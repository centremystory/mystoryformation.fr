"use client";
// app/examens/liste-attente/page.tsx — Liste d'attente par session (CDC §4).
import { useCallback, useEffect, useState } from "react";

type Session = { id: string; type: string; date_examen: string | null; horaire: string | null; capacite: number; inscrits: number; restantes: number };
type Entree = { id: string; session_id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null; note: string | null; statut: string; cree_le: string; sessions_examen?: any };

const BADGE: Record<string, string> = {
  en_attente: "bg-amber-100 text-amber-800", place_proposee: "bg-blue-100 text-blue-700", convertie: "bg-green-100 text-green-700",
};

export default function PageListeAttente() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [charge, setCharge] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState("");
  const [nom, setNom] = useState(""); const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState(""); const [telephone, setTelephone] = useState(""); const [note, setNote] = useState("");

  const charger = useCallback(async () => {
    setCharge(true);
    try {
      const [rs, re] = await Promise.all([
        fetch("/api/examens/sessions", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/examens/liste-attente", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (rs.ok) setSessions(rs.sessions ?? []);
      if (re.ok) setEntrees(re.entrees ?? []);
    } finally { setCharge(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    if (!sessionId || !nom.trim()) return;
    setBusy("add");
    try {
      await fetch("/api/examens/liste-attente", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, nom, prenom, email, telephone, note }),
      });
      setNom(""); setPrenom(""); setEmail(""); setTelephone(""); setNote("");
      await charger();
    } finally { setBusy(null); }
  }
  async function agir(id: string, action: string) {
    setBusy(id);
    try {
      await fetch("/api/examens/liste-attente", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      await charger();
    } finally { setBusy(null); }
  }

  const labelSession = (s: Session) => `${s.type} — ${s.date_examen ?? "?"} ${s.horaire ?? ""} (${s.restantes}/${s.capacite} places)`;
  const sessionsMap = new Map(sessions.map((s) => [s.id, s]));
  const groupes = new Map<string, Entree[]>();
  for (const e of entrees) { const k = e.session_id; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k)!.push(e); }

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <h1 className="page-title">Liste d'attente</h1>
      <p className="text-sm text-gray-500 mb-5">Quand une session est complète, on garde les candidats en file — à recontacter dès qu'une place se libère.</p>

      <section className="card mb-6">
        <p className="font-medium text-gray-800 mb-3">Ajouter à une liste d'attente</p>
        <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full input mb-3">
          <option value="">Choisir une session…</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{labelSession(s)}</option>)}
        </select>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom *" className="input" />
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="input" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input" />
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" className="input" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="input sm:col-span-2" />
        </div>
        <button onClick={ajouter} disabled={busy === "add" || !sessionId || !nom.trim()}
                className="btn-primary mt-3">
          {busy === "add" ? "Ajout…" : "Ajouter"}
        </button>
      </section>

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : groupes.size === 0 ? (
        <p className="text-gray-500 text-sm">Aucune liste d'attente.</p>
      ) : (
        [...groupes.entries()].map(([sid, items]) => {
          const s = sessionsMap.get(sid);
          return (
            <div key={sid} className="mb-5">
              <p className="text-sm font-semibold text-gray-800 mb-2">{s ? labelSession(s) : "Session"}</p>
              <div className="space-y-1.5">
                {items.map((e, i) => (
                  <div key={e.id} className="card !px-4 !py-2.5 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-400 text-xs">#{i + 1}</span>
                    <span className="font-medium text-gray-900">{e.prenom} {e.nom}</span>
                    {e.telephone && <span className="text-gray-500 text-xs">{e.telephone}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[e.statut] ?? "bg-gray-100 text-gray-600"}`}>{e.statut.replace("_", " ")}</span>
                    {e.note && <span className="text-gray-400 text-xs">· {e.note}</span>}
                    <span className="flex-1" />
                    {e.statut === "en_attente" && <button onClick={() => agir(e.id, "place_proposee")} disabled={busy === e.id} className="text-blue-700 underline text-xs disabled:opacity-50">Place proposée</button>}
                    {e.statut !== "convertie" && <button onClick={() => agir(e.id, "convertie")} disabled={busy === e.id} className="text-green-700 underline text-xs disabled:opacity-50">Convertie</button>}
                    <button onClick={() => agir(e.id, "retirer")} disabled={busy === e.id} className="text-gray-500 underline text-xs disabled:opacity-50">Retirer</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </main>
  );
}
