// api/channel-profile.js
// GET    /api/channel-profile -> returns the connected channel's profile
// DELETE /api/channel-profile -> disconnects (clears channel:profile:latest)

import { kv } from "./_lib/kv.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const profile = await kv.get("channel:profile:latest");
      if (!profile) {
        return res.status(404).json({ error: "No channel analyzed yet. Connect a channel first." });
      }
      return res.status(200).json(profile);
    } catch (err) {
      console.error("channel-profile GET error:", err);
      return res.status(500).json({ error: "Failed to load channel profile", detail: err.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await kv.set("channel:profile:latest", null);
      return res.status(200).json({ message: "Disconnected" });
    } catch (err) {
      console.error("channel-profile DELETE error:", err);
      return res.status(500).json({ error: "Failed to disconnect channel", detail: err.message });
    }
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}