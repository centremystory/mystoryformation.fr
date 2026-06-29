"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const BLEU = "#2F72DE";

type Stagiaire = {
  id: string; civilite: string | null; nom: string; prenom: string | null;
  email: string | null; telephone: string | null; date_naissance: string | null;
  ville_naissance: string | null; adresse: string | null; cp: string | null; ville: string | null; agence: string | null;
};
type Dossier = {
  id: string; certif: string | null; financement: string | null; montant: number | null;
  montant_encaisse: number | null; reste_a_charge_accepte: boolean | null;
  statut: string | null; statut_tunnel: string | null;
  niveau_initial: string | null; niveau_vise: string | null; niveau_atteint: string | null;
  heures_prevues: number | null; heures_realisees: number | null;
  date_debut: string | null; date_fin: string | null; service_fait_valide: boolean | null;
  numero_edof: string | null;
  participation_forfaitaire_reglee: boolean | null; participation_forfaitaire_exemptee: boolean | null;
  cpf_identite_ok: boolean | null;
};
type Examen = {
  id: string; type_examen: string | null; sous_type: string | null; statut_paiement: string | null;
  montant: number | null; reste_a_payer: number | null; numero_attestation: string | null; date_inscription: string | null;
  session: { date_examen: string | null; horaire: string | null; type: string | null } | null;
  resultat: { statut: string | null; present: boolean | null; niveau_obtenu: string | null } | null;
};
type Evaluation = {
  id: string; phase: string | null; statut: string | null; niveau_vise: string | null; dossier_id: string | null;
  ce_sur10: number | null; co_sur10: number | null; ee_sur10: number | null; eo_sur10: number | null;
  total_sur20: number | null; niveau_global: string | null; complete_le: string | null;
};
type Facture = {
  numero: string | null; montant: number | null; statut: string | null;
  date_emission: string | null; type: string | null; designation: string | null;
};
type Remarque = { id: string; texte: string | null; auteur: string | null; horodatage: string | null };
type Fiche = { stagiaire: Stagiaire; dossiers: Dossier[]; examens: Examen[]; remarques: Remarque[]; evaluations: Evaluation[]; factures: Facture[]; seancesAccueil?: { total: number; presents: number } };

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}
function euro(n: number | null): string {
  return n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} €`;
}

const LIBELLE_PHASE: Record<string, string> = { initial: "Test initial", final: "Test final" };
const STATUT_EVAL: Record<string, { label: string; cls: string }> = {
  en_cours: { label: "En cours", cls: "bg-gray-100 text-gray-600" },
  en_attente_formateur: { label: "Écrit/oral à noter", cls: "bg-amber-50 text-amber-700" },
  complet: { label: "Corrigé", cls: "bg-emerald-50 text-emerald-700" },
  annule: { label: "Annulé", cls: "bg-gray-100 text-gray-400" },
};

function PdfEvalButton({ dossierId, phase }: { dossierId: string; phase: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ouvrir() {
    if (url) { window.open(url, "_blank", "noreferrer"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/documents/evaluation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId, phase: phase === "final" ? "final" : "initial" }),
      });
      const j = await r.json();
      if (!j.ok || !j.pdfUrl) { setErr(j.erreur || "Génération impossible."); return; }
      setUrl(j.pdfUrl);
      window.open(j.pdfUrl, "_blank", "noreferrer");
    } catch (e: any) { setErr(e?.message || "Erreur réseau."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <button onClick={ouvrir} disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:border-gray-400 disabled:opacity-50">
        {busy ? "Génération…" : url ? "Voir le PDF" : "📄 Générer / ouvrir le PDF"}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

export default function PageFiche() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!id) return;
    setChargement(true);
    fetch(`/api/fiche/${id}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setFiche(j); else setErreur(j.erreur ?? "Erreur"); })
      .catch(() => setErreur("Chargement impossible."))
      .finally(() => setChargement(false));
  }, [id]);

  if (chargement) return <div className="p-6 text-gray-500">Chargement de la fiche…</div>;
  if (erreur || !fiche) return <div className="p-6 text-rose-600">{erreur ?? "Fiche introuvable."}</div>;

  const s = fiche.stagiaire;
  const nomComplet = `${s.prenom ?? ""} ${s.nom}`.trim();
  const rechercheDossiers = `/dossiers?q=${encodeURIComponent(nomComplet)}`;

  const totalFormation = fiche.dossiers.reduce((acc, d) => acc + (Number(d.montant) || 0), 0);
  const encaisse = fiche.dossiers.reduce((acc, d) => acc + (Number(d.montant_encaisse) || 0), 0);
  const totalExamens = fiche.examens.reduce((acc, e) => acc + (Number(e.montant) || 0), 0);
  const resteExamens = fiche.examens.reduce((acc, e) => acc + (Number(e.reste_a_payer) || 0), 0);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* En-tête */}
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Fiche client</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            {s.civilite ? `${s.civilite} ` : ""}{nomComplet}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            {s.email && <span>✉️ {s.email}</span>}
            {s.telephone && <span>📞 {s.telephone}</span>}
            {s.agence && <span className="badge" style={{ background: "#EAF1FC", color: BLEU }}>{s.agence}</span>}
            {(fiche.seancesAccueil?.total ?? 0) > 0 && (
              <span className="badge bg-amber-50 text-amber-700" title="Séances d'accueil hors financement (suivi interne, hors CPF)">
                {fiche.seancesAccueil!.presents} séance{fiche.seancesAccueil!.presents > 1 ? "s" : ""} d&apos;accueil (hors financement)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Identité */}
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Identité</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Info label="Naissance" valeur={`${dateFr(s.date_naissance)}${s.ville_naissance ? " · " + s.ville_naissance : ""}`} />
          <Info label="Adresse" valeur={[s.adresse, [s.cp, s.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"} />
          <Info label="Agence d'inscription" valeur={s.agence ?? "—"} />
        </dl>
      </section>

      {/* Formation */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Formation ({fiche.dossiers.length})</h2>
          <Link href={rechercheDossiers} className="text-sm hover:underline" style={{ color: BLEU }}>Ouvrir dans Dossiers ↗</Link>
        </div>
        {fiche.dossiers.length === 0 ? (
          <div className="empty-state text-sm text-gray-400">Aucun dossier de formation.</div>
        ) : (
          fiche.dossiers.map((d) => (
            <div key={d.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-gray-900">{d.certif ?? "Formation"} <span className="text-gray-400">· {d.financement ?? "—"}</span></div>
                <span className="badge bg-gray-100 text-gray-600">{d.statut ?? d.statut_tunnel ?? "—"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                <Info label="Niveaux" valeur={`${d.niveau_initial ?? "?"} → ${d.niveau_vise ?? "?"}${d.niveau_atteint ? " (atteint " + d.niveau_atteint + ")" : ""}`} />
                <Info label="Heures" valeur={`${d.heures_realisees ?? 0} / ${d.heures_prevues ?? "—"} h`} />
                <Info label="Période" valeur={`${dateFr(d.date_debut)} → ${dateFr(d.date_fin)}`} />
                <Info label="Montant" valeur={euro(d.montant)} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {d.service_fait_valide ? <span className="badge bg-emerald-50 text-emerald-700">Service fait validé</span> : <span className="badge bg-amber-50 text-amber-700">Service fait à valider</span>}
                {!d.participation_forfaitaire_reglee && !d.participation_forfaitaire_exemptee && <span className="badge bg-amber-50 text-amber-700">Participation forfaitaire due</span>}
                {!d.cpf_identite_ok && <span className="badge bg-amber-50 text-amber-700">Identité CPF non confirmée</span>}
                {d.numero_edof && <span className="badge bg-gray-100 text-gray-500">EDOF {d.numero_edof}</span>}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Tests de niveau (test initial / final) */}
      {fiche.evaluations.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Tests de niveau ({fiche.evaluations.length})</h2>
            <Link href="/suivi-eleves" className="text-sm hover:underline" style={{ color: BLEU }}>Ouvrir dans Suivi élèves ↗</Link>
          </div>
          {fiche.evaluations.map((ev) => {
            const st = STATUT_EVAL[ev.statut ?? ""] ?? { label: ev.statut ?? "—", cls: "bg-gray-100 text-gray-600" };
            return (
              <div key={ev.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-gray-900">
                    {LIBELLE_PHASE[ev.phase ?? ""] ?? "Test"}
                    {ev.complete_le && <span className="text-gray-400"> · {dateFr(ev.complete_le)}</span>}
                    {ev.niveau_vise && <span className="text-gray-400"> · visé {ev.niveau_vise}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {ev.niveau_global && <span className="badge" style={{ background: "#EAF1FC", color: BLEU }}>Niveau estimé {ev.niveau_global}</span>}
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-2 text-sm">
                  <Info label="CE · compréhension écrite" valeur={ev.ce_sur10 == null ? "—" : `${ev.ce_sur10}/10`} />
                  <Info label="CO · compréhension orale" valeur={ev.co_sur10 == null ? "—" : `${ev.co_sur10}/10`} />
                  <Info label="EE · expression écrite" valeur={ev.ee_sur10 == null ? "—" : `${ev.ee_sur10}/10`} />
                  <Info label="EO · expression orale" valeur={ev.eo_sur10 == null ? "—" : `${ev.eo_sur10}/10`} />
                  <Info label="Total" valeur={ev.total_sur20 == null ? "—" : `${ev.total_sur20}/20`} />
                </div>
                {ev.statut === "complet" && ev.dossier_id && (
                  <PdfEvalButton dossierId={ev.dossier_id} phase={ev.phase ?? "initial"} />
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Examens */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Examens ({fiche.examens.length})</h2>
          <Link href="/examens/candidats" className="text-sm hover:underline" style={{ color: BLEU }}>Ouvrir dans Candidats ↗</Link>
        </div>
        {fiche.examens.length === 0 ? (
          <div className="empty-state text-sm text-gray-400">Aucune inscription d'examen.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="table w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Mention</th>
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Paiement</th>
                  <th className="px-3 py-2">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {fiche.examens.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{e.type_examen ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{e.sous_type ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{dateFr(e.session?.date_examen ?? null)}{e.session?.horaire ? " · " + e.session.horaire : ""}</td>
                    <td className="px-3 py-2 text-gray-600">{e.statut_paiement ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {e.resultat ? `${e.resultat.statut ?? "—"}${e.resultat.niveau_obtenu ? " · " + e.resultat.niveau_obtenu : ""}` : <span className="text-gray-400">en attente</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Facturation (synthèse) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Facturation</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Formation" valeur={euro(totalFormation)} />
          <Stat label="Encaissé" valeur={euro(encaisse)} />
          <Stat label="Examens" valeur={euro(totalExamens)} />
          <Stat label="Reste examens" valeur={euro(resteExamens)} accent={resteExamens > 0} />
        </div>
        {fiche.factures.length > 0 && (
          <div className="card overflow-hidden">
            <table className="table w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">Désignation</th>
                  <th className="px-3 py-2">Montant</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Émise</th>
                </tr>
              </thead>
              <tbody>
                {fiche.factures.map((f, i) => (
                  <tr key={(f.numero ?? "") + i} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{f.numero ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600">{f.designation ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-700">{euro(f.montant)}</td>
                    <td className="px-3 py-2">
                      {(f.statut ?? "").toLowerCase().includes("pay")
                        ? <span className="badge bg-emerald-50 text-emerald-700">{f.statut}</span>
                        : <span className="badge bg-amber-50 text-amber-700">{f.statut ?? "—"}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{dateFr(f.date_emission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400">
          Synthèse. Le détail et les actions (émettre, encaisser) restent dans{" "}
          <Link href="/factures" className="hover:underline" style={{ color: BLEU }}>Factures</Link>.
        </p>
      </section>

      {/* Remarques */}
      {fiche.remarques.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Remarques</h2>
          {fiche.remarques.map((r) => (
            <div key={r.id} className="card p-3 text-sm">
              <p className="text-gray-800 whitespace-pre-wrap">{r.texte}</p>
              <p className="mt-1 text-xs text-gray-400">{r.auteur ?? "équipe"} · {dateFr(r.horodatage)}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Info({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800">{valeur}</dd>
    </div>
  );
}

function Stat({ label, valeur, accent }: { label: string; valeur: string; accent?: boolean }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent ? "text-amber-700" : "text-gray-900"}`}>{valeur}</p>
    </div>
  );
}
