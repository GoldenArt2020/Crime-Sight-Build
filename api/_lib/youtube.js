// api/_lib/youtube.js
//
// YouTube Data API v3 — free tier: 10,000 quota units/day.
// search.list costs 100 units/call, videos.list costs 1 unit/call,
// so this uses ~101 units per case. At MAX_ENRICHED = 8 cases per
// scan, that's ~808 units per scan — comfortably inside the daily
// quota even running the cron every 6 hours (4x/day).
//
// Get a free key: console.cloud.google.com -> new project ->
// enable "YouTube Data API v3" -> Credentials -> API key.

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

export async function youtubeCoverage({ apiKey, query }) {
  if (!apiKey) {
    return { video_count: 0, avg_views: 0, top_video: null, available: false };
  }

  try {
    const searchParams = new URLSearchParams({
      key: apiKey,
      q: query,
      part: "snippet",
      type: "video",
      maxResults: "25",
      order: "relevance",
    });

    const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`);
    if (!searchRes.ok) throw new Error(`YouTube search error ${searchRes.status}`);
    const searchData = await searchRes.json();
    const items = searchData.items || [];
    const videoIds = items.map((i) => i.id.videoId).filter(Boolean);

    if (videoIds.length === 0) {
      return { video_count: 0, avg_views: 0, top_video: null, available: true };
    }

    const videoParams = new URLSearchParams({
      key: apiKey,
      id: videoIds.join(","),
      part: "statistics,snippet",
    });

    const videosRes = await fetch(`${VIDEOS_URL}?${videoParams}`);
    if (!videosRes.ok) throw new Error(`YouTube videos error ${videosRes.status}`);
    const videosData = await videosRes.json();
    const videos = videosData.items || [];

    const viewCounts = videos.map((v) => parseInt(v.statistics?.viewCount || "0", 10));
    const totalViews = viewCounts.reduce((a, b) => a + b, 0);
    const avgViews = videos.length ? Math.round(totalViews / videos.length) : 0;

    let top = null;
    let topViews = -1;
    videos.forEach((v) => {
      const views = parseInt(v.statistics?.viewCount || "0", 10);
      if (views > topViews) {
        topViews = views;
        top = {
          title: v.snippet?.title,
          channel: v.snippet?.channelTitle,
          views,
          published_at: v.snippet?.publishedAt,
          video_id: v.id,
        };
      }
    });

    return {
      video_count: videos.length,
      avg_views: avgViews,
      top_video: top,
      available: true,
    };
  } catch (err) {
    console.error("youtubeCoverage failed:", err.message);
    // Degrade gracefully rather than crashing the whole scan
    return { video_count: 0, avg_views: 0, top_video: null, available: false };
  }
}