"use client";
// app/examens/sessions/[id]/page.tsx
// Détail d'une session : candidats inscrits + report / remboursement depuis chaque candidat.
// Réutilise /api/examens/remboursements (garde-fou 7 jours, override Direction).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Candidat = {
  vente_id: string;
  civilite: string; nom: string; prenom: string; telephone: string; email: string;
  type_examen: string; sous_type: string | null;
  statut_paiement: string; montant: number | null; reste_a_payer: number | null;
  numero_attestation: string | null; numero_vente: string | null;
  convocation_envoyee_le: string | null; vendu_par: string | null;
  statut_examen?: { libelle?: string } | string | null;
};
type SessionInfo = { id: string; type: string; date_examen: string; horaire: string; capacite: number; note: string | null };

const TYPE_LABEL: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Examen civique", Vente_plateforme: "Vente plateforme" };

function dateFR(iso: string): string {
  if (!iso) return "—";
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function badgePaiement(s: string): string {
  if (s === "Payé") return "badge-success";
  if (s === "Acompte") return "badge-warning";
  if (s === "Remboursé" || s === "Annulé") return "badge-neutral";
  return "badge-neutral";
}

export default function SessionDetail() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id as string;

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // action report/remboursement
  const [actionVente, setActionVente] = useState<string | null>(null);
  const [type, setType] = useState("report");
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!sessionId) return;
    setChargement(true); setErreur(null);
    try {
      const r = await fetch(`/api/examens/sessions/candidats?session=${sessionId}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Chargement impossible."); return; }
      setSession(j.session); setCandidats(j.candidats);
    } catch { setErreur("Chargement impossible."); }
    finally { setChargement(false); }
  }, [sessionId]);

  useEffect(() => { charger(); }, [charger]);

  function ouvrir(venteId: string) {
    setActionVente(venteId); setType("report"); setMontant(""); setMotif(""); setOverride(false); setMsg(null);
  }

  async function envoyer(venteId: string) {
    if (!motif.trim()) { setMsg("Le motif est obligatoire."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/examens/remboursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venteId, type, montant: montant ? Number(montant) : undefined, motif: motif.trim(), override }),
      });
      const j = await r.json();
      if (!j.ok) { setMsg(j.erreur || "Action impossible."); return; }
      setMsg("✓ Demande enregistrée.");
      setActionVente(null);
      await charger();
    } catch { setMsg("Action impossible."); }
    finally { setBusy(false); }
  }

  const besoinMontant = type === "remboursement_partiel" || type === "avoir";

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/examens/sessions" className="text-sm text-mystory underline">← Sessions</Link>

      <div className="page-header mt-2">
        <h1 className="page-title">
          {session ? `${TYPE_LABEL[session.type] ?? session.type}` : "Session"}
        </h1>
        <p className="page-subtitle">
          {session ? <>{dateFR(session.date_examen)} · {session.horaire} · Gagny</> : "Candidats inscrits"}
          {session?.note ? <> · 📌 {session.note}</> : null}
        </p>
      </div>

      {erreur && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{erreur}</div>}

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : candidats.length === 0 ? (
        <div className="empty-state">Aucun candidat inscrit sur cette session.</div>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-600">{candidats.length} candidat(s) inscrit(s)</p>
          <div className="space-y-3">
            {candidats.map((c) => (
              <div key={c.vente_id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {c.civilite} {c.nom} {c.prenom}
                    </p>
                    <p className="text-sm text-gray-600">
                      {TYPE_LABEL[c.type_examen] ?? c.type_examen}{c.sous_type ? ` · ${c.sous_type}` : ""}
                      {c.telephone ? <> · 📞 {c.telephone}</> : null}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {c.numero_attestation || c.numero_vente || "—"}
                      {c.montant != null ? ` · ${c.montant} €` : ""}
                      {c.reste_a_payer != null && c.reste_a_payer > 0 ? ` · reste ${c.reste_a_payer} €` : ""}
                      {c.convocation_envoyee_le ? " · convoqué" : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`badge ${badgePaiement(c.statut_paiement)}`}>{c.statut_paiement}</span>
                    {actionVente !== c.vente_id && c.statut_paiement !== "Remboursé" && c.statut_paiement !== "Annulé" && (
                      <button onClick={() => ouvrir(c.vente_id)} className="btn-ghost text-sm">Reporter / Rembourser</button>
                    )}
                  </div>
                </div>

                {actionVente === c.vente_id && (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm">Action
                        <select value={type} onChange={(e) => setType(e.target.value)} className="input mt-1">
                          <option value="report">Report (changer de session)</option>
                          <option value="remboursement_total">Remboursement total</option>
                          <option value="remboursement_partiel">Remboursement partiel</option>
                          <option value="avoir">Avoir</option>
                        </select>
                      </label>
                      {besoinMontant && (
                        <label className="text-sm">Montant (€)
                          <input type="number" step="0.01" min={0} value={montant} onChange={(e) => setMontant(e.target.value)} className="input mt-1" />
                        </label>
                      )}
                      <label className="text-sm sm:col-span-2">Motif *
                        <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Raison (obligatoire)" className="input mt-1" />
                      </label>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                      Forcer malgré le délai de 7 jours (Direction)
                    </label>
                    {type === "report" && (
                      <p className="mt-2 text-xs text-gray-500">
                        Le report est enregistré ici. Le changement effectif de date se fait ensuite dans{" "}
                        <Link href="/examens/corrections" className="underline text-mystory">Corrections</Link> (régénère la convocation).
                      </p>
                    )}
                    {msg && <p className={`mt-2 text-sm ${msg.startsWith("✓") ? "text-success-700" : "text-danger-700"}`}>{msg}</p>}
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => envoyer(c.vente_id)} disabled={busy || !motif.trim()} className="btn-primary text-sm disabled:opacity-50">
                        {busy ? "Envoi…" : "Valider la demande"}
                      </button>
                      <button onClick={() => { setActionVente(null); setMsg(null); }} className="btn-ghost text-sm">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Le suivi des reports/remboursements se consulte dans{" "}
            <Link href="/examens/remboursements" className="underline text-mystory">Remboursements</Link>.
          </p>
        </>
      )}
    </main>
  );
}
