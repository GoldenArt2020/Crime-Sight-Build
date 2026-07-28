// api/seo-score.js
// SEO Studio — scores a proposed title against the channel's own
// proven patterns (archetype, trigger words, title length), and
// suggests stronger alternatives + description/tag/category guidance.
// Optionally accepts the actual video script so description, tags, and
// category recommendations are grounded in real content instead of
// guessed from the title alone.
// POST /api/seo-score
// Body: { title: string, channelId: string, caseName?: string, script?: string }

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

// YouTube's actual Studio category list (the ones creators can pick from
// when uploading). The model must choose from this fixed set — true crime
// content realistically lands in one of a handful of these, and inventing
// a category outside this list (e.g. "Documentary", which YouTube doesn't
// even offer) would be a suggestion the creator can't actually select.
const YOUTUBE_CATEGORIES = [
  "Film & Animation",
  "Autos & Vehicles",
  "Music",
  "Pets & Animals",
  "Sports",
  "Travel & Events",
  "Gaming",
  "People & Blogs",
  "Comedy",
  "Entertainment",
  "News & Politics",
  "Howto & Style",
  "Education",
  "Science & Technology",
  "Nonprofits & Activism",
];

// Cap how much script we forward — plenty for grounding tone/details, without
// blowing up prompt size/latency on a full multi-thousand-word script.
const MAX_SCRIPT_CHARS = 6000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, channelId, caseName, script } = req.body || {};

  if (!title || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!channelId) {
    return res.status(400).json({ error: "channelId is required (use profile.channelId from /api/channel-analyze)" });
  }

  try {
    const channelProfile = await kv.get(`channel:profile:${channelId}`);
    if (!channelProfile) {
      return res.status(404).json({
        error: "No channel profile found for this channelId. Call /api/channel-analyze first to connect this channel.",
      });
    }

    const result = await scoreTitle({ title, channelProfile, caseName, script });

    return res.status(200).json({
      title,
      titleLength: title.length,
      channelId,
      generatedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error("seo-score error:", err);
    return res.status(500).json({ error: "Failed to score title", detail: err.message });
  }
}

async function scoreTitle({ title, channelProfile, caseName, script }) {
  const systemPrompt = `You are a YouTube SEO analyst specializing in true crime content. You score titles against a specific channel's own historical performance patterns, not generic SEO advice. You are honest about weaknesses — a title with no emotional trigger and no curiosity gap should score low. When a script is provided, ground your description, tags, and category recommendation in the script's actual content and details rather than guessing from the title alone. Respond with ONLY a JSON object, no markdown, no commentary.`;

  const topTriggerWords = (channelProfile.topTriggers || [])
    .map((t) => t.trigger)
    .join(", ");

  const scriptExcerpt = script && script.trim()
    ? script.trim().slice(0, MAX_SCRIPT_CHARS)
    : null;

  const userPrompt = `
PROPOSED TITLE: "${title}"
TITLE LENGTH: ${title.length} characters
${caseName ? `CASE: ${caseName}` : ""}
${scriptExcerpt ? `\nVIDEO SCRIPT (use this to ground description, tags, and category — do not just restate the title):\n${scriptExcerpt}${script.trim().length > MAX_SCRIPT_CHARS ? "\n[script truncated for length]" : ""}\n` : "\n(No script provided — base description/tags on the title and case name only, and note that they're generic until a script is supplied.)\n"}

CHANNEL'S PROVEN PATTERNS:
Archetype: ${channelProfile.archetype || "unknown"}
Channel's ideal title length (from top-quartile videos): ${channelProfile.avgTitleLength || "unknown"} chars
Channel's top-performing emotional triggers: ${topTriggerWords || "none identified"}
Channel's best historical video: ${channelProfile.topVideo?.title || "unknown"} (${channelProfile.topVideo?.viewsPerDay || 0} views/day)
Avg engagement rate: ${channelProfile.avgEngagementRate || "unknown"}%

VALID YOUTUBE CATEGORIES (you must pick exactly one of these — do not invent a category outside this list):
${YOUTUBE_CATEGORIES.join(", ")}

TASK:
Score this title 0-100 for how well it fits THIS channel's proven patterns, then explain and improve it.
Do NOT invent an optimal upload time — that is supplied separately from real analytics data, not part of your output.
DO recommend a YouTube category from the list above, with a short reason grounded in the content (not a default guess).

Return JSON in this exact shape:
{
  "score": 72,
  "scoreLabel": "HIGH" | "MEDIUM" | "LOW",
  "reasons": [
    { "issue": "Weak Curiosity", "detail": "short explanation" },
    { "issue": "Overused Phrase", "detail": "short explanation" }
  ],
  "alternatives": [
    { "title": "...", "score": 95, "changeNote": "short note on what changed and why it's stronger" },
    { "title": "...", "score": 93, "changeNote": "..." },
    { "title": "...", "score": 91, "changeNote": "..." }
  ],
  "description": {
    "suggested": "a 2-4 sentence YouTube description draft using the channel's tone, written for THIS title/case, grounded in the script if one was provided",
    "checkpoints": [
      { "label": "Include target keyword in first 200 chars", "status": "pass" | "warn" | "fail" },
      { "label": "Add 3+ relevant hashtags", "status": "pass" | "warn" | "fail" },
      { "label": "Include a clear hook in first line", "status": "pass" | "warn" | "fail" }
    ]
  },
  "tags": [
    { "tag": "...", "relevance": "high" | "medium" | "low" }
  ],
  "categoryRecommendation": {
    "category": "must be exactly one string from the VALID YOUTUBE CATEGORIES list",
    "reasoning": "1 sentence on why this category fits this specific video, grounded in its content"
  }
}
`.trim();

  const raw = await groqComplete({
    apiKey: process.env.GROQ_API_KEY,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJson(raw);

  if (!parsed || typeof parsed.score !== "number") {
    const snippet = (raw || "(empty response)").slice(0, 800);
    throw new Error(`Groq returned an unparseable score result. Raw response (truncated): ${snippet}`);
  }

  // Guard against the model picking something outside the valid list despite
  // instructions — fall back to a safe default rather than showing a category
  // the creator can't actually select in YouTube Studio.
  if (
    parsed.categoryRecommendation &&
    !YOUTUBE_CATEGORIES.includes(parsed.categoryRecommendation.category)
  ) {
    parsed.categoryRecommendation.category = "Entertainment";
    parsed.categoryRecommendation.reasoning =
      (parsed.categoryRecommendation.reasoning || "") +
      " (Adjusted to a valid YouTube category — the model's original pick wasn't on the official list.)";
  }

  return {
    ...parsed,
    publishingOptimizer: buildPublishingOptimizer(channelProfile),
  };
}

// ---- Real publishing-time optimizer, built from channel-analyze.js's publishTiming data ----
// No model guessing here — this reads the channel's own computed best day/hour.
// Category lives in categoryRecommendation above instead (it needs judgment
// about content, which isn't something derivable from upload timestamps).

function buildPublishingOptimizer(channelProfile) {
  const timing = channelProfile.publishTiming;

  if (!timing || !timing.bestDay || timing.sampleSize === 0) {
    return {
      optimalUploadTime: "Not enough upload history yet to compute a real recommendation.",
      basis: "none",
    };
  }

  return {
    optimalUploadTime: `${timing.bestDay}, ${timing.bestHourLabel}`,
    basis: `Based on ${timing.sampleSize} of this channel's own uploads (real publishedAt/viewsPerDay data, not a general benchmark).`,
    sampleSize: timing.sampleSize,
  };
}