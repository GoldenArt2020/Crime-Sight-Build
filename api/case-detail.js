// api/case-detail.js
// Case Intelligence — deep-dive on a single case: timeline, key facts,
// evidence points, sources. Researches via Tavily if not already cached,
// then caches the result so repeat views (and thumbnail-brief.js) are instant.
// GET /api/case-detail?id=<caseId>  OR  ?name=<caseName>

import { kv } from "./_lib/kv.js";
import { tavilySearch } from "./_lib/tavily.js";
import { groqComplete, extractJson } from "./_lib/groq.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id, name } = req.query || {};

  if (!id && !name) {
    return res.status(400).json({ error: "id or name query param is required" });
  }

  try {
    const caseId = id || slugify(name);

    // Serve from cache if we've already researched this case
    const cached = await kv.get(`case:detail:${caseId}`);
    if (cached) {
      return res.status(200).json(cached);
    }

    const caseName = name;
    if (!caseName) {
      return res.status(404).json({ error: "No cached case found for that id, and no name given to research fresh" });
    }

    // tavilySearch returns a single pre-formatted string block, e.g.
    // "[1] Title\nURL: https://...\ncontent...\n\n---\n[2] Title\n..."
    const sourceText = await tavilySearch({
      apiKey: process.env.TAVILY_API_KEY,
      query: `${caseName} true crime case facts timeline evidence`,
      maxResults: 8,
      includeSocial: false, // factual case research, not trend-sensing — keep to news/reference sites
    });

    const parsedSources = parseSourcesFromTavilyText(sourceText);
    const detail = await synthesizeCaseDetail({ caseName, sourceText });

    const record = {
      id: caseId,
      name: caseName,
      ...detail,
      sources: parsedSources.slice(0, 6),
      researchedAt: new Date().toISOString(),
    };

    await kv.set(`case:detail:${caseId}`, record);

    return res.status(200).json(record);
  } catch (err) {
    console.error("case-detail error:", err);
    return res.status(500).json({ error: "Failed to load case detail", detail: err.message });
  }
}

async function synthesizeCaseDetail({ caseName, sourceText }) {
  const systemPrompt = `You are a true crime research assistant. You synthesize search results into a structured, factual case brief for a content creator. You never invent facts not supported by the source material — if something is unclear or disputed across sources, say so explicitly rather than guessing. Respond with ONLY a JSON object, no markdown, no commentary.`;

  const userPrompt = `
CASE: ${caseName}

SOURCE MATERIAL:
${sourceText || "No sources found."}

TASK:
Synthesize the above into a structured case brief. If sources are thin or conflicting, reflect that honestly in the fields rather than fabricating specifics.

Return JSON in this exact shape:
{
  "summary": "2-3 sentence factual overview",
  "location": "city, state/country, or null if unclear",
  "date": "year or date range, or null if unclear",
  "status": "unsolved" | "solved" | "cold_case" | "unclear",
  "timeline": [
    { "date": "...", "event": "..." }
  ],
  "keyFacts": ["short factual bullet", "short factual bullet"],
  "evidencePoints": ["specific piece of evidence or lead", "..."],
  "openQuestions": ["unresolved question a video could explore", "..."],
  "contentAngleHints": ["short hint at an interesting narrative angle, not a full pitch"]
}
`.trim();

  const raw = await groqComplete({
    apiKey: process.env.GROQ_API_KEY,
    systemPrompt,
    userPrompt,
  });

  const parsed = extractJson(raw);
  if (!parsed || !parsed.summary) {
    throw new Error("Groq returned an unparseable case detail result");
  }
  return parsed;
}

// Parses tavily.js's formatted string output back into { title, url } pairs,
// since it returns a joined string rather than structured data.
function parseSourcesFromTavilyText(text) {
  if (!text) return [];
  const blocks = text.split("\n---\n");
  const sources = [];

  for (const block of blocks) {
    const titleMatch = block.match(/^\[\d+\]\s*(.+)$/m);
    const urlMatch = block.match(/^URL:\s*(.+)$/m);
    if (titleMatch && urlMatch) {
      sources.push({ title: titleMatch[1].trim(), url: urlMatch[1].trim() });
    }
  }

  return sources;
}

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}