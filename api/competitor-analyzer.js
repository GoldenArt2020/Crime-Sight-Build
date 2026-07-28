// api/competitor-analyzer.js
// Competition Analyzer — compares your channel's profile against one or
// more competitor channels: title patterns, upload frequency, content gaps.
// POST /api/competitor-analyzer
// Body: { channelId: string, competitorUrls: string[] }

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { channelId: rawChannelId, competitorUrls } = req.body || {};

  if (!rawChannelId) {
    return res.status(400).json({ error: "channelId is required (use profile.channelId from /api/channel-analyze)" });
  }
  if (!Array.isArray(competitorUrls) || competitorUrls.length === 0) {
    return res.status(400).json({ error: "competitorUrls must be a non-empty array" });
  }

  // Accept a full channel URL, an @handle, or a bare UC... id here — normalize
  // to the bare id so this matches the key channel-analyze.js actually stored
  // the profile under (it always strips URLs down to the bare channel id).
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
    console.error("competitor-analyzer error:", err);
    return res.status(500).json({ error: "Failed to analyze competitors", detail: err.message });
  }
}

// ---- Lightweight version of channel-analyze's pipeline, scoped to what comparison needs ----

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
    throw new Error("Groq returned an unparseable comparison result");
  }
  return parsed;
}

// ---- Shared helpers (same logic as channel-analyze.js) ----

// Synchronous, no API call: strips a full channel URL down to the bare
// UC... id. If it's already a bare id, returns it unchanged. Only an
// @handle (with no id anywhere) falls through unresolved — see the async
// resolveChannelId() below for that case (used for competitor URLs, which
// are frequently handles).
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

function average(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
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