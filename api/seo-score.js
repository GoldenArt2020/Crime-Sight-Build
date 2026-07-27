// api/seo-score.js
// SEO Studio — scores a proposed title against the channel's own
// proven patterns (archetype, trigger words, title length), and
// suggests stronger alternatives + description/tag guidance.
// POST /api/seo-score
// Body: { title: string, channelId: string, caseName?: string }

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { title, channelId, caseName } = req.body || {};

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

    const result = await scoreTitle({ title, channelProfile, caseName });

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

async function scoreTitle({ title, channelProfile, caseName }) {
  const systemPrompt = `You are a YouTube SEO analyst specializing in true crime content. You score titles against a specific channel's own historical performance patterns, not generic SEO advice. You are honest about weaknesses — a title with no emotional trigger and no curiosity gap should score low. Respond with ONLY a JSON object, no markdown, no commentary.`;

  const topTriggerWords = (channelProfile.topTriggers || [])
    .map((t) => t.trigger)
    .join(", ");

  const userPrompt = `
PROPOSED TITLE: "${title}"
TITLE LENGTH: ${title.length} characters
${caseName ? `CASE: ${caseName}` : ""}

CHANNEL'S PROVEN PATTERNS:
Archetype: ${channelProfile.archetype || "unknown"}
Channel's ideal title length (from top-quartile videos): ${channelProfile.avgTitleLength || "unknown"} chars
Channel's top-performing emotional triggers: ${topTriggerWords || "none identified"}
Channel's best historical video: ${channelProfile.topVideo?.title || "unknown"} (${channelProfile.topVideo?.viewsPerDay || 0} views/day)
Avg engagement rate: ${channelProfile.avgEngagementRate || "unknown"}%

TASK:
Score this title 0-100 for how well it fits THIS channel's proven patterns, then explain and improve it.
Do NOT invent an optimal upload time or category — that is supplied separately from real data, not part of your output.

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
    "suggested": "a 2-4 sentence YouTube description draft using the channel's tone, written for THIS title/case",
    "checkpoints": [
      { "label": "Include target keyword in first 200 chars", "status": "pass" | "warn" | "fail" },
      { "label": "Add 3+ relevant hashtags", "status": "pass" | "warn" | "fail" },
      { "label": "Include a clear hook in first line", "status": "pass" | "warn" | "fail" }
    ]
  },
  "tags": [
    { "tag": "...", "relevance": "high" | "medium" | "low" }
  ]
}
`.trim();

  const raw = await groqComplete({
    apiKey: process.env.GROQ_API_KEY,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJson(raw);

  if (!parsed || typeof parsed.score !== "number") {
    throw new Error("Groq returned an unparseable score result");
  }

  return {
    ...parsed,
    publishingOptimizer: buildPublishingOptimizer(channelProfile),
  };
}

// ---- Real publishing-time optimizer, built from channel-analyze.js's publishTiming data ----
// No model guessing here — this reads the channel's own computed best day/hour.

function buildPublishingOptimizer(channelProfile) {
  const timing = channelProfile.publishTiming;

  if (!timing || !timing.bestDay || timing.sampleSize === 0) {
    return {
      optimalUploadTime: "Not enough upload history yet to compute a real recommendation.",
      idealCategory: "Documentary",
      basis: "none",
    };
  }

  return {
    optimalUploadTime: `${timing.bestDay}, ${timing.bestHourLabel}`,
    idealCategory: "Documentary",
    basis: `Based on ${timing.sampleSize} of this channel's own uploads (real publishedAt/viewsPerDay data, not a general benchmark).`,
    sampleSize: timing.sampleSize,
  };
}