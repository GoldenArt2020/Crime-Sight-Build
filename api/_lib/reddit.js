// api/_lib/reddit.js
//
// Reddit's free read-only API via OAuth client-credentials grant
// (no user login needed). Create a "script" app at
// reddit.com/prefs/apps to get a client ID + secret — completely free.

let cachedToken = null;
let tokenExpiry = 0;

async function getRedditToken({ clientId, clientSecret }) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "crimesight-trending-scan/1.0",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Reddit auth error ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function redditSignal({ clientId, clientSecret, query }) {
  if (!clientId || !clientSecret) {
    return {
      mention_count: 0,
      total_score: 0,
      total_comments: 0,
      top_post: null,
      subreddits: [],
      available: false,
    };
  }

  try {
    const token = await getRedditToken({ clientId, clientSecret });

    const params = new URLSearchParams({
      q: query,
      sort: "new",
      limit: "25",
      t: "month",
    });

    const res = await fetch(`https://oauth.reddit.com/search?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "crimesight-trending-scan/1.0",
      },
    });

    if (!res.ok) throw new Error(`Reddit search error ${res.status}`);

    const data = await res.json();
    const posts = (data.data?.children || []).map((c) => c.data);

    const totalScore = posts.reduce((sum, p) => sum + (p.score || 0), 0);
    const totalComments = posts.reduce((sum, p) => sum + (p.num_comments || 0), 0);
    const subreddits = [...new Set(posts.map((p) => p.subreddit))];

    let top = null;
    let topScore = -1;
    posts.forEach((p) => {
      if ((p.score || 0) > topScore) {
        topScore = p.score;
        top = {
          title: p.title,
          subreddit: p.subreddit,
          score: p.score,
          num_comments: p.num_comments,
          url: `https://reddit.com${p.permalink}`,
        };
      }
    });

    return {
      mention_count: posts.length,
      total_score: totalScore,
      total_comments: totalComments,
      top_post: top,
      subreddits,
      available: true,
    };
  } catch (err) {
    console.error("redditSignal failed:", err.message);
    return {
      mention_count: 0,
      total_score: 0,
      total_comments: 0,
      top_post: null,
      subreddits: [],
      available: false,
    };
  }
}