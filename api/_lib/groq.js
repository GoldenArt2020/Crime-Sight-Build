// api/_lib/groq.js
//
// Groq free tier (generous daily token limits, no card required).
// Includes retry/backoff on transient errors (429/5xx).

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile"; // free-tier model

export async function groqComplete({ apiKey, systemPrompt, userPrompt, retries = 4 }) {
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
        // Groq (like most rate-limited APIs) may send Retry-After on 429s —
        // honor it when present instead of guessing with pure backoff, since
        // free-tier limits are often per-minute and a short backoff isn't
        // long enough to actually clear.
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
        const err = new Error(`Groq transient error: ${res.status}`);
        err.retryAfterMs = retryAfterMs;
        throw err;
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
        // Base backoff: 1s, 2s, 4s, 8s — with jitter to avoid thundering-herd
        // retries if multiple requests are rate limited at once. If the
        // server told us how long to wait, use whichever is longer.
        const baseDelay = 1000 * 2 ** attempt;
        const jitter = Math.random() * 300;
        const delay = Math.max(baseDelay + jitter, err.retryAfterMs || 0);
        await new Promise((r) => setTimeout(r, delay));
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