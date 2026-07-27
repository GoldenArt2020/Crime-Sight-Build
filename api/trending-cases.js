// api/trending-cases.js
//
// GET  /api/trending-cases            -> serves the cached latest scan
// GET  /api/trending-cases?saved=true  -> serves the user's saved shortlist
// POST /api/trending-cases             -> save a case { caseData }
// DELETE /api/trending-cases           -> remove a saved case { id }

import { kv } from "./_lib/kv.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { saved } = req.query;

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