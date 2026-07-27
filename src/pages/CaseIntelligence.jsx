import { useEffect, useState } from "react";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";

export default function CaseIntelligence() {
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const name = params.get("name");

    if (!id && !name) {
      setError("No case specified — go back and pick a case from Channel Matchmaker.");
      setLoading(false);
      return;
    }

    const fetchParams = new URLSearchParams();
    if (id) fetchParams.set("id", id);
    if (name) fetchParams.set("name", name);

    fetch(`/api/case-detail?${fetchParams.toString()}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || "Failed to load case");
        setCaseData(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
        <h1 className="text-2xl font-semibold">{caseData.name}</h1>
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