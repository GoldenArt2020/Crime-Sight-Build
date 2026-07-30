import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Sparkles, Radar, ListChecks } from "lucide-react";

const STAGE_LABELS = {
  idea: "Idea",
  researching: "Researching",
  scripting: "Scripting",
  thumbnail: "Thumbnail",
  published: "Published",
};

function MiniGauge({ value }) {
  const color = value >= 85 ? "text-cyan-400" : value >= 60 ? "text-amber-300" : "text-pink-400";
  return <span className={`text-sm font-semibold ${color}`}>{value}/100</span>;
}

export default function Dashboard() {
  const [trending, setTrending] = useState([]);
  const [channel, setChannel] = useState(null);
  const [matches, setMatches] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingChannel, setLoadingChannel] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingPipeline, setLoadingPipeline] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTrending();
    loadChannel();
    loadPipeline();
  }, []);

  async function loadPipeline() {
    setLoadingPipeline(true);
    try {
      const res = await fetch("/api/publishing-queue");
      const data = await res.json();
      // Only show cases still in progress — published ones don't need "continuing"
      setPipeline((data.queue || []).filter((c) => (c.stage || "idea") !== "published").slice(0, 4));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPipeline(false);
    }
  }

  async function loadTrending() {
    setLoadingTrending(true);
    try {
      const res = await fetch("/api/trending-cases");
      const data = await res.json();
      setTrending((data.cases || []).slice(0, 5));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingTrending(false);
    }
  }

  async function loadChannel() {
    setLoadingChannel(true);
    try {
      const res = await fetch("/api/channel-profile");
      if (res.status === 404) {
        setChannel(null);
        setLoadingMatches(false);
        return;
      }
      const data = await res.json();
      setChannel(data);
      await loadMatches();
    } catch (err) {
      setError(err.message);
      setLoadingMatches(false);
    } finally {
      setLoadingChannel(false);
    }
  }

  async function loadMatches() {
    setLoadingMatches(true);
    try {
      const res = await fetch("/api/channel-matches");
      const data = await res.json();
      const sorted = [...(data.matches || [])].sort(
        (a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0)
      );
      setMatches(sorted.slice(0, 4));
    } catch {
      // non-fatal — opportunity radar just stays empty
    } finally {
      setLoadingMatches(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your Intelligence Command Center</h1>
        <p className="text-white/40 text-sm mt-1">A premium true crime content intelligence platform</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}

      {/* Continue Working — "what should I do next" */}
      <div>
        <h3 className="text-xs uppercase text-white/40 mb-3 flex items-center gap-1.5">
          <ListChecks size={13} /> Continue Working
        </h3>
        {loadingPipeline ? (
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading...
          </div>
        ) : pipeline.length === 0 ? (
          <p className="text-sm text-white/30">Nothing in progress — save a case from Discovery to start a project.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pipeline.map((c) => (
              <a
                key={c.id}
                href={`/case-intelligence?id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}`}
                className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-3 hover:border-cyan-400/30 transition-colors block"
              >
                <p className="text-sm font-medium truncate">{c.name}</p>
                <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                  {STAGE_LABELS[c.stage || "idea"]}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trending Now */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
          <h3 className="text-xs uppercase text-white/40 mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> Trending Now
          </h3>
          {loadingTrending ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          ) : trending.length === 0 ? (
            <p className="text-sm text-white/30">No cases yet — run a scan from Discovery.</p>
          ) : (
            <div className="space-y-3">
              {trending.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-white/40 truncate">{c.location}</p>
                  </div>
                  <MiniGauge value={c.viral_score?.overall ?? 0} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Opportunity Radar — how well each case fits YOUR channel's archetype */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
          <h3 className="text-xs uppercase text-white/40 mb-3 flex items-center gap-1.5">
            <Radar size={13} /> Opportunity Radar
          </h3>
          {!channel ? (
            <p className="text-sm text-white/30">Connect a channel in Discovery to see fit-scored opportunities.</p>
          ) : loadingMatches ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 size={14} className="animate-spin" /> Matching...
            </div>
          ) : matches.length === 0 ? (
            <p className="text-sm text-white/30">No matches yet — run a trending scan first.</p>
          ) : (
            <div className="space-y-3">
              {matches.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-white/30 w-4 shrink-0">#{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-white/40 truncate">{m.recommended_angle || "—"}</p>
                    </div>
                  </div>
                  <MiniGauge value={m.fitScore ?? 0} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Channel Snapshot */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
          <h3 className="text-xs uppercase text-white/40 mb-3 flex items-center gap-1.5">
            <Sparkles size={13} /> Channel Snapshot
          </h3>
          {loadingChannel ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          ) : !channel ? (
            <p className="text-sm text-white/30">No channel connected yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-white font-medium">{channel.channelTitle}</p>
              <p className="text-white/60">Avg views/day: {channel.avgViewsPerDay?.toLocaleString()}</p>
              <p className="text-white/60">Archetype: <span className="text-cyan-400">{channel.archetype}</span></p>
              {channel.topTriggers?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {channel.topTriggers.map((t, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">
                      {t.trigger}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}