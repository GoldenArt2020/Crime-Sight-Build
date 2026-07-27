// api/thumbnail-brief.js
// Thumbnail Studio — generates a creative brief (not an image) for a
// thumbnail: concept, composition, text overlay, color/mood, imagery
// direction, and an A/B test variant. Grounded in the channel's own
// archetype/trigger-word patterns from channel-analyze.js.
// POST /api/thumbnail-brief            -> generate a new brief { caseName, channelId, title? }
// POST /api/thumbnail-brief?save=true  -> save an already-generated brief { caseName, brief }
// GET  /api/thumbnail-brief?caseName=  -> retrieve the saved brief for a case

import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { caseName } = req.query;
    if (!caseName) {
      return res.status(400).json({ error: "caseName is required" });
    }
    const saved = await kv.get(`thumbnail:brief:${slugify(caseName)}`);
    if (!saved) {
      return res.status(404).json({ error: "No saved thumbnail brief for this case" });
    }
    return res.status(200).json(saved);
  }

  if (req.method === "POST") {
    const { save } = req.query;

    if (save === "true") {
      const { caseName, brief } = req.body || {};
      if (!caseName || !caseName.trim()) {
        return res.status(400).json({ error: "caseName is required" });
      }
      if (!brief || !brief.concept) {
        return res.status(400).json({ error: "brief (a generated thumbnail brief) is required" });
      }

      const record = { ...brief, caseName, savedAt: new Date().toISOString() };
      await kv.set(`thumbnail:brief:${slugify(caseName)}`, record);
      return res.status(200).json({ message: "Saved", brief: record });
    }

    // Default: generate a new brief
    const { caseName, channelId, title } = req.body || {};

    if (!caseName || !caseName.trim()) {
      return res.status(400).json({ error: "caseName is required" });
    }
    if (!channelId || !channelId.trim()) {
      return res.status(400).json({ error: "channelId is required (use profile.channelId from /api/channel-analyze)" });
    }

    try {
      const channelProfile = await kv.get(`channel:profile:${channelId}`);
      if (!channelProfile) {
        return res.status(404).json({
          error: "No channel profile found for this channelId. Call /api/channel-analyze first to connect this channel.",
        });
      }

      const brief = await generateBrief({ caseName, channelProfile, title });

      return res.status(200).json({
        caseName,
        channelId,
        title: title || null,
        generatedAt: new Date().toISOString(),
        ...brief,
      });
    } catch (err) {
      console.error("thumbnail-brief error:", err);
      return res.status(500).json({ error: "Failed to generate thumbnail brief", detail: err.message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function generateBrief({ caseName, channelProfile, title }) {
  const systemPrompt = `You are a YouTube thumbnail art director specializing in true crime content. You produce a creative brief for a human designer to execute — not an image, not a description of a finished image, but clear creative direction. You ground your direction in the channel's own proven visual identity and archetype. You are honest and specific, never generic ("bold text", "dramatic lighting" alone are not acceptable — give concrete, actionable direction). Respond with ONLY a JSON object, no markdown, no commentary.`;

  const topTriggerWords = (channelProfile.topTriggers || [])
    .map((t) => t.trigger)
    .join(", ");

  const userPrompt = `
CASE: ${caseName}
${title ? `VIDEO TITLE: "${title}"` : "VIDEO TITLE: not yet finalized"}

CHANNEL CONTEXT:
Channel: ${channelProfile.channelTitle || "unknown"}
Archetype: ${channelProfile.archetype || "unknown"}
Channel's top-performing emotional triggers: ${topTriggerWords || "none identified"}
Channel's best historical video: ${channelProfile.topVideo?.title || "unknown"}

TASK:
Produce a thumbnail creative brief for a human designer. This is direction, not a finished image — no photorealistic prose descriptions meant to stand in for the image itself.

Return JSON in this exact shape:
{
  "concept": "1-2 sentence core creative idea for this thumbnail, tied to the case and the channel's archetype",
  "composition": {
    "focalPoint": "what the eye should land on first, and why",
    "layout": "concrete layout direction, e.g. subject positioned left-third, text right-third, rule-of-thirds framing"
  },
  "textOverlay": {
    "primaryText": "2-5 word punchy overlay text, not the video title itself",
    "secondaryText": "optional short supporting text, or empty string if none needed"
  },
  "colorMood": {
    "mood": "1-3 words describing the emotional tone, e.g. Cold Dread, Urgent Alarm",
    "palette": ["#hexcode", "#hexcode", "#hexcode", "#hexcode"]
  },
  "imageryDirection": [
    "specific, concrete imagery guidance the designer can act on — not vague adjectives",
    "e.g. actual named location if known, actual case-relevant object, actual documented detail",
    "avoid inventing photographic details as if a real photo exists — direction only"
  ],
  "abTestVariant": {
    "concept": "a genuinely different creative approach for A/B testing, not a minor tweak",
    "primaryText": "alternative overlay text for this variant"
  }
}
`.trim();

  const raw = await groqComplete({
    apiKey: process.env.GROQ_API_KEY,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJson(raw);

  if (!parsed || !parsed.concept) {
    throw new Error("Groq returned an unparseable thumbnail brief");
  }

  return parsed;
}

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}