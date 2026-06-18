"use client";
// app/messages/page.tsx — Messages prospects (équipe) : liste + traiter / archiver.
import { useCallback, useEffect, useState } from "react";

type Msg = { id: string; nom: string | null; email: string | null; message: string; statut: string; source?: string | null; cree_le: string; assignee?: string | null; assignee_nom?: string | null; assignee_email?: string | null };
type Personne = { id: string; nom: string; prenom: string | null; email: string | null };

const FILTRES = [
  { v: "nouveau", l: "Nouveaux" },
  { v: "traite", l: "Traités" },
  { v: "archive", l: "Archivés" },
  { v: "", l: "Tous" },
];
const BADGE: Record<string, string> = {
  nouveau: "bg-blue-100 text-blue-700", traite: "bg-green-100 text-green-700", archive: "bg-gray-100 text-gray-500",
};

export default function PageMessages() {
  const [filtre, setFiltre] = useState("nouveau");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [personnes, setPersonnes] = useState<Personne[]>([]);
  const [monEmail, setMonEmail] = useState<string | null>(null);
  const [mesMsg, setMesMsg] = useState(false);

  useEffect(() => {
    fetch("/api/utilisateurs").then((r) => r.json()).then((j) => { if (j.ok) setPersonnes(j.utilisateurs); }).catch(() => {});
    fetch("/api/me").then((r) => r.json()).then((j) => { if (j.ok) setMonEmail(j.user?.email ?? null); }).catch(() => {});
  }, []);
  const nomPersonne = (p: Personne) => `${p.prenom ? p.prenom + " " : ""}${p.nom}`;

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const r = await fetch(`/api/contact${filtre ? `?statut=${filtre}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setMessages(j.messages);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [filtre]);
  useEffect(() => { charger(); }, [charger]);

  async function setStatut(id: string, statut: string) {
    setBusy(id);
    try {
      await fetch("/api/contact", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, statut }) });
      await charger();
    } finally { setBusy(null); }
  }

  async function assigner(id: string, assignee: string) {
    setBusy(id);
    try {
      await fetch("/api/contact", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, assignee: assignee || null }) });
      await charger();
    } finally { setBusy(null); }
  }

  const visibles = mesMsg && monEmail ? messages.filter((m) => m.assignee_email === monEmail) : messages;

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Messages reçus depuis le formulaire du site (prospects).</p>
        </div>
      </header>

      <div className="flex gap-2 mb-4">
        {FILTRES.map((f) => (
          <button key={f.v} onClick={() => setFiltre(f.v)}
            className={`text-xs px-3 py-1.5 rounded-full border ${filtre === f.v ? "bg-mystory text-white border-mystory" : "border-gray-300 text-gray-600"}`}>
            {f.l}
          </button>
        ))}
        {monEmail && (
          <button onClick={() => setMesMsg((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border ${mesMsg ? "bg-mystory text-white border-mystory" : "border-gray-300 text-gray-600"}`}>
            👤 Qui m&apos;est assigné
          </button>
        )}
      </div>

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : visibles.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun message.</p>
      ) : (
        <div className="space-y-2">
          {visibles.map((m) => (
            <div key={m.id} className="border border-gray-200 rounded-xl bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[m.statut] ?? "bg-gray-100 text-gray-600"}`}>{m.statut}</span>
                {m.source === "pre-inscription" && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Pré-inscription</span>}
                <span className="font-medium text-gray-900">{m.nom || "—"}</span>
                {m.email && <a href={`mailto:${m.email}`} className="text-sm text-mystory underline">{m.email}</a>}
                <span className="flex-1" />
                {m.assignee_nom && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">👤 {m.assignee_nom}</span>}
                <span className="text-xs text-gray-400">{new Date(m.cree_le).toLocaleString("fr-FR")}</span>
              </div>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{m.message}</p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                {m.statut !== "traite" && <button onClick={() => setStatut(m.id, "traite")} disabled={busy === m.id} className="text-xs text-green-700 underline disabled:opacity-50">Marquer traité</button>}
                {m.statut !== "archive" && <button onClick={() => setStatut(m.id, "archive")} disabled={busy === m.id} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50">Archiver</button>}
                {m.statut !== "nouveau" && <button onClick={() => setStatut(m.id, "nouveau")} disabled={busy === m.id} className="text-xs text-blue-600 underline disabled:opacity-50">Rouvrir</button>}
                <span className="flex-1" />
                <select value={m.assignee ?? ""} onChange={(e) => assigner(m.id, e.target.value)} disabled={busy === m.id}
                        title="Assigner" className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-600">
                  <option value="">Non assigné</option>
                  {personnes.map((p) => <option key={p.id} value={p.id}>{nomPersonne(p)}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
