import { useState, useEffect } from "react";
import { Loader2, Image as ImageIcon, RefreshCw, Save, Check } from "lucide-react";


export default function ThumbnailStudio() {
  const [caseName, setCaseName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [channelTitle, setChannelTitle] = useState(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillCase = params.get("caseName");
    if (prefillCase) setCaseName(prefillCase);

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
    setSaved(false);
    try {
      const res = await fetch("/api/thumbnail-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseName, channelId, title: title || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate brief");
      setBrief(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleSave() {
    if (!brief) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/thumbnail-brief?save=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseName, brief }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save brief");
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Thumbnail Studio</h1>
        <p className="text-white/40 text-sm mt-1">Generate a creative brief for your next thumbnail</p>
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
          placeholder="Case name"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Video title (optional)"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30"
        />
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><ImageIcon size={14} /> Generate Brief</>}
        </button>
      </div>


      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}


      {brief && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1 text-xs font-medium border border-white/15 text-white/80 rounded-lg py-2 hover:bg-white/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <><Loader2 size={12} className="animate-spin" /> Regenerating...</>
              ) : (
                <><RefreshCw size={12} /> Regenerate</>
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="flex-1 text-xs font-medium bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white rounded-lg py-2 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {saving ? (
                <><Loader2 size={12} className="animate-spin" /> Saving...</>
              ) : saved ? (
                <><Check size={12} /> Saved to Case</>
              ) : (
                <><Save size={12} /> Save to Case</>
              )}
            </button>
          </div>


          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs uppercase text-white/40 mb-1">Concept</h3>
            <p className="text-sm text-white/80">{brief.concept}</p>
          </div>


          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Composition</h3>
              <p className="text-sm text-white/70"><span className="text-cyan-400">Focal point: </span>{brief.composition?.focalPoint}</p>
              <p className="text-sm text-white/70 mt-1"><span className="text-cyan-400">Layout: </span>{brief.composition?.layout}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Text Overlay</h3>
              <p className="text-sm font-semibold">{brief.textOverlay?.primaryText}</p>
              {brief.textOverlay?.secondaryText && (
                <p className="text-xs text-white/50 mt-1">{brief.textOverlay.secondaryText}</p>
              )}
            </div>
          </div>


          {brief.colorMood?.palette?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Color & Mood — {brief.colorMood.mood}</h3>
              <div className="flex gap-2">
                {brief.colorMood.palette.map((c, i) => (
                  <div key={i} className="w-10 h-10 rounded-lg border border-white/10" style={{ backgroundColor: c }} title={c} />
                ))}
              </div>
            </div>
          )}


          {brief.imageryDirection?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-xs uppercase text-white/40 mb-2">Imagery Direction</h3>
              <ul className="list-disc list-inside text-sm text-white/70 space-y-1">
                {brief.imageryDirection.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}


          {brief.abTestVariant && (
            <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-4">
              <h3 className="text-xs uppercase text-fuchsia-300 mb-1">A/B Test Variant</h3>
              <p className="text-sm text-white/80">{brief.abTestVariant.concept}</p>
              <p className="text-sm font-semibold mt-1">{brief.abTestVariant.primaryText}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}