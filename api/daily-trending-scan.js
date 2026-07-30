// api/trending-cases.js
//
// GET    /api/trending-cases                -> serves the cached latest scan
// GET    /api/trending-cases?saved=true      -> serves the user's saved shortlist
// POST   /api/trending-cases                 -> save a case { caseData }
// POST   /api/trending-cases?scan=true       -> run a trending scan { focus }
// POST   /api/trending-cases?scan=true&cron=true -> cron entry point (Bearer CRON_SECRET), rotates focus
// DELETE /api/trending-cases                 -> remove a saved case { id }

import { kv } from "./_lib/kv.js";
import { tavilySearch } from "./_lib/tavily.js";
import { groqComplete, extractJson } from "./_lib/groq.js";
import { youtubeCoverage } from "./_lib/youtube.js";
import { redditSignal } from "./_lib/reddit.js";
import { competitionScore, momentumScore, recencyScore, overallViralScore } from "./_lib/scoring.js";

const MAX_ENRICHED = 8;

const FOCUS_ROTATION = [
  null, // general trending
  "UK true crime",
  "US true crime",
  "unsolved mystery",
];

async function runScan(focus, res) {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const redditId = process.env.REDDIT_CLIENT_ID;
  const redditSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!tavilyKey) return res.status(500).json({ error: "TAVILY_API_KEY is not set on the server" });
  if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set on the server" });

  const query = focus
    ? `${focus} true crime case trending news this week`
    : `true crime case going viral trending news this week arrest OR trial OR sentencing OR missing person`;

  const searchContext = await tavilySearch({ apiKey: tavilyKey, query, maxResults: 10, includeSocial: true });

  const extractSystemPrompt = `You research true crime cases for a content research platform focused on CURRENTLY TRENDING cases — not obscure or under-covered ones. From the search results, extract real, verifiable cases that show signs of active public attention right now: recent news coverage, a recent development (arrest, trial start, verdict, new evidence, resurfaced interest), or clear signs of online discussion.

Do NOT invent cases. Only extract cases actually present in the search results. A case only qualifies if the results give a named victim or suspect, a specific location, and a specific recent date or dated development. If details are too thin, drop the case rather than guessing.

Include cases at ANY stage — under investigation, awaiting trial, in trial, or resolved — since trending cases are frequently still open. For each case, describe the case_status factually and precisely (e.g. "suspect arrested, awaiting arraignment" or "trial ongoing" or "convicted, sentencing scheduled"). Never imply guilt or resolution beyond what the sources state.

Respond with ONLY valid JSON: {"cases": [{"name": string, "location": string, "date": string (most recent relevant date, YYYY-MM-DD if possible), "summary": string (2 sentences, concrete facts only, neutral tone, no speculation), "case_status": string, "source_count": number (how many distinct search results mention this case)}]}. Return up to 10 cases. If nothing qualifies, return {"cases": []}.`;

  const extractText = await groqComplete({
    apiKey: groqKey,
    systemPrompt: extractSystemPrompt,
    userPrompt: `Search focus: ${focus || "general trending"}\n\nSearch results:\n${searchContext}`,
  });
  const extracted = extractJson(extractText);
  const rawCases = (extracted && extracted.cases) || [];

  const shortlist = rawCases.slice(0, MAX_ENRICHED);

  const qualitativeSystemPrompt = `You score true crime cases on four dimensions for a content-research tool, based ONLY on the facts given. Do not invent details. Score each 0-100:
- emotion: how emotionally affecting the known facts are
- mystery: how much genuine unresolved question/intrigue exists in the known facts
- institutional_failure: how much the known facts suggest a system (police, school, healthcare, etc.) failed to act — score 0 if there's no such element
- public_outrage: how much public anger/attention the facts would reasonably generate

Respond with ONLY valid JSON: {"emotion": number, "mystery": number, "institutional_failure": number, "public_outrage": number}.`;

  // Groq's free tier has a per-minute rate limit. Running all case-enrichment
  // calls in parallel (Promise.all) can burst past that limit in one instant,
  // so this processes cases one at a time and pauses briefly between each
  // Groq call. YouTube and Reddit calls are cheap/high-limit, so those two
  // still run in parallel per case.
  const enrichedCases = [];
  for (const c of shortlist) {
    const searchName = `${c.name} ${c.location}`;

    const [ytData, redditData] = await Promise.all([
      youtubeCoverage({ apiKey: youtubeKey, query: searchName }),
      redditSignal({ clientId: redditId, clientSecret: redditSecret, query: searchName }),
    ]);

    const qualText = await groqComplete({
      apiKey: groqKey,
      systemPrompt: qualitativeSystemPrompt,
      userPrompt: `Case: ${c.name}\nLocation: ${c.location}\nStatus: ${c.case_status}\nSummary: ${c.summary}`,
    });

    await new Promise((r) => setTimeout(r, 1200)); // pace Groq calls to respect free-tier RPM limit

    const qualitative = extractJson(qualText) || {};
    const competition = competitionScore({ video_count: ytData.video_count, avg_views: ytData.avg_views });
    const momentum = momentumScore({
      mention_count: redditData.mention_count,
      total_score: redditData.total_score,
      total_comments: redditData.total_comments,
    });
    const recency = recencyScore(c.date);
    const overall = overallViralScore({ competition, momentum, recency, qualitative });

    enrichedCases.push({
      id: `${c.name}-${c.location}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80),
      name: c.name,
      location: c.location,
      date: c.date,
      summary: c.summary,
      case_status: c.case_status,
      source_count: c.source_count || null,
      youtube_coverage: {
        video_count: ytData.video_count,
        avg_views: ytData.avg_views,
        top_video: ytData.top_video,
        available: ytData.available,
      },
      social_signal: {
        mention_count: redditData.mention_count,
        top_post: redditData.top_post,
        subreddits: redditData.subreddits,
        available: redditData.available,
      },
      viral_score: {
        overall,
        competition: competition.score,
        competition_label: competition.label,
        momentum: momentum.score,
        momentum_trend: momentum.trend,
        recency: recency.score,
        days_ago: recency.days_ago,
        emotion: qualitative.emotion ?? null,
        mystery: qualitative.mystery ?? null,
        institutional_failure: qualitative.institutional_failure ?? null,
        public_outrage: qualitative.public_outrage ?? null,
      },
      scanned_at: new Date().toISOString(),
    });
  }

  enrichedCases.sort((a, b) => b.viral_score.overall - a.viral_score.overall);

  const today = new Date().toISOString().slice(0, 10);
  const result = { date: today, focus: focus || null, cases: enrichedCases };
  await kv.set("trending:latest", result);

  return res.status(200).json(result);
}

export default async function handler(req, res) {
  const { saved, scan, cron } = req.query || {};

  if (req.method === "GET") {
    if (saved === "true") {
      const savedCases = (await kv.get("trending:saved")) || [];
      return res.status(200).json({ cases: savedCases });
    }

    const latest = await kv.get("trending:latest");
    if (!latest) {
      return res.status(200).json({ date: null, focus: null, cases: [] });
    }
    return res.status(200).json(latest);
  }

  if (req.method === "POST" && scan === "true") {
    try {
      if (cron === "true") {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const hour = new Date().getUTCHours();
        const rotationIndex = Math.floor(hour / 6) % FOCUS_ROTATION.length;
        return await runScan(FOCUS_ROTATION[rotationIndex], res);
      }

      const { focus } = req.body || {};
      return await runScan(focus, res);
    } catch (err) {
      return res.status(500).json({ error: err.message || "Trending scan failed" });
    }
  }

  if (req.method === "POST") {
    const { caseData } = req.body || {};
    if (!caseData || !caseData.id) {
      return res.status(400).json({ error: "caseData with an id is required" });
    }

    const savedCases = (await kv.get("trending:saved")) || [];
    const exists = savedCases.some((c) => c.id === caseData.id);
    if (exists) {
      return res.status(200).json({ message: "Already saved", cases: savedCases });
    }

    const updated = [...savedCases, { ...caseData, saved_at: new Date().toISOString() }];
    await kv.set("trending:saved", updated);
    return res.status(200).json({ message: "Saved", cases: updated });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const savedCases = (await kv.get("trending:saved")) || [];
    const updated = savedCases.filter((c) => c.id !== id);
    await kv.set("trending:saved", updated);
    return res.status(200).json({ message: "Removed", cases: updated });
  }

  return res.status(405).json({ error: "Method not allowed" });
}