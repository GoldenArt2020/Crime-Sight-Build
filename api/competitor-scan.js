// api/competitor-scan.js
//
// Scans YouTube for the highest-performing videos on a given case type
// (e.g. "unsolved missing person", "courtroom trial", "serial killer"),
// discovered via targeted search queries rather than a fixed channel list.
// Extracts what's actually working — title patterns, tags, category,
// length, view velocity — so new cases can be shaped around proven
// patterns instead of guessed at.
//
// POST /api/competitor-scan
// Body: { caseType: string, caseName?: string, maxPerQuery?: number }

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const CACHE_TTL_HOURS = 24;
const DEFAULT_MAX_PER_QUERY = 15;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!youtubeKey) return res.status(500).json({ error: "YOUTUBE_API_KEY is not set on the server" });
  if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set on the server" });

  const { caseType, caseName, maxPerQuery } = req.body || {};
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

    // Run each query's search + video-detail lookup, merging & deduping by videoId.
    const videoMap = new Map();
    for (const q of queries) {
      const ids = await searchVideoIds({ apiKey: youtubeKey, query: q, maxResults: perQuery });
      if (ids.length === 0) continue;
      const details = await fetchVideoDetails({ apiKey: youtubeKey, ids });
      for (const v of details) videoMap.set(v.id, v);
      await new Promise((r) => setTimeout(r, 150)); // light pacing between query pairs
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
    console.error("competitor-scan error:", err);
    return res.status(500).json({ error: "Competitor scan failed", detail: err.message });
  }
}

// ---- query construction ----
// Discovers videos via search rather than a hardcoded channel list, so new
// case types get relevant results automatically, no maintenance needed.
function buildQueries(caseType) {
  const base = caseType.trim();
  return [`${base} true crime documentary`, `${base} case explained`, `${base} true crime`];
}

// ---- YouTube API calls ----

async function searchVideoIds({ apiKey, query, maxResults }) {
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    part: "snippet",
    type: "video",
    order: "viewCount",
    maxResults: String(Math.min(maxResults, 50)),
    videoDuration: "medium", // excludes Shorts/clips — this is about long-form patterns
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

// ---- aggregation helpers ----

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

function average(nums) {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, n) => sum + n, 0) / valid.length;
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

// ---- Groq pattern analysis ----
// Turns raw scraped stats into an actionable "what's working" summary,
// grounded only in the actual titles/tags pulled above — not generic advice.
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

  const raw = await groqComplete({ apiKey: groqKey, systemPrompt, userPrompt });
  return extractJson(raw) || { note: "Pattern analysis failed to parse — raw stats above are still usable." };
}