import { kv } from "./_lib/kv.js";
import { groqComplete, extractJson } from "./_lib/groq.js";


function scoreFit(channelProfile, caseItem) {
  const text = `${caseItem.name} ${caseItem.summary || ""} ${caseItem.case_status || ""}`.toLowerCase();
  const channelTriggerWords = channelProfile.topTriggers.map((t) => t.trigger);


  let keywordScore = 0;
  for (const trigger of channelTriggerWords) {
    if (text.includes(trigger)) keywordScore += 1;
  }
  // Normalize to 0-40
  const normalizedKeywordScore = Math.min(40, keywordScore * 10);


  // Reward low competition / unreleased coverage (fits a channel looking for gaps)
  const coverageScore =
    caseItem.coverage === "unreleased" ? 30 : caseItem.coverage === "low_coverage" ? 20 : 10;


  // Use the case's own viral score if present (viral_score is an object
  // like { overall, competition, public_outrage } from trending-scan/scoring.js —
  // pull out .overall, don't use the object itself, or this becomes NaN).
  const caseQuality = caseItem.viral_score?.overall ?? 50;
  const qualityScore = Math.min(30, Math.round((caseQuality / 100) * 30));


  const fitScore = Math.min(100, normalizedKeywordScore + coverageScore + qualityScore);


  return {
    fitScore,
    matchedTriggers: channelTriggerWords.filter((t) => text.includes(t)),
  };
}


async function generateAngle(groqKey, channelProfile, caseItem, matchedTriggers) {
  const systemPrompt = `You write one-sentence content-strategy notes for a true crime YouTube creator. Given their channel archetype, their proven title triggers, and a candidate case, respond with ONLY valid JSON: {"why_it_matches": string (max 20 words, concrete), "recommended_angle": string (a specific video angle/title direction, max 15 words)}. Be concrete and reference the actual case facts given — never generic filler.`;


  const userPrompt = `Channel archetype: ${channelProfile.archetype}
Channel's proven triggers: ${matchedTriggers.join(", ") || channelProfile.topTriggers.map((t) => t.trigger).join(", ")}
Channel's typical title length: ${channelProfile.avgTitleLength} characters


Case: ${caseItem.name}
Location: ${caseItem.location || "unspecified"}
Summary: ${caseItem.summary || "unspecified"}
Coverage status: ${caseItem.coverage || "unspecified"}`;


  try {
    const text = await groqComplete({ apiKey: groqKey, systemPrompt, userPrompt });
    const parsed = extractJson(text);
    return {
      why_it_matches: parsed?.why_it_matches || "Matches your channel's proven archetype.",
      recommended_angle: parsed?.recommended_angle || `The story behind ${caseItem.name}`,
    };
  } catch {
    return {
      why_it_matches: "Matches your channel's proven archetype.",
      recommended_angle: `The story behind ${caseItem.name}`,
    };
  }
}


export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }


  const groqKey = process.env.GROQ_API_KEY;


  try {
    const channelProfile = await kv.get("channel:profile:latest");
    if (!channelProfile) {
      return res.status(404).json({ error: "No channel analyzed yet. POST to /api/channel-analyze first." });
    }


    const trending = (await kv.get("trending:latest")) || { cases: [] };
    const cases = trending.cases || [];


    if (!cases.length) {
      return res.status(200).json({ channel: channelProfile.channelTitle, matches: [] });
    }


    const scored = cases
      .map((c) => {
        const { fitScore, matchedTriggers } = scoreFit(channelProfile, c);
        return { case: c, fitScore, matchedTriggers };
      })
      .sort((a, b) => b.fitScore - a.fitScore);


    const topN = scored.slice(0, 6);
    const rest = scored.slice(6);


    // Groq's free tier has a per-minute rate limit. Firing all 6 angle
    // calls at once (Promise.all) can burst past that limit; when it does,
    // groqComplete's retry/backoff (up to 4 retries, honoring Retry-After)
    // can legitimately take well over a minute PER call, and with 6 calls
    // retrying in lockstep that stacked past Vercel's 300s function limit
    // and 504'd. Processing one at a time with a short pause between each
    // avoids tripping the limit in the first place — same fix already
    // applied to trending-cases.js's enrichment loop.
    const enrichedTop = [];
    for (const item of topN) {
      let angle = {
        why_it_matches: "Matches your channel's proven archetype.",
        recommended_angle: `The story behind ${item.case.name}`,
      };
      if (groqKey) {
        angle = await generateAngle(groqKey, channelProfile, item.case, item.matchedTriggers);
        await new Promise((r) => setTimeout(r, 1200)); // pace Groq calls to respect free-tier RPM limit
      }
      enrichedTop.push({
        id: item.case.id || item.case.name,
        name: item.case.name,
        location: item.case.location,
        date: item.case.date,
        fitScore: item.fitScore,
        coverage: item.case.coverage,
        ...angle,
      });
    }


    const restMinimal = rest.map((item) => ({
      id: item.case.id || item.case.name,
      name: item.case.name,
      fitScore: item.fitScore,
    }));


    return res.status(200).json({
      channel: channelProfile.channelTitle,
      archetype: channelProfile.archetype,
      analyzedAt: channelProfile.analyzedAt,
      matches: [...enrichedTop, ...restMinimal],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Channel matching failed" });
  }
}