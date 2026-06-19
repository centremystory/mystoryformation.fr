"use client";
// app/validations/page.tsx — Validation Direction (point 26).
// La Direction approuve/refuse les actions sensibles lancées par un non-Direction
// (remise hors CPF, sous-traitance, facture hors CPF). L'action n'est exécutée qu'à l'approbation.
import { useCallback, useEffect, useState } from "react";

type Demande = {
  id: string; type: string; libelle: string; statut: string;
  demande_par: string | null; demande_le: string;
  decide_par: string | null; decide_le: string | null; commentaire: string | null;
  applique: boolean; resultat: any;
};

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  remise_hors_cpf: { label: "Remise hors CPF", cls: "bg-purple-100 text-purple-800" },
  sous_traitance: { label: "Sous-traitance", cls: "bg-sky-100 text-sky-800" },
  facture_hors_cpf: { label: "Facture hors CPF", cls: "bg-emerald-100 text-emerald-800" },
};
const STATUT: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "bg-amber-100 text-amber-800" },
  approuve: { label: "Approuvée", cls: "bg-green-100 text-green-800" },
  refuse: { label: "Refusée", cls: "bg-red-100 text-red-800" },
};
const FILTRES = [
  { v: "en_attente", label: "En attente" },
  { v: "approuve", label: "Approuvées" },
  { v: "refuse", label: "Refusées" },
  { v: "", label: "Toutes" },
];

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function resumeResultat(r: any): string | null {
  if (!r) return null;
  if (r.numero) return `Facture ${r.numero}${r.email?.envoye ? " · envoyée" : ""}`;
  if (r.remise) return `Remise ${Number(r.remise).toLocaleString("fr-FR")} € appliquée`;
  if (r.id) return "Ligne enregistrée";
  return null;
}

function Carte({ d, peutValider, onAction, busy }:
  { d: Demande; peutValider: boolean; onAction: (id: string, action: "approuver" | "refuser", commentaire?: string) => void; busy: boolean }) {
  const t = TYPE_LABEL[d.type] ?? { label: d.type, cls: "bg-gray-100 text-gray-600" };
  const st = STATUT[d.statut] ?? { label: d.statut, cls: "bg-gray-100 text-gray-600" };
  const [com, setCom] = useState("");
  const res = resumeResultat(d.resultat);
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
        <span className="flex-1" />
        <span className="text-xs text-gray-400">{dateFr(d.demande_le)}</span>
      </div>
      <p className="text-sm text-gray-800 font-medium">{d.libelle}</p>
      {peutValider && d.demande_par && <p className="text-xs text-gray-500 mt-0.5">Demandé par {d.demande_par}</p>}
      {res && <p className="text-xs text-green-700 mt-1">✓ {res}</p>}
      {d.decide_par && (
        <p className="text-xs text-gray-400 mt-1">
          Décision : {d.decide_par}{d.decide_le ? ` · ${dateFr(d.decide_le)}` : ""}{d.commentaire ? ` — ${d.commentaire}` : ""}
        </p>
      )}
      {peutValider && d.statut === "en_attente" && (
        <div className="mt-3 space-y-2">
          <input value={com} onChange={(e) => setCom(e.target.value)} placeholder="Commentaire (facultatif)"
                 className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-full bg-white" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => onAction(d.id, "approuver", com)}
                    className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs disabled:opacity-50">
              Approuver
            </button>
            <button disabled={busy} onClick={() => onAction(d.id, "refuser", com)}
                    className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs disabled:opacity-50">
              Refuser
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ValidationsPage() {
  const [statut, setStatut] = useState("en_attente");
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [peutValider, setPeutValider] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true); setErreur(null);
    try {
      const r = await fetch(`/api/validations?statut=${encodeURIComponent(statut)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur ?? "Erreur de chargement.");
      setDemandes(j.demandes ?? []);
      setPeutValider(!!j.peutValider);
    } catch (e: any) { setErreur(e?.message ?? String(e)); }
    finally { setChargement(false); }
  }, [statut]);

  useEffect(() => { charger(); }, [charger]);

  async function onAction(id: string, action: "approuver" | "refuser", commentaire?: string) {
    setBusy(true); setErreur(null);
    try {
      const r = await fetch("/api/validations", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, commentaire }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur ?? "Action impossible.");
      await charger();
    } catch (e: any) { setErreur(e?.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <h1 className="text-xl font-semibold text-gray-900">Validations Direction</h1>
      <p className="text-sm text-gray-500 mt-1">
        {peutValider
          ? "Approuvez ou refusez les actions sensibles. L'action n'est exécutée qu'à l'approbation."
          : "Vos demandes en attente d'approbation par la Direction."}
      </p>

      <div className="flex flex-wrap gap-2 mt-4">
        {FILTRES.map((f) => (
          <button key={f.v || "tous"} onClick={() => setStatut(f.v)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${statut === f.v ? "bg-mystory text-white border-mystory" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {erreur && <p className="mt-4 text-sm text-red-600">{erreur}</p>}

      <div className="mt-4 space-y-3">
        {chargement ? (
          <p className="text-sm text-gray-400">Chargement…</p>
        ) : demandes.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune demande.</p>
        ) : (
          demandes.map((d) => <Carte key={d.id} d={d} peutValider={peutValider} onAction={onAction} busy={busy} />)
        )}
      </div>
    </main>
  );
}
