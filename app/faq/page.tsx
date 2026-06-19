"use client";
// app/faq/page.tsx — FAQ interne équipe (réponses homogènes aux prospects + modèles de mails).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Check, Pencil, Archive, Mail } from "lucide-react";

type Entree = { id: string; categorie: string; question: string; reponse: string; auteur: string | null; cree_le: string; maj_le: string };

const CATS: { v: string; label: string }[] = [
  { v: "general", label: "Général" },
  { v: "tef_irn", label: "TEF IRN" },
  { v: "examen", label: "Examen" },
  { v: "tarifs", label: "Tarifs" },
  { v: "financement_cpf", label: "Financement & CPF" },
  { v: "formation", label: "Formation" },
  { v: "inscription", label: "Inscription & dossier" },
  { v: "leveltel", label: "LEVELTEL" },
  { v: "modeles_mails", label: "Modèles de mails" },
  { v: "autre", label: "Autre" },
];
const LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.v, c.label]));

// --- Rendu inline : **gras** ---
function renderInline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={`${keyBase}-${i}`} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{p}</span>,
  );
}

// --- Rendu markdown léger : titres (## ), listes (- / •), paragraphes ---
function RenderMarkdown({ texte }: { texte: string }) {
  const lignes = texte.replace(/\r/g, "").split("\n");
  const blocs: React.ReactNode[] = [];
  let liste: string[] = [];
  const flush = () => {
    if (liste.length) {
      blocs.push(
        <ul key={`ul-${blocs.length}`} className="my-1 ml-1 space-y-1">
          {liste.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-mystory" />
              <span>{renderInline(it, `li-${blocs.length}-${i}`)}</span>
            </li>
          ))}
        </ul>,
      );
      liste = [];
    }
  };
  let table: string[] = [];
  const flushTable = () => {
    if (!table.length) return;
    const cells = (r: string) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const rows = table.filter((r) => !/^\|[\s:|-]+\|$/.test(r)); // retire la ligne séparatrice |---|---|
    const header = cells(rows[0] ?? "");
    const body = rows.slice(1).map(cells);
    blocs.push(
      <div key={`tbl-${blocs.length}`} className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{header.map((h, i) => <th key={i} className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-800">{renderInline(h, `th-${i}`)}</th>)}</tr></thead>
          <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-gray-200 px-2 py-1 align-top text-gray-700">{renderInline(c, `td-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
        </table>
      </div>,
    );
    table = [];
  };
  lignes.forEach((ln, idx) => {
    const t = ln.trim();
    if (/^[-•]\s+/.test(t)) { flushTable(); liste.push(t.replace(/^[-•]\s+/, "")); return; }
    if (/^\|.*\|$/.test(t)) { flush(); table.push(t); return; }
    flush(); flushTable();
    if (!t) return;
    if (t.startsWith("## ")) {
      blocs.push(<p key={idx} className="mt-2 font-semibold text-gray-900">{t.slice(3)}</p>);
    } else {
      blocs.push(<p key={idx} className="text-sm text-gray-700">{renderInline(t, `p-${idx}`)}</p>);
    }
  });
  flush(); flushTable();
  return <div className="space-y-1">{blocs}</div>;
}

function BoutonCopier({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false);
  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {}
  }
  return (
    <button onClick={copier} className={`btn-ghost !py-1.5 ${copie ? "!text-success-600" : ""}`}>
      {copie ? <><Check size={15} /> Copié</> : <><Copy size={15} /> Copier le mail</>}
    </button>
  );
}

export default function PageFaq() {
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [charge, setCharge] = useState(true);
  const [filtre, setFiltre] = useState<string>("toutes");
  const [recherche, setRecherche] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ajout
  const [categorie, setCategorie] = useState("general");
  const [question, setQuestion] = useState("");
  const [reponse, setReponse] = useState("");
  const [ouvertAjout, setOuvertAjout] = useState(false);

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

  // catégories réellement présentes (pour n'afficher que les filtres utiles)
  const catsPresentes = useMemo(() => {
    const set = new Set(entrees.map((e) => e.categorie));
    return CATS.filter((c) => set.has(c.v));
  }, [entrees]);

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
      setQuestion(""); setReponse(""); setOuvertAjout(false);
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
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">FAQ interne</h1>
          <p className="page-subtitle">Les bonnes réponses aux questions des prospects — pour que toute l'équipe dise la même chose. Les <strong>modèles de mails</strong> se copient en un clic.</p>
        </div>
        <button onClick={() => setOuvertAjout((o) => !o)} className="btn-ghost">{ouvertAjout ? "Fermer" : "+ Ajouter"}</button>
      </header>

      {/* Ajout (repliable) */}
      {ouvertAjout && (
        <section className="card mb-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Ajouter une entrée</h2>
          <div className="grid grid-cols-1 gap-2">
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className="input sm:w-64">
              {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question / titre du modèle" className="input" />
            <textarea value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder={"Réponse. Mise en forme : **gras**, et « - » en début de ligne pour une puce."} rows={4} className="input" />
          </div>
          <button onClick={ajouter} disabled={busy === "__add__"} className="btn-primary mt-3">
            {busy === "__add__" ? "Ajout…" : "Ajouter"}
          </button>
        </section>
      )}

      {/* Recherche + filtre */}
      <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une question, un mot-clé…" className="input mb-3 w-full" />
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ v: "toutes", label: "Toutes" }, ...catsPresentes].map((c) => (
          <button key={c.v} onClick={() => setFiltre(c.v)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${filtre === c.v ? "border-mystory bg-mystory text-white" : "border-gray-300 bg-white text-gray-700 hover:border-mystory"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}

      {charge ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : visibles.length === 0 ? (
        <div className="empty-state">Aucune entrée pour ce filtre.</div>
      ) : (
        <div className="space-y-2">
          {visibles.map((e) => {
            const estModele = e.categorie === "modeles_mails";
            return (
              <div key={e.id} className="card">
                {editId === e.id ? (
                  <div className="space-y-2">
                    <select value={editC} onChange={(ev) => setEditC(ev.target.value)} className="input sm:w-64">
                      {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                    </select>
                    <input value={editQ} onChange={(ev) => setEditQ(ev.target.value)} className="input w-full" />
                    <textarea value={editR} onChange={(ev) => setEditR(ev.target.value)} rows={estModele ? 14 : 4} className="input w-full font-mono text-xs" />
                    <div className="flex gap-2">
                      <button onClick={enregistrerEdition} disabled={busy === `edit-${e.id}`} className="btn-primary !py-1.5">Enregistrer</button>
                      <button onClick={() => setEditId(null)} className="btn-ghost !py-1.5">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`badge ${estModele ? "badge-info" : "badge-neutral"}`}>
                        {estModele && <Mail size={12} className="mr-1" />}{LABEL[e.categorie] ?? e.categorie}
                      </span>
                      <span className="flex-1" />
                      {estModele && <BoutonCopier texte={e.reponse} />}
                      <button onClick={() => ouvrirEdition(e)} className="text-xs text-gray-400 hover:text-mystory inline-flex items-center gap-1"><Pencil size={12} /> Éditer</button>
                      <button onClick={() => archiver(e.id)} disabled={busy === `arch-${e.id}`} className="text-xs text-gray-400 hover:text-danger-600 disabled:opacity-50 inline-flex items-center gap-1"><Archive size={12} /> Archiver</button>
                    </div>
                    <p className="font-medium text-gray-900">{e.question}</p>
                    {estModele ? (
                      <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-3 font-sans text-[13px] leading-relaxed text-gray-700">{e.reponse}</pre>
                    ) : (
                      <div className="mt-1"><RenderMarkdown texte={e.reponse} /></div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
