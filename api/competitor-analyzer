import { useState } from "react";
import { Loader2, Plus, X, Zap } from "lucide-react";

export default function CompetitionAnalyzer() {
  const [channelId, setChannelId] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState([""]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function updateUrl(i, value) {
    setCompetitorUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }
  function addUrlField() {
    if (competitorUrls.length >= 5) return;
    setCompetitorUrls((prev) => [...prev, ""]);
  }
  function removeUrlField(i) {
    setCompetitorUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleAnalyze() {
    const urls = competitorUrls.map((u) => u.trim()).filter(Boolean);
    if (!channelId.trim() || urls.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/competitor-analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, competitorUrls: urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze competitors");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Competition Analyzer</h1>
        <p className="text-white/40 text-sm mt-1">See where competitor channels are beating yours, and why</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 space-y-3">
        <input
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder="Your Channel ID (from Channel Matchmaker)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />

        <div className="space-y-2">
          {competitorUrls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={url}
                onChange={(e) => updateUrl(i, e.target.value)}
                placeholder={`Competitor channel URL #${i + 1} (youtube.com/@handle)`}
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
              />
              {competitorUrls.length > 1 && (
                <button
                  onClick={() => removeUrlField(i)}
                  className="px-2 text-white/30 hover:text-red-300"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          {competitorUrls.length < 5 && (
            <button
              onClick={addUrlField}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <Plus size={12} /> Add another competitor
            </button>
          )}
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Analyzing...</> : <><Zap size={14} /> Analyze Competitors</>}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs uppercase text-white/40 mb-1">Positioning</h3>
            <p className="text-sm text-white/80">{result.positioning}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
            <h3 className="text-xs uppercase text-white/40 mb-3">Competitor Channels</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/40 text-xs">
                  <th className="pb-2 pr-4">Channel</th>
                  <th className="pb-2 pr-4">Subscribers</th>
                  <th className="pb-2 pr-4">Avg Views/Day</th>
                  <th className="pb-2 pr-4">Avg Title Length</th>
                  <th className="pb-2">Top Triggers</th>
                </tr>
              </thead>
              <tbody>
                {result.competitors.map((c, i) => (
                  <tr key={i} className="border-t border-white/10">
                    <td className="py-2 pr-4 font-medium">{c.channelTitle}</td>
                    <td className="py-2 pr-4 text-white/70">{c.subscriberCount?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-white/70">{c.avgViewsPerDay?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-white/70">{c.avgTitleLength} chars</td>
                    <td className="py-2 text-white/70">
                      {(c.topTriggers || []).map((t) => t.trigger).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.gaps?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Content Gaps</h3>
              <div className="space-y-2">
                {result.gaps.map((g, i) => (
                  <div key={i} className="rounded-lg bg-black/30 p-3">
                    <p className="text-sm font-medium text-pink-400">{g.gap}</p>
                    <p className="text-xs text-white/50 mt-1">{g.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.opportunities?.length > 0 && (
            <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-4">
              <h3 className="text-xs uppercase text-fuchsia-300 mb-2">Opportunities</h3>
              <div className="space-y-2">
                {result.opportunities.map((o, i) => (
                  <div key={i} className="rounded-lg bg-black/30 p-3">
                    <p className="text-sm font-medium text-cyan-400">{o.opportunity}</p>
                    <p className="text-xs text-white/50 mt-1">{o.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.titlePatternDiff && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-1">Title Pattern Comparison</h3>
              <p className="text-sm text-white/80">{result.titlePatternDiff}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}