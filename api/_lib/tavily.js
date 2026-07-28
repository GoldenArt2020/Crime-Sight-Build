// api/_lib/tavily.js
//
// Tavily free tier: 1,000 searches/month, no card required.
// includeSocial=true opens up Reddit/Twitter/TikTok as sources,
// which is what "trending" detection actually needs (unlike the
// conservative FOIA-sourcing version this was adapted from).

const TAVILY_URL = "https://api.tavily.com/search";

const SOCIAL_DOMAINS = ["reddit.com", "twitter.com", "x.com", "tiktok.com"];

export async function tavilySearch({ apiKey, query, maxResults = 10, includeSocial = false }) {
  const body = {
    api_key: apiKey,
    query,
    search_depth: "advanced",
    max_results: maxResults,
    include_answer: false,
    include_raw_content: false,
  };

  if (!includeSocial) {
    body.exclude_domains = SOCIAL_DOMAINS;
  }

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tavily error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const results = data.results || [];

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}\n`)
    .join("\n---\n");
}