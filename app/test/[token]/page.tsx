"use client";

/**
 * MYSTORY — Passation d'un test (initial ou final), accès public par jeton.
 * Le candidat répond ; la correction se fait côté serveur (les corrigés ne sont jamais envoyés ici).
 */
import { useEffect, useMemo, useState } from "react";

type Option = { cle: string; texte: string; image?: string };
type Question = {
  id: string; section: "CE" | "CO"; ordre: number; bloc: string | null; type: string;
  contexte: string | null; audio_path: string | null; enonce: string; options: Option[]; points: number;
};
type Data = {
  test: { titre: string; phase: string; consigne_ecrit: string | null; consigne_oral: string | null };
  candidat: { nom: string | null; prenom: string | null };
  questions: Question[];
};

const LABEL: Record<string, string> = { CE: "Compréhension écrite", CO: "Compréhension orale" };
const jouable = (p: string | null) => !!p && /^(https?:|\/)/.test(p);

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center text-gray-700">
      {children}
    </div>
  );
}

export default function Passation({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null);
  const [rep, setRep] = useState<Record<string, string>>({});
  const [ecrit, setEcrit] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);
  const [deja, setDeja] = useState(false);
  const [kiosque, setKiosque] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("k=1")) setKiosque(true);
    fetch(`/api/tests/passation?token=${encodeURIComponent(params.token)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); else { setErreur(j.erreur || "Introuvable."); if (j.dejaFait) setDeja(true); } })
      .catch(() => setErreur("Chargement impossible."));
  }, [params.token]);

  const sections = useMemo<("CE" | "CO")[]>(() => ["CE", "CO"], []);

  async function envoyer() {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch("/api/tests/passation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, reponses: rep, ecrit }),
      });
      const j = await r.json();
      if (j.ok) setFini(true); else setErreur(j.erreur || "Envoi impossible.");
    } catch { setErreur("Envoi impossible. Vérifiez votre connexion."); }
    finally { setEnvoi(false); }
  }

  if (fini) return <Centre><h1 className="mb-2 text-2xl font-bold text-mystory">✓ Test envoyé</h1><p>Merci ! Une formatrice évaluera votre expression écrite et orale, puis votre niveau vous sera communiqué.</p>{kiosque && <a href="/test/kiosque" className="btn-primary mt-5">Candidat suivant →</a>}</Centre>;
  if (deja) return <Centre><h1 className="mb-2 text-2xl font-bold text-mystory">Test déjà envoyé</h1><p>Ce test a déjà été complété. Merci !</p></Centre>;
  if (erreur && !data) return <Centre><p className="text-red-700">{erreur}</p></Centre>;
  if (!data) return <Centre><p>Chargement…</p></Centre>;

  let numero = 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-mystory">{data.test.titre}</h1>
        <p className="text-sm text-gray-500">
          {data.candidat.prenom || data.candidat.nom ? `${data.candidat.prenom ?? ""} ${data.candidat.nom ?? ""}`.trim() + " · " : ""}
          Cochez la bonne réponse. Les questions à écrire se corrigent sur les mots-clés attendus.
        </p>
      </header>

      {sections.map((sec) => {
        const qs = data.questions.filter((q) => q.section === sec);
        if (!qs.length) return null;
        let lastCtx: string | null = null, lastAudio: string | null = null, lastBloc: string | null = null;
        return (
          <section key={sec} className="mb-8">
            <h2 className="mb-3 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">{LABEL[sec]}</h2>
            {qs.map((q) => {
              numero += 1;
              const newBloc = q.bloc !== lastBloc; lastBloc = q.bloc;
              const showCtx = !!q.contexte && q.contexte !== lastCtx; if (q.contexte) lastCtx = q.contexte;
              const showAudio = !!q.audio_path && q.audio_path !== lastAudio; if (q.audio_path) lastAudio = q.audio_path;
              const aImages = q.options.some((o) => o.image);
              return (
                <div key={q.id}>
                  {newBloc && q.bloc && <p className="mt-4 mb-1 text-sm font-semibold text-mystory">{q.bloc}</p>}
                  {showCtx && <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm italic text-gray-700">{q.contexte}</div>}
                  {showAudio && (
                    jouable(q.audio_path) ? (
                      <audio controls preload="none" className="mb-3 w-full">
                        <source src={q.audio_path!} />
                      </audio>
                    ) : (
                      <p className="mb-3 text-xs text-amber-700">🎧 Audio fourni par la formatrice le jour du test.</p>
                    )
                  )}
                  <div className="mb-4 rounded-xl border border-gray-200 p-3">
                    <p className="mb-2 font-medium text-gray-800">{numero}. {q.enonce}</p>
                    {q.type === "texte_libre" ? (
                      <input
                        value={rep[q.id] ?? ""} onChange={(e) => setRep((p) => ({ ...p, [q.id]: e.target.value }))}
                        placeholder="Votre réponse…" className="input w-full"
                      />
                    ) : aImages ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {q.options.map((o) => (
                          <button
                            key={o.cle} type="button"
                            onClick={() => setRep((p) => ({ ...p, [q.id]: o.cle }))}
                            className={`overflow-hidden rounded-lg border-2 p-1 transition ${rep[q.id] === o.cle ? "border-mystory ring-2 ring-mystory/30" : "border-gray-200"}`}
                          >
                            {o.image && <img src={o.image} alt={o.texte} className="h-24 w-full object-contain" />}
                            <span className="block text-xs text-gray-600">{o.texte}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {q.options.map((o) => (
                          <label key={o.cle} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${rep[q.id] === o.cle ? "border-mystory bg-mystory-clair" : "border-gray-200 hover:bg-gray-50"}`}>
                            <input type="radio" name={q.id} checked={rep[q.id] === o.cle} onChange={() => setRep((p) => ({ ...p, [q.id]: o.cle }))} className="mt-0.5" />
                            <span><span className="font-medium">{o.cle}.</span> {o.texte}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {data.test.consigne_ecrit && (
        <section className="mb-8">
          <h2 className="mb-3 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">Expression écrite</h2>
          <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm italic text-gray-700">{data.test.consigne_ecrit}</div>
          <textarea value={ecrit} onChange={(e) => setEcrit(e.target.value)} rows={10} placeholder="Rédigez votre réponse ici…" className="input w-full" />
        </section>
      )}

      {data.test.consigne_oral && (
        <section className="mb-8">
          <h2 className="mb-2 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">Expression orale</h2>
          <div className="rounded-lg bg-gray-50 p-3 text-sm italic text-gray-700">{data.test.consigne_oral}</div>
          <p className="mt-2 text-xs text-gray-500">Cette partie sera évaluée avec la formatrice.</p>
        </section>
      )}

      {erreur && <p className="mb-3 text-sm text-red-700">{erreur}</p>}
      <button onClick={envoyer} disabled={envoi} className="btn-primary w-full">{envoi ? "Envoi…" : "Envoyer mes réponses"}</button>
      <p className="mt-3 text-center text-xs text-gray-400">MYSTORY Formation — vos réponses sont corrigées automatiquement, l'oral et l'écrit par une formatrice.</p>
    </div>
  );
}
