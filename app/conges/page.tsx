"use client";
// app/conges/page.tsx — Demandes de congés (RH). L'employé demande, la Direction valide.
import { useCallback, useEffect, useState } from "react";

type Demande = {
  id: string; utilisateur_id: string; type: string; date_debut: string; date_fin: string; motif: string | null;
  statut: string; decide_par: string | null; decide_le: string | null; commentaire_decision: string | null; remplace_par: string | null; cree_le: string;
  utilisateurs?: { nom: string | null; prenom: string | null; email: string | null } | null;
};

const TYPES = [
  { v: "conges_payes", label: "Congés payés" }, { v: "sans_solde", label: "Sans solde" },
  { v: "maladie", label: "Maladie" }, { v: "rtt", label: "RTT" }, { v: "autre", label: "Autre" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.v, t.label]));
const STATUT: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "bg-amber-100 text-amber-800" },
  approuve: { label: "Approuvé", cls: "bg-green-100 text-green-800" },
  refuse: { label: "Refusé", cls: "bg-red-100 text-red-800" },
  annule: { label: "Annulé", cls: "bg-gray-100 text-gray-500" },
};

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso.length > 10 ? iso : iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function nomDemandeur(d: Demande): string {
  const u = d.utilisateurs;
  if (!u) return "—";
  return [u.prenom, u.nom].filter(Boolean).join(" ") || u.email || "—";
}

function Carte({ d, peutValider, onAction }: { d: Demande; peutValider: boolean; onAction: (id: string, action: string, extra?: Record<string, unknown>) => void }) {
  const st = STATUT[d.statut] ?? { label: d.statut, cls: "bg-gray-100 text-gray-600" };
  const [remplacant, setRemplacant] = useState(d.remplace_par ?? "");
  const editable = peutValider && (d.statut === "en_attente" || d.statut === "approuve");
  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{TYPE_LABEL[d.type] ?? d.type}</span>
        {peutValider && <span className="text-xs text-gray-500">{nomDemandeur(d)}</span>}
        <span className="flex-1" />
        <span className="text-xs text-gray-400">{dateFr(d.date_debut)} → {dateFr(d.date_fin)}</span>
      </div>
      {d.motif && <p className="text-sm text-gray-700 mt-1">{d.motif}</p>}
      {d.remplace_par && <p className="text-xs text-gray-600 mt-1">🔁 Remplacé·e par : <span className="font-medium">{d.remplace_par}</span></p>}
      {d.decide_par && <p className="text-xs text-gray-400 mt-1">Décision : {d.decide_par}{d.decide_le ? ` · ${dateFr(d.decide_le)}` : ""}{d.commentaire_decision ? ` — ${d.commentaire_decision}` : ""}</p>}

      {editable && (
        <div className="flex items-center gap-2 mt-2">
          <input
            value={remplacant}
            onChange={(e) => setRemplacant(e.target.value)}
            placeholder="Remplacé·e par (nom)"
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 bg-white"
          />
          {d.statut === "approuve" && (
            <button onClick={() => onAction(d.id, "remplacant", { remplacePar: remplacant })}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs whitespace-nowrap">
              Enregistrer le remplaçant
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        {peutValider && d.statut === "en_attente" && (
          <>
            <button onClick={() => onAction(d.id, "approuver", { remplacePar: remplacant })} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold">Approuver</button>
            <button onClick={() => onAction(d.id, "refuser")} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold">Refuser</button>
          </>
        )}
        {["en_attente", "approuve"].includes(d.statut) && (
          <button onClick={() => onAction(d.id, "annuler")} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs">Annuler</button>
        )}
      </div>
    </div>
  );
}

export default function PageConges() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [peutValider, setPeutValider] = useState(false);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // formulaire
  const [type, setType] = useState("conges_payes");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [motif, setMotif] = useState("");

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const r = await fetch("/api/conges", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setDemandes(j.demandes); setPeutValider(j.peutValider);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function demander() {
    if (!dateDebut || !dateFin) { setErr("Indique les dates de début et de fin."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/conges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, dateDebut, dateFin, motif }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Demande impossible."); return; }
      setDateDebut(""); setDateFin(""); setMotif("");
      await charger();
    } catch (e: any) { setErr(e?.message || "Demande impossible."); }
    finally { setBusy(false); }
  }

  async function action(id: string, act: string, extra?: Record<string, unknown>) {
    try {
      const r = await fetch("/api/conges", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: act, ...(extra ?? {}) }) });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Action impossible."); return; }
      await charger();
    } catch (e: any) { setErr(e?.message || "Action impossible."); }
  }

  const enAttente = demandes.filter((d) => d.statut === "en_attente");
  const autres = peutValider ? demandes : demandes; // employé : tout est « mes demandes »

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Congés</h1>
          <p className="text-sm text-gray-500 mt-0.5">{peutValider ? "Demandes de l'équipe — à valider." : "Dépose et suis tes demandes de congés."}</p>
        </div>
      </header>

      {/* Demande */}
      <section className="border border-gray-200 rounded-xl bg-white p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Nouvelle demande</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <label className="text-sm text-gray-600 flex items-center gap-2">Du <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1" /></label>
          <label className="text-sm text-gray-600 flex items-center gap-2">Au <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1" /></label>
        </div>
        <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (optionnel)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2" />
        <button onClick={demander} disabled={busy} className="mt-3 px-4 py-2 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
          {busy ? "Envoi…" : "Demander"}
        </button>
      </section>

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : (
        <>
          {peutValider && enAttente.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">À valider ({enAttente.length})</h2>
              <div className="space-y-2">{enAttente.map((d) => <Carte key={d.id} d={d} peutValider={peutValider} onAction={action} />)}</div>
            </section>
          )}
          <section>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">{peutValider ? "Toutes les demandes" : "Mes demandes"}</h2>
            {autres.length === 0 ? <p className="text-gray-500 text-sm">Aucune demande pour l'instant.</p> : (
              <div className="space-y-2">{autres.map((d) => <Carte key={d.id} d={d} peutValider={peutValider} onAction={action} />)}</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
