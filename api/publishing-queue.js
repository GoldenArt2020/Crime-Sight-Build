// api/publishing-queue.js
// Publishing Center backend — adds a production "stage" on top of the
// existing saved shortlist (trending:saved), so a case can move from
// idea -> researching -> scripting -> thumbnail -> published.
// GET   /api/publishing-queue            -> list all queued cases with their stage
// PATCH /api/publishing-queue { id, stage } -> move a case to a new stage

import { kv } from "./_lib/kv.js";

const VALID_STAGES = ["idea", "researching", "scripting", "thumbnail", "published"];

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const savedCases = (await kv.get("trending:saved")) || [];
      const queue = savedCases.map((c) => ({
        ...c,
        stage: c.stage || "idea",
      }));
      return res.status(200).json({ queue });
    } catch (err) {
      console.error("publishing-queue GET error:", err);
      return res.status(500).json({ error: "Failed to load publishing queue", detail: err.message });
    }
  }

  if (req.method === "PATCH") {
    const { id, stage } = req.body || {};
    if (!id || !stage) {
      return res.status(400).json({ error: "id and stage are required" });
    }
    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(", ")}` });
    }

    try {
      const savedCases = (await kv.get("trending:saved")) || [];
      const exists = savedCases.some((c) => c.id === id);
      if (!exists) {
        return res.status(404).json({ error: "Case not found in saved shortlist" });
      }

      const updated = savedCases.map((c) => (c.id === id ? { ...c, stage } : c));
      await kv.set("trending:saved", updated);
      return res.status(200).json({ message: "Updated", queue: updated });
    } catch (err) {
      console.error("publishing-queue PATCH error:", err);
      return res.status(500).json({ error: "Failed to update stage", detail: err.message });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}