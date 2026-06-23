// app/page.tsx — Accueil du CRM (Design 1C, page de référence SaaS épuré).
// Tableau de bord à deux espaces (Formation / Examen) : compteurs temps réel,
// file « À traiter », deux grandes portes, tuiles transverses.
// Logique de comptage / rôle / filtrage INCHANGÉE — seul le rendu a été refondu.
import Link from "next/link";
import { cookies, headers } from "next/headers";
import {
  GraduationCap, ClipboardList, Users, Receipt, FileSpreadsheet, ListChecks,
  Plus, ArrowRight, CheckCircle2, AlertTriangle, Send, FileSignature, ChevronRight, MessageSquareWarning,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { conformiteFormateurs } from "@/lib/conformiteFormateurs";
import { verifySession } from "@/lib/auth";
import { peutVoirPage } from "@/lib/roles";
import { siteValide, COOKIE_SITE, type SiteFiltre } from "@/lib/sites";

export const dynamic = "force-dynamic";

async function compter(site: SiteFiltre) {
  const zero = { enCours: 0, aFinaliser: 0, aRelancer: 0, finsProches: 0 };
  try {
    const compteDossiers = (statut: string) => {
      let q = supabaseAdmin
        .from("dossiers")
        .select(site ? "id, stagiaires!inner(agence)" : "id", { count: "exact", head: true })
        .eq("statut", statut);
      if (site) q = q.eq("stagiaires.agence", site);
      return q;
    };
    const compteAFinaliser = () => {
      let q = supabaseAdmin
        .from("dossiers")
        .select(site ? "id, stagiaires!inner(agence)" : "id", { count: "exact", head: true })
        .eq("statut", "incomplet").not("date_fin", "is", null);
      if (site) q = q.eq("stagiaires.agence", site);
      return q;
    };
    const [incomplets, aFinaliser, relances, planning] = await Promise.all([
      compteDossiers("incomplet"),
      compteAFinaliser(),
      supabaseAdmin.from("v_conventions_a_relancer").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("planning")
        .select(
          `heures, emarge_le, dossier:dossiers!dossier_id ( id, statut, date_fin, heures_prevues, stagiaire:stagiaires!stagiaire_id ( agence ) )`
        ),
    ]);
    // Fins de formation proches : dossier en cours (non clôturé) dont les heures
    // émargées atteignent >= 80 % des heures prévues -> à finaliser en priorité.
    // Heures faites calculées en live depuis le planning (dossiers.heures_realisees
    // n'est figé qu'à la clôture).
    const acc = new Map<string, { fait: number; prevu: number }>();
    for (const r of ((planning.data as any[]) ?? [])) {
      const d = (r as any).dossier;
      if (!d?.id || d.statut !== "incomplet" || d.date_fin != null) continue;
      if (site && (d.stagiaire?.agence ?? "") !== site) continue;
      if (!acc.has(d.id)) acc.set(d.id, { fait: 0, prevu: Number(d.heures_prevues ?? 0) });
      if (r.emarge_le) acc.get(d.id)!.fait += Number(r.heures ?? 0);
    }
    let finsProches = 0;
    for (const v of acc.values()) if (v.prevu > 0 && v.fait >= 0.8 * v.prevu) finsProches++;
    return {
      enCours: incomplets.count ?? 0,
      aFinaliser: aFinaliser.count ?? 0,
      aRelancer: relances.count ?? 0,
      finsProches,
    };
  } catch {
    return zero; // le tableau de bord s'affiche même si la base est indisponible
  }
}

async function aTraiter(site: SiteFiltre) {
  const zero = { participation: 0, identite: 0, conges: 0, messages: 0, formateurDocs: 0, incidents: 0, validations: 0, questionsInternes: 0, reclamations: 0 };
  try {
    const estCpf = (d: any) => d.financement === "CPF" || d.origine_fonds === "CPF_CDC";
    let dq = supabaseAdmin
      .from("dossiers")
      .select(site
        ? "financement, origine_fonds, participation_forfaitaire_reglee, participation_forfaitaire_exemptee, cpf_identite_ok, stagiaires!inner(agence)"
        : "financement, origine_fonds, participation_forfaitaire_reglee, participation_forfaitaire_exemptee, cpf_identite_ok");
    if (site) dq = dq.eq("stagiaires.agence", site);
    const [dossiers, conges, messages, fdocs, validations, qInternes] = await Promise.all([
      dq,
      supabaseAdmin.from("conges").select("id", { count: "exact", head: true }).eq("statut", "en_attente"),
      supabaseAdmin.from("messages_prospects").select("id", { count: "exact", head: true }).eq("statut", "nouveau"),
      supabaseAdmin.from("formateur_documents").select("id", { count: "exact", head: true }).eq("statut", "envoye_a_signer"),
      supabaseAdmin.from("validations_direction").select("id", { count: "exact", head: true }).eq("statut", "en_attente"),
      supabaseAdmin.from("questions_internes").select("id", { count: "exact", head: true }).is("parent_id", null).eq("statut", "ouverte").eq("archive", false),
    ]);
    const incidents = await supabaseAdmin.from("incidents_techniques").select("id", { count: "exact", head: true }).eq("resolu", false);
    let rq = supabaseAdmin.from("reclamations").select("id", { count: "exact", head: true }).eq("actif", true).neq("statut", "resolue");
    if (site) rq = rq.eq("agence", site);
    const reclamations = await rq;
    const cpf = (dossiers.data ?? []).filter(estCpf);
    return {
      participation: cpf.filter((d: any) => !d.participation_forfaitaire_reglee && !d.participation_forfaitaire_exemptee).length,
      identite: cpf.filter((d: any) => !d.cpf_identite_ok).length,
      conges: conges.count ?? 0,
      messages: messages.count ?? 0,
      formateurDocs: fdocs.count ?? 0,
      incidents: incidents.count ?? 0,
      validations: validations.count ?? 0,
      questionsInternes: qInternes.count ?? 0,
      reclamations: reclamations.count ?? 0,
    };
  } catch { return zero; }
}

/** Carte chiffre (KPI) du design system, avec accent sémantique optionnel. */
function Kpi({ libelle, valeur, accent, href }: { libelle: string; valeur: string; accent?: "ambre" | "vert"; href?: string }) {
  const couleur = accent === "ambre" ? "text-warning-600" : accent === "vert" ? "text-success-700" : "text-gray-900";
  const inner = (
    <div className={`kpi ${href ? "card-hover cursor-pointer" : ""}`}>
      <p className="kpi-label">{libelle}</p>
      <p className={`kpi-value mt-1 ${couleur}`}>{valeur}</p>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

/** Grande porte d'un espace (Formation / Examen). */
function Porte({ icone: Icone, titre, desc, children }: { icone: LucideIcon; titre: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="card card-hover">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
        <Icone size={22} strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-lg font-semibold tracking-tight text-gray-900">{titre}</p>
      <p className="mt-1 text-sm text-gray-500">{desc}</p>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function bornesSemaineParis(): { lundi: string; dimanche: string } {
  const todayStr = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const [y, m, d] = todayStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=dim … 6=sam
  const offsetLundi = dow === 0 ? -6 : 1 - dow;
  const lundi = new Date(dt); lundi.setUTCDate(dt.getUTCDate() + offsetLundi);
  const dimanche = new Date(lundi); dimanche.setUTCDate(lundi.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { lundi: iso(lundi), dimanche: iso(dimanche) };
}

/** Indicateurs examen pour l'accueil : places libres TEF/civique de la semaine + liens de paiement en attente. */
async function examenSemaine(site: SiteFiltre) {
  const zero = { placesTef: 0, placesCiv: 0, liens: 0 };
  try {
    const { lundi, dimanche } = bornesSemaineParis();
    const { data: sessions } = await supabaseAdmin
      .from("sessions_examen")
      .select("id, type, capacite, date_examen")
      .gte("date_examen", lundi)
      .lte("date_examen", dimanche);
    const ids = (sessions ?? []).map((x: any) => x.id);
    const inscrits = new Map<string, number>();
    if (ids.length) {
      const { data: v } = await supabaseAdmin
        .from("ventes_examen")
        .select("session_id, statut_paiement")
        .in("session_id", ids);
      (v ?? []).forEach((x: any) => {
        if (x.statut_paiement !== "Annulé" && x.statut_paiement !== "Remboursé") {
          inscrits.set(x.session_id, (inscrits.get(x.session_id) ?? 0) + 1);
        }
      });
    }
    let placesTef = 0, placesCiv = 0;
    (sessions ?? []).forEach((s: any) => {
      const libres = Math.max(0, (s.capacite ?? 0) - (inscrits.get(s.id) ?? 0));
      if (s.type === "TEF_IRN") placesTef += libres;
      else if (s.type === "Examen_civique") placesCiv += libres;
    });
    let qp = supabaseAdmin
      .from("preinscriptions_examen")
      .select("id", { count: "exact", head: true })
      .not("lien_paiement", "is", null)
      .eq("statut", "en_attente");
    if (site) qp = qp.eq("agence", site);
    const { count: liens } = await qp;
    return { placesTef, placesCiv, liens: liens ?? 0 };
  } catch { return zero; }
}

/** Top vendeurs et top agences du mois (CA) pour le widget d'accueil — Direction/Manager. */
async function classementAccueil() {
  const vide = { vendeurs: [] as { nom: string; ca: number }[], agences: [] as { nom: string; ca: number }[] };
  try {
    const d = new Date();
    const depuis = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const { data: exAll } = await supabaseAdmin
      .from("ventes_examen").select("vendu_par, montant, agence, statut_paiement, created_at").gte("created_at", depuis);
    const ex = (exAll ?? []).filter((r: any) => !["Annulé", "Remboursé"].includes(r.statut_paiement));
    const { data: foAll } = await supabaseAdmin
      .from("dossiers").select("vendu_par, montant, statut, created_at, stagiaires:stagiaire_id(agence)").gte("created_at", depuis);
    const fo = (foAll ?? []).filter((r: any) => !["annule", "archive", "annulé", "archivé"].includes(String(r.statut ?? "").toLowerCase()));

    const vMap = new Map<string, { nom: string; ca: number }>();
    const aMap = new Map<string, { nom: string; ca: number }>();
    const add = (m: Map<string, { nom: string; ca: number }>, cle: string | null | undefined, montant: number | null) => {
      const nom = (cle ?? "").trim() || "(non attribué)";
      const cur = m.get(nom.toLowerCase()) ?? { nom, ca: 0 };
      cur.ca += Number(montant ?? 0);
      m.set(nom.toLowerCase(), cur);
    };
    const agence = (r: any): string | null | undefined => Array.isArray(r.stagiaires) ? r.stagiaires[0]?.agence : r.stagiaires?.agence;
    ex.forEach((r: any) => { add(vMap, r.vendu_par, r.montant); add(aMap, r.agence, r.montant); });
    fo.forEach((r: any) => { add(vMap, r.vendu_par, r.montant); add(aMap, agence(r), r.montant); });
    const top = (m: Map<string, { nom: string; ca: number }>) => [...m.values()].sort((a, b) => b.ca - a.ca).slice(0, 3);
    return { vendeurs: top(vMap), agences: top(aMap) };
  } catch { return vide; }
}

/** Tâches à faire (non clôturées), pour le widget d'accueil — filtrées par site si sélectionné. */
async function tachesAccueil(site: SiteFiltre) {
  try {
    let q = supabaseAdmin
      .from("taches")
      .select("id, titre, agence, echeance")
      .eq("actif", true).eq("fait", false)
      .order("echeance", { ascending: true, nullsFirst: false })
      .limit(40);
    if (site) q = q.eq("agence", site);
    const { data } = await q;
    return (data ?? []) as { id: string; titre: string; agence: string | null; echeance: string | null }[];
  } catch { return []; }
}

const AGENCES_ACCUEIL = ["Gagny", "Sarcelles", "Rosny"];
function aujourdhuiParis(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}
function frJour(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * Anomalies opérationnelles (examen) — pour l'indicateur d'accueil et la page /anomalies.
 * Trois registres dérivés de ventes_examen (pas de nouvelle table) :
 *  · convocations : payé, examen à venir, convocation jamais envoyée
 *  · paiements    : examen à venir avec un reste à payer (acompte non soldé)
 *  · doublons     : même candidat + même session + même type, ≥ 2 ventes actives
 */
async function anomaliesAccueil(site: SiteFiltre) {
  const zero = { convocations: 0, paiements: 0, doublons: 0, total: 0 };
  try {
    const auj = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
    let q = supabaseAdmin
      .from("ventes_examen")
      .select("id, session_id, type_examen, statut_paiement, convocation_envoyee_le, reste_a_payer, agence, stagiaires:candidat_id(nom, prenom), sessions_examen:session_id(date_examen)")
      .neq("type_examen", "Vente_plateforme")
      .not("statut_paiement", "in", '("Remboursé","Annulé")');
    if (site) q = q.eq("agence", site);
    const { data } = await q;
    const rows = (data ?? []) as any[];
    const aVenir = rows.filter((v) => v.sessions_examen?.date_examen && v.sessions_examen.date_examen >= auj);
    const convocations = aVenir.filter(
      (v) => (v.statut_paiement === "Payé" || v.statut_paiement === "Inclus CPF") && !v.convocation_envoyee_le,
    ).length;
    const paiements = aVenir.filter((v) => Number(v.reste_a_payer ?? 0) > 0).length;
    const comptes = new Map<string, number>();
    for (const v of rows) {
      const k = `${(v.stagiaires?.nom ?? "").trim().toLowerCase()}|${(v.stagiaires?.prenom ?? "").trim().toLowerCase()}|${v.session_id ?? ""}|${v.type_examen ?? ""}`;
      if (k.replace(/\|/g, "").length) comptes.set(k, (comptes.get(k) ?? 0) + 1);
    }
    let doublons = 0;
    for (const n of comptes.values()) if (n > 1) doublons += n - 1;
    return { convocations, paiements, doublons, total: convocations + paiements + doublons };
  } catch { return zero; }
}

/** Tests initiaux envoyés à distance, en attente de passation (lien e-mail envoyé, pas encore passé). */
async function testsADistanceCount() {
  try {
    const { count } = await supabaseAdmin
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .neq("phase", "final")
      .eq("statut", "en_cours")
      .not("email", "is", null);
    return count ?? 0;
  } catch { return 0; }
}

/** Liste (courte) des conventions de formation envoyées à signer et non encore signées. */
async function conventionsListe() {
  try {
    const { data } = await supabaseAdmin
      .from("v_conventions_a_relancer")
      .select("dossier_id, envoyee_le, stagiaire_nom, stagiaire_prenom, stagiaire_email")
      .order("envoyee_le", { ascending: true })
      .limit(8);
    return (data ?? []) as { dossier_id: string; envoyee_le: string | null; stagiaire_nom: string; stagiaire_prenom: string; stagiaire_email: string | null }[];
  } catch { return []; }
}

/** Ancienneté en jours d'un envoi (pour l'affichage « il y a N j »). */
function joursDepuis(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export default async function Accueil() {
  const site = siteValide(cookies().get(COOKIE_SITE)?.value);
  const [c, t, cf, ex, cl, tk, an, testsDist, convListe] = await Promise.all([
    compter(site), aTraiter(site), conformiteFormateurs(), examenSemaine(site), classementAccueil(), tachesAccueil(site),
    anomaliesAccueil(site), testsADistanceCount(), conventionsListe(),
  ]);

  // Rôle de la session (filtrage du périmètre — défense en profondeur, en plus du middleware).
  const h = headers();
  const sessionReq = new Request("http://internal/", {
    headers: { cookie: h.get("cookie") ?? "", authorization: h.get("authorization") ?? "" },
  });
  const user = await verifySession(sessionReq);
  const role = user?.role ?? null;
  const voir = (href: string) => peutVoirPage(role, href);

  const actions = [
    { label: "Liens de paiement à traiter", n: ex.liens, href: "/examens/preinscriptions" },
    { label: "Réclamations à traiter", n: t.reclamations, href: "/reclamations" },
    { label: "Participations 150 € à régler", n: t.participation, href: "/formation" },
    { label: "Identités CPF à confirmer", n: t.identite, href: "/formation" },
    { label: "Congés en attente", n: t.conges, href: "/conges" },
    { label: "Validations Direction en attente", n: t.validations, href: "/validations" },
    { label: "Messages prospects", n: t.messages, href: "/messages" },
    { label: "Questions internes ouvertes", n: t.questionsInternes, href: "/interne" },
    { label: "Documents formateur à signer", n: t.formateurDocs, href: "/formateurs" },
    { label: "Formatrices sans justificatif FLE (séance à venir)", n: cf.fleManquant.length, href: "/equipe" },
    { label: "Charte/contrat formateur à signer (séance à venir)", n: cf.docsManquant.length, href: "/formateurs" },
    { label: "Incidents techniques", n: t.incidents, href: "/incidents" },
  ].filter((a) => a.n > 0 && voir(a.href));

  // Tuiles transverses, filtrées selon le rôle.
  const tuiles: { href: string; icone: LucideIcon; titre: string; desc: string }[] = [
    { href: "/equipe", icone: Users, titre: "Équipe", desc: "Formateurs (justificatifs FLE) et commerciaux." },
    { href: "/reclamations", icone: MessageSquareWarning, titre: "Réclamations", desc: "Candidats examen & stagiaires formation." },
    { href: "/factures", icone: Receipt, titre: "Factures", desc: "Facturation et relances." },
    { href: "/bpf", icone: FileSpreadsheet, titre: "BPF", desc: "Bilan pédagogique et financier." },
    { href: "/taches", icone: ListChecks, titre: "Tâches par agence", desc: "Le pense-bête opérationnel de chaque site." },
  ].filter((tu) => voir(tu.href));

  const heure = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit" });
  const salut = parseInt(heure) < 18 ? "Bonjour" : "Bonsoir";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      {/* En-tête */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/embleme-bleu.png" alt="MYSTORY" className="h-11 w-auto" />
          <div>
            <h1 className="page-title text-2xl">{salut}</h1>
            <p className="page-subtitle">
              Tableau de bord MYSTORY — Formation &amp; Examen.
              <span className="badge badge-info ml-2 align-middle">{site ? `Site : ${site}` : "Tous les sites"}</span>
            </p>
          </div>
        </div>
      </header>

      {/* Notifications — alertes prioritaires */}
      {(t.participation > 0 || testsDist > 0) && (
        <div className="mb-6 space-y-2">
          {t.participation > 0 && (
            <Link href="/formation" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
              <AlertTriangle size={18} strokeWidth={1.9} className="shrink-0 text-amber-600" />
              <span><strong>{t.participation}</strong> participation{t.participation > 1 ? "s" : ""} forfaitaire{t.participation > 1 ? "s" : ""} manquante{t.participation > 1 ? "s" : ""} — à régler avant l&apos;entrée en formation.</span>
              <ChevronRight size={16} className="ml-auto shrink-0 text-amber-400" />
            </Link>
          )}
          {testsDist > 0 && (
            <Link href="/formation" className="flex items-center gap-3 rounded-xl border border-mystory/20 bg-mystory-clair px-4 py-3 text-sm text-mystory-fonce hover:brightness-95">
              <Send size={18} strokeWidth={1.9} className="shrink-0 text-mystory" />
              <span><strong>{testsDist}</strong> test{testsDist > 1 ? "s" : ""} initial envoyé{testsDist > 1 ? "s" : ""} à distance — en attente de passation.</span>
              <ChevronRight size={16} className="ml-auto shrink-0 text-mystory/60" />
            </Link>
          )}
        </div>
      )}

      {/* Compteurs — formation */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi libelle="Dossiers de formation en cours" valeur={String(c.enCours)} href="/dossiers?vue=incomplet" />
        <Kpi libelle="Dossiers de formation à finaliser" valeur={String(c.aFinaliser)} accent={c.aFinaliser > 0 ? "ambre" : undefined} href="/dossiers?vue=a_finaliser" />
        <Kpi libelle="Fins de formation proches" valeur={String(c.finsProches)} accent={c.finsProches > 0 ? "ambre" : undefined} href="/suivi-eleves?filtre=fins_proches" />
        <Kpi libelle="Anomalies" valeur={String(an.total)} accent={an.total > 0 ? "ambre" : "vert"} href="/anomalies" />
      </div>

      {/* Examen — cette semaine */}
      <div className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Examen — cette semaine</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi libelle="Places TEF IRN (semaine)" valeur={String(ex.placesTef)} accent={ex.placesTef === 0 ? "ambre" : undefined} href="/examens/sessions" />
          <Kpi libelle="Places civique (semaine)" valeur={String(ex.placesCiv)} accent={ex.placesCiv === 0 ? "ambre" : undefined} href="/examens/sessions" />
          <Kpi libelle="Liens de paiement en attente" valeur={String(ex.liens)} accent={ex.liens > 0 ? "ambre" : undefined} href="/examens/preinscriptions" />
        </div>
      </div>

      {(role === "direction" || role === "manager" || role === "staff" || !role) && (
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Classement du mois</h2>
            <Link href="/classement" className="text-xs text-mystory underline">Voir tout</Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="card">
              <p className="mb-2 text-xs font-semibold text-gray-500">Top vendeurs</p>
              {cl.vendeurs.length === 0 ? <p className="text-sm text-gray-400">—</p> : cl.vendeurs.map((v, i) => (
                <div key={v.nom} className="flex justify-between py-0.5 text-sm">
                  <span>{["🥇", "🥈", "🥉"][i] ?? ""} {v.nom}</span>
                  <span className="font-medium text-gray-900">{Math.round(v.ca)} €</span>
                </div>
              ))}
            </div>
            <div className="card">
              <p className="mb-2 text-xs font-semibold text-gray-500">Top agences</p>
              {cl.agences.length === 0 ? <p className="text-sm text-gray-400">—</p> : cl.agences.map((a, i) => (
                <div key={a.nom} className="flex justify-between py-0.5 text-sm">
                  <span>{["🥇", "🥈", "🥉"][i] ?? ""} {a.nom}</span>
                  <span className="font-medium text-gray-900">{Math.round(a.ca)} €</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conventions de formation à relancer — mini-liste */}
      {convListe.length > 0 && (
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <FileSignature size={16} strokeWidth={1.9} className="text-mystory" />
              Conventions de formation à relancer
            </h2>
            <Link href="/dossiers" className="text-xs text-mystory underline">Voir tout</Link>
          </div>
          <div className="card !p-0 divide-y divide-gray-100">
            {convListe.map((cv) => {
              const j = joursDepuis(cv.envoyee_le);
              return (
                <Link key={cv.dossier_id} href="/dossiers"
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{cv.stagiaire_prenom} {cv.stagiaire_nom}</p>
                    <p className="truncate text-xs text-gray-500">{cv.stagiaire_email ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-xs ${j != null && j >= 7 ? "font-medium text-red-600" : "text-gray-400"}`}>
                      {j == null ? "—" : j === 0 ? "envoyée aujourd'hui" : `envoyée il y a ${j} j`}
                    </span>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* À traiter */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">À traiter</p>
      {actions.length === 0 ? (
        <div className="card mb-8">
          <div className="empty-state">
            <CheckCircle2 size={28} strokeWidth={1.75} className="text-success-600" />
            <p className="text-sm font-medium text-gray-700">Tout est à jour</p>
            <p className="text-xs text-gray-400">Aucune action en attente sur votre périmètre.</p>
          </div>
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a) => (
            <Link key={a.label} href={a.href}
              className="card card-hover flex items-center justify-between gap-3 !p-4">
              <span className="text-sm text-gray-700">{a.label}</span>
              <span className="badge badge-warning shrink-0">{a.n}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Tâches à faire par agence */}
      {tk.length > 0 && (() => {
        const auj = aujourdhuiParis();
        const cles = Array.from(new Set(tk.map((x) => x.agence ?? "—")));
        cles.sort((a, b) => ((AGENCES_ACCUEIL.indexOf(a) + 1) || 99) - ((AGENCES_ACCUEIL.indexOf(b) + 1) || 99));
        return (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Tâches à faire</p>
              <Link href="/taches" className="text-xs text-mystory underline">Gérer</Link>
            </div>
            <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cles.map((ag) => {
                const items = tk.filter((x) => (x.agence ?? "—") === ag);
                return (
                  <div key={ag} className="card">
                    <p className="mb-2 text-xs font-semibold text-gray-500">{ag}</p>
                    {items.slice(0, 5).map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                        <span className="truncate text-gray-700">{it.titre}</span>
                        {it.echeance && (
                          <span className={`shrink-0 text-xs ${it.echeance < auj ? "font-medium text-red-600" : "text-gray-400"}`}>{frJour(it.echeance)}</span>
                        )}
                      </div>
                    ))}
                    {items.length > 5 && <p className="mt-1 text-xs text-gray-400">+{items.length - 5} autre(s)</p>}
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Deux grandes portes */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Porte icone={GraduationCap} titre="Espace Formation"
          desc="Inscriptions, suivi des dossiers, tests de positionnement, émargement, import EDOF.">
          {voir("/formation") && (
            <Link href="/formation" className="btn-ghost">Ouvrir l'espace <ArrowRight size={16} /></Link>
          )}
          {voir("/inscriptions/nouvelle") && (
            <Link href="/inscriptions/nouvelle" className="btn-primary"><Plus size={16} /> Inscription Formation</Link>
          )}
        </Porte>

        <Porte icone={ClipboardList} titre="Espace Examen"
          desc="Inscriptions, sessions, jour J, corrections, classement des vendeurs — centre d'examen : Gagny.">
          <Link href="/examen" className="btn-ghost">Ouvrir l'espace <ArrowRight size={16} /></Link>
          <Link href="/examens/vente-groupe" className="btn-primary"><Plus size={16} /> Inscription Examen</Link>
        </Porte>
      </div>

      {/* Transverse */}
      {tuiles.length > 0 && (
        <>
          <p className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-gray-400">Transverse</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tuiles.map((tu) => {
              const Icone = tu.icone;
              return (
                <Link key={tu.href} href={tu.href} className="card card-hover group">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mystory-clair text-mystory-fonce">
                    <Icone size={20} strokeWidth={1.75} />
                  </div>
                  <p className="mt-3 font-semibold text-gray-900 group-hover:text-mystory">{tu.titre}</p>
                  <p className="mt-1 text-sm text-gray-500">{tu.desc}</p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
