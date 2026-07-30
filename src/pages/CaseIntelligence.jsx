import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ExternalLink, Search, Wand2, Sparkles, Tag } from "lucide-react";

const STAGE_LABELS = {
  idea: "Idea",
  researching: "Researching",
  scripting: "Scripting",
  thumbnail: "Thumbnail",
  published: "Published",
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "angles", label: "Angles" },
  { key: "seo", label: "SEO" },
  { key: "thumbnail", label: "Thumbnail" },
  { key: "competition", label: "Competition" },
];

export default function CaseIntelligence() {
  const [caseData, setCaseData] = useState(null);
  const [stage, setStage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // No-case-selected state
  const [searchValue, setSearchValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [pipeline, setPipeline] = useState([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);

  // Connected channel (needed for Angles/SEO tabs)
  const [channelId, setChannelId] = useState(null);
  const [channelError, setChannelError] = useState(null);

  // Angles tab state
  const [angles, setAngles] = useState(null);
  const [loadingAngles, setLoadingAngles] = useState(false);
  const [anglesError, setAnglesError] = useState(null);
  const [selectedAngle, setSelectedAngle] = useState(null);

  // SEO tab state
  const [seo, setSeo] = useState(null);
  const [loadingSeo, setLoadingSeo] = useState(false);
  const [seoError, setSeoError] = useState(null);
  const [seoTitleInput, setSeoTitleInput] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const name = params.get("name");

    loadChannel();

    if (!id && !name) {
      setLoading(false);
      loadPipeline();
      return;
    }

    loadCase({ id, name });
  }, []);

  async function loadChannel() {
    try {
      const res = await fetch("/api/channel-profile");
      const data = await res.json();
      if (!res.ok) {
        setChannelError(data.error || "No channel connected yet.");
        return;
      }
      setChannelId(data.channelId);
    } catch (err) {
      setChannelError(err.message);
    }
  }

  async function loadPipeline() {
    setLoadingPipeline(true);
    try {
      const res = await fetch("/api/publishing-queue");
      const data = await res.json();
      setPipeline(data.queue || []);
    } catch {
      // non-fatal
    } finally {
      setLoadingPipeline(false);
    }
  }

  async function loadCase({ id, name }) {
    setLoading(true);
    setError(null);
    try {
      const fetchParams = new URLSearchParams();
      if (id) fetchParams.set("id", id);
      if (name) fetchParams.set("name", name);

      const res = await fetch(`/api/case-detail?${fetchParams.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load case");
      setCaseData(data);

      const newParams = new URLSearchParams({ id: data.id, name: data.name });
      window.history.replaceState(null, "", `?${newParams.toString()}`);

      try {
        const stageRes = await fetch("/api/publishing-queue");
        const stageData = await stageRes.json();
        const match = (stageData.queue || []).find((c) => c.id === data.id);
        setStage(match?.stage || null);
      } catch {
        // non-fatal
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    if (!searchValue.trim() || searching) return;
    setSearching(true);
    loadCase({ name: searchValue.trim() }).finally(() => setSearching(false));
  }

  async function handleGenerateAngles() {
    if (!channelId || !caseData) return;
    setLoadingAngles(true);
    setAnglesError(null);
    try {
      const res = await fetch("/api/angle-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: caseData.id, channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate angles");
      setAngles(data.angles || []);
    } catch (err) {
      setAnglesError(err.message);
    } finally {
      setLoadingAngles(false);
    }
  }

  function handlePickAngle(angle) {
    setSelectedAngle(angle);
    setSeoTitleInput(angle.title);
    setActiveTab("seo");
  }

  async function handleScoreSeo(titleOverride) {
    const title = (titleOverride ?? seoTitleInput).trim();
    if (!title || !channelId || !caseData) return;
    setLoadingSeo(true);
    setSeoError(null);
    try {
      const res = await fetch("/api/seo-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, channelId, caseName: caseData.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to score title");
      setSeo(data);
    } catch (err) {
      setSeoError(err.message);
    } finally {
      setLoadingSeo(false);
    }
  }

  // ---- No case selected: search + quick-pick from pipeline ----
  if (!loading && !caseData && !error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-white/40 text-sm mt-1">Search for a case to research, or pick one from your pipeline</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex items-center gap-2">
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Case name (e.g. Ashley Dale)"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-white/30"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchValue.trim()}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {searching ? <Loader2 size={12} className="animate-spin" /> : "Research"}
          </button>
        </div>

        <div>
          <h3 className="text-xs uppercase text-white/40 mb-3">Your Pipeline</h3>
          {loadingPipeline ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading...
            </div>
          ) : pipeline.length === 0 ? (
            <p className="text-sm text-white/30">No saved cases yet — save one from Discovery first.</p>
          ) : (
            <div className="space-y-2">
              {pipeline.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadCase({ id: c.id, name: c.name })}
                  className="w-full text-left rounded-lg border border-white/10 hover:border-cyan-400/40 bg-white/5 p-3 flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-white/40 truncate">{c.location} {c.date ? `· ${c.date}` : ""}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 shrink-0">
                    {STAGE_LABELS[c.stage || "idea"]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center gap-2 text-white/50">
        <Loader2 size={16} className="animate-spin" /> Researching case...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-2 text-red-300">
        <AlertCircle size={20} />
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{caseData.name}</h1>
          {stage && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
              {STAGE_LABELS[stage] || stage}
            </span>
          )}
        </div>
        <div className="flex gap-3 text-xs text-white/40 mt-1">
          {caseData.location && <span>{caseData.location}</span>}
          {caseData.date && <span>· {caseData.date}</span>}
          {caseData.status && (
            <span className="px-2 py-0.5 rounded-full bg-white/10 uppercase tracking-wide">
              {caseData.status.replace("_", " ")}
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-cyan-400 text-white"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {channelError && (activeTab === "angles" || activeTab === "seo") && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300 text-sm px-4 py-2">
          {channelError} Connect a channel on the Discovery page first.
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <p className="text-white/70 leading-relaxed">{caseData.summary}</p>

          {caseData.timeline?.length > 0 && (
            <Section title="Timeline">
              <div className="space-y-2">
                {caseData.timeline.map((t, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-cyan-400 font-medium w-28 shrink-0">{t.date}</span>
                    <span className="text-white/70">{t.event}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {caseData.keyFacts?.length > 0 && (
            <Section title="Key Facts">
              <ul className="list-disc list-inside text-sm text-white/70 space-y-1">
                {caseData.keyFacts.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </Section>
          )}

          {caseData.evidencePoints?.length > 0 && (
            <Section title="Evidence Points">
              <ul className="list-disc list-inside text-sm text-white/70 space-y-1">
                {caseData.evidencePoints.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Section>
          )}

          {caseData.openQuestions?.length > 0 && (
            <Section title="Open Questions">
              <ul className="list-disc list-inside text-sm text-fuchsia-300 space-y-1">
                {caseData.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </Section>
          )}

          {caseData.contentAngleHints?.length > 0 && (
            <Section title="Content Angle Hints">
              <div className="flex flex-wrap gap-2">
                {caseData.contentAngleHints.map((h, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                    {h}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {caseData.sources?.length > 0 && (
            <Section title="Sources">
              <div className="space-y-1">
                {caseData.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline"
                  >
                    <ExternalLink size={11} /> {s.title}
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ANGLES TAB */}
      {activeTab === "angles" && (
        <div className="space-y-4">
          {!angles && !loadingAngles && (
            <button
              onClick={handleGenerateAngles}
              disabled={!channelId}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <Wand2 size={14} /> Generate 5 Ranked Angles
            </button>
          )}

          {loadingAngles && (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 size={14} className="animate-spin" /> Generating angles...
            </div>
          )}

          {anglesError && <p className="text-sm text-red-300">{anglesError}</p>}

          {angles && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {angles.map((a) => (
                <button
                  key={a.rank}
                  onClick={() => handlePickAngle(a)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    selectedAngle?.rank === a.rank
                      ? "border-cyan-400/60 bg-cyan-500/10"
                      : "border-white/10 bg-white/5 hover:border-cyan-400/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-cyan-400 font-semibold">Rank {a.rank}</span>
                    <span className="text-xs font-semibold text-white/80">{a.opportunityScore}/100</span>
                  </div>
                  <p className="text-sm text-white font-medium mt-2 leading-snug">{a.title}</p>
                  <p className="text-xs text-white/50 mt-2">{a.angleSummary}</p>
                  <p className="text-[11px] text-fuchsia-300 mt-2">{a.bestPerformanceMatch}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEO TAB */}
      {activeTab === "seo" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex items-center gap-2">
            <input
              value={seoTitleInput}
              onChange={(e) => setSeoTitleInput(e.target.value)}
              placeholder={selectedAngle ? selectedAngle.title : "Pick an angle, or type a title to score"}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/30"
            />
            <button
              onClick={() => handleScoreSeo()}
              disabled={!channelId || !seoTitleInput.trim() || loadingSeo}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {loadingSeo ? <Loader2 size={12} className="animate-spin" /> : "Score"}
            </button>
          </div>

          {seoError && <p className="text-sm text-red-300">{seoError}</p>}

          {seo && (
            <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-fuchsia-400" />
                <span className="text-sm font-semibold text-white/80">
                  SEO Score: {seo.score}/100 ({seo.scoreLabel})
                </span>
              </div>

              {seo.description?.suggested && (
                <div>
                  <p className="text-[10px] uppercase text-white/40 mb-1">Description</p>
                  <p className="text-sm text-white/70 leading-relaxed">{seo.description.suggested}</p>
                </div>
              )}

              {seo.tags?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase text-white/40 mb-1 flex items-center gap-1">
                    <Tag size={10} /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {seo.tags.map((t, i) => (
                      <span
                        key={i}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          t.relevance === "high" ? "bg-cyan-500/20 text-cyan-300" : "bg-white/10 text-white/50"
                        }`}
                      >
                        {t.tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {seo.categoryRecommendation?.category && (
                <div>
                  <p className="text-[10px] uppercase text-white/40 mb-1">Best Category</p>
                  <p className="text-sm text-white/70">
                    {seo.categoryRecommendation.category}
                    <span className="text-white/40"> — {seo.categoryRecommendation.reasoning}</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* THUMBNAIL TAB — links to standalone tool until fully merged */}
      {activeTab === "thumbnail" && (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
          <p className="text-sm text-white/60 mb-3">Open Thumbnail Studio for this case:</p>
          <a
            href={`/thumbnail-studio?caseName=${encodeURIComponent(caseData.name)}`}
            className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium"
          >
            Open Thumbnail Studio
          </a>
        </div>
      )}

      {/* COMPETITION TAB — links to standalone tool until fully merged */}
      {activeTab === "competition" && (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
          <p className="text-sm text-white/60 mb-3">Open Competition Analyzer for this case:</p>
          <a
            href={`/competition-analyzer?caseName=${encodeURIComponent(caseData.name)}`}
            className="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-sm font-medium"
          >
            Open Competition Analyzer
          </a>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
      <h3 className="text-sm font-medium text-white/50 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}