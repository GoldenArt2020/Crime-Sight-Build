// api/angle-generator.js
// YouTube Angle Generator — 5 ranked content angles for a case,
// tailored to a specific channel's archetype and proven patterns.
// POST /api/angle-generator
// Body: { caseId?: string, caseName?: string, channelId: string }
// (channelId comes from the response of /api/channel-analyze, e.g. profile.channelId)

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { caseId, caseName, channelId, force } = req.body || {};

  if (!channelId) {
    return res.status(400).json({ error: "channelId is required (use profile.channelId from /api/channel-analyze)" });
  }
  if (!caseId && !caseName) {
    return res.status(400).json({ error: "Provide either caseId or caseName" });
  }

  try {
    const resolvedId = caseId || slugify(caseName);
    const cacheKey = `angles:${resolvedId}:${channelId}`;

    if (!force) {
      const cached = await kv.get(cacheKey);
      if (cached) return res.status(200).json({ ...cached, cached: true });
    }

    const caseDetail = await kv.get(`case:detail:${resolvedId}`);
    if (!caseDetail) {
      return res.status(404).json({
        error: "No case detail found for this case. Call /api/case-detail first to research it.",
      });
    }

    const channelProfile = await kv.get(`channel:profile:${channelId}`);
    if (!channelProfile) {
      return res.status(404).json({
        error: "No channel profile found for this channelId. Call /api/channel-analyze first to connect this channel.",
      });
    }

    const angles = await generateAngles({ caseDetail, channelProfile });

    const payload = {
      caseId: resolvedId,
      caseName: caseDetail.name,
      channelId,
      channelTitle: channelProfile.channelTitle,
      generatedAt: new Date().toISOString(),
      angles,
    };

    await kv.set(cacheKey, payload, { ex: CACHE_TTL_SECONDS });

    return res.status(200).json({ ...payload, cached: false });
  } catch (err) {
    console.error("angle-generator error:", err);
    return res.status(500).json({ error: "Failed to generate angles", detail: err.message });
  }
}

async function generateAngles({ caseDetail, channelProfile }) {
  const systemPrompt = `You are a YouTube true crime content strategist. You generate content angles that are specific, evidence-grounded, and tailored to a channel's proven style. You never invent facts not present in the case material provided — if evidence is thin, say so in the angle's gap notes rather than fabricating detail. Respond with ONLY a JSON object, no markdown, no commentary.`;

  const topTriggerWords = (channelProfile.topTriggers || [])
    .map((t) => t.trigger)
    .join(", ");

  const userPrompt = `
CASE MATERIAL:
Name: ${caseDetail.name}
Summary: ${caseDetail.summary}
Key facts: ${JSON.stringify(caseDetail.keyFacts || [])}
Evidence points: ${JSON.stringify(caseDetail.evidencePoints || [])}
Open questions: ${JSON.stringify(caseDetail.openQuestions || [])}
Existing content angle hints: ${JSON.stringify(caseDetail.contentAngleHints || [])}

CHANNEL PROFILE:
Channel: ${channelProfile.channelTitle || "unknown"}
Archetype: ${channelProfile.archetype || "unknown"}
Avg title length: ${channelProfile.avgTitleLength || "unknown"} chars
Subscribers: ${channelProfile.subscriberCount || "unknown"}
Avg views/day: ${channelProfile.avgViewsPerDay || "unknown"}
Avg engagement rate: ${channelProfile.avgEngagementRate || "unknown"}%
Top-performing emotional triggers in their titles: ${topTriggerWords || "none identified"}
Best historical video: ${channelProfile.topVideo?.title || "unknown"} (${channelProfile.topVideo?.viewsPerDay || 0} views/day)

TASK:
Generate exactly 5 distinct content angles for this case, ranked 1-5 by opportunity (best first).
Each angle must exploit a genuine gap in existing coverage, not just restate the case.
Favor angles that naturally incorporate the channel's proven emotional triggers where the case material genuinely supports them — do not force a trigger word if the facts don't back it.
For each angle, return:
- rank (1-5)
- title: a hook-style working title matching the channel's title length and tone
- opportunityScore: 0-100, based on how underserved this angle is + how well it fits the channel's archetype
- bestPerformanceMatch: short phrase naming which of the channel's proven patterns this angle reuses (e.g. "Matches 'Systemic Failure' archetype")
- angleSummary: 1-2 sentences describing the actual content approach
- contentGaps: array of 1-3 short phrases naming what competitors have missed (e.g. "Missing key detail", "No family perspective")
- groundedIn: array of exact key facts / evidence points from the case material above that this angle is actually built on (do not invent sources)

Return JSON in this exact shape:
{
  "angles": [
    { "rank": 1, "title": "...", "opportunityScore": 95, "bestPerformanceMatch": "...", "angleSummary": "...", "contentGaps": ["..."], "groundedIn": ["..."] }
  ]
}
`.trim();

  const raw = await groqComplete({
    apiKey: process.env.GROQ_API_KEY,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJson(raw);

  if (!parsed?.angles || !Array.isArray(parsed.angles)) {
    throw new Error("Groq returned an unparseable or empty angles list");
  }

  return parsed.angles
    .slice(0, 5)
    .sort((a, b) => (a.rank || 99) - (b.rank || 99));
}

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}