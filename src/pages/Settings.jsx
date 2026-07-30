import { useEffect, useState } from "react";
import { Loader2, Link2, Trash2 } from "lucide-react";

export default function Settings() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/channel-profile");
      if (res.ok) setProfile(await res.json());
      else setProfile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/channel-profile", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
      setProfile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-white/40 text-sm mt-1">Manage your connected channel</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm px-4 py-2">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading...
        </div>
      ) : !profile ? (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex items-center gap-2 text-white/50 text-sm">
          <Link2 size={16} />
          No channel connected — connect one from Discovery.
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 space-y-3">
          <div>
            <p className="text-xs text-white/40">Connected Channel</p>
            <p className="text-lg font-semibold">{profile.channelTitle}</p>
          </div>
          <p className="text-xs font-mono text-cyan-300">{profile.channelId}</p>
          <p className="text-sm text-white/60">Archetype: <span className="text-cyan-400">{profile.archetype}</span></p>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-400/30 text-red-300 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Disconnect Channel
          </button>
        </div>
      )}
    </div>
  );
}