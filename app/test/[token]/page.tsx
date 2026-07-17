"use client";

/**
 * MYSTORY — Passation d'un test (initial ou final), accès public par jeton.
 * Le candidat répond ; la correction se fait côté serveur (les corrigés ne sont jamais envoyés ici).
 */
import { useEffect, useMemo, useRef, useState } from "react";

type Option = { cle: string; texte: string; image?: string };
type Question = {
  id: string; section: "CE" | "CO"; ordre: number; bloc: string | null; type: string;
  contexte: string | null; audio_path: string | null; enonce: string; options: Option[]; points: number;
};
type Data = {
  mode?: "sur_place" | "distance";
  test: { titre: string; phase: string; consigne_ecrit: string | null; consigne_oral: string | null; oral_questions: string[] | null; sujets_ecrit?: Array<{ niveau: string; sujet: string; mots_min: number }> | null };
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
  const [sujetEcrit, setSujetEcrit] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);
  const [provisoire, setProvisoire] = useState<string | null>(null);
  const [deja, setDeja] = useState(false);
  const [kiosque, setKiosque] = useState(false);
  const [oralBlobs, setOralBlobs] = useState<Record<number, Blob>>({});
  // Épreuve chronométrée (décision Direction 10/07) : CE 20 min → CO 20 min (écoute unique)
  // → EE 15 min → EO 10 min. Pas de retour en arrière ; fin du temps = étape suivante.
  const [phase, setPhase] = useState<"intro" | "CE" | "CO" | "EE" | "EO">("intro");
  const [finPhase, setFinPhase] = useState<number | null>(null);
  const [resteSec, setResteSec] = useState<number>(0);
  const envoyeRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("k=1")) setKiosque(true);
    fetch(`/api/tests/passation?token=${encodeURIComponent(params.token)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); else { setErreur(j.erreur || "Introuvable."); if (j.dejaFait) setDeja(true); } })
      .catch(() => setErreur("Chargement impossible."));
  }, [params.token]);

  const sections = useMemo<("CE" | "CO")[]>(() => ["CE", "CO"], []);
  const DUREES_MIN: Record<"CE" | "CO" | "EE" | "EO", number> = { CE: 20, CO: 20, EE: 15, EO: 10 };
  // Sur place : l'expression orale se fait EN DIRECT avec l'examinateur (qui la note ensuite) —
  // pas d'enregistrement en ligne. À distance : enregistrement micro (étape EO 10 min).
  const ORDRE_PHASES: ("CE" | "CO" | "EE" | "EO")[] = data?.mode === "sur_place" ? ["CE", "CO", "EE"] : ["CE", "CO", "EE", "EO"];

  function demarrerPhase(ph: "CE" | "CO" | "EE" | "EO") {
    setPhase(ph);
    setFinPhase(Date.now() + DUREES_MIN[ph] * 60_000);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function phaseSuivante() {
    const i = ORDRE_PHASES.indexOf(phase as any);
    const proch = ORDRE_PHASES[i + 1];
    if (proch) demarrerPhase(proch);
    else if (!envoyeRef.current) { envoyeRef.current = true; envoyer(); }
  }

  // Tic du chrono : à 0, on passe automatiquement à l'étape suivante.
  useEffect(() => {
    if (!finPhase || fini) return;
    const t = setInterval(() => {
      const reste = Math.max(0, Math.ceil((finPhase - Date.now()) / 1000));
      setResteSec(reste);
      if (reste <= 0) { clearInterval(t); phaseSuivante(); }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finPhase, fini]);

  const mmss = `${String(Math.floor(resteSec / 60)).padStart(2, "0")}:${String(resteSec % 60).padStart(2, "0")}`;

  async function envoyer() {
    setEnvoi(true); setErreur(null);
    try {
      const oq = data?.test.oral_questions ?? [];
      if (oq.length) {
        const audios: Array<{ q: number; question: string; audioBase64: string }> = [];
        for (let i = 0; i < oq.length; i++) { const bl = oralBlobs[i]; if (bl) audios.push({ q: i, question: oq[i], audioBase64: await blobToB64(bl) }); }
        if (audios.length) {
          await fetch("/api/tests/oral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: params.token, audios }) });
        }
      }
      const r = await fetch("/api/tests/passation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, reponses: rep, ecrit, sujet_ecrit: sujetEcrit }),
      });
      const j = await r.json();
      if (j.ok) { setProvisoire(j.niveau_provisoire ?? null); setFini(true); } else setErreur(j.erreur || "Envoi impossible.");
    } catch { setErreur("Envoi impossible. Vérifiez votre connexion."); }
    finally { setEnvoi(false); }
  }

  if (fini) {
    const nbMotsFin = ecrit.trim() ? ecrit.trim().split(/\s+/).length : 0;
    const surPlace = data?.mode === "sur_place";
    return (
      <Centre>
        <h1 className="mb-1 text-2xl font-bold text-mystory">✓ Test terminé — merci{data?.candidat.prenom ? ` ${data.candidat.prenom}` : ""} !</h1>
        <p className="mb-3 text-sm text-gray-500">Voici le résumé de votre passation.</p>
        {provisoire && (
          <div className="my-2 rounded-xl border-2 border-mystory bg-blue-50 px-6 py-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Niveau provisoire (compréhension écrite &amp; orale)</div>
            <div className="text-4xl font-extrabold text-mystory">{provisoire}</div>
          </div>
        )}
        <div className="mx-auto mb-3 max-w-sm space-y-1.5 text-left text-sm text-gray-700">
          <div className="flex justify-between"><span>📖 Compréhension écrite</span><span className="font-medium text-green-700">✓ envoyée</span></div>
          <div className="flex justify-between"><span>🎧 Compréhension orale</span><span className="font-medium text-green-700">✓ envoyée</span></div>
          <div className="flex justify-between"><span>✍️ Expression écrite{sujetEcrit ? ` (sujet ${sujetEcrit})` : ""}</span><span className="font-medium text-amber-600">{nbMotsFin > 0 ? `${nbMotsFin} mots · en correction` : "non rédigée"}</span></div>
          <div className="flex justify-between"><span>🎤 Expression orale</span><span className="font-medium text-amber-600">{surPlace ? "avec votre examinateur" : Object.keys(oralBlobs).length > 0 ? `${Object.keys(oralBlobs).length} audio(s) · en correction` : "non enregistrée"}</span></div>
        </div>
        <div className="mx-auto max-w-sm rounded-xl bg-gray-50 p-4 text-left text-sm text-gray-600">
          <p className="mb-1 font-semibold text-gray-900">Et maintenant ?</p>
          <p>{surPlace ? "Votre examinateur va évaluer votre expression orale avec vous, puis une formatrice corrige votre rédaction." : "Une formatrice corrige votre rédaction et vos réponses orales sous 24-48 h."} Vous recevrez ensuite votre <strong>niveau complet, le détail des 4 épreuves et nos conseils par email</strong>{surPlace ? " — et un conseiller vous accompagne tout de suite pour la suite." : ", avec une invitation à échanger avec un conseiller (06 81 43 16 54)."}</p>
        </div>
        {kiosque && <a href="/test/kiosque" className="btn-primary mt-5">Candidat suivant →</a>}
      </Centre>
    );
  }
  if (deja) return <Centre><h1 className="mb-2 text-2xl font-bold text-mystory">Test déjà envoyé</h1><p>Ce test a déjà été complété. Merci !</p></Centre>;
  if (erreur && !data) return <Centre><p className="text-red-700">{erreur}</p></Centre>;
  if (!data) return <Centre><p>Chargement…</p></Centre>;

  let numero = 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-mystory">{data.test.titre}</h1>
        <p className="text-sm text-gray-500">
          {data.candidat.prenom || data.candidat.nom ? `${data.candidat.prenom ?? ""} ${data.candidat.nom ?? ""}`.trim() : ""}
        </p>
      </header>

      {phase === "intro" && (
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">Avant de commencer</h2>
          <p className="mb-3 text-sm text-gray-600">Le test dure <b>{data.mode === "sur_place" ? "55" : "65"} minutes</b>, en {ORDRE_PHASES.length} étapes chronométrées. Quand le temps d&apos;une étape est écoulé (ou que vous la validez), vous passez à la suivante — <b>impossible de revenir en arrière</b>.</p>
          <ul className="mb-4 space-y-1.5 text-sm text-gray-700">
            <li>📖 <b>Compréhension écrite</b> — 20 min</li>
            <li>🎧 <b>Compréhension orale</b> — 20 min · <b>chaque audio ne peut être écouté qu&apos;UNE seule fois</b></li>
            <li>✍️ <b>Expression écrite</b> — 15 min</li>
            {data.mode === "sur_place"
              ? <li>🎤 <b>Expression orale</b> — en direct avec votre examinateur, après le test écrit</li>
              : <li>🎤 <b>Expression orale</b> — 10 min (micro requis)</li>}
          </ul>
          <p className="mb-4 text-xs text-gray-400">Installez-vous au calme, avec de quoi écouter le son. Le chrono démarre au clic.</p>
          <button onClick={() => demarrerPhase("CE")} className="btn-primary w-full">🚀 Commencer le test (le chrono démarre)</button>
        </section>
      )}

      {phase !== "intro" && !fini && (
        <div className="sticky top-0 z-20 mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold text-gray-800">
            Étape {ORDRE_PHASES.indexOf(phase as any) + 1}/{ORDRE_PHASES.length} · {phase === "CE" ? "Compréhension écrite" : phase === "CO" ? "Compréhension orale" : phase === "EE" ? "Expression écrite" : "Expression orale"}
          </div>
          <div className={`rounded-lg px-3 py-1 font-mono text-sm font-bold ${resteSec <= 120 ? "bg-red-100 text-red-700" : "bg-blue-50 text-mystory"}`}>⏱ {mmss}</div>
        </div>
      )}

      {sections.filter((s) => s === phase).map((sec) => {
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
                      <AudioUneEcoute src={q.audio_path!} />
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

      {phase === "EE" && (data.test.consigne_ecrit || (data.test.sujets_ecrit?.length ?? 0) > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">Expression écrite <span className="text-sm font-normal text-gray-400">· /10</span></h2>
          {data.test.consigne_ecrit && <p className="mb-3 whitespace-pre-line text-sm italic text-gray-600">{data.test.consigne_ecrit}</p>}
          {(data.test.sujets_ecrit?.length ?? 0) > 0 && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {data.test.sujets_ecrit!.map((s) => {
                const actif = sujetEcrit === s.niveau;
                return (
                  <button key={s.niveau} type="button" onClick={() => setSujetEcrit(s.niveau)}
                    className={`rounded-xl border-2 p-3 text-left transition ${actif ? "border-mystory bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${actif ? "bg-mystory text-white" : "bg-gray-100 text-gray-600"}`}>{s.niveau}</span>
                      <span className="text-xs text-gray-400">min. {s.mots_min} mots</span>
                    </div>
                    <p className="text-sm text-gray-700">{s.sujet}</p>
                  </button>
                );
              })}
            </div>
          )}
          {(() => {
            const s = (data.test.sujets_ecrit ?? []).find((x) => x.niveau === sujetEcrit) ?? null;
            const nbMots = ecrit.trim() ? ecrit.trim().split(/\s+/).length : 0;
            const okMots = s ? nbMots >= s.mots_min : true;
            return (
              <div>
                <textarea value={ecrit} onChange={(e) => setEcrit(e.target.value)} rows={10}
                  placeholder={s ? `Sujet ${s.niveau} — rédigez votre texte ici (minimum ${s.mots_min} mots)…` : "Choisissez d'abord votre sujet ci-dessus, puis rédigez ici…"}
                  className="input w-full" />
                {(data.test.sujets_ecrit?.length ?? 0) > 0 && (
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-400">{sujetEcrit ? `Sujet choisi : ${sujetEcrit}` : "Aucun sujet choisi"}</span>
                    <span className={ecrit.trim() ? (okMots ? "font-medium text-green-600" : "text-amber-600") : "text-gray-400"}>
                      {nbMots} mot{nbMots > 1 ? "s" : ""}{s ? ` / ${s.mots_min} minimum` : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {phase === "EO" && data.mode !== "sur_place" && (data.test.consigne_oral || (data.test.oral_questions?.length ?? 0) > 0) && (
        <section className="mb-8">
          <h2 className="mb-2 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">Expression orale</h2>
          {data.test.consigne_oral && <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm italic text-gray-700">{data.test.consigne_oral}</div>}
          {(data.test.oral_questions?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Enregistrez votre réponse à chaque question (autorisez l'accès au micro).</p>
              {data.test.oral_questions!.map((q, i) => (
                <EnregistreurOral key={i} index={i} question={q} onBlob={(bl) => setOralBlobs((pp) => ({ ...pp, [i]: bl }))} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Cette partie sera évaluée avec la formatrice.</p>
          )}
        </section>
      )}

      {erreur && <p className="mb-3 text-sm text-red-700">{erreur}</p>}
      {phase !== "intro" && !fini && (
        phase === ORDRE_PHASES[ORDRE_PHASES.length - 1] ? (
          <button onClick={() => { if (!envoyeRef.current) { envoyeRef.current = true; envoyer(); } }} disabled={envoi} className="btn-primary w-full">{envoi ? "Envoi…" : "✅ Terminer et envoyer mes réponses"}</button>
        ) : (
          <button onClick={() => { if (confirm("Passer à l'étape suivante ? Vous ne pourrez pas revenir en arrière.")) phaseSuivante(); }} className="btn-primary w-full">Étape suivante →</button>
        )
      )}
      <p className="mt-3 text-center text-xs text-gray-400">MYSTORY Formation — vos réponses sont corrigées automatiquement, l'oral et l'écrit par une formatrice.</p>
    </div>
  );
}

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
}

function EnregistreurOral({ index, question, onBlob }: { index: number; question: string; onBlob: (b: Blob) => void }) {
  const [etat, setEtat] = useState<"vide" | "enregistre" | "fait">("vide");
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function demarrer() {
    setErr(null);
    if (!navigator.mediaDevices || typeof window === "undefined" || !("MediaRecorder" in window)) {
      setErr("Enregistrement non supporté par ce navigateur (essayez Chrome ou Safari à jour)."); return;
    }
    try { streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setErr("Micro non autorisé."); return; }
    chunksRef.current = [];
    const rec = new MediaRecorder(streamRef.current);
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      onBlob(blob); setUrl(URL.createObjectURL(blob)); setEtat("fait");
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    rec.start(); setEtat("enregistre");
  }
  function arreter() { recRef.current?.stop(); }

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="mb-2 text-sm font-medium text-gray-800">{index + 1}. {question}</p>
      <div className="flex items-center gap-2">
        {etat !== "enregistre" ? (
          <button type="button" onClick={demarrer} className="btn-ghost !py-1 !text-xs">{etat === "fait" ? "Réenregistrer" : "● Enregistrer"}</button>
        ) : (
          <button type="button" onClick={arreter} className="btn-primary !py-1 !text-xs">■ Arrêter</button>
        )}
        {etat === "enregistre" && <span className="text-xs text-red-600">Enregistrement en cours…</span>}
        {etat === "fait" && <span className="text-xs text-green-600">✓ Enregistré</span>}
      </div>
      {url && <audio controls src={url} className="mt-2 w-full" />}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/** Compréhension orale : chaque audio ne peut être écouté qu'UNE seule fois (règle Direction 10/07). */
function AudioUneEcoute({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [etat, setEtat] = useState<"pret" | "lecture" | "fini">("pret");

  function lancer() {
    if (etat !== "pret") return;
    const a = new Audio(src);
    audioRef.current = a;
    a.onended = () => setEtat("fini");
    a.onerror = () => setEtat("fini");
    a.play().then(() => setEtat("lecture")).catch(() => setEtat("pret"));
  }

  return (
    <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      {etat === "pret" && (
        <button type="button" onClick={lancer} className="btn-primary !py-1.5 !text-sm">▶ Écouter l&apos;audio (1 seule fois)</button>
      )}
      {etat === "lecture" && <span className="text-sm font-medium text-mystory">🔊 Écoute en cours… répondez aux questions ci-dessous.</span>}
      {etat === "fini" && <span className="text-sm text-gray-500">✓ Écoute terminée — répondez de mémoire.</span>}
    </div>
  );
}
