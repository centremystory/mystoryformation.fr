"use client";
// app/examens/remboursements/page.tsx — Reports / Remboursements / Avoirs (CDC §3.3).
import { useCallback, useEffect, useState } from "react";

type R = {
  id: string; type: string; montant: number; motif: string; statut: string;
  override_7j: boolean; avoir_numero: string | null; avoir_url: string | null;
  created_by: string | null; cree_le: string; decided_by: string | null;
  ventes_examen?: any;
};

const TYPE_LABEL: Record<string, string> = {
  report: "Report", remboursement_total: "Remb. total", remboursement_partiel: "Remb. partiel", avoir: "Avoir",
};
const STATUT_BADGE: Record<string, string> = {
  demande: "bg-amber-100 text-amber-800", valide: "bg-blue-100 text-blue-700",
  effectue: "bg-green-100 text-green-700", refuse: "bg-gray-100 text-gray-500",
};

export default function PageRemboursements() {
  const [liste, setListe] = useState<R[]>([]);
  const [fStatut, setFStatut] = useState("");
  const [fType, setFType] = useState("");
  const [charge, setCharge] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // formulaire
  const [numero, setNumero] = useState("");
  const [type, setType] = useState("remboursement_total");
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [override, setOverride] = useState(false);

  const charger = useCallback(async () => {
    setCharge(true);
    const p = new URLSearchParams();
    if (fStatut) p.set("statut", fStatut);
    if (fType) p.set("type", fType);
    try {
      const r = await fetch(`/api/examens/remboursements?${p}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setListe(j.remboursements);
    } finally { setCharge(false); }
  }, [fStatut, fType]);
  useEffect(() => { charger(); }, [charger]);

  async function creer() {
    setBusy("creer"); setMsg(null);
    try {
      const r = await fetch("/api/examens/remboursements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroAttestation: numero.trim(), type, montant: montant ? Number(montant) : undefined, motif, override }),
      });
      const j = await r.json();
      if (!j.ok) {
        setMsg(j.erreur || "Erreur.");
        if (j.besoinOverride) setOverride(true);
        return;
      }
      setNumero(""); setMontant(""); setMotif(""); setOverride(false); setMsg("Demande créée ✅");
      await charger();
    } finally { setBusy(null); }
  }

  async function agir(id: string, action: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/examens/remboursements", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (!j.ok) setMsg(j.erreur || "Erreur.");
      await charger();
    } finally { setBusy(null); }
  }

  const besoinMontant = type === "remboursement_partiel" || type === "avoir";

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Reports & remboursements</h1>
      <p className="text-sm text-gray-500 mb-5">Report, remboursement (total/partiel) et avoir — avec garde-fou des 7 jours.</p>

      {/* Création */}
      <section className="card mb-6">
        <p className="font-medium text-gray-800 mb-3">Nouvelle demande</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="N° d'attestation (MYS-…)" className="input" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="input">
            <option value="remboursement_total">Remboursement total</option>
            <option value="remboursement_partiel">Remboursement partiel</option>
            <option value="avoir">Avoir</option>
            <option value="report">Report</option>
          </select>
          {besoinMontant && <input value={montant} onChange={(e) => setMontant(e.target.value)} type="number" step="0.01" placeholder="Montant €" className="input" />}
          <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (obligatoire)" className="input sm:col-span-2" />
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          Dérogation à la règle des 7 jours (journalisée)
        </label>
        <button onClick={creer} disabled={busy === "creer" || !numero.trim() || !motif.trim()}
                className="btn-primary mt-3">
          {busy === "creer" ? "Création…" : "Créer la demande"}
        </button>
        {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
      </section>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select value={fStatut} onChange={(e) => setFStatut(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Tous statuts</option>
          <option value="demande">Demande</option><option value="valide">Validé</option>
          <option value="effectue">Effectué</option><option value="refuse">Refusé</option>
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : liste.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucune demande.</p>
      ) : (
        <div className="space-y-2">
          {liste.map((r) => {
            const v = r.ventes_examen;
            const cand = v?.stagiaires ? `${v.stagiaires.prenom ?? ""} ${v.stagiaires.nom ?? ""}`.trim() : "—";
            return (
              <div key={r.id} className="card">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{cand}</span>
                  <span className="text-xs text-gray-400">{v?.numero_attestation}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{TYPE_LABEL[r.type] ?? r.type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUT_BADGE[r.statut]}`}>{r.statut}</span>
                  {r.montant > 0 && <span className="text-gray-700">{Number(r.montant).toFixed(2)} €</span>}
                  {r.override_7j && <span className="text-xs text-red-600">⚠ dérogation 7j</span>}
                  <span className="flex-1" />
                  <span className="text-xs text-gray-400">{new Date(r.cree_le).toLocaleDateString("fr-FR")}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{r.motif}</p>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                  {r.statut === "demande" && (
                    <>
                      <button onClick={() => agir(r.id, "valider")} disabled={busy === r.id} className="text-blue-700 underline disabled:opacity-50">Valider</button>
                      <button onClick={() => agir(r.id, "refuser")} disabled={busy === r.id} className="text-gray-500 underline disabled:opacity-50">Refuser</button>
                    </>
                  )}
                  {r.statut === "valide" && (
                    <button onClick={() => agir(r.id, "effectuer")} disabled={busy === r.id} className="text-green-700 underline disabled:opacity-50">Effectuer</button>
                  )}
                  {r.avoir_url && <a href={r.avoir_url} target="_blank" rel="noreferrer" className="text-mystory underline">📄 Avoir {r.avoir_numero}</a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
