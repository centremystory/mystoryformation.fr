"use client";
// app/dossiers/page.tsx — Suivi des dossiers (équipe)
// Tous les dossiers en un tableau : badge complet/incomplet, avancement des pièces,
// détail des pièces à traiter d'un clic, recherche par nom, lien vers la page suivi stagiaire.
// Même catalogue de pièces et de statuts que la page /suivi (brique 2C) — un seul langage de conformité.
import { useEffect, useMemo, useState } from "react";

const LIBELLE_PIECE: Record<string, string> = {
  fiche_analyse_besoin: "Fiche d'analyse du besoin",
  evaluation_initiale: "Évaluation initiale",
  convention: "Convention (+ annexes)",
  programme: "Programme (annexe 1)",
  reglement_interieur: "Règlement intérieur (annexe 2)",
  planning: "Planning (annexe 3)",
  convocation: "Convocation",
  feuille_emargement: "Feuille d'émargement",
  evaluation_finale: "Évaluation finale",
  satisfaction_chaud: "Satisfaction à chaud",
  attestation_fin: "Attestation de fin",
  certificat_realisation: "Certificat de réalisation",
  satisfaction_froid: "Satisfaction à froid (3 mois)",
  justificatif_participation: "Justificatif participation forfaitaire",
};

const STATUT_PIECE: Record<string, { label: string; classes: string }> = {
  manquant: { label: "À faire", classes: "bg-gray-100 text-gray-600" },
  genere: { label: "Généré", classes: "bg-blue-50 text-blue-800" },
  envoye_a_signer: { label: "Envoyé à signer", classes: "bg-amber-50 text-amber-800" },
  signature_en_cours: { label: "Signature en cours", classes: "bg-amber-50 text-amber-800" },
  signee: { label: "Signé", classes: "bg-green-50 text-green-800" },
  erreur_envoi: { label: "Erreur d'envoi", classes: "bg-red-50 text-red-800" },
};

const LIBELLE_CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

type Piece = { type: string; statut: string; optionnelle: boolean; exige_signature: boolean; ordre: number };
type Dossier = {
  id: string;
  certif: string;
  financement: string;
  statut: string;
  date_debut: string | null;
  date_fin: string | null;
  token: string;
  heures_prevues: number | null;
  service_fait_valide: boolean;
  stagiaires: { nom: string; prenom: string | null } | null;
  formatrices: { nom: string; prenom: string | null } | null;
  pieces: Piece[];
};

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

/** Une pièce obligatoire compte « faite » : signée, ou générée si aucune signature n'est exigée. */
function pieceFaite(p: Piece): boolean {
  return p.statut === "signee" || (p.statut === "genere" && !p.exige_signature);
}

export default function PageDossiers() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "incomplet" | "complet">("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dossiers", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
        setDossiers(j.dossiers);
      })
      .catch((e) => setErreur(e?.message || "Erreur de chargement."))
      .finally(() => setChargement(false));
  }, []);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (filtre !== "tous" && d.statut !== filtre) return false;
      if (!q) return true;
      const nom = `${d.stagiaires?.prenom ?? ""} ${d.stagiaires?.nom ?? ""}`.toLowerCase();
      return nom.includes(q);
    });
  }, [dossiers, recherche, filtre]);

  const nbIncomplets = dossiers.filter((d) => d.statut === "incomplet").length;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suivi des dossiers</h1>
        <p className="text-sm text-gray-500 mt-1">
          L'état de conformité de chaque dossier, en temps réel — clique sur une ligne pour voir les pièces à traiter.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un stagiaire…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 bg-white"
        />
        <div className="flex gap-1.5">
          {([
            ["tous", `Tous (${dossiers.length})`],
            ["incomplet", `Incomplets (${nbIncomplets})`],
            ["complet", `Complets (${dossiers.length - nbIncomplets})`],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFiltre(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                filtre === v
                  ? "bg-mystory text-white border-mystory"
                  : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{erreur}</div>
      )}

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : visibles.length === 0 ? (
        <p className="text-gray-500">
          {dossiers.length === 0 ? "Aucun dossier pour l'instant." : "Aucun dossier ne correspond à cette recherche."}
        </p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Stagiaire</th>
                <th className="px-4 py-3 font-medium">Formation</th>
                <th className="px-4 py-3 font-medium">Formatrice</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Pièces</th>
                <th className="px-4 py-3 font-medium">Dossier</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((d) => {
                const obligatoires = (d.pieces ?? []).filter((p) => !p.optionnelle);
                const faites = obligatoires.filter(pieceFaite).length;
                const aTraiter = (d.pieces ?? [])
                  .filter((p) => !pieceFaite(p))
                  .sort((a, b) => a.ordre - b.ordre);
                const estOuvert = ouvert === d.id;
                const pct = obligatoires.length ? Math.round((faites / obligatoires.length) * 100) : 0;
                return (
                  <FragmentLigne
                    key={d.id}
                    d={d}
                    faites={faites}
                    total={obligatoires.length}
                    pct={pct}
                    aTraiter={aTraiter}
                    estOuvert={estOuvert}
                    onToggle={() => setOuvert(estOuvert ? null : d.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Une pièce compte « faite » quand elle est générée — ou signée si une signature est exigée (convention,
        émargement…). Le badge du dossier est celui calculé par le moteur de conformité.
      </p>
    </main>
  );
}

function FragmentLigne({
  d, faites, total, pct, aTraiter, estOuvert, onToggle,
}: {
  d: Dossier; faites: number; total: number; pct: number;
  aTraiter: Piece[]; estOuvert: boolean; onToggle: () => void;
}) {
  const nomStagiaire = d.stagiaires ? `${d.stagiaires.prenom ?? ""} ${d.stagiaires.nom}`.trim() : "—";
  const nomFormatrice = d.formatrices ? `${d.formatrices.prenom ?? ""} ${d.formatrices.nom}`.trim() : "—";
  return (
    <>
      <tr onClick={onToggle} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
        <td className="px-4 py-3 font-medium text-gray-900">{nomStagiaire}</td>
        <td className="px-4 py-3 text-gray-600">
          {LIBELLE_CERTIF[d.certif] ?? d.certif}
          <span className="text-gray-400"> · {d.financement}</span>
        </td>
        <td className="px-4 py-3 text-gray-600">{nomFormatrice}</td>
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
          {dateFr(d.date_debut)} → {dateFr(d.date_fin)}
        </td>
        <td className="px-4 py-3 min-w-[120px]">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-mystory"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-gray-600 whitespace-nowrap">{faites}/{total}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          {d.statut === "complet" ? (
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs bg-green-50 text-green-800">✅ Complet</span>
          ) : (
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs bg-amber-50 text-amber-800">⏳ Incomplet</span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-gray-400">{estOuvert ? "▴" : "▾"}</td>
      </tr>
      {estOuvert && (
        <tr className="border-t border-gray-100 bg-gray-50/60">
          <td colSpan={7} className="px-4 py-4">
            {aTraiter.length === 0 ? (
              <p className="text-sm text-green-800">Toutes les pièces sont en règle 🎉</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {aTraiter.map((p) => {
                  const s = STATUT_PIECE[p.statut] ?? STATUT_PIECE.manquant;
                  return (
                    <span key={p.type}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${s.classes}`}>
                      {LIBELLE_PIECE[p.type] ?? p.type}
                      <span className="opacity-70">· {s.label}{p.optionnelle ? " (optionnelle)" : ""}</span>
                    </span>
                  );
                })}
              </div>
            )}
            <a
              href={`/suivi?token=${d.token}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-block mt-3 text-sm underline text-mystory"
            >
              Ouvrir la page de suivi détaillée ↗
            </a>
          </td>
        </tr>
      )}
    </>
  );
}
