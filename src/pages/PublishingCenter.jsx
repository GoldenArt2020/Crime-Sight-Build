import { useEffect, useState } from "react";
import { Loader2, ArrowRight, Wand2 } from "lucide-react";

const STAGES = [
  { key: "idea", label: "Idea" },
  { key: "researching", label: "Researching" },
  { key: "scripting", label: "Scripting" },
  { key: "thumbnail", label: "Thumbnail" },
  { key: "published", label: "Published" },
];

function nextStage(current) {
  const idx = STAGES.findIndex((s) => s.key === current);
  return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1].key : null;
}

export default function PublishingCenter() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/publishing-queue");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load queue");
      setQueue(data.queue || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function advanceStage(item) {
    const next = nextStage(item.stage || "idea");
    if (!next) return;
    setUpdatingId(item.id);
    try {
      const res = await fetch("/api/publishing-queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, stage: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update stage");
      setQueue(data.queue || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Publish</h1>
        <p className="text-white/40 text-sm mt-1">Track saved cases from idea through to published</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading queue...
        </div>
      ) : queue.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-16">
          No cases in your pipeline yet — save a case from Discovery to add it here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {queue.map((item) => {
            const stage = item.stage || "idea";
            const stageLabel = STAGES.find((s) => s.key === stage)?.label || stage;
            const next = nextStage(stage);

            return (
              <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex flex-col gap-3">
                <div>
                  <h4 className="text-white font-medium leading-tight">{item.name}</h4>
                  <p className="text-xs text-white/40 mt-0.5">{item.location} {item.date ? `· ${item.date}` : ""}</p>
                </div>

                <span className="self-start text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                  {stageLabel}
                </span>

                <a
                  href={`/case-intelligence?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}`}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-cyan-400 pt-1 border-t border-white/10"
                >
                  <Wand2 size={11} /> Open Project (Research, Angles, SEO)
                </a>

                {next && (
                  <button
                    onClick={() => advanceStage(item)}
                    disabled={updatingId === item.id}
                    className="mt-1 text-xs font-medium bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white rounded-lg py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {updatingId === item.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>Move to {STAGES.find((s) => s.key === next)?.label} <ArrowRight size={12} /></>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}