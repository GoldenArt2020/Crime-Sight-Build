// api/competitor-analyzer.js
// Two modes:
//  1) mode: "caseType" — { caseType, caseName? } — finds top-performing
//     YouTube videos for a given true-crime case type and extracts patterns.
//  2) default/legacy — { channelId, competitorUrls } — compares your
//     channel's profile against named competitor channels.

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CASE_TYPE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};

  if (body.mode === "caseType" || (body.caseType && !body.channelId)) {
    return handleCaseTypeMode(req, res, body);
  }

  return handleChannelMode(req, res, body);
}

// ============================================================
// MODE 1: case-type competitor scan
// ============================================================

async function handleCaseTypeMode(req, res, body) {
  const caseType = (body.caseType || "").trim();
  const caseName = (body.caseName || "").trim();

  if (!caseType) {
    return res.status(400).json({ error: "caseType is required" });
  }

  const cacheKey = `competitor:caseType:${caseType.toLowerCase()}`;

  try {
    const cached = await kv.get(cacheKey);
    if (cached && Date.now() - new Date(cached.generatedAt).getTime() < CASE_TYPE_CACHE_TTL_MS) {
      return res.status(200).json({ ...cached, cached: true });
    }

    const query = caseName ? `${caseName} ${caseType} true crime` : `${caseType} true crime`;
    const videos = await searchTopVideos(query, 25);

    if (videos.length === 0) {
      const empty = {
        caseType,
        cached: false,
        videoCount: 0,
        message: "No videos found for this case type. Try a broader or differently worded case type.",
        generatedAt: new Date().toISOString(),
      };
      await kv.set(cacheKey, empty);
      return res.status(200).json(empty);
    }

    const stats = {
      avgViews: Math.round(average(videos.map((v) => v.viewCount))),
      avgTitleLength: Math.round(average(videos.map((v) => v.title.length))),
      avgDurationMinutes: Math.round(average(videos.map((v) => v.durationSeconds)) / 60),
    };

    const uniqueChannels = new Set(videos.map((v) => v.channelTitle)).size;

    const topVideos = [...videos]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10)
      .map((v) => ({
        id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.title,
        channelTitle: v.channelTitle,
        viewCount: v.viewCount,
      }));

    const patterns = await synthesizeCaseTypePatterns({ caseType, videos });

    const result = {
      caseType,
      cached: false,
      videoCount: videos.length,
      uniqueChannels,
      stats,
      patterns,
      topVideos,
      generatedAt: new Date().toISOString(),
    };

    await kv.set(cacheKey, result);
    return res.status(200).json(result);
  } catch (err) {
    console.error("competitor-analyzer (caseType mode) error:", err);
    return res.status(500).json({ error: "Failed to scan competitors", detail: err.message });
  }
}

async function synthesizeCaseTypePatterns({ caseType, videos }) {
  const systemPrompt = `You are a YouTube growth strategist for true crime creators. Given real top-performing video titles for a case type, extract concrete, specific patterns — not generic advice. Respond with ONLY a JSON object, no markdown, no commentary.`;

  const titleList = videos.slice(0, 25).map((v) => `- "${v.title}" (${v.viewCount.toLocaleString()} views, ${v.channelTitle})`).join("\n");

  const userPrompt = `
CASE TYPE: ${caseType}

TOP-PERFORMING VIDEO TITLES:
${titleList}

TASK:
Analyze these real titles and extract patterns a creator could apply to their own video on this case type.

Return JSON in this exact shape:
{
  "titleStructurePatterns": [
    { "pattern": "short name for the pattern", "example": "one real title from the list that demonstrates it" }
  ],
  "commonHooks": ["short hook phrase", "short hook phrase"],
  "lengthGuidance": "1 sentence on ideal title length based on what's shown here",
  "recommendation": "2-3 sentences of specific, actionable advice for a title on this exact case type"
}
`.trim();

  const raw = await groqComplete({
    apiKey: process.env.GROQ_API_KEY,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJson(raw);
  if (!parsed) {
    const snippet = (raw || "(empty response)").slice(0, 800);
    throw new Error(`Groq returned an unparseable patterns result. Raw response (truncated): ${snippet}`);
  }
  return parsed;
}

async function searchTopVideos(query, max = 25) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&maxResults=${max}&key=${YOUTUBE_API_KEY}`;
  const searchResp = await fetch(searchUrl);
  const searchData = await searchResp.json();
  const items = searchData.items || [];
  const ids = items.map((i) => i.id?.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${YOUTUBE_API_KEY}`;
  const videosResp = await fetch(videosUrl);
  const videosData = await videosResp.json();

  return (videosData.items || []).map((v) => ({
    id: v.id,
    title: v.snippet.title,
    channelTitle: v.snippet.channelTitle,
    viewCount: Number(v.statistics?.viewCount || 0),
    durationSeconds: parseISODuration(v.contentDetails?.duration),
  }));
}

function parseISODuration(iso) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

function average(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ============================================================
// MODE 2: channel-vs-channel comparison (legacy/original behavior)
// ============================================================

async function handleChannelMode(req, res, body) {
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
    console.error("competitor-analyzer (channel mode) error:", err);
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

  const raw = await groqComplete({
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