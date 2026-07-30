import { useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  Loader2,
  Bookmark,
  BookmarkCheck,
  TrendingUp,
  Link2,
  Copy,
  Check,
  Wand2,
  ArrowRight,
} from "lucide-react";

const CASE_TYPES = ["All Types", "Missing Persons", "Unsolved", "Cold Case", "Trial", "Recently Solved"];
const SORT_OPTIONS = [
  { value: "viral", label: "Viral Potential" },
  { value: "recent", label: "Most Recent" },
  { value: "competition", label: "Lowest Competition" },
];

function Gauge({ label, value, invert = false }) {
  const good = invert ? value <= 33 : value >= 67;
  const mid = invert ? value > 33 && value <= 66 : value >= 34 && value < 67;
  const color = good ? "text-cyan-400" : mid ? "text-amber-300" : "text-pink-400";
  return (
    <div>
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}/100</p>
    </div>
  );
}

function FitGauge({ score }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((score ?? 0) / 100) * circumference;
  const color = score >= 85 ? "#22d3ee" : score >= 60 ? "#a78bfa" : "#f472b6";

  return (
    <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="5" fill="none" />
        <circle
          cx="24" cy="24" r={radius}
          stroke={color} strokeWidth="5" fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xs font-semibold text-white">{score ?? 0}</span>
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
    } catch {
      // clipboard can fail in some contexts — id is still selectable manually
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
        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
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
        <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">Close</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {angles.map((a) => (
          <div key={a.rank} className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-cyan-400 font-semibold">Rank {a.rank}</span>
              <span className="text-xs font-semibold text-white/80">{a.opportunityScore}/100</span>
            </div>
            <p className="text-sm text-white font-medium mt-1 leading-snug">{a.title}</p>
            <p className="text-xs text-white/50 mt-1">{a.angleSummary}</p>
            <p className="text-[11px] text-fuchsia-300 mt-2">{a.bestPerformanceMatch}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Card used once a channel is connected — fit score + angle/research actions
function ConnectedCaseCard({ item, channelId, isSaved, onToggleSave, savingId, onAnglesGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [researching, setResearching] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleGenerateAngle() {
    setLocalError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/angle-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: item.id, channelId }),
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
      const res = await fetch(`/api/case-detail?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}`);
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
        <div className="min-w-0">
          <h4 className="text-white font-medium leading-tight truncate">{item.name}</h4>
          <p className="text-xs text-white/40 mt-0.5 truncate">
            {item.location} {item.date ? `· ${item.date}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FitGauge score={item.fitScore} />
          <button
            onClick={() => onToggleSave(item)}
            disabled={savingId === item.id}
            className="text-white/40 hover:text-cyan-400 transition-colors"
            title={isSaved ? "Remove from shortlist" : "Save to shortlist"}
          >
            {savingId === item.id ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isSaved ? (
              <BookmarkCheck size={16} className="text-cyan-400" />
            ) : (
              <Bookmark size={16} />
            )}
          </button>
        </div>
      </div>

      {item.why_it_matches && (
        <div className="text-xs text-white/60 leading-relaxed">
          <span className="text-cyan-400 font-medium">Why it matches: </span>{item.why_it_matches}
        </div>
      )}
      {item.recommended_angle && (
        <div className="text-xs text-white/60 leading-relaxed">
          <span className="text-fuchsia-400 font-medium">Recommended angle: </span>{item.recommended_angle}
        </div>
      )}
      {item.coverage && (
        <span className="self-start text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50">
          {item.coverage.replace("_", " ")}
        </span>
      )}
      {localError && <p className="text-[11px] text-red-300">{localError}</p>}

      <div className="flex gap-2 mt-1">
        <button
          onClick={handleGenerateAngle}
          disabled={generating}
          className="flex-1 text-xs font-medium bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white rounded-lg py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {generating ? <><Loader2 size={12} className="animate-spin" /> Generating...</> : <><Wand2 size={12} /> Generate Angle</>}
        </button>
        <button
          onClick={handleStartResearch}
          disabled={researching}
          className="flex-1 text-xs font-medium border border-white/15 text-white/80 rounded-lg py-1.5 hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {researching ? <><Loader2 size={12} className="animate-spin" /> Researching...</> : <><ArrowRight size={12} /> Open Project</>}
        </button>
      </div>
    </div>
  );
}

// Card used when no channel is connected yet — original Discover Cases card
function GeneralCaseCard({ item, isSaved, onToggleSave, savingId }) {
  const viral = item.viral_score?.overall ?? 0;
  const competition = item.viral_score?.competition ?? 0;
  const outrage = item.viral_score?.public_outrage ?? 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex flex-col gap-3 hover:border-cyan-400/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-white font-medium leading-tight">{item.name}</h4>
          <p className="text-xs text-white/40 mt-0.5">
            {item.location} {item.date ? `· ${item.date}` : ""}
          </p>
        </div>
        <button
          onClick={() => onToggleSave(item)}
          disabled={savingId === item.id}
          className="shrink-0 text-white/40 hover:text-cyan-400 transition-colors"
          title={isSaved ? "Remove from shortlist" : "Save to shortlist"}
        >
          {savingId === item.id ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isSaved ? (
            <BookmarkCheck size={16} className="text-cyan-400" />
          ) : (
            <Bookmark size={16} />
          )}
        </button>
      </div>

      <p className="text-xs text-white/60 leading-relaxed line-clamp-3">{item.summary}</p>

      <span className="self-start text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/10 text-white/50">
        {item.case_status}
      </span>

      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/10">
        <Gauge label="Viral" value={viral} />
        <Gauge label="Competition" value={competition} invert />
        <Gauge label="Outrage" value={outrage} />
      </div>

      <div className="flex gap-2 text-[11px] text-white/40 pt-1">
        <span>{item.youtube_coverage?.video_count ?? 0} YT videos</span>
        <span>·</span>
        <span>{item.social_signal?.mention_count ?? 0} social mentions</span>
      </div>

      <button
        onClick={() =>
          (window.location.href = `/case-intelligence?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}`)
        }
        className="mt-1 text-xs font-medium bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white rounded-lg py-1.5 hover:opacity-90 transition-opacity"
      >
        Open Case Intelligence
      </button>
    </div>
  );
}

export default function DiscoverCases() {
  const [query, setQuery] = useState("");
  const [caseType, setCaseType] = useState(CASE_TYPES[0]);
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0].value);
  const [cases, setCases] = useState([]);
  const [savedIds, setSavedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  // Channel connect + fit-matching state (from the old Channel Matchmaker)
  const [channelUrl, setChannelUrl] = useState("");
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [activeAngles, setActiveAngles] = useState(null);
  const [checkingChannel, setCheckingChannel] = useState(true);

  useEffect(() => {
    loadCached();
    loadSaved();
    loadExistingChannel();
  }, []);

  async function loadCached() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trending-cases");
      const data = await res.json();
      setCases(data.cases || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSaved() {
    try {
      const res = await fetch("/api/trending-cases?saved=true");
      const data = await res.json();
      setSavedIds(new Set((data.cases || []).map((c) => c.id)));
    } catch {
      // non-fatal
    }
  }

  // If a channel was already connected in a previous session, load it
  // automatically instead of asking to reconnect every visit.
  async function loadExistingChannel() {
    setCheckingChannel(true);
    try {
      const res = await fetch("/api/channel-profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        await fetchMatches();
      }
    } catch {
      // non-fatal — just shows the connect bar
    } finally {
      setCheckingChannel(false);
    }
  }

  async function runFreshScan() {
    setScanning(true);
    setError(null);
    try {
      // Was POSTing to /api/trending-scan, which no longer exists — the
      // scan endpoint now lives on trending-cases.js behind ?scan=true.
      const res = await fetch("/api/trending-cases?scan=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: query.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setCases(data.cases || []);
      if (profile) await fetchMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleConnect() {
    if (!channelUrl.trim()) return;
    setError(null);
    setLoadingAnalyze(true);
    try {
      const res = await fetch("/api/channel-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze channel");
      setProfile(data);
      await fetchMatches();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      const res = await fetch("/api/channel-profile", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect channel");
      setProfile(null);
      setMatches([]);
      setChannelUrl("");
    } catch (err) {
      setError(err.message);
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

  async function toggleSave(item) {
    setSavingId(item.id);
    try {
      if (savedIds.has(item.id)) {
        await fetch("/api/trending-cases", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      } else {
        await fetch("/api/trending-cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseData: item }),
        });
        setSavedIds((prev) => new Set(prev).add(item.id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  const isConnected = Boolean(profile?.channelId);

  const filteredGeneral = cases
    .filter((c) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.location || "").toLowerCase().includes(q);
    })
    .filter((c) => {
      if (caseType === "All Types") return true;
      const status = (c.case_status || "").toLowerCase();
      if (caseType === "Missing Persons") return status.includes("missing");
      if (caseType === "Unsolved") return status.includes("unsolved") || status.includes("investigation");
      if (caseType === "Cold Case") return status.includes("cold");
      if (caseType === "Trial") return status.includes("trial") || status.includes("arraign");
      if (caseType === "Recently Solved") return status.includes("convict") || status.includes("sentenc");
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "viral") return (b.viral_score?.overall ?? 0) - (a.viral_score?.overall ?? 0);
      if (sortBy === "competition") return (a.viral_score?.competition ?? 0) - (b.viral_score?.competition ?? 0);
      if (sortBy === "recent") return new Date(b.date || 0) - new Date(a.date || 0);
      return 0;
    });

  const filteredMatches = matches.filter((m) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return m.name.toLowerCase().includes(q) || (m.location || "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Discovery</h1>
        <p className="text-white/40 text-sm mt-1">
          {isConnected
            ? "Cases ranked for your channel — connect once, never re-enter it."
            : "A premium true crime content intelligence platform"}
        </p>
      </div>

      {/* Connect bar — only shown if no channel connected yet */}
      {!checkingChannel && !isConnected && (
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
            {loadingAnalyze ? <><Loader2 size={14} className="animate-spin" /> Analyzing...</> : "Connect Channel"}
          </button>
        </div>
      )}

      {isConnected && (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ChannelIdBadge channelId={profile.channelId} />
          </div>
          <button
            onClick={handleDisconnect}
            className="shrink-0 text-xs font-medium px-4 py-3 rounded-xl border border-white/10 text-white/50 hover:text-red-300 hover:border-red-400/30 transition-colors"
          >
            Disconnect / Switch Channel
          </button>
        </div>
      )}

      {isConnected && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Subscribers</p>
            <p className="text-lg font-semibold mt-1">{profile.subscriberCount?.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Avg Views/Day</p>
            <p className="text-lg font-semibold mt-1">{profile.avgViewsPerDay?.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Avg Title Length</p>
            <p className="text-lg font-semibold mt-1">{profile.avgTitleLength} chars</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Archetype</p>
            <p className="text-sm font-semibold mt-1 text-cyan-400">{profile.archetype}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
          <Search size={16} className="text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runFreshScan()}
            placeholder="Search for a case, or type a focus (e.g. UK true crime) and run a new scan"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-white/30"
          />
        </div>
        {!isConnected && (
          <>
            <select
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              {CASE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </>
        )}
        <button
          onClick={runFreshScan}
          disabled={scanning}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {scanning ? <><Loader2 size={14} className="animate-spin" /> Scanning...</> : <><RefreshCw size={14} /> Run New Scan</>}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}

      {activeAngles && (
        <AnglesPanel
          caseName={activeAngles.caseName}
          angles={activeAngles.angles}
          onClose={() => setActiveAngles(null)}
        />
      )}

      {isConnected ? (
        loadingMatches ? (
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Loader2 size={14} className="animate-spin" /> Matching cases to your channel...
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="text-center text-white/30 text-sm py-16 flex flex-col items-center gap-2">
            <TrendingUp size={24} />
            No matches yet — run a scan above to discover trending true crime cases.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredMatches.map((item) => (
              <ConnectedCaseCard
                key={item.id}
                item={item}
                channelId={profile.channelId}
                isSaved={savedIds.has(item.id)}
                onToggleSave={toggleSave}
                savingId={savingId}
                onAnglesGenerated={handleAnglesGenerated}
              />
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading cached scan...
        </div>
      ) : filteredGeneral.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-16 flex flex-col items-center gap-2">
          <TrendingUp size={24} />
          No cases yet — run a scan above to discover trending true crime cases.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredGeneral.map((item) => (
            <GeneralCaseCard
              key={item.id}
              item={item}
              isSaved={savedIds.has(item.id)}
              onToggleSave={toggleSave}
              savingId={savingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}