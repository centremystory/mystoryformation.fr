"use client";
// app/dossiers/page.tsx — Suivi des dossiers (équipe) : le poste de pilotage
// Tableau de tous les dossiers (badge complet/incomplet, avancement des pièces, recherche, filtres).
// Ligne dépliée = la check-list des pièces AVEC actions : générer le document, envoyer la
// convention en signature, consulter le PDF archivé — et le journal de remarques.
// Toute génération passe par le moteur existant (fusion lieu=Gagny, portes de conformité 2B) :
// cette page n'invente AUCUNE règle, elle appuie sur les routes déjà validées.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

const LIBELLE_PIECE: Record<string, string> = {
  fiche_analyse_besoin: "Fiche d'analyse du besoin",
  evaluation_initiale: "Évaluation initiale (test de positionnement)",
  convention: "Convention (+ annexes)",
  programme: "Programme (annexe 1)",
  reglement_interieur: "Règlement intérieur (annexe 2)",
  planning: "Planning (annexe 3)",
  convocation: "Convocation",
  feuille_emargement: "Feuille d'émargement",
  evaluation_finale: "Évaluation finale (test final)",
  satisfaction_chaud: "Satisfaction à chaud",
  attestation_fin: "Attestation de fin",
  certificat_realisation: "Certificat de réalisation",
  satisfaction_froid: "Satisfaction à froid (3 mois)",
  justificatif_participation: "Justificatif participation forfaitaire",
  justificatif_examen: "Justificatif de passage d'examen",
};

// Pièces déposées (fichier externe → archives du dossier). Affichées même si absentes en base.
const DEPOSABLES = new Set(["justificatif_participation", "justificatif_examen"]);

const STATUT_PIECE: Record<string, { label: string; classes: string }> = {
  manquant: { label: "À faire", classes: "bg-gray-100 text-gray-600" },
  genere: { label: "Généré", classes: "bg-blue-50 text-blue-800" },
  envoye_a_signer: { label: "Envoyé à signer", classes: "bg-amber-50 text-amber-800" },
  signature_en_cours: { label: "Signature en cours", classes: "bg-amber-50 text-amber-800" },
  signee: { label: "Signé", classes: "bg-green-50 text-green-800" },
  erreur_envoi: { label: "Erreur d'envoi", classes: "bg-red-50 text-red-800" },
};

const LIBELLE_CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

// Pièces générables par /api/documents/generate (type de pièce → type moteur).
const GENERABLES: Record<string, string> = {
  convocation: "convocation",
  feuille_emargement: "emargement",
  programme: "programme",
  reglement_interieur: "reglement_interieur",
  planning: "planning",
  attestation_fin: "attestation_fin",
  certificat_realisation: "certificat_realisation",
};

// Pièces complétées via un petit formulaire CRM → PDF archivé (route /api/documents/completer).
const COMPLETABLES = new Set(["fiche_analyse_besoin", "evaluation_finale"]);

// Pièces remplies AUTOMATIQUEMENT depuis le moteur de tests (route /api/documents/evaluation).
const EVAL_DEPUIS_TEST = new Set(["evaluation_initiale"]);

type Piece = { type: string; statut: string; optionnelle: boolean; exige_signature: boolean; ordre: number; sign_url_integre?: string | null };
type Dossier = {
  id: string;
  stagiaire_id: string | null;
  certif: string;
  financement: string;
  statut: string;
  statut_tunnel: string | null;
  date_debut: string | null;
  date_fin: string | null;
  token: string;
  heures_prevues: number | null;
  service_fait_valide: boolean;
  satisfaction_froid_envoyee_le: string | null;
  niveau_initial: string | null;
  niveau_vise: string | null;
  niveau_atteint: string | null;
  positionnement?: { niveau_global: string | null; total_sur20: number | null; statut: string | null; source: string | null; created_at: string | null } | null;
  stagiaires: { nom: string; prenom: string | null; agence: string | null } | null;
  formatrices: { nom: string; prenom: string | null } | null;
  formatrice_libre?: string | null;
  pieces: Piece[];
};

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

// Tunnel d'inscription prospect → validé (dossiers.statut_tunnel).
const TUNNEL: Array<{ v: string; court: string; long: string }> = [
  { v: "devis_demande", court: "Devis demandé", long: "1 · Devis demandé" },
  { v: "devis_participation_payee", court: "Participation payée", long: "2 · Participation forfaitaire payée" },
  { v: "courrier_identite_envoye", court: "Courrier identité", long: "3 · Courrier d'identité envoyé" },
  { v: "validation_numerique_demandee", court: "Validation num.", long: "4 · Validation numérique demandée" },
  { v: "compte_identite_a_creer", court: "Compte à créer", long: "5 · Compte identité à créer" },
  { v: "valide", court: "Validé", long: "6 · Validé" },
];
const TUNNEL_LBL: Record<string, string> = Object.fromEntries(TUNNEL.map((t) => [t.v, t.court]));
function tunnelClasses(v: string | null): string {
  if (v === "valide") return "bg-green-100 text-green-800";
  if (!v) return "bg-gray-100 text-gray-500";
  return "bg-blue-50 text-blue-700 border border-blue-200";
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
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v) setRecherche(v);
  }, []);
  const [filtre, setFiltre] = useState<"tous" | "incomplet" | "complet" | "a_finaliser">(() => {
    if (typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("vue");
      if (v === "a_finaliser" || v === "incomplet" || v === "complet") return v;
    }
    return "tous";
  });
  const [filtreAgence, setFiltreAgence] = useState<string>("toutes");
  const [filtreTunnel, setFiltreTunnel] = useState<string>("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/dossiers", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setDossiers(j.dossiers);
      setErreur(null);
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return dossiers.filter((d) => {
      if (filtre === "a_finaliser") { if (!(d.date_fin != null && d.statut === "incomplet")) return false; }
      else if (filtre !== "tous" && d.statut !== filtre) return false;
      if (filtreAgence !== "toutes" && (d.stagiaires?.agence ?? "") !== filtreAgence) return false;
      if (filtreTunnel !== "tous") {
        if (filtreTunnel === "aucun" ? d.statut_tunnel != null : d.statut_tunnel !== filtreTunnel) return false;
      }
      if (!q) return true;
      const nom = `${d.stagiaires?.prenom ?? ""} ${d.stagiaires?.nom ?? ""}`.toLowerCase();
      return nom.includes(q);
    });
  }, [dossiers, recherche, filtre, filtreAgence, filtreTunnel]);

  const nbIncomplets = dossiers.filter((d) => d.statut === "incomplet").length;
  const nbAFinaliser = dossiers.filter((d) => d.date_fin != null && d.statut === "incomplet").length;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="page-title">Suivi des dossiers</h1>
          <a href="/dossiers/conformite"
             className="px-3 py-1.5 rounded-lg text-sm font-medium border border-mystory text-mystory bg-white hover:bg-mystory hover:text-white">
            🛡️ Scanner de conformité
          </a>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          L'état de conformité de chaque dossier — clique sur une ligne pour générer les documents et suivre les pièces.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un stagiaire…"
          className="input w-64 bg-white"
        />
        <div className="flex gap-1.5">
          {([
            ["tous", `Tous (${dossiers.length})`],
            ["incomplet", `Incomplets (${nbIncomplets})`],
            ["complet", `Complets (${dossiers.length - nbIncomplets})`],
            ["a_finaliser", `À finaliser (${nbAFinaliser})`],
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
        <div className="flex gap-1.5">
          {([
            ["toutes", "Toutes agences"],
            ["Gagny", "Gagny"],
            ["Sarcelles", "Sarcelles"],
            ["Rosny", "Rosny"],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFiltreAgence(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                filtreAgence === v
                  ? "bg-mystory text-white border-mystory"
                  : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <select value={filtreTunnel} onChange={(e) => setFiltreTunnel(e.target.value)}
          className="px-3 py-1.5 rounded-full text-sm border border-gray-300 bg-white text-gray-600">
          <option value="tous">Tunnel : tous</option>
          <option value="aucun">Hors tunnel</option>
          {TUNNEL.map((t) => <option key={t.v} value={t.v}>{t.long}</option>)}
        </select>
      </div>

      {erreur && (
        <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{erreur}</div>
      )}

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : visibles.length === 0 ? (
        <p className="text-gray-500">
          {dossiers.length === 0 ? "Aucun dossier pour l'instant." : "Aucun dossier ne correspond à cette recherche."}
        </p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
          <table className="w-full text-sm table-cards">
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
              {visibles.map((d) => (
                <LigneDossier
                  key={d.id}
                  d={d}
                  estOuvert={ouvert === d.id}
                  onToggle={() => setOuvert(ouvert === d.id ? null : d.id)}
                  recharger={charger}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Une pièce compte « faite » quand elle est générée — ou signée si une signature est exigée. Toute génération
        passe par le moteur de conformité : si une porte bloque (champs manquants, délai, plafond CPF…), le détail
        s'affiche et rien n'est produit.
      </p>
    </main>
  );
}

function SeancesAccueil({ dossierId, stagiaireId }: { dossierId: string; stagiaireId: string | null }) {
  const [liste, setListe] = useState<{ id: string; date_seance: string; present: boolean; note: string | null }[]>([]);
  const [presents, setPresents] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [date, setDate] = useState("");
  const [present, setPresent] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch(`/api/seances-accueil?dossier=${dossierId}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) { setListe(j.seances ?? []); setPresents(j.presents ?? 0); }
    } finally { setChargement(false); }
  }, [dossierId]);

  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/seances-accueil", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId, stagiaireId, dateSeance: date || undefined, present, note: note || undefined }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Ajout impossible."); return; }
      setDate(""); setPresent(true); setNote("");
      await charger();
    } catch (e: any) { setErr(e?.message || "Erreur réseau."); }
    finally { setBusy(false); }
  }

  async function archiver(id: string) {
    setBusy(true); setErr(null);
    try {
      await fetch("/api/seances-accueil", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "archiver" }),
      });
      await charger();
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <p className="font-semibold text-gray-800">Séances d&apos;accueil — <span className="text-amber-700">hors financement</span></p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{presents} présence{presents > 1 ? "s" : ""}</span>
      </div>
      <p className="mb-2 text-[11px] text-gray-400">Suivi interne (gratuit, avant le début de la formation). N&apos;entre pas dans le dossier CPF, ni dans l&apos;émargement, ni dans les heures financées.</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500">Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 className="block rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={present} onChange={(e) => setPresent(e.target.checked)} /> Présent
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)"
               className="min-w-[160px] flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
        <button onClick={ajouter} disabled={busy}
                className="rounded-lg bg-mystory px-3 py-1 text-xs text-white disabled:opacity-50">
          {busy ? "…" : "Ajouter"}
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}

      {!chargement && liste.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100">
          {liste.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-1.5">
              <span className="text-gray-700">
                {new Date(s.date_seance).toLocaleDateString("fr-FR")}
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${s.present ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {s.present ? "présent" : "absent"}
                </span>
                {s.note && <span className="ml-2 text-gray-400">— {s.note}</span>}
              </span>
              <button onClick={() => archiver(s.id)} disabled={busy} className="text-xs text-gray-400 hover:text-red-600">Retirer</button>
            </li>
          ))}
        </ul>
      )}
      {!chargement && liste.length === 0 && <p className="mt-2 text-xs text-gray-400">Aucune séance d&apos;accueil enregistrée.</p>}
    </div>
  );
}

function ClotureFormation({ dossierId, recharger }: { dossierId: string; recharger: () => Promise<void> }) {
  const [apercu, setApercu] = useState<any | null>(null);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [niveau, setNiveau] = useState<string>("");
  const [ecartOk, setEcartOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const r = await fetch(`/api/cloture?dossierId=${dossierId}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setApercu(j.apercu);
      setNiveau(j.apercu.niveauAtteint ?? "");
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [dossierId]);
  useEffect(() => { charger(); }, [charger]);

  async function cloturer() {
    if (!apercu) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/cloture", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId, niveauAtteint: niveau || undefined, ecartConfirme: ecartOk }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Clôture impossible."); await charger(); return; }
      setMsg(`Formation clôturée : fin le ${dateFr(j.dateFinReelle)}, ${j.heuresRealisees} h réalisées, niveau atteint ${j.niveauAtteint}.`);
      await charger(); await recharger();
    } catch (e: any) { setErr(e?.message || "Clôture impossible."); }
    finally { setBusy(false); }
  }

  if (charge) return <div className="mt-4 text-sm text-gray-400">Chargement de la clôture…</div>;
  if (err && !apercu) return <div className="mt-4 text-sm text-red-700">{err}</div>;
  if (!apercu) return null;
  const a = apercu;

  return (
    <div className="mt-4 card">
      <h4 className="text-sm font-semibold text-gray-800 mb-3">🏁 Clôture de formation</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-400">Heures</div>
          <div className="text-gray-900">{a.heuresRealisees} h réalisées <span className="text-gray-400">/ {a.heuresPrevues ?? "—"} prévues</span></div>
          {a.ecart && <div className="text-amber-700 text-xs mt-0.5">Écart à confirmer</div>}
        </div>
        <div>
          <div className="text-xs text-gray-400">Date de fin réelle</div>
          <div className="text-gray-900">{a.dateFinReelle ? dateFr(a.dateFinReelle) : "— (aucune séance émargée)"}</div>
          <div className="text-xs text-gray-400 mt-0.5">{a.nbSeancesEmargees} séance(s) émargée(s){a.nbAbsences ? ` · ${a.nbAbsences} absence(s)` : ""}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Niveau CECRL</div>
          <div className="text-gray-900">visé {a.niveauVise ?? "—"} → atteint {a.niveauAtteint ?? "à définir"}</div>
        </div>
      </div>

      {a.doitSaisirNiveau && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Niveau atteint (l'évaluation finale ne l'a pas encore fixé)</label>
          <select value={niveau} onChange={(e) => setNiveau(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="">— choisir —</option>
            {a.niveaux.map((n: string) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {a.ecart && (
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={ecartOk} onChange={(e) => setEcartOk(e.target.checked)} className="mt-0.5" />
          <span>J'atteste l'écart entre heures prévues ({a.heuresPrevues} h) et réalisées ({a.heuresRealisees} h).</span>
        </label>
      )}

      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
      {msg && <div className="mt-3 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">{msg}</div>}

      <button onClick={cloturer} disabled={busy || a.nbSeancesEmargees === 0}
        className="btn-primary mt-3">
        {busy ? "Clôture…" : "Clôturer la formation"}
      </button>
      {a.nbSeancesEmargees === 0 && (
        <p className="mt-2 text-xs text-gray-400">Aucune séance émargée : la clôture sera possible une fois l'émargement réalisé.</p>
      )}
    </div>
  );
}

function LigneDossier({
  d, estOuvert, onToggle, recharger,
}: {
  d: Dossier; estOuvert: boolean; onToggle: () => void; recharger: () => Promise<void>;
}) {
  const obligatoires = (d.pieces ?? []).filter((p) => !p.optionnelle);
  const faites = obligatoires.filter(pieceFaite).length;
  const pct = obligatoires.length ? Math.round((faites / obligatoires.length) * 100) : 0;
  const nomStagiaire = d.stagiaires ? `${d.stagiaires.prenom ?? ""} ${d.stagiaires.nom}`.trim() : "—";
  const nomFormatrice = d.formatrices ? `${d.formatrices.prenom ?? ""} ${d.formatrices.nom}`.trim() : "—";

  return (
    <>
      <tr onClick={onToggle} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
        <td data-label="Stagiaire" className="px-4 py-3 font-medium text-gray-900">
          {d.stagiaire_id ? (
            <Link href={`/fiche/${d.stagiaire_id}`} onClick={(e) => e.stopPropagation()}
              className="hover:underline" style={{ color: "#2F72DE" }}>
              {nomStagiaire}
            </Link>
          ) : (
            nomStagiaire
          )}
          {d.stagiaires?.agence && (
            <span className="block text-xs font-normal text-gray-400">{d.stagiaires.agence}</span>
          )}
        </td>
        <td data-label="Formation" className="px-4 py-3 text-gray-600">
          {LIBELLE_CERTIF[d.certif] ?? d.certif}
          <span className="text-gray-400"> · {d.financement}</span>
        </td>
        <td data-label="Formatrice" className="px-4 py-3 text-gray-600">{nomFormatrice}{d.formatrice_libre && <span className="block text-xs text-gray-400">+ intervenante : {d.formatrice_libre}</span>}</td>
        <td data-label="Dates" className="px-4 py-3 text-gray-600 whitespace-nowrap">
          {dateFr(d.date_debut)} → {dateFr(d.date_fin)}
        </td>
        <td data-label="Pièces" className="px-4 py-3 min-w-[120px]">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-mystory"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-gray-600 whitespace-nowrap">{faites}/{obligatoires.length}</span>
          </div>
        </td>
        <td data-label="Dossier" className="px-4 py-3">
          {d.statut === "complet" ? (
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs bg-green-50 text-green-800">✅ Complet</span>
          ) : (
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs bg-amber-50 text-amber-800">⏳ Incomplet</span>
          )}
          {d.statut_tunnel && (
            <span className={`block mt-1 w-fit px-2 py-0.5 rounded-full text-[11px] ${tunnelClasses(d.statut_tunnel)}`}>
              {TUNNEL_LBL[d.statut_tunnel] ?? d.statut_tunnel}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-gray-400">{estOuvert ? "▴" : "▾"}</td>
      </tr>
      {estOuvert && (
        <tr className="border-t border-gray-100 bg-gray-50/60">
          <td colSpan={7} className="px-4 py-4">
            <TunnelControl d={d} recharger={recharger} />
            <PiecesActions d={d} recharger={recharger} />
            <ClotureFormation dossierId={d.id} recharger={recharger} />
            <SeancesAccueil dossierId={d.id} stagiaireId={d.stagiaire_id} />
            <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-sm">
              <p className="mb-2 font-semibold text-gray-800">Tests &amp; évaluations</p>
              <div className="grid gap-1 sm:grid-cols-2">
                <div>
                  <span className="text-gray-500">Test initial :</span>{" "}
                  {d.positionnement ? (
                    <span className="text-gray-900">
                      niveau {d.positionnement.niveau_global ?? "—"}
                      {d.positionnement.total_sur20 != null ? ` · ${d.positionnement.total_sur20}/20` : ""}
                      <span className="text-gray-400"> ({dateFr((d.positionnement.created_at ?? "").slice(0, 10) || null)})</span>
                    </span>
                  ) : d.niveau_initial ? (
                    <span className="text-gray-900">niveau {d.niveau_initial}</span>
                  ) : (
                    <span className="text-gray-400">non enregistré</span>
                  )}
                </div>
                <div>
                  <span className="text-gray-500">Test final :</span>{" "}
                  {d.niveau_atteint ? (
                    <span className="text-gray-900">niveau atteint {d.niveau_atteint}</span>
                  ) : (
                    <span className="text-gray-400">non enregistré</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 sm:col-span-2">Niveau visé : {d.niveau_vise ?? "—"}</div>
              </div>
            </div>
            <LienTestFinal dossierId={d.id} />
            <div className="mt-3 text-sm text-gray-600">
              Satisfaction à froid (J+3 mois) :{" "}
              {d.satisfaction_froid_envoyee_le ? (
                <span className="font-medium text-success-700">envoyée le {dateFr(d.satisfaction_froid_envoyee_le)}</span>
              ) : (
                <span className="text-gray-500">pas encore envoyée</span>
              )}
            </div>
            <a
              href={`/suivi?token=${d.token}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-block mt-3 text-sm underline text-mystory"
            >
              Ouvrir la page de suivi détaillée ↗
            </a>
            <Remarques dossierId={d.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function TunnelControl({ d, recharger }: { d: Dossier; recharger: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function maj(v: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/dossiers/tunnel", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: d.id, statut_tunnel: v || null }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Échec"); return; }
      await recharger();
    } catch { setErr("Échec de la mise à jour."); }
    finally { setBusy(false); }
  }
  return (
    <div className="mb-3 flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-gray-700">Tunnel d'inscription :</span>
      <select disabled={busy} value={d.statut_tunnel ?? ""} onChange={(e) => maj(e.target.value)}
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
        <option value="">— hors tunnel —</option>
        {TUNNEL.map((t) => <option key={t.v} value={t.v}>{t.long}</option>)}
      </select>
      {busy && <span className="text-xs text-gray-400">…</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

function PiecesActions({ d, recharger }: { d: Dossier; recharger: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [formOuvert, setFormOuvert] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number; bloques: { piece: string; raison: string }[] } | null>(null);
  const [envoiMsg, setEnvoiMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cibleDepotRef = useRef<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Le formulaire « à compléter » se rend en bas de la carte (après la liste des pièces) :
  // sur un dossier à plusieurs pièces il s'ouvre hors écran → vécu comme « il ne s'ouvre pas ».
  // On l'amène à l'écran dès son ouverture.
  useEffect(() => {
    if (formOuvert) requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [formOuvert]);

  const reelles = [...(d.pieces ?? [])].sort((a, b) => a.ordre - b.ordre);
  const presentes = new Set(reelles.map((p) => p.type));
  const virtuelles: Piece[] = ["justificatif_participation", "justificatif_examen"]
    .filter((t) => !presentes.has(t))
    .map((t, i) => ({ type: t, statut: "manquant", optionnelle: true, exige_signature: false, ordre: 90 + i }));
  const pieces = [...reelles, ...virtuelles];

  function ouvrirDepot(pieceType: string) {
    cibleDepotRef.current = pieceType;
    fileInputRef.current?.click();
  }

  async function fichierChoisi(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    const pieceType = cibleDepotRef.current;
    e.target.value = "";
    if (!fichier || !pieceType) return;
    setBusy(pieceType); setErreurs([]);
    try {
      const fd = new FormData();
      fd.append("dossierId", d.id);
      fd.append("piece", pieceType);
      fd.append("fichier", fichier);
      const r = await fetch("/api/documents/justificatif", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) { setErreurs([j.erreur || "Échec du dépôt."]); return; }
      await recharger();
    } catch (e: any) {
      setErreurs([e?.message || "Échec du dépôt."]);
    } finally {
      setBusy(null);
      cibleDepotRef.current = null;
    }
  }

  async function voir(piece: Piece) {
    setBusy(piece.type); setErreurs([]);
    try {
      const r = await fetch(`/api/documents/url?dossier=${d.id}&piece=${piece.type}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "PDF introuvable.");
      window.open(j.url, "_blank", "noreferrer");
    } catch (e: any) {
      setErreurs([e?.message || "PDF introuvable."]);
    } finally {
      setBusy(null);
    }
  }

  async function generer(piece: Piece) {
    setBusy(piece.type); setErreurs([]);
    try {
      const r = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: d.id, type: GENERABLES[piece.type] }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErreurs(j.recap ?? [j.error || j.erreur || "Erreur lors de la génération."]);
        return;
      }
      await recharger();
    } catch (e: any) {
      setErreurs([e?.message || "Erreur lors de la génération."]);
    } finally {
      setBusy(null);
    }
  }

  async function genererDepuisTest(piece: Piece) {
    setBusy(piece.type); setErreurs([]);
    try {
      const phase = piece.type === "evaluation_finale" ? "final" : "initial";
      const r = await fetch("/api/documents/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: d.id, phase }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErreurs([j.erreur || "Aucun test exploitable pour ce dossier (le bénéficiaire doit l'avoir passé)."]);
        return;
      }
      await recharger();
    } catch (e: any) {
      setErreurs([e?.message || "Erreur lors de la génération."]);
    } finally {
      setBusy(null);
    }
  }

  async function genererTout() {
    // Génère en une fois toutes les pièces auto-générables encore à faire.
    // On exclut la feuille d'émargement (produite à partir des signatures réelles, jamais anticipée).
    // Les portes de conformité du serveur s'appliquent pièce par pièce : les documents non
    // générables (ex. documents de fin avant la fin) sont remontés avec leur motif, sans rien forcer.
    const cibles = pieces.filter(
      (p) => GENERABLES[p.type] && p.type !== "feuille_emargement" && (p.statut === "manquant" || p.statut === "erreur_envoi")
    );
    if (cibles.length === 0) {
      setBatch(null);
      setErreurs(["Tous les documents générables sont déjà générés (l'émargement et les pièces à compléter/signer restent manuels)."]);
      return;
    }
    setBusy("__tout__"); setErreurs([]); setBatch(null);
    const bloques: { piece: string; raison: string }[] = [];
    let done = 0;
    for (const p of cibles) {
      try {
        const r = await fetch("/api/documents/generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossierId: d.id, type: GENERABLES[p.type] }),
        });
        const j = await r.json();
        if (j.ok) done++;
        else bloques.push({ piece: p.type, raison: j.recap?.[0] ?? j.error ?? j.erreur ?? "non généré" });
      } catch (e: any) {
        bloques.push({ piece: p.type, raison: e?.message ?? "erreur réseau" });
      }
    }
    setBatch({ done, total: cibles.length, bloques });
    setBusy(null);
    await recharger();
  }

  async function envoyerDossier() {
    setBusy("__envoi__"); setErreurs([]); setEnvoiMsg(null); setBatch(null);
    try {
      const r = await fetch("/api/documents/envoyer-dossier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: d.id }),
      });
      const j = await r.json();
      if (j.ok) setEnvoiMsg(`✉️ ${j.nbDocuments} document${j.nbDocuments > 1 ? "s" : ""} envoyé${j.nbDocuments > 1 ? "s" : ""} au stagiaire par email.`);
      else setErreurs([j.erreur || "Envoi impossible."]);
    } catch (e: any) {
      setErreurs([e?.message || "Envoi impossible."]);
    } finally {
      setBusy(null);
    }
  }

  async function envoyerConvention(piece: Piece) {
    setBusy(piece.type); setErreurs([]);
    try {
      const r = await fetch("/api/conventions/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: d.id }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErreurs(j.recap ?? [j.error || j.erreur || "Erreur lors de l'envoi en signature."]);
        return;
      }
      await recharger();
    } catch (e: any) {
      setErreurs([e?.message || "Erreur lors de l'envoi en signature."]);
    } finally {
      setBusy(null);
    }
  }

  function boutons(p: Piece) {
    const occupé = busy === p.type;
    const consultable = p.statut === "genere" || p.statut === "signee"
      || p.statut === "envoye_a_signer" || p.statut === "signature_en_cours";

    if (p.type === "convention") {
      return (
        <>
          {(p.statut === "manquant" || p.statut === "erreur_envoi") && (
            <button onClick={() => envoyerConvention(p)} disabled={occupé}
                    className="px-3 py-1 rounded-lg text-xs text-white bg-mystory disabled:opacity-50">
              {occupé ? "Envoi…" : "Envoyer à signer ✍️"}
            </button>
          )}
          {(p.statut === "envoye_a_signer" || p.statut === "signature_en_cours") && (
            <>
              <span className="text-xs text-gray-400">en attente du stagiaire</span>
              {p.sign_url_integre && (
                <a href={p.sign_url_integre} target="_blank" rel="noopener noreferrer"
                   className="px-3 py-1 rounded-lg text-xs text-white bg-mystory">
                  Signer sur place ✍️
                </a>
              )}
            </>
          )}
          {consultable && (
            <button onClick={() => voir(p)} disabled={occupé}
                    className="px-3 py-1 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white disabled:opacity-50">
              {occupé ? "…" : "Voir le PDF"}
            </button>
          )}
        </>
      );
    }

    if (DEPOSABLES.has(p.type)) {
      return (
        <>
          <button onClick={() => ouvrirDepot(p.type)} disabled={occupé}
                  className="px-3 py-1 rounded-lg text-xs text-white bg-mystory disabled:opacity-50">
            {occupé ? "Envoi…" : consultable ? "Remplacer le fichier" : "Déposer le fichier"}
          </button>
          {consultable && (
            <button onClick={() => voir(p)} disabled={occupé}
                    className="px-3 py-1 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white disabled:opacity-50">
              {occupé ? "…" : "Voir la pièce"}
            </button>
          )}
        </>
      );
    }

    if (p.type === "satisfaction_chaud" || p.type === "satisfaction_froid") {
      const variante = p.type === "satisfaction_chaud" ? "chaud" : "froid";
      return (
        <>
          {!consultable && (
            <button
              onClick={async () => {
                const lien = `${window.location.origin}/satisfaction?token=${d.token}&type=${variante}`;
                try { await navigator.clipboard.writeText(lien); } catch {}
                setErreurs([]);
                window.prompt("Lien du questionnaire copié — envoie-le au stagiaire (email, SMS, WhatsApp) :", lien);
              }}
              className="px-3 py-1 rounded-lg text-xs text-white bg-mystory"
            >
              Copier le lien du questionnaire
            </button>
          )}
          {!consultable && (
            <button
              onClick={async () => {
                setErreurs([]);
                const r = await fetch("/api/dossiers/satisfaction-envoyer", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ dossierId: d.id, type: variante }),
                });
                const j = await r.json();
                if (j.ok) window.alert(`Questionnaire envoyé par e-mail à ${j.email}.`);
                else setErreurs([j.erreur || "Envoi impossible."]);
              }}
              className="px-3 py-1 rounded-lg text-xs border border-mystory text-mystory bg-white"
            >
              Envoyer au stagiaire
            </button>
          )}
          {consultable && (
            <button onClick={() => voir(p)} disabled={occupé}
                    className="px-3 py-1 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white disabled:opacity-50">
              {occupé ? "…" : "Voir la réponse (PDF)"}
            </button>
          )}
        </>
      );
    }

    if (COMPLETABLES.has(p.type)) {
      return (
        <>
          <button onClick={() => setFormOuvert(formOuvert === p.type ? null : p.type)} disabled={occupé}
                  className="px-3 py-1 rounded-lg text-xs text-white bg-mystory disabled:opacity-50">
            {p.statut === "manquant" || p.statut === "erreur_envoi" ? "Compléter et générer" : "Recompléter"}
          </button>
          {consultable && (
            <button onClick={() => voir(p)} disabled={occupé}
                    className="px-3 py-1 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white disabled:opacity-50">
              {occupé ? "…" : "Voir le PDF"}
            </button>
          )}
        </>
      );
    }

    if (EVAL_DEPUIS_TEST.has(p.type)) {
      return (
        <>
          <button onClick={() => genererDepuisTest(p)} disabled={occupé}
                  title="Génère l'évaluation à partir du test réellement passé par le bénéficiaire"
                  className="px-3 py-1 rounded-lg text-xs text-white bg-mystory disabled:opacity-50">
            {occupé ? "Génération…" : (p.statut === "manquant" || p.statut === "erreur_envoi" ? "Générer depuis le test" : "Regénérer depuis le test")}
          </button>
          {consultable && (
            <button onClick={() => voir(p)} disabled={occupé}
                    className="px-3 py-1 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white disabled:opacity-50">
              {occupé ? "…" : "Voir le PDF"}
            </button>
          )}
        </>
      );
    }

    if (GENERABLES[p.type]) {
      return (
        <>
          {(p.statut === "manquant" || p.statut === "erreur_envoi") && (
            <button onClick={() => generer(p)} disabled={occupé}
                    className="px-3 py-1 rounded-lg text-xs text-white bg-mystory disabled:opacity-50">
              {occupé ? "Génération…" : "Générer"}
            </button>
          )}
          {consultable && (
            <>
              <button onClick={() => voir(p)} disabled={occupé}
                      className="px-3 py-1 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white disabled:opacity-50">
                {occupé ? "…" : "Voir le PDF"}
              </button>
              <button onClick={() => generer(p)} disabled={occupé}
                      className="px-3 py-1 rounded-lg text-xs text-gray-400 hover:text-mystory">
                Regénérer
              </button>
            </>
          )}
        </>
      );
    }

    if (consultable) {
      return (
        <button onClick={() => voir(p)} disabled={occupé}
                className="px-3 py-1 rounded-lg text-xs border border-gray-300 text-gray-700 bg-white disabled:opacity-50">
          {occupé ? "…" : "Voir le PDF"}
        </button>
      );
    }
    return <span className="text-xs text-gray-300">génération bientôt</span>;
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
             className="hidden" onChange={fichierChoisi} />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pièces du dossier</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={genererTout} disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-mystory disabled:opacity-50"
            title="Génère d'un coup tous les documents auto-générables encore à faire (émargement, pièces à compléter et signatures restent manuels)">
            {busy === "__tout__" ? "Génération du dossier…" : "⚡ Générer tout le dossier"}
          </button>
          <button onClick={envoyerDossier} disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-mystory text-mystory bg-white disabled:opacity-50"
            title="Envoie tous les documents archivés du dossier au stagiaire, en un seul email (pièces jointes PDF)">
            {busy === "__envoi__" ? "Envoi…" : "✉️ Envoyer au stagiaire"}
          </button>
          <a href={`/dossiers/edof?dossier=${d.id}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 bg-white hover:border-mystory hover:text-mystory"
            title="Toutes les valeurs à recopier dans EDOF (Mon Compte Formation), prêtes à copier-coller">
            🪪 Fiche EDOF
          </a>
          <a href={`/api/dossiers/export-zip?dossier=${d.id}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 bg-white hover:border-mystory hover:text-mystory"
            title="Télécharge le dossier conforme du stagiaire (toutes les pièces archivées, numérotées dans l'ordre) en un ZIP">
            📦 Dossier conforme (ZIP)
          </a>
        </div>
      </div>
      {erreurs.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
          <p className="font-medium mb-1">Le moteur de conformité a bloqué :</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {erreurs.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {batch && (
        <div className={`mb-3 px-3 py-2 rounded-lg border text-sm ${batch.bloques.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <p className="font-medium mb-1">
            {batch.done}/{batch.total} document{batch.total > 1 ? "s" : ""} généré{batch.done > 1 ? "s" : ""} et archivé{batch.done > 1 ? "s" : ""}.
          </p>
          {batch.bloques.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5">
              {batch.bloques.map((b, i) => (
                <li key={i}><strong>{LIBELLE_PIECE[b.piece] ?? b.piece}</strong> — {b.raison}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {envoiMsg && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">
          {envoiMsg}
        </div>
      )}
      <ul className="divide-y divide-gray-100 bg-white border border-gray-200 rounded-lg">
        {pieces.map((p) => {
          const s = STATUT_PIECE[p.statut] ?? STATUT_PIECE.manquant;
          return (
            <li key={p.type} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="text-sm text-gray-800 flex-1 min-w-[180px]">
                {LIBELLE_PIECE[p.type] ?? p.type}
                {p.optionnelle && <span className="text-gray-400 text-xs"> (optionnelle)</span>}
              </span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${s.classes}`}>{s.label}</span>
              <span className="flex items-center gap-1.5">{boutons(p)}</span>
            </li>
          );
        })}
      </ul>
      {formOuvert && (
        <div ref={formRef} className="scroll-mt-24">
          <FormulaireCompletion
            dossierId={d.id}
            type={formOuvert}
            onFini={async () => { setFormOuvert(null); await recharger(); }}
            onErreurs={setErreurs}
          />
        </div>
      )}
    </div>
  );
}

function dateHeureFr(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type Remarque = { id: string; auteur: string | null; texte: string; horodatage: string };

function Remarques({ dossierId }: { dossierId: string }) {
  const [liste, setListe] = useState<Remarque[]>([]);
  const [charge, setCharge] = useState(false);
  const [texte, setTexte] = useState("");
  const [auteur, setAuteur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try { setAuteur(localStorage.getItem("mystory_auteur") ?? ""); } catch {}
    fetch(`/api/dossiers/remarques?dossier=${dossierId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setListe(j.remarques); })
      .catch(() => {})
      .finally(() => setCharge(true));
  }, [dossierId]);

  async function ajouter() {
    if (!texte.trim() || envoi) return;
    setEnvoi(true); setErr(null);
    try {
      const r = await fetch("/api/dossiers/remarques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier_id: dossierId, texte: texte.trim(), auteur: auteur.trim() || null }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur lors de l'ajout.");
      setListe((l) => [j.remarque, ...l]);
      setTexte("");
      try { if (auteur.trim()) localStorage.setItem("mystory_auteur", auteur.trim()); } catch {}
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de l'ajout.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        Suivi du dossier ({liste.length})
      </p>

      <div className="flex flex-wrap items-start gap-2 mb-3">
        <input
          value={auteur}
          onChange={(e) => setAuteur(e.target.value)}
          placeholder="Ton prénom"
          className="input w-32 bg-white"
        />
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Ajouter une remarque (appel, pièce reçue, report de séance…)"
          rows={2}
          className="input flex-1 min-w-[220px] bg-white resize-y"
        />
        <button
          onClick={ajouter}
          disabled={envoi || !texte.trim()}
          className="px-4 py-2 rounded-lg text-sm text-white bg-mystory disabled:opacity-50"
        >
          {envoi ? "Ajout…" : "Ajouter"}
        </button>
      </div>
      {err && <p className="text-sm text-red-700 mb-2">{err}</p>}

      {!charge ? (
        <p className="text-sm text-gray-400">Chargement du suivi…</p>
      ) : liste.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune remarque pour l'instant — la première marquera le début du journal.</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((r) => (
            <li key={r.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-400">
                {dateHeureFr(r.horodatage)}{r.auteur ? ` · ${r.auteur}` : ""}
              </p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.texte}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-2">
        Les remarques sont horodatées par le serveur et ne peuvent être ni modifiées ni supprimées (journal de suivi infalsifiable).
      </p>
    </div>
  );
}

const NIVEAUX_CECRL = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];

function FormulaireCompletion({
  dossierId, type, onFini, onErreurs,
}: {
  dossierId: string; type: string; onFini: () => Promise<void>; onErreurs: (e: string[]) => void;
}) {
  const [champs, setChamps] = useState<Record<string, any>>(
    type === "fiche_analyse_besoin"
      ? { objectif: "", demarches: [], projet: "", apport_francais: "", situation: "", situation_detail: "", positionnement: "test", positionnement_detail: "", dispo_rythme: "", dispo_creneaux: [], prerequis_items: ["aucun_diplome", "lire_ecrire", "positionnement"], commentaires: "", compensation: "non", compensation_detail: "", coherence: false }
      : { niveau_co: "", niveau_ce: "", niveau_eo: "", niveau_ee: "", niveau_global: "", commentaires: "", axes: "" }
  );
  const [auteur, setAuteur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  // Blocages affichés DANS le formulaire (au-dessus du bouton) : l'utilisateur voit
  // immédiatement pourquoi « ça ne se génère pas », sans devoir remonter en haut de la carte.
  const [erreursLocales, setErreursLocales] = useState<string[]>([]);
  const blocRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { setAuteur(localStorage.getItem("mystory_auteur") ?? ""); } catch {}
    fetch(`/api/documents/completer?dossier=${dossierId}&type=${type}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok && j.completion?.champs) setChamps((c) => ({ ...c, ...j.completion.champs })); })
      .catch(() => {});
  }, [dossierId, type]);

  const [signUrl, setSignUrl] = useState<string | null>(null);
  const set = (k: string, v: any) => setChamps((c) => ({ ...c, [k]: v }));

  function signalerErreurs(msgs: string[]) {
    setErreursLocales(msgs);   // visible dans le formulaire, sous les yeux
    onErreurs(msgs);           // + bandeau parent (cohérence avec les autres actions)
    // Amène le bloc à l'écran au cas où le formulaire dépasse la fenêtre.
    requestAnimationFrame(() => blocRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function envoyer(avecSignature = false) {
    setEnvoi(true); onErreurs([]); setErreursLocales([]); setSignUrl(null);
    try {
      const champsEnvoi = avecSignature ? { ...champs, envoyer_signature: true } : champs;
      const r = await fetch("/api/documents/completer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId, type, champs: champsEnvoi, auteur: auteur.trim() || null }),
      });
      const j = await r.json();
      if (!j.ok) { signalerErreurs(j.recap ?? [j.erreur || "Erreur lors de la génération."]); return; }
      try { if (auteur.trim()) localStorage.setItem("mystory_auteur", auteur.trim()); } catch {}
      if (j.signUrl) setSignUrl(j.signUrl);
      await onFini();
    } catch (e: any) {
      signalerErreurs([e?.message || "Erreur lors de la génération."]);
    } finally {
      setEnvoi(false);
    }
  }

  const champClasses = "input";

  return (
    <div className="mt-3 border border-mystory/30 bg-mystory-clair/40 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
        {type === "fiche_analyse_besoin" ? "Fiche d'analyse du besoin — à compléter" : "Évaluation finale — à compléter"}
      </p>

      {type === "fiche_analyse_besoin" ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Objectif principal (nécessairement professionnel)</span>
            <select value={champs.objectif} onChange={(e) => set("objectif", e.target.value)}
                    className={`${champClasses} mt-1 block w-full max-w-md`}>
              <option value="">— Choisir —</option>
              <option value="emploi">Accès / retour à l'emploi</option>
              <option value="maintien">Maintien dans l'emploi / adaptation au poste</option>
              <option value="mobilite">Mobilité / évolution professionnelle</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Description du projet professionnel</span>
            <textarea value={champs.projet} onChange={(e) => set("projet", e.target.value)} rows={2}
                      className={`${champClasses} mt-1 block w-full resize-y`} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">En quoi la maîtrise du français sert ce projet</span>
            <textarea value={champs.apport_francais} onChange={(e) => set("apport_francais", e.target.value)} rows={2}
                      className={`${champClasses} mt-1 block w-full resize-y`} />
          </label>
          {/* Démarche administrative ASSOCIÉE — contexte lié au projet pro, jamais l'objectif principal CPF */}
          <div className="text-sm">
            <span className="font-medium">Démarche administrative associée </span>
            <span className="text-xs font-normal text-gray-500">(le cas échéant — contexte lié au projet professionnel, jamais l'objectif principal d'une formation CPF)</span>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {([["residence", "Carte de résidence longue durée"], ["naturalisation", "Naturalisation"], ["titre_sejour", "1re demande de titre de séjour"], ["maintien", "Maintien de résidence"], ["integration", "Intégration"]] as const).map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={(champs.demarches ?? []).includes(v)}
                         onChange={(e) => set("demarches", e.target.checked ? [...(champs.demarches ?? []), v] : (champs.demarches ?? []).filter((x: string) => x !== v))} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Situation professionnelle — justifie le contexte pro exigé par le CPF */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">Situation professionnelle :</span>
            <select value={champs.situation} onChange={(e) => set("situation", e.target.value)} className={champClasses}>
              <option value="">— Choisir —</option>
              <option value="salarie">Salarié</option>
              <option value="demandeur_emploi">Demandeur d'emploi</option>
              <option value="chef_entreprise">Chef d'entreprise</option>
              <option value="autre">Autre</option>
            </select>
            {champs.situation === "autre" && (
              <input value={champs.situation_detail} onChange={(e) => set("situation_detail", e.target.value)}
                     placeholder="Préciser la situation" className={`${champClasses} flex-1 min-w-[200px]`} />
            )}
          </div>
          {/* Méthode de positionnement — Qualiopi ind. 8 */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">Méthode de positionnement :</span>
            <select value={champs.positionnement} onChange={(e) => set("positionnement", e.target.value)} className={champClasses}>
              <option value="test">Test de positionnement</option>
              <option value="attestation">Attestation de niveau</option>
              <option value="autre">Autre</option>
            </select>
            {champs.positionnement === "autre" && (
              <input value={champs.positionnement_detail} onChange={(e) => set("positionnement_detail", e.target.value)}
                     placeholder="Préciser la méthode" className={`${champClasses} flex-1 min-w-[200px]`} />
            )}
          </div>
          {/* Disponibilités en cases (saisie rapide) — rythme obligatoire + créneaux */}
          <div className="text-sm">
            <span className="font-medium">Disponibilités — rythme :</span>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <label key={n} className="inline-flex items-center gap-1.5">
                  <input type="radio" name="dispo_rythme" checked={champs.dispo_rythme === String(n)}
                         onChange={() => set("dispo_rythme", String(n))} />
                  <span>{n}×/sem</span>
                </label>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-gray-500">Créneaux :</span>
              {([["matin", "Matin"], ["apresmidi", "Après-midi"], ["soir", "Soir"], ["samedi", "Samedi"]] as const).map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={(champs.dispo_creneaux ?? []).includes(v)}
                         onChange={(e) => set("dispo_creneaux", e.target.checked ? [...(champs.dispo_creneaux ?? []), v] : (champs.dispo_creneaux ?? []).filter((x: string) => x !== v))} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Prérequis en cases (pré-cochés par défaut) */}
          <div className="text-sm">
            <span className="font-medium">Prérequis :</span>
            <div className="mt-1 flex flex-col gap-1">
              {([["aucun_diplome", "Aucun prérequis de diplôme"], ["lire_ecrire", "Sait lire et écrire dans sa langue d'origine"], ["positionnement", "Positionnement réalisé à l'entrée"], ["informatique", "Maîtrise de base de l'outil informatique (si formation à distance)"]] as const).map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={(champs.prerequis_items ?? []).includes(v)}
                         onChange={(e) => set("prerequis_items", e.target.checked ? [...(champs.prerequis_items ?? []), v] : (champs.prerequis_items ?? []).filter((x: string) => x !== v))} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">Besoin de compensation (handicap) :</span>
            <select value={champs.compensation} onChange={(e) => set("compensation", e.target.value)} className={champClasses}>
              <option value="non">Non</option>
              <option value="oui">Oui</option>
            </select>
            {champs.compensation === "oui" && (
              <input value={champs.compensation_detail} onChange={(e) => set("compensation_detail", e.target.value)}
                     placeholder="Préciser l'adaptation" className={`${champClasses} flex-1 min-w-[200px]`} />
            )}
          </div>
          <label className="block text-sm">
            <span className="font-medium">Commentaires</span>
            <textarea value={champs.commentaires} onChange={(e) => set("commentaires", e.target.value)} rows={2}
                      className={`${champClasses} mt-1 block w-full resize-y`} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={!!champs.coherence} onChange={(e) => set("coherence", e.target.checked)}
                   className="mt-0.5" />
            <span><strong>J'ai vérifié la cohérence durée / écart de niveau</strong> (obligatoire pour générer la fiche). Les niveaux estimé et visé sont repris automatiquement du dossier.</span>
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {([["niveau_co", "Compr. orale"], ["niveau_ce", "Compr. écrite"], ["niveau_eo", "Expr. orale"], ["niveau_ee", "Expr. écrite"], ["niveau_global", "Niveau global"]] as const).map(([k, l]) => (
              <label key={k} className="block text-sm">
                <span className="font-medium">{l}</span>
                <select value={champs[k]} onChange={(e) => set(k, e.target.value)} className={`${champClasses} mt-1 block w-full`}>
                  <option value="">—</option>
                  {NIVEAUX_CECRL.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Le niveau global devient le niveau du dossier : l'attestation de fin le reprendra tel quel
            (cohérence CECRL garantie). « Objectifs atteints » se coche automatiquement par rapport au niveau visé.
          </p>
          <label className="block text-sm">
            <span className="font-medium">Commentaires du formateur</span>
            <textarea value={champs.commentaires} onChange={(e) => set("commentaires", e.target.value)} rows={2}
                      className={`${champClasses} mt-1 block w-full resize-y`} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Axes de progression</span>
            <textarea value={champs.axes} onChange={(e) => set("axes", e.target.value)} rows={2}
                      className={`${champClasses} mt-1 block w-full resize-y`} />
          </label>
        </div>
      )}

      {erreursLocales.length > 0 && (
        <div ref={blocRef} className="mt-4 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-800 text-sm">
          <p className="font-medium mb-1">Génération bloquée — à corriger avant de générer :</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {erreursLocales.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <input value={auteur} onChange={(e) => setAuteur(e.target.value)} placeholder="Ton prénom"
               className={`${champClasses} w-32`} />
        <button onClick={() => envoyer(false)} disabled={envoi}
                className="px-4 py-2 rounded-lg text-sm text-white bg-mystory disabled:opacity-50">
          {envoi ? "Génération…" : "Générer le PDF"}
        </button>
        {type === "fiche_analyse_besoin" && (
          <button onClick={() => envoyer(true)} disabled={envoi}
                  className="px-4 py-2 rounded-lg text-sm text-mystory border border-mystory disabled:opacity-50">
            {envoi ? "Envoi…" : "Générer + envoyer à signer"}
          </button>
        )}
        <span className="text-xs text-gray-500">La saisie est tracée (horodatage serveur) et le PDF archivé au dossier.</span>
      </div>
      {signUrl && (
        <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm">
          <p className="font-medium text-green-800">Fiche envoyée à signer ✓</p>
          <p className="text-xs text-gray-600">Le stagiaire et le centre reçoivent le lien par e-mail. Pour signer <strong>sur place</strong>, ouvre ce lien :</p>
          <a href={signUrl} target="_blank" rel="noreferrer" className="break-all text-mystory underline">{signUrl}</a>
        </div>
      )}
    </div>
  );
}



function LienTestFinal({ dossierId }: { dossierId: string }) {
  const [id, setId] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [mail, setMail] = useState<string | null>(null);
  const [envoiMail, setEnvoiMail] = useState(false);

  async function creer() {
    setCreation(true); setErreur(null);
    try {
      const r = await fetch("/api/tests/evaluation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier_id: dossierId, phase: "final" }),
      });
      const j = await r.json();
      if (j.ok) { setId(j.id); setLien(j.url); setQr(j.qr ?? null); } else setErreur(j.erreur || "Création impossible.");
    } catch { setErreur("Création impossible."); }
    finally { setCreation(false); }
  }

  async function envoyer() {
    if (!id) return;
    setEnvoiMail(true); setErreur(null); setMail(null);
    try {
      const r = await fetch("/api/tests/envoyer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (j.ok) setMail(`Envoyé à ${j.email}`); else setErreur(j.erreur || "Envoi impossible.");
    } catch { setErreur("Envoi impossible."); }
    finally { setEnvoiMail(false); }
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-sm" onClick={(e) => e.stopPropagation()}>
      <p className="mb-2 font-semibold text-gray-800">Test final en ligne</p>
      {lien ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {qr && <img src={qr} alt="QR code du test" className="h-32 w-32 shrink-0 rounded-lg border border-gray-200" />}
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Lien à envoyer, à scanner (QR) ou à ouvrir sur place :</p>
            <a href={lien} target="_blank" rel="noreferrer" className="block break-all text-mystory underline">{lien}</a>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { navigator.clipboard?.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 1500); }} className="btn-ghost !py-1 !text-xs">{copie ? "Copié ✓" : "Copier le lien"}</button>
              <button onClick={envoyer} disabled={envoiMail} className="btn-primary !py-1 !text-xs">{envoiMail ? "Envoi…" : "Envoyer par mail"}</button>
            </div>
            {mail && <p className="text-xs text-success-700">{mail}</p>}
          </div>
        </div>
      ) : (
        <button onClick={creer} disabled={creation} className="btn-primary !py-1.5 !text-sm">{creation ? "Création…" : "Créer le lien du test final"}</button>
      )}
      {erreur && <p className="mt-2 text-xs text-red-600">{erreur}</p>}
    </div>
  );
}
