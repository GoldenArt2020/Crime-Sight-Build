// api/_lib/groq.js
//
// Groq free tier (generous daily token limits, no card required).
// Includes retry/backoff on transient errors (429/5xx).

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile"; // free-tier model

export async function groqComplete({ apiKey, systemPrompt, userPrompt, retries = 2 }) {
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          max_tokens: 2048,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Groq transient error: ${res.status}`);
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Groq error ${res.status}: ${body}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }

  throw lastErr;
}

// Groq sometimes wraps JSON in markdown fences or adds stray text.
// This strips that and safely parses whatever JSON object it can find.
export function extractJson(text) {
  if (!text) return null;

  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}