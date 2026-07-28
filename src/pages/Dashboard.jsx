import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Sparkles, Radar } from "lucide-react";

function MiniGauge({ value }) {
  const color = value >= 85 ? "text-cyan-400" : value >= 60 ? "text-amber-300" : "text-pink-400";
  return <span className={`text-sm font-semibold ${color}`}>{value}/100</span>;
}

export default function Dashboard() {
  const [trending, setTrending] = useState([]);
  const [channel, setChannel] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingChannel, setLoadingChannel] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTrending();
    loadChannel();
  }, []);

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
      const res = await fetch("/api/channel-snapshot");
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
      setMatches((data.matches || []).slice(0, 4));
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
            <p className="text-sm text-white/30">No cases yet — run a scan from Discover Cases.</p>
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

        {/* Opportunity Radar */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
          <h3 className="text-xs uppercase text-white/40 mb-3 flex items-center gap-1.5">
            <Radar size={13} /> Opportunity Radar
          </h3>
          {!channel ? (
            <p className="text-sm text-white/30">Connect a channel in Channel Matchmaker to see fit-scored opportunities.</p>
          ) : loadingMatches ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 size={14} className="animate-spin" /> Matching...
            </div>
          ) : matches.length === 0 ? (
            <p className="text-sm text-white/30">No matches yet — run a trending scan first.</p>
          ) : (
            <div className="space-y-3">
              {matches.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-white/40 truncate">{m.recommended_angle || "—"}</p>
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