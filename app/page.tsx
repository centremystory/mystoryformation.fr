// app/page.tsx — Accueil du CRM (Design 1C, page de référence SaaS épuré).
// Tableau de bord à deux espaces (Formation / Examen) : compteurs temps réel,
// file « À traiter », deux grandes portes, tuiles transverses.
// Logique de comptage / rôle / filtrage INCHANGÉE — seul le rendu a été refondu.
import Link from "next/link";
import { cookies, headers } from "next/headers";
import {
  GraduationCap, ClipboardList, Users, Receipt, FileSpreadsheet, ListChecks,
  Plus, ArrowRight, CheckCircle2,
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
  const zero = { participation: 0, identite: 0, conges: 0, messages: 0, formateurDocs: 0, incidents: 0, validations: 0, questionsInternes: 0 };
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

export default async function Accueil() {
  const site = siteValide(cookies().get(COOKIE_SITE)?.value);
  const [c, t, cf, ex, cl, tk] = await Promise.all([compter(site), aTraiter(site), conformiteFormateurs(), examenSemaine(site), classementAccueil(), tachesAccueil(site)]);

  // Rôle de la session (filtrage du périmètre — défense en profondeur, en plus du middleware).
  const h = headers();
  const sessionReq = new Request("http://internal/", {
    headers: { cookie: h.get("cookie") ?? "", authorization: h.get("authorization") ?? "" },
  });
  const user = await verifySession(sessionReq);
  const role = user?.role ?? null;
  const voir = (href: string) => peutVoirPage(role, href);

  const actions = [
    { label: "Conventions à relancer", n: c.aRelancer, href: "/formation" },
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

      {/* Compteurs */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi libelle="Dossiers en cours" valeur={String(c.enCours)} href="/dossiers?vue=incomplet" />
        <Kpi libelle="Dossiers à finaliser" valeur={String(c.aFinaliser)} accent={c.aFinaliser > 0 ? "ambre" : undefined} href="/dossiers?vue=a_finaliser" />
        <Kpi libelle="Conventions à relancer" valeur={String(c.aRelancer)} accent={c.aRelancer > 0 ? "ambre" : undefined} href="/dossiers" />
        <Kpi libelle="Fins de formation proches" valeur={String(c.finsProches)} accent={c.finsProches > 0 ? "ambre" : undefined} href="/suivi-eleves?filtre=fins_proches" />
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
