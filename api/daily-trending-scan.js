// api/daily-trending-scan.js
//
// Cron-safe wrapper around trending-scan.js. Vercel Cron hits this
// endpoint on a schedule (see vercel.json). Rotates the focus area
// every 6 hours so the cache stays varied instead of always scanning
// the same generic query.

import handler from "./trending-scan.js";

const FOCUS_ROTATION = [
  null, // general trending
  "UK true crime",
  "US true crime",
  "unsolved mystery",
];

export default async function cronHandler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const hour = new Date().getUTCHours();
  const rotationIndex = Math.floor(hour / 6) % FOCUS_ROTATION.length;
  const focus = FOCUS_ROTATION[rotationIndex];

  req.method = "POST";
  req.body = { focus };

  return handler(req, res);
}