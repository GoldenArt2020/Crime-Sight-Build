// api/channel.js
// Merged: channel-analyze.js + channel-matches.js + channel-profile.js
// POST   /api/channel?action=analyze   (was POST /api/channel-analyze)
// GET    /api/channel?action=matches   (was GET  /api/channel-matches)
// GET    /api/channel?action=profile   (was GET  /api/channel-profile)
// DELETE /api/channel?action=profile   (was DELETE /api/channel-profile)

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function handler(req, res) {
  const { action } = req.query;

  switch (action) {
    case "analyze":
      return handleAnalyze(req, res);
    case "matches":
      return handleMatches(req, res);
    case "profile":
      return handleProfile(req, res);
    default:
      return res.status(400).json({ error: "Unknown or missing action. Use ?action=analyze|matches|profile" });
  }
}

// ==================== ANALYZE ====================

async function handleAnalyze(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { channelUrl } = req.body || {};
  if (!channelUrl || !channelUrl.trim()) {
    return res.status(400).json({ error: "channelUrl is required" });
  }

  try {
    const channelId = await resolveChannelId(channelUrl.trim());
    if (!channelId) {
      return res.status(404).json({ error: "Could not resolve a channel from that URL" });
    }

    const channelMeta = await fetchChannelMeta(channelId);
    const videos = await fetchRecentVideos(channelId, 50);

    const stats = computeStats(videos);
    const publishTiming = computePublishTiming(videos);

    const profile = {
      channelId,
      channelTitle: channelMeta.title,
      subscriberCount: channelMeta.subscriberCount,
      avgViewsPerDay: stats.avgViewsPerDay,
      avgTitleLength: stats.avgTitleLength,
      avgEngagementRate: stats.avgEngagementRate,
      archetype: stats.archetype,
      topTriggers: stats.topTriggers,
      topVideo: stats.topVideo,
      publishTiming,
      analyzedAt: new Date().toISOString(),
    };

    await kv.set(`channel:profile:${channelId}`, profile);
    await kv.set("channel:profile:latest", profile);

    return res.status(200).json(profile);
  } catch (err) {
    console.error("channel analyze error:", err);
    return res.status(500).json({ error: "Failed to analyze channel", detail: err.message });
  }
}

async function resolveChannelId(input) {
  const handleMatch = input.match(/@([\w-]+)/);
  const channelIdMatch = input.match(/channel\/(UC[\w-]+)/);

  if (channelIdMatch) return channelIdMatch[1];

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

async function fetchRecentVideos(channelId, max = 50) {
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

function computeStats(videos) {
  if (videos.length === 0) {
    return {
      avgViewsPerDay: 0,
      avgTitleLength: 0,
      avgEngagementRate: 0,
      archetype: "unknown",
      topTriggers: [],
      topVideo: null,
    };
  }

  const now = Date.now();
  const enriched = videos.map((v) => {
    const publishedAt = new Date(v.snippet.publishedAt).getTime();
    const ageDays = Math.max(1, (now - publishedAt) / (1000 * 60 * 60 * 24));
    const views = Number(v.statistics?.viewCount || 0);
    const likes = Number(v.statistics?.likeCount || 0);
    const comments = Number(v.statistics?.commentCount || 0);
    const viewsPerDay = views / ageDays;
    const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
    return {
      title: v.snippet.title,
      views,
      viewsPerDay,
      engagementRate,
      publishedAt: v.snippet.publishedAt,
    };
  });

  const avgViewsPerDay = average(enriched.map((v) => v.viewsPerDay));
  const avgTitleLength = average(enriched.map((v) => v.title.length));
  const avgEngagementRate = average(enriched.map((v) => v.engagementRate));

  const topVideo = [...enriched].sort((a, b) => b.viewsPerDay - a.viewsPerDay)[0];

  const topTriggers = extractTriggerWords(enriched.map((v) => v.title));
  const archetype = inferArchetype(enriched.map((v) => v.title));

  return {
    avgViewsPerDay: Math.round(avgViewsPerDay),
    avgTitleLength: Math.round(avgTitleLength),
    avgEngagementRate: Number(avgEngagementRate.toFixed(2)),
    archetype,
    topTriggers,
    topVideo: topVideo
      ? { title: topVideo.title, viewsPerDay: Math.round(topVideo.viewsPerDay) }
      : null,
  };
}

function computePublishTiming(videos) {
  if (videos.length === 0) {
    return { bestDay: null, bestHour: null, heatmap: [], sampleSize: 0 };
  }

  const buckets = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ totalViewsPerDay: 0, count: 0 }))
  );

  const now = Date.now();

  for (const v of videos) {
    const published = new Date(v.snippet.publishedAt);
    const day = published.getUTCDay();
    const hour = published.getUTCHours();

    const ageDays = Math.max(1, (now - published.getTime()) / (1000 * 60 * 60 * 24));
    const views = Number(v.statistics?.viewCount || 0);
    const viewsPerDay = views / ageDays;

    buckets[day][hour].totalViewsPerDay += viewsPerDay;
    buckets[day][hour].count += 1;
  }

  const heatmap = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const b = buckets[day][hour];
      if (b.count > 0) {
        heatmap.push({
          day: DAY_NAMES[day],
          hour,
          avgViewsPerDay: Math.round(b.totalViewsPerDay / b.count),
          uploadCount: b.count,
        });
      }
    }
  }

  heatmap.sort((a, b) => b.avgViewsPerDay - a.avgViewsPerDay);

  const best = heatmap[0] || null;

  return {
    bestDay: best?.day || null,
    bestHour: best?.hour ?? null,
    bestHourLabel: best ? formatHourUTC(best.hour) : null,
    heatmap,
    sampleSize: videos.length,
    note: "Times are UTC, derived from publishedAt on this channel's own uploads — not a general audience benchmark.",
  };
}

function formatHourUTC(hour) {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period} UTC`;
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

function inferArchetype(titles) {
  const joined = titles.join(" ").toLowerCase();
  if (/(unsolved|cold case|disappeared|missing)/.test(joined)) return "Unsolved Mystery Specialist";
  if (/(trial|confession|arrested|sentenced)/.test(joined)) return "Courtroom & Justice Focused";
  if (/(serial|killer|murder)/.test(joined)) return "Serial Crime Deep-Diver";
  return "General True Crime";
}

// ==================== MATCHES ====================

async function handleMatches(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const groqKey = process.env.GROQ_API_KEY;

  try {
    const channelProfile = await kv.get("channel:profile:latest");
    if (!channelProfile) {
      return res.status(404).json({ error: "No channel analyzed yet. POST to /api/channel?action=analyze first." });
    }

    const trending = (await kv.get("trending:latest")) || { cases: [] };
    const cases = trending.cases || [];

    if (!cases.length) {
      return res.status(200).json({ channel: channelProfile.channelTitle, matches: [] });
    }

    const scored = cases
      .map((c) => {
        const { fitScore, matchedTriggers } = scoreFit(channelProfile, c);
        return { case: c, fitScore, matchedTriggers };
      })
      .sort((a, b) => b.fitScore - a.fitScore);

    const topN = scored.slice(0, 6);
    const rest = scored.slice(6);

    const enrichedTop = [];
    for (const item of topN) {
      let angle = {
        why_it_matches: "Matches your channel's proven archetype.",
        recommended_angle: `The story behind ${item.case.name}`,
      };
      if (groqKey) {
        angle = await generateAngle(groqKey, channelProfile, item.case, item.matchedTriggers);
        await new Promise((r) => setTimeout(r, 800));
      }
      enrichedTop.push({
        id: item.case.id || item.case.name,
        name: item.case.name,
        location: item.case.location,
        date: item.case.date,
        fitScore: item.fitScore,
        coverage: item.case.coverage,
        ...angle,
      });
    }

    const restMinimal = rest.map((item) => ({
      id: item.case.id || item.case.name,
      name: item.case.name,
      fitScore: item.fitScore,
    }));

    return res.status(200).json({
      channel: channelProfile.channelTitle,
      archetype: channelProfile.archetype,
      analyzedAt: channelProfile.analyzedAt,
      matches: [...enrichedTop, ...restMinimal],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Channel matching failed" });
  }
}

function scoreFit(channelProfile, caseItem) {
  const text = `${caseItem.name} ${caseItem.summary || ""} ${caseItem.case_status || ""}`.toLowerCase();
  const channelTriggerWords = channelProfile.topTriggers.map((t) => t.trigger);

  let keywordScore = 0;
  for (const trigger of channelTriggerWords) {
    if (text.includes(trigger)) keywordScore += 1;
  }
  const normalizedKeywordScore = Math.min(40, keywordScore * 10);

  const coverageScore =
    caseItem.coverage === "unreleased" ? 30 : caseItem.coverage === "low_coverage" ? 20 : 10;

  const caseQuality = caseItem.viral_score?.overall ?? 50;
  const qualityScore = Math.min(30, Math.round((caseQuality / 100) * 30));

  const fitScore = Math.min(100, normalizedKeywordScore + coverageScore + qualityScore);

  return {
    fitScore,
    matchedTriggers: channelTriggerWords.filter((t) => text.includes(t)),
  };
}

async