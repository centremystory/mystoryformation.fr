"use client";

/**
 * MYSTORY — Édition d'un test : métadonnées, questions (choix unique / réponse libre), upload audio & images.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Option = { cle: string; texte: string; image?: string };
type Question = {
  id?: string; section: "CE" | "CO"; ordre: number; bloc: string | null; type: "choix_unique" | "texte_libre";
  contexte: string | null; audio_path: string | null; enonce: string; options: Option[];
  bonne_reponse: string | null; mots_cles: string[] | null; points: number;
};
type Test = { id: string; phase: string; certif: string; titre: string; periode: string | null; consigne_ecrit: string | null; consigne_oral: string | null; oral_questions: string[] | null; actif: boolean };

const LETTRES = ["A", "B", "C", "D", "E", "F", "G", "H"];

async function uploadFichier(file: File): Promise<string | null> {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch("/api/tests/audio", { method: "POST", body: fd });
  const j = await r.json(); return j.ok ? j.url : null;
}

export default function EditionTest({ params }: { params: { id: string } }) {
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<Question | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const charger = useCallback(() => {
    setChargement(true);
    fetch(`/api/tests/banque?test_id=${params.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setTest(j.test); setQuestions(j.questions); } else setErreur(j.erreur || "Introuvable."); })
      .catch(() => setErreur("Chargement impossible."))
      .finally(() => setChargement(false));
  }, [params.id]);
  useEffect(() => { charger(); }, [charger]);

  async function enregistrerTest() {
    if (!test) return;
    await fetch("/api/tests/banque", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "maj_test", test_id: test.id, titre: test.titre, periode: test.periode, consigne_ecrit: test.consigne_ecrit, consigne_oral: test.consigne_oral, oral_questions: test.oral_questions }),
    });
    setOkMsg("Enregistré ✓"); setTimeout(() => setOkMsg(null), 1500);
  }

  async function archiverQuestion(qid: string) {
    await fetch("/api/tests/banque", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archiver_question", question_id: qid, test_id: params.id }),
    });
    charger();
  }

  function nouvelleQuestion(section: "CE" | "CO") {
    const ordreMax = Math.max(0, ...questions.filter((q) => q.section === section).map((q) => q.ordre));
    setEdition({ section, ordre: ordreMax + 1, bloc: "", type: "choix_unique", contexte: "", audio_path: "", enonce: "", options: [{ cle: "A", texte: "" }, { cle: "B", texte: "" }], bonne_reponse: "A", mots_cles: [], points: 1 });
  }

  if (chargement) return <p className="text-gray-500">Chargement…</p>;
  if (!test) return <p className="text-red-700">{erreur || "Test introuvable."}</p>;

  const parSection = (s: "CE" | "CO") => questions.filter((q) => q.section === s);

  return (
    <div>
      <div className="page-header">
        <Link href="/tests/banque" className="text-sm text-mystory underline">← Banque de tests</Link>
        <h1 className="page-title mt-1">{test.titre}</h1>
        <p className="page-subtitle">{test.phase === "final" ? "Test final" : "Test initial"} · {test.periode ?? "—"}</p>
      </div>

      <div className="card mb-5 space-y-3">
        <p className="font-semibold text-gray-800">Informations</p>
        <label className="block text-sm text-gray-700">Titre
          <input value={test.titre} onChange={(e) => setTest({ ...test, titre: e.target.value })} className="input mt-1 w-full" />
        </label>
        <label className="block text-sm text-gray-700">Période
          <input value={test.periode ?? ""} onChange={(e) => setTest({ ...test, periode: e.target.value })} className="input mt-1 w-full" />
        </label>
        <label className="block text-sm text-gray-700">Consigne expression écrite <span className="text-gray-400">(vide = pas de rédaction)</span>
          <textarea value={test.consigne_ecrit ?? ""} onChange={(e) => setTest({ ...test, consigne_ecrit: e.target.value })} rows={2} className="input mt-1 w-full" />
        </label>
        <label className="block text-sm text-gray-700">Consigne expression orale
          <textarea value={test.consigne_oral ?? ""} onChange={(e) => setTest({ ...test, consigne_oral: e.target.value })} rows={2} className="input mt-1 w-full" />
        </label>
        <label className="block text-sm text-gray-700">Questions orales à enregistrer <span className="text-gray-400">(une par ligne)</span>
          <textarea value={(test.oral_questions ?? []).join("\n")} onChange={(e) => setTest({ ...test, oral_questions: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} rows={3} placeholder="Une question par ligne…" className="input mt-1 w-full" />
        </label>
        <div className="flex items-center gap-3">
          <button onClick={enregistrerTest} className="btn-primary">Enregistrer</button>
          {okMsg && <span className="text-sm text-mystory">{okMsg}</span>}
        </div>
      </div>

      {(["CE", "CO"] as const).map((sec) => (
        <div key={sec} className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">{sec === "CE" ? "Compréhension écrite" : "Compréhension orale"}</h2>
            <button onClick={() => nouvelleQuestion(sec)} className="btn-ghost !py-1 !text-xs">+ Ajouter une question</button>
          </div>
          <div className="space-y-2">
            {parSection(sec).map((q) => (
              <div key={q.id} className="card flex items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="text-xs text-gray-400">{q.bloc || "—"} · {q.type === "texte_libre" ? "réponse libre" : "choix unique"} · {q.points} pt</p>
                  <p className="font-medium text-gray-800">{q.ordre}. {q.enonce}</p>
                  {q.type === "choix_unique" && <p className="text-xs text-gray-500">Réponse : {q.bonne_reponse}</p>}
                  {q.type === "texte_libre" && <p className="text-xs text-gray-500">Mots-clés : {(q.mots_cles ?? []).join(", ")}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setEdition(q)} className="btn-ghost !py-1 !text-xs">Modifier</button>
                  <button onClick={() => q.id && archiverQuestion(q.id)} className="btn-ghost !py-1 !text-xs text-red-600">Archiver</button>
                </div>
              </div>
            ))}
            {parSection(sec).length === 0 && <p className="text-sm text-gray-400">Aucune question.</p>}
          </div>
        </div>
      ))}

      {edition && <EditeurQuestion testId={test.id} q={edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); charger(); }} />}
    </div>
  );
}

function EditeurQuestion({ testId, q, onClose, onSaved }: { testId: string; q: Question; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Question>(q);
  const [envoi, setEnvoi] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [motsStr, setMotsStr] = useState((q.mots_cles ?? []).join(", "));

  function set<K extends keyof Question>(k: K, v: Question[K]) { setF((p) => ({ ...p, [k]: v })); }
  function setOption(i: number, patch: Partial<Option>) { setF((p) => ({ ...p, options: p.options.map((o, idx) => idx === i ? { ...o, ...patch } : o) })); }
  function ajouterOption() { setF((p) => ({ ...p, options: [...p.options, { cle: LETTRES[p.options.length] || String(p.options.length + 1), texte: "" }] })); }
  function retirerOption(i: number) {
    setF((p) => {
      const opts = p.options.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, cle: LETTRES[idx] || String(idx + 1) }));
      let br = p.bonne_reponse;
      if (!opts.find((o) => o.cle === br)) br = opts[0]?.cle ?? null;
      return { ...p, options: opts, bonne_reponse: br };
    });
  }

  async function uploadAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await uploadFichier(file); if (url) set("audio_path", url); else setErr("Upload audio échoué.");
  }
  async function uploadImageOption(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const url = await uploadFichier(file); if (url) setOption(i, { image: url }); else setErr("Upload image échoué.");
  }

  async function enregistrer() {
    setEnvoi(true); setErr(null);
    const mots = motsStr.split(",").map((s) => s.trim()).filter(Boolean);
    const payload = {
      action: "maj_question", test_id: testId, question_id: f.id, section: f.section, ordre: f.ordre, bloc: f.bloc,
      type: f.type, contexte: f.contexte, audio_path: f.audio_path, enonce: f.enonce, options: f.options,
      bonne_reponse: f.bonne_reponse, mots_cles: mots, points: f.points,
    };
    const r = await fetch("/api/tests/banque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (j.ok) onSaved(); else { setErr(j.erreur || "Erreur."); setEnvoi(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="card my-8 w-full max-w-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold text-gray-900">{f.id ? "Modifier la question" : "Nouvelle question"}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-gray-700">Section
              <select value={f.section} onChange={(e) => set("section", e.target.value as "CE" | "CO")} className="input ml-2"><option value="CE">CE</option><option value="CO">CO</option></select>
            </label>
            <label className="text-sm text-gray-700">Type
              <select value={f.type} onChange={(e) => set("type", e.target.value as "choix_unique" | "texte_libre")} className="input ml-2"><option value="choix_unique">Choix unique</option><option value="texte_libre">Réponse libre</option></select>
            </label>
            <label className="text-sm text-gray-700">Ordre<input type="number" value={f.ordre} onChange={(e) => set("ordre", Number(e.target.value))} className="input ml-2 w-20" /></label>
            <label className="text-sm text-gray-700">Points<input type="number" value={f.points} onChange={(e) => set("points", Number(e.target.value))} className="input ml-2 w-20" /></label>
          </div>
          <label className="block text-sm text-gray-700">Bloc (regroupement)
            <input value={f.bloc ?? ""} onChange={(e) => set("bloc", e.target.value)} placeholder="ex : Exercice 1, Audio 1" className="input mt-1 w-full" />
          </label>
          <label className="block text-sm text-gray-700">Texte support / contexte (optionnel)
            <textarea value={f.contexte ?? ""} onChange={(e) => set("contexte", e.target.value)} rows={3} className="input mt-1 w-full" />
          </label>
          <div>
            <label className="block text-sm text-gray-700">Audio (URL ou upload)</label>
            <div className="flex gap-2">
              <input value={f.audio_path ?? ""} onChange={(e) => set("audio_path", e.target.value)} placeholder="https://…" className="input mt-1 w-full" />
              <label className="btn-ghost mt-1 cursor-pointer !text-xs">Upload<input type="file" accept="audio/*" onChange={uploadAudio} className="hidden" /></label>
            </div>
            {f.audio_path && /^https?:/.test(f.audio_path) && <audio controls preload="none" className="mt-2 w-full"><source src={f.audio_path} /></audio>}
          </div>
          <label className="block text-sm text-gray-700">Énoncé
            <input value={f.enonce} onChange={(e) => set("enonce", e.target.value)} className="input mt-1 w-full" />
          </label>

          {f.type === "choix_unique" ? (
            <div>
              <p className="text-sm font-medium text-gray-700">Options (cochez la bonne réponse)</p>
              {f.options.map((o, i) => (
                <div key={i} className="mt-1 flex items-center gap-2">
                  <input type="radio" name="bonne" checked={f.bonne_reponse === o.cle} onChange={() => set("bonne_reponse", o.cle)} />
                  <span className="w-5 text-sm font-medium">{o.cle}</span>
                  <input value={o.texte} onChange={(e) => setOption(i, { texte: e.target.value })} placeholder="Texte de l'option" className="input flex-1" />
                  <label className="btn-ghost cursor-pointer !text-xs">Img<input type="file" accept="image/*" onChange={(e) => uploadImageOption(i, e)} className="hidden" /></label>
                  {o.image && <img src={o.image} alt="" className="h-8 w-8 rounded object-cover" />}
                  <button onClick={() => retirerOption(i)} className="text-xs text-red-500">✕</button>
                </div>
              ))}
              <button onClick={ajouterOption} className="btn-ghost mt-2 !py-1 !text-xs">+ Option</button>
            </div>
          ) : (
            <label className="block text-sm text-gray-700">Mots-clés acceptés (séparés par des virgules)
              <input value={motsStr} onChange={(e) => setMotsStr(e.target.value)} placeholder="ex : garde, enfant, nounou" className="input mt-1 w-full" />
            </label>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={enregistrer} disabled={envoi} className="btn-primary">{envoi ? "Enregistrement…" : "Enregistrer la question"}</button>
            <button onClick={onClose} className="btn-ghost">Annuler</button>
          </div>
        </div>
      </div>
    </div>
  );
}
