/**
 * MYSTORY — /api/cron/convocations-partenaire · Convocation J-7 des candidats
 * presentes par un organisme partenaire (Secure Academy et suivants).
 *
 * POURQUOI UNE ROUTE DEDIEE. Accepter une demande partenaire passe simplement son
 * statut a « confirmee » : cela ne cree ni stagiaire ni vente. Le candidat d'un
 * partenaire n'est pas une vente — c'est le partenaire qu'on facture, pas lui.
 * La machinerie de convocation existante, adossee aux ventes, ne se declenche
 * donc jamais pour ces candidats. Sans cette route, personne ne les convoque.
 *
 * GET  → apercu JSON : qui serait convoque, et pourquoi. N'ENVOIE RIEN.
 * POST → genere et envoie. ?dryRun=1 calcule sans envoyer.
 *
 * IDEMPOTENCE. convocation_envoyee_le est pose APRES un envoi reussi, et lui seul
 * ferme le dossier. Rejouer la route ne renvoie jamais une convocation deja
 * partie. En cas d'echec on ecrit le motif et on incremente le compteur : au-dela
 * de trois tentatives, on cesse d'essayer et on le signale.
 *
 * CE QUE CETTE ROUTE NE FAIT PAS. Elle ne ment pas sur son resultat. Les pannes
 * des 9 et 10 septembre ont coute des convocations parce qu'un echec d'envoi
 * etait rapporte comme un succes. Ici, un envoi rate est compte comme rate, la
 * reponse porte le detail, et le statut HTTP devient 207 des qu'un seul echoue.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fusionExamen, valeursCachet, dateFR, lieuDuCentre, journal } from "@/lib/examens";
import { renderHtmlToPdf } from "@/lib/docuseal";
import { envoyerEmail, gabaritEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Delai entre l'envoi de la convocation et l'examen, en jours. */
const JOURS_AVANT = Number(process.env.CONVOCATION_PARTENAIRE_JOURS ?? 7);
/** Copie cachee : permet de verifier ce qui est reellement parti. */
const COPIE = process.env.SECRETARIAT_EMAIL ?? "secretariat@mystoryformation.fr";
/** Au-dela, on arrete de reessayer : l'adresse est probablement fausse. */
const MAX_TENTATIVES = 3;

async function garde(req: NextRequest): Promise<NextResponse | SessionUser> {
  try { return await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    }
    throw e;
  }
}

/** Date cible au format ISO, en heure de Paris — pas en UTC. Un cron qui tourne
 *  a 23 h UTC un soir d'ete viserait sinon le mauvais jour. */
function dateCibleISO(): string {
  const maintenant = new Date();
  const paris = new Date(maintenant.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  paris.setDate(paris.getDate() + JOURS_AVANT);
  const a = paris.getFullYear();
  const m = String(paris.getMonth() + 1).padStart(2, "0");
  const j = String(paris.getDate()).padStart(2, "0");
  return `${a}-${m}-${j}`;
}

/** « 14h-17h » → { debut: "14h00", fin: "17h00" }. Tolere « 14h00 - 17h00 ». */
function bornesHoraire(h: string | null | undefined): { debut: string; fin: string } {
  const m = String(h ?? "").match(/(\d{1,2})\s*h\s*(\d{2})?\s*[-–]\s*(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return { debut: String(h ?? ""), fin: "" };
  return {
    debut: `${m[1].padStart(2, "0")}h${m[2] ?? "00"}`,
    fin: `${m[3].padStart(2, "0")}h${m[4] ?? "00"}`,
  };
}

type Ligne = {
  id: string;
  nom: string;
  prenom: string;
  civilite: string | null;
  email: string | null;
  partenaire: string;
  type: string;
  sous_type: string | null;
  centre: string | null;
  date_examen: string;
  horaire: string | null;
  tentatives: number;
};

/** Les candidats a convoquer : confirmes, sur une session a J-7, jamais convoques. */
async function aConvoquer(): Promise<{ cible: string; lignes: Ligne[]; ignores: string[] }> {
  const cible = dateCibleISO();
  const ignores: string[] = [];

  const { data: sessions } = await supabaseAdmin
    .from("sessions_examen")
    .select("id, date_examen, horaire, type, centre")
    .eq("date_examen", cible);

  if (!sessions?.length) return { cible, lignes: [], ignores };

  const { data: demandes } = await supabaseAdmin
    .from("demandes_inscription_partenaire")
    .select("id, candidat_nom, candidat_prenom, candidat_civilite, candidat_email, "
          + "session_id, sous_type, convocation_tentatives, "
          + "partenaires:partenaire_id (raison_sociale)")
    .in("session_id", sessions.map((s: any) => s.id))
    .eq("statut", "confirmee")
    .is("convocation_envoyee_le", null);

  const parSession = new Map(sessions.map((s: any) => [s.id, s]));
  const lignes: Ligne[] = [];

  for (const d of (demandes ?? []) as any[]) {
    const s = parSession.get(d.session_id);
    if (!s) continue;
    const p = Array.isArray(d.partenaires) ? d.partenaires[0] : d.partenaires;
    const nomComplet = `${d.candidat_prenom ?? ""} ${d.candidat_nom ?? ""}`.trim();

    if (Number(d.convocation_tentatives ?? 0) >= MAX_TENTATIVES) {
      ignores.push(`${nomComplet} — ${MAX_TENTATIVES} tentatives échouées, à reprendre à la main`);
      continue;
    }
    if (!d.candidat_email) {
      ignores.push(`${nomComplet} — aucune adresse e-mail au dossier`);
      continue;
    }
    lignes.push({
      id: d.id,
      nom: String(d.candidat_nom ?? ""),
      prenom: String(d.candidat_prenom ?? ""),
      civilite: d.candidat_civilite ?? null,
      email: String(d.candidat_email),
      partenaire: String(p?.raison_sociale ?? "—"),
      type: String(s.type ?? ""),
      sous_type: d.sous_type ?? null,
      centre: s.centre ?? null,
      date_examen: String(s.date_examen),
      horaire: s.horaire ?? null,
      tentatives: Number(d.convocation_tentatives ?? 0),
    });
  }
  return { cible, lignes, ignores };
}

export async function GET(req: NextRequest) {
  const g = await garde(req);
  if (g instanceof NextResponse) return g;
  const { cible, lignes, ignores } = await aConvoquer();
  return NextResponse.json({
    ok: true,
    apercu: true,
    date_examen_visee: cible,
    jours_avant: JOURS_AVANT,
    a_convoquer: lignes.length,
    candidats: lignes.map((l) => ({
      nom: `${l.prenom} ${l.nom}`, partenaire: l.partenaire,
      type: l.type, centre: l.centre, horaire: l.horaire, tentatives: l.tentatives,
    })),
    ignores,
  });
}

export async function POST(req: NextRequest) {
  const g = await garde(req);
  if (g instanceof NextResponse) return g;
  const auteur = (g as SessionUser).email ?? "cron";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const { cible, lignes, ignores } = await aConvoquer();
  if (!lignes.length) {
    return NextResponse.json({
      ok: true, date_examen_visee: cible, envoyes: 0, echecs: 0, ignores,
      message: "Aucun candidat partenaire à convoquer pour cette date.",
    });
  }
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, date_examen_visee: cible,
      auraient_ete_envoyes: lignes.length,
      candidats: lignes.map((l) => `${l.prenom} ${l.nom} <${l.email}>`),
      ignores,
    });
  }

  const cachet = valeursCachet();
  const envoyes: string[] = [];
  const echecs: Array<{ candidat: string; erreur: string }> = [];

  for (const l of lignes) {
    const nomComplet = `${l.prenom} ${l.nom}`.trim();
    try {
      const lieu = await lieuDuCentre(l.centre);
      const { debut, fin } = bornesHoraire(l.horaire);
      const civique = l.type.toLowerCase().includes("civique");

      const valeurs: Record<string, string | null> = {
        ...cachet,
        civilite: l.civilite ?? "",
        nom: l.nom,
        prenom: l.prenom,
        date_examen: dateFR(l.date_examen),
        heure_debut: debut,
        heure_fin: fin,
        lieu_examen: lieu.adresse,
        acces_examen: lieu.acces,
        date_emission: dateFR(new Date().toISOString().slice(0, 10)),
        of_siret: process.env.MYSTORY_SIRET ?? "913 423 083 00017",
        of_nda: process.env.MYSTORY_NDA ?? "11756521775",
        of_rcs: process.env.MYSTORY_RCS ?? "Paris 913 423 083",
        of_email: "contact@mystoryformation.fr",
        of_tel: "01 89 74 49 01",
        // Le gabarit civique attend une mention cochee ; on n'en coche aucune si
        // le sous-type est absent plutot que d'en supposer une.
        civ_pluriannuelle: l.sous_type?.toLowerCase().includes("pluriannuelle") ? "1" : null,
        civ_resident: l.sous_type?.toLowerCase().includes("résident") ? "1" : null,
        civ_naturalisation: l.sous_type?.toLowerCase().includes("naturalisation") ? "1" : null,
      };

      const template = civique ? "convocation_examen_civique" : "convocation_examen_tef";
      const nomFichier = `Convocation_${civique ? "civique" : "TEF"}_${l.nom}.pdf`;
      const html = fusionExamen(template, valeurs);
      const { pdf } = await renderHtmlToPdf({ html, name: nomFichier });

      // Archivage avant envoi : si l'email echoue, le document existe quand meme
      // et l'equipe peut le renvoyer a la main.
      await supabaseAdmin.storage
        .from("documents")
        .upload(`partenaires/${l.id}/convocation.pdf`, pdf,
                { contentType: "application/pdf", upsert: true });

      const corps = `
        <p>Bonjour ${l.civilite ? `${l.civilite} ` : ""}${l.prenom} ${l.nom},</p>
        <p>Vous êtes convoqué(e) à votre examen
        <strong>${civique ? "Examen civique" : "TEF IRN"}</strong>${l.sous_type ? ` — ${l.sous_type}` : ""}.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 14px 4px 0"><strong>Date</strong></td>
              <td style="padding:4px 0">${dateFR(l.date_examen)}</td></tr>
          <tr><td style="padding:4px 14px 4px 0"><strong>Horaire</strong></td>
              <td style="padding:4px 0">${debut}${fin ? ` – ${fin}` : ""}</td></tr>
          <tr><td style="padding:4px 14px 4px 0"><strong>Lieu</strong></td>
              <td style="padding:4px 0">${lieu.adresse}</td></tr>
        </table>
        <p><strong>Accès :</strong> ${lieu.acces}</p>
        <p><strong>À apporter obligatoirement :</strong> votre pièce d'identité en cours de
        validité, celle-là même dont le numéro figure sur votre inscription. Sans elle,
        le passage ne peut pas avoir lieu.</p>
        <p>Présentez-vous <strong>15 minutes avant</strong> le début de l'épreuve. Tout retard
        au-delà de l'heure de début empêche l'accès à la salle.</p>
        <p>Votre convocation est jointe à ce message.</p>
        <p>Votre inscription a été prise en charge par <strong>${l.partenaire}</strong>.
        Vous n'avez aucun règlement à effectuer auprès de MYSTORY.</p>`;

      const env = await envoyerEmail({
        a: l.email as string,
        copieCachee: COPIE,
        objet: `Convocation — ${civique ? "Examen civique" : "TEF IRN"} du ${dateFR(l.date_examen)}`,
        html: gabaritEmail("Votre convocation", corps),
        piecesJointes: [{ nom: nomFichier, contenu: pdf }],
        entite: "demandes_inscription_partenaire",
        entiteId: l.id,
        auteur,
      });

      if (!env.ok) throw new Error(env.erreur ?? "Envoi refusé sans motif.");

      await supabaseAdmin
        .from("demandes_inscription_partenaire")
        .update({ convocation_envoyee_le: new Date().toISOString(), convocation_erreur: null })
        .eq("id", l.id);
      envoyes.push(nomComplet);

    } catch (err: any) {
      const motif = String(err?.message ?? err);
      // On trace l'echec EN BASE. Un echec silencieux est ce qui a coute les
      // convocations des 9 et 10 septembre.
      await supabaseAdmin
        .from("demandes_inscription_partenaire")
        .update({ convocation_erreur: motif, convocation_tentatives: l.tentatives + 1 })
        .eq("id", l.id);
      echecs.push({ candidat: nomComplet, erreur: motif });
    }
  }

  await journal("demandes_inscription_partenaire", null, "convocations_partenaire_j7",
    { date_examen: cible, envoyes: envoyes.length, echecs: echecs.length, ignores: ignores.length },
    auteur);

  // 207 des qu'un seul envoi echoue : l'appelant ne doit pas lire « 200 » comme
  // « tout est parti ».
  return NextResponse.json(
    { ok: echecs.length === 0, date_examen_visee: cible,
      envoyes: envoyes.length, candidats_envoyes: envoyes,
      echecs: echecs.length, detail_echecs: echecs, ignores },
    { status: echecs.length ? 207 : 200 },
  );
}
