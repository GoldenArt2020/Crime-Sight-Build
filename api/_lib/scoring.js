// api/_lib/scoring.js
//
// Rule-based scoring on real numbers (YouTube/Reddit data), so the
// only thing Groq is asked to judge is the 4 qualitative dimensions
// (emotion, mystery, institutional_failure, public_outrage) that
// genuinely need a language model rather than arithmetic.

export function competitionScore({ video_count, avg_views }) {
  // Fewer existing videos = bigger opportunity gap for a new creator.
  let score;
  if (video_count === 0) score = 90;
  else if (video_count <= 5) score = 80;
  else if (video_count <= 15) score = 60;
  else if (video_count <= 30) score = 40;
  else score = 20;

  let label;
  if (score >= 75) label = "Low competition";
  else if (score >= 50) label = "Moderate competition";
  else if (score >= 30) label = "High competition";
  else label = "Saturated";

  return { score, label };
}

export function momentumScore({ mention_count, total_score, total_comments }) {
  const raw = mention_count * 3 + total_score * 0.1 + total_comments * 0.2;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  let trend;
  if (score >= 70) trend = "Surging";
  else if (score >= 40) trend = "Active";
  else if (score >= 15) trend = "Building";
  else trend = "Quiet";

  return { score, trend };
}

export function recencyScore(dateStr) {
  if (!dateStr) return { score: 0, days_ago: null };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { score: 0, days_ago: null };

  const daysAgo = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));

  let score;
  if (daysAgo <= 2) score = 100;
  else if (daysAgo <= 7) score = 85;
  else if (daysAgo <= 14) score = 65;
  else if (daysAgo <= 30) score = 40;
  else if (daysAgo <= 90) score = 20;
  else score = 5;

  return { score, days_ago: daysAgo };
}

export function overallViralScore({ competition, momentum, recency, qualitative }) {
  const emotion = qualitative.emotion ?? 50;
  const mystery = qualitative.mystery ?? 50;
  const institutional = qualitative.institutional_failure ?? 0;
  const outrage = qualitative.public_outrage ?? 50;

  const qualAvg = (emotion + mystery + institutional + outrage) / 4;

  const weighted =
    competition.score * 0.25 +
    momentum.score * 0.3 +
    recency.score * 0.2 +
    qualAvg * 0.25;

  return Math.round(Math.max(0, Math.min(100, weighted)));
}