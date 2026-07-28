// api/channel-snapshot.js
// Lightweight read of the most recently connected channel's profile,
// for the Dashboard's "Channel Snapshot" card. Does not re-analyze —
// just serves whatever channel-analyze.js already cached.
// GET /api/channel-snapshot

import { kv } from "./_lib/kv.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const profile = await kv.get("channel:profile:latest");
    if (!profile) {
      return res.status(404).json({ error: "No channel connected yet. Use Channel Matchmaker to connect one." });
    }
    return res.status(200).json(profile);
  } catch (err) {
    console.error("channel-snapshot error:", err);
    return res.status(500).json({ error: "Failed to load channel snapshot", detail: err.message });
  }
}