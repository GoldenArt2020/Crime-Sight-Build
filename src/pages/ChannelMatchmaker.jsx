import { useState } from "react";
import { Link2, Loader2, Sparkles, TrendingUp, RefreshCw, Wand2, Search, Copy, Check } from "lucide-react";

function FitGauge({ score }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 85 ? "#22d3ee" : score >= 60 ? "#a78bfa" : "#f472b6";

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg width="64" height="64" className="-rotate-90">
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
          fill="none"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-sm font-semibold text-white">
        {score}
      </span>
    </div>
  );
}

function ChannelIdBadge({ channelId }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(channelId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // Clipboard API can fail in some environments (e.g. insecure context) —
      // fail silently rather than throwing, the ID is still visible to select manually.
    }
  }

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-cyan-300/70">Channel ID</p>
        <p className="text-sm font-mono text-cyan-300 truncate">{channelId}</p>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-cyan-400/20 text-cyan-300 hover:bg-cyan-400/10 transition-colors"
      >
        {copied ? (
          <>
            <Check size={12} /> Copied
          </>
        ) : (
          <>
            <Copy size={12} /> Copy
          </>
        )}
      </button>
    </div>
  );
}

function CaseCard({ item, channelId, onAnglesGenerated }) {
  const isEnriched = Boolean(item.recommended_angle);
  const [generating, setGenerating] = useState(false);
  const [researching, setResearching] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleGenerateAngle() {
    if (!channelId) {
      setLocalError("Connect a channel first");
      return;
    }
    setLocalError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/angle-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: item.id,
          caseName: item.id ? undefined : item.name,
          channelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate angles");
      onAnglesGenerated?.(item, data);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleStartResearch() {
    setLocalError(null);
    setResearching(true);
    try {
      const params = item.id ? `id=${encodeURIComponent(item.id)}` : `name=${encodeURIComponent(item.name)}`;
      const res = await fetch(`/api/case-detail?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to research case");
      window.location.href = `/case-intelligence?id=${data.id}`;
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setResearching(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex flex-col gap-3 hover:border-cyan-400/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-white font-medium leading-tight">{item.name}</h4>
          {item.location && (
            <p className="text-xs text-white/40 mt-0.5">
              {item.location} {item.date ? `· ${item.date}` : ""}
            </p>
          )}
        </div>
        <FitGauge score={item.fitScore} />
      </div>

      {isEnriched && (
        <>
          <div className="text-xs text-white/60 leading-relaxed">
            <span className="text-cyan-400 font-medium">Why it matches: </span>
            {item.why_it_matches}
          </div>
          <div className="text-xs text-white/60 leading-relaxed">
            <span className="text-fuchsia-400 font-medium">Recommended angle: </span>
            {item.recommended_angle}
          </div>
        </>
      )}

      {item.coverage && (
        <span className="self-start text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50">
          {item.coverage.replace("_", " ")}
        </span>
      )}

      {localError && (
        <p className="text-[11px] text-red-300">{localError}</p>
      )}

      {isEnriched && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleGenerateAngle}
            disabled={generating}
            className="flex-1 text-xs font-medium bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white rounded-lg py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {generating ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Wand2 size={12} /> Generate Angle
              </>
            )}
          </button>
          <button
            onClick={handleStartResearch}
            disabled={researching}
            className="flex-1 text-xs font-medium border border-white/15 text-white/80 rounded-lg py-1.5 hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {researching ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Researching...
              </>
            ) : (
              <>
                <Search size={12} /> Start Research
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function AnglesPanel({ caseName, angles, onClose }) {
  return (
    <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 backdrop-blur-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/80">
          Ranked Angles — <span className="text-fuchsia-400">{caseName}</span>
        </h3>
        <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">
          Close
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {angles.map((a) => (
          <div key={a.rank} className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-cyan-400 font-semibold">
                Rank {a.rank}
              </span>
              <span className="text-xs font-semibold text-white/80">{a.opportunityScore}/100</span>
            </div>
            <p className="text-sm text-white font-medium mt-1 leading-snug">{a.title}</p>
            <p className="text-xs text-white/50 mt-1">{a.angleSummary}</p>
            <p className="text-[11px] text-fuchsia-300 mt-2">{a.bestPerformanceMatch}</p>
            {a.contentGaps?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {a.contentGaps.map((gap, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50"
                  >
                    {gap}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChannelMatchmaker() {
  const [channelUrl, setChannelUrl] = useState("");
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState(null);
  const [activeAngles, setActiveAngles] = useState(null); // { caseName, angles }

  async function handleConnect() {
    if (!channelUrl.trim()) return;
    setError(null);
    setLoadingAnalyze(true);
    setMatches([]);
    setActiveAngles(null);

    try {
      const res = await fetch("/api/channel-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze channel");
      setProfile(data); // includes data.channelId — the real resolved UC... ID
      await fetchMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function fetchMatches() {
    setLoadingMatches(true);
    try {
      const res = await fetch("/api/channel-matches");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load matches");
      setMatches(data.matches || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMatches(false);
    }
  }

  function handleAnglesGenerated(item, data) {
    setActiveAngles({ caseName: item.name, angles: data.angles });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          Channel Matchmaker
        </h1>
        <p className="text-white/40 text-sm mt-1">
          A premium true crime content intelligence platform
        </p>
      </div>

      {/* Connect bar */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex-1 flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
          <Link2 size={16} className="text-white/40" />
          <input
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            placeholder="youtube.com/@YourChannel"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-white/30"
          />
        </div>
        <button
          onClick={handleConnect}
          disabled={loadingAnalyze}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loadingAnalyze ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Analyzing...
            </>
          ) : (
            "Connect Channel"
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">
          {error}
        </div>
      )}

      {/* Channel ID — copyable, needed to use SEO Studio, Thumbnail Studio, Competition Analyzer */}
      {profile?.channelId && <ChannelIdBadge channelId={profile.channelId} />}

      {/* Channel profile summary */}
      {profile && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Subscribers</p>
            <p className="text-lg font-semibold mt-1">
              {profile.subscriberCount?.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Avg Views/Day</p>
            <p className="text-lg font-semibold mt-1">
              {profile.avgViewsPerDay?.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Avg Title Length</p>
            <p className="text-lg font-semibold mt-1">{profile.avgTitleLength} chars</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Archetype</p>
            <p className="text-sm font-semibold mt-1 text-cyan-400">
              {profile.archetype}
            </p>
          </div>
        </div>
      )}

      {/* Active angle results, shown when "Generate Angle" was clicked on a card */}
      {activeAngles && (
        <AnglesPanel
          caseName={activeAngles.caseName}
          angles={activeAngles.angles}
          onClose={() => setActiveAngles(null)}
        />
      )}

      {/* Recommendations */}
      {(matches.length > 0 || loadingMatches) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white/70 flex items-center gap-2">
              <Sparkles size={14} className="text-fuchsia-400" />
              Personalized Case Recommendations
            </h3>
            <button
              onClick={fetchMatches}
              className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {loadingMatches ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 size={14} className="animate-spin" /> Matching cases...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches.map((item) => (
                <CaseCard
                  key={item.id}
                  item={item}
                  channelId={profile?.channelId}
                  onAnglesGenerated={handleAnglesGenerated}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!profile && !loadingAnalyze && (
        <div className="text-center text-white/30 text-sm py-16 flex flex-col items-center gap-2">
          <TrendingUp size={24} />
          Paste your channel link above to get personalized case recommendations.
        </div>
      )}
    </div>
  );
}