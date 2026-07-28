import { useState } from "react";
import { Loader2, Search, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

const STATUS_ICON = {
  pass: <CheckCircle2 size={14} className="text-cyan-400 shrink-0" />,
  warn: <AlertTriangle size={14} className="text-amber-300 shrink-0" />,
  fail: <XCircle size={14} className="text-pink-400 shrink-0" />,
};

const RELEVANCE_STYLE = {
  high: "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20",
  medium: "bg-white/10 text-white/70 border border-white/10",
  low: "bg-white/5 text-white/40 border border-white/5",
};

export default function SeoStudio() {
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState("");
  const [caseName, setCaseName] = useState("");
  const [script, setScript] = useState("");
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
        body: JSON.stringify({
          title,
          channelId,
          caseName: caseName.trim() || undefined,
          script: script.trim() || undefined,
        }),
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
        <input
          value={caseName}
          onChange={(e) => setCaseName(e.target.value)}
          placeholder="Case name (optional, improves accuracy)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />
        <div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste your script here (optional) — grounds the description, tags, and category recommendation in the actual video content instead of just the title"
            rows={6}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30 resize-y"
          />
          <p className="text-xs text-white/30 mt-1">
            {script.length > 0
              ? `${script.length.toLocaleString()} characters`
              : "Without a script, description and tags are generated from the title alone and will be more generic."}
          </p>
        </div>
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
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <h3 className="text-xs uppercase text-white/40">Suggested Description</h3>
              <p className="text-sm text-white/70">{result.description.suggested}</p>
              {result.description.checkpoints?.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  {result.description.checkpoints.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-white/70">
                      {STATUS_ICON[c.status] || null}
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result.tags?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {result.tags.map((t, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-1 rounded-full ${RELEVANCE_STYLE[t.relevance] || RELEVANCE_STYLE.medium}`}
                    title={`${t.relevance || "medium"} relevance`}
                  >
                    {t.tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(result.categoryRecommendation || result.publishingOptimizer) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {result.categoryRecommendation && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-xs uppercase text-white/40 mb-2">Best YouTube Category</h3>
                  <p className="text-sm font-semibold text-fuchsia-300">{result.categoryRecommendation.category}</p>
                  <p className="text-xs text-white/50 mt-1">{result.categoryRecommendation.reasoning}</p>
                </div>
              )}

              {result.publishingOptimizer && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-xs uppercase text-white/40 mb-2 flex items-center gap-1.5">
                    <Clock size={12} /> Optimal Upload Time
                  </h3>
                  <p className="text-sm font-semibold text-cyan-300">{result.publishingOptimizer.optimalUploadTime}</p>
                  <p className="text-xs text-white/40 mt-1">{result.publishingOptimizer.basis}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}