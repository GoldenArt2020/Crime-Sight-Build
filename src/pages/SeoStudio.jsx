import { useState } from "react";
import { Loader2, Search } from "lucide-react";

export default function SeoStudio() {
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleScore() {
    if (!title.trim() || !channelId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seo-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to score title");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const labelColor =
    result?.scoreLabel === "HIGH" ? "text-cyan-400" : result?.scoreLabel === "MEDIUM" ? "text-amber-300" : "text-pink-400";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">SEO Studio</h1>
        <p className="text-white/40 text-sm mt-1">Score a title against your channel's own proven patterns</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 space-y-3">
        <input
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder="Channel ID (from Channel Matchmaker)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScore()}
          placeholder="Proposed video title"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />
        <button
          onClick={handleScore}
          disabled={loading}
          className="w-full px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Scoring...</> : <><Search size={14} /> Score Title</>}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex items-center gap-5">
            <div className="text-4xl font-bold">{result.score}</div>
            <div>
              <p className={`text-sm font-semibold ${labelColor}`}>{result.scoreLabel} fit</p>
              <p className="text-xs text-white/40">{result.titleLength} characters</p>
            </div>
          </div>

          {result.reasons?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Reasons</h3>
              <div className="space-y-1.5">
                {result.reasons.map((r, i) => (
                  <p key={i} className="text-sm text-white/70">
                    <span className="text-pink-400 font-medium">{r.issue}: </span>{r.detail}
                  </p>
                ))}
              </div>
            </div>
          )}

          {result.alternatives?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Stronger Alternatives</h3>
              <div className="space-y-2">
                {result.alternatives.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-lg bg-black/30 p-2.5">
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-white/40 mt-0.5">{a.changeNote}</p>
                    </div>
                    <span className="text-sm font-semibold text-cyan-400 shrink-0">{a.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.description?.suggested && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Suggested Description</h3>
              <p className="text-sm text-white/70">{result.description.suggested}</p>
            </div>
          )}

          {result.tags?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {result.tags.map((t, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                    {t.tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}