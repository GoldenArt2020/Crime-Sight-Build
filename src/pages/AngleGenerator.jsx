import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

export default function AngleGenerator() {
  const [caseName, setCaseName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [channelTitle, setChannelTitle] = useState(null);
  const [angles, setAngles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/channel-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.channelId) {
          setChannelId(data.channelId);
          setChannelTitle(data.channelTitle);
        }
      })
      .catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!caseName.trim() || !channelId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const detailParams = new URLSearchParams({ name: caseName });
      const detailRes = await fetch(`/api/case-detail?${detailParams.toString()}`);
      const detailData = await detailRes.json();
      if (!detailRes.ok) throw new Error(detailData.error || "Failed to research case");

      const res = await fetch("/api/angle-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: detailData.id, channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate angles");
      setAngles(data.angles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">YouTube Angle Generator</h1>
        <p className="text-white/40 text-sm mt-1">5 ranked content angles, tailored to your channel's proven patterns</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 space-y-3">
        {channelTitle ? (
          <div className="text-xs text-white/40 px-1">
            Connected channel: <span className="text-cyan-400">{channelTitle}</span>
          </div>
        ) : (
          <input
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="Channel ID (connect one in Discovery to skip this)"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
          />
        )}
        <input
          value={caseName}
          onChange={(e) => setCaseName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="Case name (e.g. Ashley Dale)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Wand2 size={14} /> Generate Angles</>}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}

      {angles && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {angles.map((a) => (
            <div key={a.rank} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-cyan-400 font-semibold">
                  Rank {a.rank}
                </span>
                <span className="text-xs font-semibold text-white/80">{a.opportunityScore}/100</span>
              </div>
              <p className="text-sm text-white font-medium mt-2 leading-snug">{a.title}</p>
              <p className="text-xs text-white/50 mt-2">{a.angleSummary}</p>
              <p className="text-[11px] text-fuchsia-300 mt-2">{a.bestPerformanceMatch}</p>

              {a.contentGaps?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {a.contentGaps.map((gap, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">
                      {gap}
                    </span>
                  ))}
                </div>
              )}

              {a.groundedIn?.length > 0 && (
                <p className="text-[10px] text-white/30 mt-3">
                  Grounded in: {a.groundedIn.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}