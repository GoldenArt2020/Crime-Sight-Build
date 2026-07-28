// api/competitor-analyzer.js
//
// Two modes, selected via body.mode:
//
// 1. mode: "compare" (default) — Competition Analyzer: compares your
//    channel's profile against one or more NAMED competitor channels
//    (title patterns, upload frequency, content gaps).
//    Body: { channelId: string, competitorUrls: string[] }
//
// 2. mode: "caseType" — Competitor Scan: discovers top-performing videos
//    for a CASE TYPE via YouTube search (no channels named up front),
//    and extracts title/tag/pattern data across whatever ranks highest.
//    Body: { mode: "caseType", caseType: string, caseName?: string, maxPerQuery?: number }
//
// Merged into one file (from two separate endpoints) to stay under the
// 12-serverless-function limit on Vercel's Hobby plan — see project notes.

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};

  if (body.mode === "caseType") {
    return handleCaseTypeScan(req, res, body);
  }

  return handleCompare(req, res, body);
}

// =====================================================================
// MODE 1: compare — unchanged from the original competitor-analyzer.js
// =====================================================================

async function handleCompare(req, res, body) {
  const { channelId: rawChannelId, competitorUrls } = body;

  if (!rawChannelId) {
    return res.status(400).json({ error: "channelId is required (use profile.channelId from /api/channel-analyze)" });
  }
  if (!Array.isArray(competitorUrls) || competitorUrls.length === 0) {
    return res.status(400).json({ error: "competitorUrls must be a non-empty array" });
  }

  const channelId = normalizeChannelId(rawChannelId.trim());

  try {
    const myProfile = await kv.get(`channel:profile:${channelId}`);
    if (!myProfile) {
      return res.status(404).json({ error: "No channel profile found. Call /api/channel-analyze first." });
    }

    const competitorProfiles = [];
    for (const url of competitorUrls.slice(0, 5)) {
      const profile = await analyzeCompetitor(url);
      if (profile) competitorProfiles.push(profile);
    }

    if (competitorProfiles.length === 0) {
      return res.status(404).json({ error: "Could not resolve any of the competitor URLs" });
    }

    const comparison = await synthesizeComparison({ myProfile, competitorProfiles });

    const result = {
      channelId,
      competitors: competitorProfiles.map((c) => ({
        channelTitle: c.channelTitle,
        subscriberCount: c.subscriberCount,
        avgViewsPerDay: c.avgViewsPerDay,
        avgTitleLength: c.avgTitleLength,
        topTriggers: c.topTriggers,
      })),
      ...comparison,
      generatedAt: new Date().toISOString(),
    };

    await kv.set(`competitor:analysis:${channelId}`, result);

    return res.status(200).json(result);
  } catch (err) {
    console.error("competitor-analyzer (compare) error:", err);
    return res.status(500).json({ error: "Failed to analyze competitors", detail: err.message });
  }
}

async function analyzeCompetitor(channelUrl) {
  const channelId = await resolveChannelId(channelUrl);
  if (!channelId) return null;

  const channelMeta = await fetchChannelMeta(channelId);
  const videos = await fetchRecentVideos(channelId, 25);
  if (videos.length === 0) {
    return { channelId, channelTitle: channelMeta.title, subscriberCount: channelMeta.subscriberCount, avgViewsPerDay: 0, avgTitleLength: 0, topTriggers: [] };
  }

  const now = Date.now();
  const enriched = videos.map((v) => {
    const ageDays = Math.max(1, (now - new Date(v.snippet.publishedAt).getTime()) / (1000 * 60 * 60 * 24));
    return {
      title: v.snippet.title,
      viewsPerDay: Number(v.statistics?.viewCount || 0) / ageDays,
    };
  });

  return {
    channelId,
    channelTitle: channelMeta.title,
    subscriberCount: channelMeta.subscriberCount,
    avgViewsPerDay: Math.round(average(enriched.map((v) => v.viewsPerDay))),
    avgTitleLength: Math.round(average(enriched.map((v) => v.title.length))),
    topTriggers: extractTriggerWords(enriched.map((v) => v.title)),
    recentTitles: enriched.map((v) => v.title).slice(0, 15),
  };
}

async function synthesizeComparison({ myProfile, competitorProfiles }) {
  const systemPrompt = `You are a YouTube channel strategist for true crime creators. You compare a creator's channel against named competitors and identify concrete, specific gaps and opportunities — not generic advice. Respond with ONLY a JSON object, no markdown, no commentary.`;

  const competitorText = competitorProfiles
    .map(
      (c) =>
        `- ${c.channelTitle}: avg ${c.avgViewsPerDay} views/day, avg title length ${c.avgTitleLength}, top triggers: ${(c.topTriggers || []).map((t) => t.trigger).join(", ") || "none"}\n  recent titles: ${(c.recentTitles || []).slice(0, 8).join(" | ")}`
    )
    .join("\n\n");

  const userPrompt = `
MY CHANNEL:
Archetype: ${myProfile.archetype}
Avg views/day: ${myProfile.avgViewsPerDay}
Avg title length: ${myProfile.avgTitleLength}
Top triggers: ${(myProfile.topTriggers || []).map((t) => t.trigger).join(", ") || "none"}

COMPETITORS:
${competitorText}

TASK:
Compare my channel to these competitors. Be specific and honest — call out where competitors are outperforming me and why, not just generic strengths.

Return JSON in this exact shape:
{
  "positioning": "1-2 sentence honest read on where my channel sits relative to these competitors",
  "gaps": [
    { "gap": "specific content or format gap", "evidence": "what in the competitor data shows this" }
  ],
  "opportunities": [
    { "opportunity": "specific actionable move", "reasoning": "why this would work based on the data" }
  ],
  "titlePatternDiff": "1-2 sentences comparing my title conventions to theirs specifically"
}
`.trim();

  const raw = await groqCompleteWithRetry({
    apiKey: process.env.GROQ_API_KEY,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJson(raw);
  if (!parsed || !parsed.positioning) {
    const snippet = (raw || "(empty response)").slice(0, 800);
    throw new Error(`Groq returned an unparseable comparison result. Raw response (truncated): ${snippet}`);
  }
  return parsed;
}

// ---- Shared YouTube/profile helpers for compare mode ----

function normalizeChannelId(input) {
  const channelIdMatch = input.match(/(UC[\w-]{20,})/);
  if (channelIdMatch) return channelIdMatch[1];
  return input;
}

async function resolveChannelId(input) {
  const channelIdMatch = input.match(/channel\/(UC[\w-]+)/);
  if (channelIdMatch) return channelIdMatch[1];

  const handleMatch = input.match(/@([\w-]+)/);
  const handle = handleMatch ? handleMatch[1] : input.replace(/^@/, "");

  const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${YOUTUBE_API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  return data.items?.[0]?.id || null;
}

async function fetchChannelMeta(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const item = data.items?.[0];
  return {
    title: item?.snippet?.title || "Unknown",
    subscriberCount: Number(item?.statistics?.subscriberCount || 0),
  };
}

async function fetchRecentVideos(channelId, max = 25) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&order=date&maxResults=${max}&type=video&key=${YOUTUBE_API_KEY}`;
  const searchResp = await fetch(searchUrl);
  const searchData = await searchResp.json();
  const ids = (searchData.items || []).map((i) => i.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${YOUTUBE_API_KEY}`;
  const videosResp = await fetch(videosUrl);
  const videosData = await videosResp.json();
  return videosData.items || [];
}

function extractTriggerWords(titles) {
  const triggerWords = [
    "murder", "killer", "missing", "disappeared", "found", "confession",
    "unsolved", "mystery", "evidence", "trial", "arrested", "victim",
    "secret", "truth", "shocking", "twisted", "cover-up", "exposed",
  ];
  const counts = {};
  for (const title of titles) {
    const lower = title.toLowerCase();
    for (const word of triggerWords) {
      if (lower.includes(word)) counts[word] = (counts[word] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([trigger, count]) => ({ trigger, count }));
}

// =====================================================================
// MODE 2: caseType — merged in from the old standalone competitor-scan.js
// =====================================================================

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const CACHE_TTL_HOURS = 24;
const DEFAULT_MAX_PER_QUERY = 15;

async function handleCaseTypeScan(req, res, body) {
  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!youtubeKey) return res.status(500).json({ error: "YOUTUBE_API_KEY is not set on the server" });
  if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set on the server" });

  const { caseType, caseName, maxPerQuery } = body;
  if (!caseType || !caseType.trim()) {
    return res.status(400).json({
      error: "caseType is required (e.g. 'unsolved missing person', 'courtroom trial', 'serial killer')",
    });
  }

  const cacheKey = `competitor:scan:${slugify(caseType)}`;

  try {
    const cached = await kv.get(cacheKey);
    if (cached && !isStale(cached.scanned_at)) {
      return res.status(200).json({ ...cached, cached: true });
    }

    const queries = buildQueries(caseType);
    const perQuery = maxPerQuery || DEFAULT_MAX_PER_QUERY;

    const videoMap = new Map();
    for (const q of queries) {
      const ids = await searchVideoIds({ apiKey: youtubeKey, query: q, maxResults: perQuery });
      if (ids.length === 0) continue;
      const details = await fetchVideoDetails({ apiKey: youtubeKey, ids });
      for (const v of details) videoMap.set(v.id, v);
      await new Promise((r) => setTimeout(r, 150));
    }

    const videos = Array.from(videoMap.values());
    if (videos.length === 0) {
      return res.status(200).json({
        caseType,
        scanned_at: new Date().toISOString(),
        queries,
        videoCount: 0,
        topVideos: [],
        patterns: null,
        message: "No videos found for this case type — try broadening the query.",
      });
    }

    videos.sort((a, b) => b.viewCount - a.viewCount);
    const topVideos = videos.slice(0, 25);

    const stats = {
      avgViews: Math.round(average(videos.map((v) => v.viewCount))),
      avgTitleLength: Math.round(average(videos.map((v) => v.title.length))),
      avgDurationMinutes: Math.round((average(videos.map((v) => v.durationSeconds)) / 60) * 10) / 10,
      categoryDistribution: buildCategoryDistribution(videos),
      topTags: buildTagFrequency(videos, 20),
    };

    const patterns = await analyzePatterns({
      groqKey,
      caseType,
      caseName,
      topVideos: topVideos.slice(0, 15),
    });

    const result = {
      caseType,
      scanned_at: new Date().toISOString(),
      queries,
      videoCount: videos.length,
      uniqueChannels: new Set(videos.map((v) => v.channelId)).size,
      stats,
      topVideos: topVideos.map((v) => ({
        id: v.id,
        title: v.title,
        channelTitle: v.channelTitle,
        channelId: v.channelId,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        publishedAt: v.publishedAt,
        durationSeconds: v.durationSeconds,
        categoryId: v.categoryId,
        tags: v.tags.slice(0, 10),
        url: `https://www.youtube.com/watch?v=${v.id}`,
      })),
      patterns,
    };

    await kv.set(cacheKey, result);
    return res.status(200).json({ ...result, cached: false });
  } catch (err) {
    console.error("competitor-analyzer (caseType) error:", err);
    return res.status(500).json({ error: "Competitor scan failed", detail: err.message });
  }
}

function buildQueries(caseType) {
  const base = caseType.trim();
  return [`${base} true crime documentary`, `${base} case explained`, `${base} true crime`];
}

async function searchVideoIds({ apiKey, query, maxResults }) {
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    part: "snippet",
    type: "video",
    order: "viewCount",
    maxResults: String(Math.min(maxResults, 50)),
    videoDuration: "medium",
    relevanceLanguage: "en",
  });

  const resp = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`YouTube search failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  return (data.items || []).map((item) => item.id && item.id.videoId).filter(Boolean);
}

async function fetchVideoDetails({ apiKey, ids }) {
  const params = new URLSearchParams({
    key: apiKey,
    id: ids.join(","),
    part: "snippet,statistics,contentDetails",
  });

  const resp = await fetch(`${YOUTUBE_VIDEOS_URL}?${params.toString()}`);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`YouTube videos.list failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  const data = await resp.json();

  return (data.items || []).map((item) => ({
    id: item.id,
    title: item.snippet?.title || "",
    channelTitle: item.snippet?.channelTitle || "",
    channelId: item.snippet?.channelId || "",
    publishedAt: item.snippet?.publishedAt || null,
    categoryId: item.snippet?.categoryId || null,
    tags: item.snippet?.tags || [],
    viewCount: Number(item.statistics?.viewCount || 0),
    likeCount: Number(item.statistics?.likeCount || 0),
    commentCount: Number(item.statistics?.commentCount || 0),
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
  }));
}

function buildCategoryDistribution(videos) {
  const counts = {};
  for (const v of videos) {
    const key = v.categoryId || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([categoryId, count]) => ({ categoryId, count }));
}

function buildTagFrequency(videos, limit) {
  const counts = {};
  for (const v of videos) {
    for (const tag of v.tags) {
      const key = tag.toLowerCase().trim();
      if (!key) continue;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function parseIsoDuration(iso) {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
}

function isStale(scannedAt) {
  if (!scannedAt) return true;
  const ageMs = Date.now() - new Date(scannedAt).getTime();
  return ageMs > CACHE_TTL_HOURS * 60 * 60 * 1000;
}

async function analyzePatterns({ groqKey, caseType, caseName, topVideos }) {
  const systemPrompt = `You analyze real YouTube performance data for true crime content to extract concrete, non-generic patterns. Base every claim on the actual video data given — do not give generic YouTube SEO advice. Respond with ONLY valid JSON, no markdown, no commentary.`;

  const videoList = topVideos
    .map(
      (v, i) =>
        `${i + 1}. "${v.title}" — ${v.viewCount.toLocaleString()} views, ${Math.round(v.durationSeconds / 60)}min, tags: ${v.tags.slice(0, 6).join(", ") || "none"}`
    )
    .join("\n");

  const userPrompt = `
CASE TYPE: ${caseType}
${caseName ? `SPECIFIC CASE BEING WORKED ON: ${caseName}` : ""}

TOP-PERFORMING VIDEOS FOUND FOR THIS CASE TYPE:
${videoList}

Based ONLY on this real data, extract:
1. titleStructurePatterns: recurring structural patterns in the winning titles (e.g. "Name + location + one-word hook"), max 4, each with a short example pulled from the list above
2. commonHooks: recurring emotional/curiosity triggers that show up across these specific titles, max 5
3. lengthGuidance: one sentence on the title/video length that's actually winning here, based on the numbers above
4. recommendation: 2-3 sentences of concrete guidance for shaping ${caseName || "a new case in this category"}, based on what's actually working above

Return JSON: { "titleStructurePatterns": [{"pattern": "...", "example": "..."}], "commonHooks": ["..."], "lengthGuidance": "...", "recommendation": "..." }
`.trim();

  const raw = await groqCompleteWithRetry({ apiKey: groqKey, systemPrompt, userPrompt });
  return extractJson(raw) || { note: "Pattern analysis failed to parse — raw stats above are still usable." };
}

// =====================================================================
// Shared utilities
// =====================================================================

function average(nums) {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, n) => sum + n, 0) / valid.length;
}

// Thin retry wrapper around the shared groqComplete helper: on a 429
// (rate limit), waits and retries a couple of times instead of throwing
// immediately. This is the fix for the "Groq transient error: 429" crash
// seen earlier — that endpoint had no backoff at all.
async function groqCompleteWithRetry(args, attempt = 1) {
  try {
    return await groqComplete(args);
  } catch (err) {
    const is429 = /429/.test(err?.message || "");
    if (is429 && attempt < 3) {
      const waitMs = 1500 * attempt;
      await new Promise((r) => setTimeout(r, waitMs));
      return groqCompleteWithRetry(args, attempt + 1);
    }
    throw err;
  }
}