"use client";
// app/faq/page.tsx — FAQ interne équipe (réponses homogènes aux prospects).
import { useCallback, useEffect, useMemo, useState } from "react";

type Entree = { id: string; categorie: string; question: string; reponse: string; auteur: string | null; cree_le: string; maj_le: string };

const CATS: { v: string; label: string }[] = [
  { v: "financement_cpf", label: "Financement & CPF" },
  { v: "tef_irn", label: "TEF IRN" },
  { v: "leveltel", label: "LEVELTEL" },
  { v: "inscription", label: "Inscription & dossier" },
  { v: "examen", label: "Examen" },
  { v: "tarifs", label: "Tarifs" },
  { v: "autre", label: "Autre" },
];
const LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.v, c.label]));

export default function PageFaq() {
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [charge, setCharge] = useState(true);
  const [filtre, setFiltre] = useState<string>("toutes");
  const [recherche, setRecherche] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ajout
  const [categorie, setCategorie] = useState("financement_cpf");
  const [question, setQuestion] = useState("");
  const [reponse, setReponse] = useState("");

  // édition inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState("");
  const [editR, setEditR] = useState("");
  const [editC, setEditC] = useState("autre");

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const r = await fetch("/api/faq", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setEntrees(j.entrees);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return entrees.filter((e) =>
      (filtre === "toutes" || e.categorie === filtre) &&
      (!q || e.question.toLowerCase().includes(q) || e.reponse.toLowerCase().includes(q)),
    );
  }, [entrees, filtre, recherche]);

  async function ajouter() {
    if (!question.trim() || !reponse.trim()) { setErr("Question et réponse requises."); return; }
    setBusy("__add__"); setErr(null);
    try {
      const r = await fetch("/api/faq", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorie, question, reponse }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Ajout impossible."); return; }
      setQuestion(""); setReponse("");
      await charger();
    } catch (e: any) { setErr(e?.message || "Ajout impossible."); }
    finally { setBusy(null); }
  }

  function ouvrirEdition(e: Entree) {
    setEditId(e.id); setEditQ(e.question); setEditR(e.reponse); setEditC(e.categorie);
  }
  async function enregistrerEdition() {
    if (!editId) return;
    setBusy(`edit-${editId}`); setErr(null);
    try {
      const r = await fetch("/api/faq", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, question: editQ, reponse: editR, categorie: editC }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Modification impossible."); return; }
      setEditId(null);
      await charger();
    } catch (e: any) { setErr(e?.message || "Modification impossible."); }
    finally { setBusy(null); }
  }
  async function archiver(id: string) {
    setBusy(`arch-${id}`);
    try {
      await fetch("/api/faq", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "archiver" }) });
      await charger();
    } finally { setBusy(null); }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FAQ interne</h1>
          <p className="text-sm text-gray-500 mt-0.5">Les bonnes réponses aux questions des prospects — pour que toute l'équipe dise la même chose.</p>
        </div>
      </header>

      {/* Ajout */}
      <section className="border border-gray-200 rounded-xl bg-white p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Ajouter une question / réponse</h2>
        <div className="grid grid-cols-1 gap-2">
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white sm:w-64">
            {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question (ex. « Le CPF couvre-t-il tout ? »)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <textarea value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder="Réponse validée à donner au prospect" rows={3} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={ajouter} disabled={busy === "__add__"} className="mt-3 px-4 py-2 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
          {busy === "__add__" ? "Ajout…" : "Ajouter"}
        </button>
      </section>

      {/* Recherche + filtre */}
      <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une question…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />
      <div className="flex flex-wrap gap-2 mb-4">
        {[{ v: "toutes", label: "Toutes" }, ...CATS].map((c) => (
          <button key={c.v} onClick={() => setFiltre(c.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filtre === c.v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-700 border-gray-300 hover:border-mystory"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : visibles.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucune question pour ce filtre. Ajoute la première ci-dessus.</p>
      ) : (
        <div className="space-y-2">
          {visibles.map((e) => (
            <div key={e.id} className="border border-gray-200 rounded-xl bg-white p-4">
              {editId === e.id ? (
                <div className="space-y-2">
                  <select value={editC} onChange={(ev) => setEditC(ev.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white sm:w-64">
                    {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                  </select>
                  <input value={editQ} onChange={(ev) => setEditQ(ev.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <textarea value={editR} onChange={(ev) => setEditR(ev.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={enregistrerEdition} disabled={busy === `edit-${e.id}`} className="px-3 py-1.5 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">Enregistrer</button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-sm">Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{LABEL[e.categorie] ?? e.categorie}</span>
                    <span className="flex-1" />
                    <button onClick={() => ouvrirEdition(e)} className="text-xs text-gray-400 hover:text-mystory">Éditer</button>
                    <button onClick={() => archiver(e.id)} disabled={busy === `arch-${e.id}`} className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">Archiver</button>
                  </div>
                  <p className="font-medium text-gray-900">{e.question}</p>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{e.reponse}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
