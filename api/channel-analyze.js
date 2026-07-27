import { kv } from "./_lib/kv.js";

const EMOTIONAL_TRIGGERS = [
  "murder", "caught", "secret", "truth", "hidden", "final hours",
  "warning signs", "never should have", "how", "inside", "cover-up",
  "gang war", "wrong house", "institutional failure", "police failure",
  "teacher", "baby", "mother", "child", "missing", "vanished",
  "betrayal", "stalker", "obsession",
];

const ARCHETYPES = {
  "Systemic Failure": ["police failure", "cover-up", "institutional failure", "warning signs"],
  "Family / Victim-Focused": ["mother", "baby", "child", "teacher", "family"],
  "Recent / Missing": ["missing", "vanished", "disappearance"],
  "Predator / Stalker": ["stalker", "obsession", "betrayal", "caught"],
};

function extractHandleOrId(channelUrl) {
  // Supports: youtube.com/@handle, youtube.com/channel/UC..., youtube.com/c/name, youtube.com/user/name, or bare @handle
  const cleaned = channelUrl.trim();
  const handleMatch = cleaned.match(/@([A-Za-z0-9_.-]+)/);
  if (handleMatch) return { type: "handle", value: handleMatch[1] };

  const channelIdMatch = cleaned.match(/channel\/(UC[A-Za-z0-9_-]{20,})/);
  if (channelIdMatch) return { type: "id", value: channelIdMatch[1] };

  const legacyMatch = cleaned.match(/\/(?:c|user)\/([A-Za-z0-9_.-]+)/);
  if (legacyMatch) return { type: "username", value: legacyMatch[1] };

  // Fallback: treat the whole string as a raw handle/username
  return { type: "handle", value: cleaned.replace(/^@/, "") };
}

async function resolveChannel(apiKey, channelUrl) {
  const ref = extractHandleOrId(channelUrl);
  const base = "https://www.googleapis.com/youtube/v3/channels";
  let url;

  if (ref.type === "id") {
    url = `${base}?part=snippet,statistics,contentDetails&id=${ref.value}&key=${apiKey}`;
  } else if (ref.type === "handle") {
    url = `${base}?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(ref.value)}&key=${apiKey}`;
  } else {
    url = `${base}?part=snippet,statistics,contentDetails&forUsername=${encodeURIComponent(ref.value)}&key=${apiKey}`;
  }

  const res = await fetch(url);
  const data = await res.json();

  if (!data.items || !data.items.length) {
    // Last-resort fallback: search.list by name and take the top channel result
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(ref.value)}&maxResults=1&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const found = searchData.items?.[0]?.snippet?.channelId;
    if (!found) throw new Error("Channel not found");

    const retryUrl = `${base}?part=snippet,statistics,contentDetails&id=${found}&key=${apiKey}`;
    const retryRes = await fetch(retryUrl);
    const retryData = await retryRes.json();
    if (!retryData.items?.length) throw new Error("Channel not found");
    return retryData.items[0];
  }

  return data.items[0];
}

async function fetchRecentVideos(apiKey, uploadsPlaylistId, limit = 60) {
  const items = [];
  let pageToken = "";

  while (items.length < limit) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&pageToken=${pageToken}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items) break;
    items.push(...data.items);
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  const videoIds = items.slice(0, limit).map((i) => i.contentDetails.videoId);
  const stats = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${batch.join(",")}&key=${apiKey}`;
    const statsRes = await fetch(statsUrl);
    const statsData = await statsRes.json();
    if (statsData.items) stats.push(...statsData.items);
  }

  return stats;
}

function analyzeVideos(videos) {
  const now = Date.now();
  const enriched = videos.map((v) => {
    const publishedAt = new Date(v.snippet.publishedAt).getTime();
    const ageDays = Math.max(1, (now - publishedAt) / (1000 * 60 * 60 * 24));
    const views = Number(v.statistics.viewCount || 0);
    const likes = Number(v.statistics.likeCount || 0);
    const comments = Number(v.statistics.commentCount || 0);
    const title = v.snippet.title || "";
    const titleLower = title.toLowerCase();

    const triggers = EMOTIONAL_TRIGGERS.filter((t) => titleLower.includes(t));

    return {
      title,
      views,
      viewsPerDay: views / ageDays,
      engagementRate: views > 0 ? (likes + comments) / views : 0,
      titleLength: title.length,
      triggers,
      publishedAt: v.snippet.publishedAt,
    };
  });

  // Rank by viewsPerDay to find what's actually working, not just raw views
  const ranked = [...enriched].sort((a, b) => b.viewsPerDay - a.viewsPerDay);
  const topQuartile = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.25)));

  const triggerCounts = {};
  for (const v of topQuartile) {
    for (const t of v.triggers) {
      triggerCounts[t] = (triggerCounts[t] || 0) + 1;
    }
  }
  const topTriggers = Object.entries(triggerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([trigger, count]) => ({ trigger, count }));

  const avgTitleLength = Math.round(
    topQuartile.reduce((sum, v) => sum + v.titleLength, 0) / topQuartile.length
  );

  const avgEngagementRate =
    enriched.reduce((sum, v) => sum + v.engagementRate, 0) / (enriched.length || 1);

  // Score each archetype by how often its keywords appear in top-performing titles
  let bestArchetype = "General True Crime";
  let bestScore = 0;
  for (const [archetype, keywords] of Object.entries(ARCHETYPES)) {
    const score = topTriggers.reduce(
      (sum, t) => sum + (keywords.includes(t.trigger) ? t.count : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = archetype;
    }
  }

  const topVideo = ranked[0] || null;

  return {
    videosAnalyzed: enriched.length,
    avgViewsPerDay: Math.round(
      enriched.reduce((sum, v) => sum + v.viewsPerDay, 0) / (enriched.length || 1)
    ),
    avgEngagementRate: Number((avgEngagementRate * 100).toFixed(2)),
    avgTitleLength,
    topTriggers,
    archetype: bestArchetype,
    topVideo: topVideo
      ? { title: topVideo.title, views: topVideo.views, viewsPerDay: Math.round(topVideo.viewsPerDay) }
      : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY is not set on the server" });
  }

  const { channelUrl } = req.body || {};
  if (!channelUrl) {
    return res.status(400).json({ error: "channelUrl is required" });
  }

  try {
    const channel = await resolveChannel(apiKey, channelUrl);
    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
    const videos = await fetchRecentVideos(apiKey, uploadsPlaylistId, 60);
    const analysis = analyzeVideos(videos);

    const profile = {
      channelId: channel.id,
      channelTitle: channel.snippet.title,
      subscriberCount: Number(channel.statistics.subscriberCount || 0),
      videoCount: Number(channel.statistics.videoCount || 0),
      analyzedAt: new Date().toISOString(),
      ...analysis,
    };

    await kv.set(`channel:profile:${channel.id}`, profile);
    await kv.set("channel:profile:latest", profile);

    return res.status(200).json(profile);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Channel analysis failed" });
  }
}