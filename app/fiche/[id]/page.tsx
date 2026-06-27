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
  montant: number | null; numero_attestation: string | null; date_inscription: string | null;
  session: { date_examen: string | null; horaire: string | null; type: string | null } | null;
  resultat: { statut: string | null; present: boolean | null; niveau_obtenu: string | null } | null;
};
type Remarque = { id: string; texte: string | null; auteur: string | null; horodatage: string | null };
type Fiche = { stagiaire: Stagiaire; dossiers: Dossier[]; examens: Examen[]; remarques: Remarque[] };

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}
function euro(n: number | null): string {
  return n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} €`;
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
