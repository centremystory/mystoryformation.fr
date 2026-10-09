/**
 * MYSTORY — /api/liens-candidat  (INTERNE — session d'équipe exigée)
 *
 * C'est par ici que l'équipe FABRIQUE les liens nominatifs à envoyer au
 * candidat. Sans cette route, les quatre pages publiques existent mais personne
 * ne peut en obtenir l'adresse — et un outil qu'on ne sait pas déclencher n'est
 * pas un outil.
 *
 *   GET  /api/liens-candidat?dossier=<uuid>   l'état des liens de ce dossier
 *   POST /api/liens-candidat                  { dossier, type } → l'URL à envoyer
 *
 * ⚠️ ROUTE INTERNE. Elle n'est PAS dans `CHEMINS_PUBLICS` du middleware, donc
 * elle exige une session d'équipe. C'est la différence de nature avec les quatre
 * pages : celles-là s'ouvrent avec un jeton, celle-ci FABRIQUE les jetons. La
 * laisser passer en public donnerait à n'importe qui le moyen de s'ouvrir un
 * lien vers n'importe quel dossier — soit exactement la porte que les jetons
 * ferment.
 *
 * ── CE QUE LE GET REND, ET POURQUOI ─────────────────────────────────────────
 *
 * Pas seulement les liens : aussi l'ÉTAT de chaque démarche (voie d'identité
 * choisie, devis accepté, participation réglée ou exonérée). Parce que la vraie
 * question de l'équipe n'est pas « quelle est l'URL », c'est « où en est ce
 * candidat, et qu'est-ce qu'il me reste à lui envoyer ». Rendre les deux
 * ensemble évite d'aller lire la fiche en parallèle — c'est-à-dire évite la 5e
 * recopie à la main.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import {
  TYPES_LIEN, type TypeLien, creerLien, lienCandidat, contexteDossier,
  etatParticipation, DUREE_JOURS, TICKET_MODERATEUR,
} from "@/lib/liensCandidat";
import { baseCrm } from "@/lib/liensCandidatPages";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const estType = (v: unknown): v is TypeLien =>
  (TYPES_LIEN as readonly string[]).includes(String(v ?? ""));

export async function GET(req: NextRequest) {
  /* 09/10/2026 — `requireUser` ne suffisait PAS ici, et une revue de sécurité l'a
     relevé. Cette route FABRIQUE les jetons : un lien qu'elle émet fait accepter un
     devis et ouvre un paiement, et sa lecture expose le nom et le courriel du
     candidat. Toute session authentifiée pouvait en demander un, pour N'IMPORTE quel
     dossier. Or on a mesuré le 09/10 qu'un jeton de portail partenaire ouvrait déjà
     des pages du back-office : « authentifié » ne veut pas dire « habilité ».
     Même garde que `dossiers/depuis-vente`, qui est l'acte voisin : conseillères,
     secrétariat, encadrement. Pas les formatrices, qui n'envoient pas de devis. */
  let auth;
  try {
    auth = await requireRole(req, ["direction", "manager", "commercial", "back_office"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Action réservée à l'équipe commerciale, au secrétariat et à la direction." }, { status: 403 });
    throw e;
  }

  const dossier = req.nextUrl.searchParams.get("dossier") ?? "";
  if (!dossier) return NextResponse.json({ ok: false, erreur: "Paramètre `dossier` manquant." }, { status: 400 });

  const c = await contexteDossier(dossier);
  if (!c) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  const { data } = await supabaseAdmin
    .from("liens_candidat")
    .select("id, type, cree_le, expire_le, utilise_le, revoque_le, cree_par, jeton")
    .eq("dossier_id", dossier)
    .order("cree_le", { ascending: false });

  const base = baseCrm();
  const liens = (data ?? []).map((l: Record<string, any>) => ({
    type: String(l.type),
    url: lienCandidat(base, String(l.type) as TypeLien, String(l.jeton)),
    cree_le: l.cree_le,
    expire_le: l.expire_le,
    utilise_le: l.utilise_le,
    revoque_le: l.revoque_le,
    cree_par: l.cree_par,
    /* « Vivant » = ni révoqué, ni périmé. C'est la seule colonne que l'équipe
       regarde vraiment : un lien mort doit être renvoyé, pas rafistolé. */
    vivant: !l.revoque_le && new Date(String(l.expire_le)).getTime() > Date.now(),
  }));

  return NextResponse.json({
    ok: true,
    dossier: {
      id: c.dossierId,
      candidat: `${c.prenom} ${c.nom}`.trim(),
      email: c.email,
      heures: c.heuresPrevues,
      montant: c.montant,
      financement: c.financement,
      numero_edof: c.numeroEdof,
    },
    /* L'état de chaque démarche — ce qu'il reste à faire, en clair. */
    etat: {
      identite_voie: c.verificationIdentiteVoie,
      identite_statut: c.verificationIdentite,
      devis_accepte_le: c.devisAccepteLe,
      participation: etatParticipation(c),
      participation_montant: TICKET_MODERATEUR,
      exoneration_demandee_le: c.exonerationDemandeeLe,
    },
    liens,
  });
}

export async function POST(req: NextRequest) {
  /* 09/10/2026 — `requireUser` ne suffisait PAS ici, et une revue de sécurité l'a
     relevé. Cette route FABRIQUE les jetons : un lien qu'elle émet fait accepter un
     devis et ouvre un paiement, et sa lecture expose le nom et le courriel du
     candidat. Toute session authentifiée pouvait en demander un, pour N'IMPORTE quel
     dossier. Or on a mesuré le 09/10 qu'un jeton de portail partenaire ouvrait déjà
     des pages du back-office : « authentifié » ne veut pas dire « habilité ».
     Même garde que `dossiers/depuis-vente`, qui est l'acte voisin : conseillères,
     secrétariat, encadrement. Pas les formatrices, qui n'envoient pas de devis. */
  let auth;
  try {
    auth = await requireRole(req, ["direction", "manager", "commercial", "back_office"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Action réservée à l'équipe commerciale, au secrétariat et à la direction." }, { status: 403 });
    throw e;
  }

  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 });
  }
  const b = corps as Record<string, unknown>;

  const dossier = String(b.dossier ?? "").trim();
  if (!dossier) return NextResponse.json({ ok: false, erreur: "`dossier` manquant." }, { status: 400 });
  if (!estType(b.type)) {
    return NextResponse.json(
      { ok: false, erreur: `\`type\` doit valoir : ${TYPES_LIEN.join(", ")}.` }, { status: 400 },
    );
  }
  const type = b.type;

  const c = await contexteDossier(dossier);
  if (!c) return NextResponse.json({ ok: false, erreur: "Dossier introuvable." }, { status: 404 });

  /* ⚠️ AVERTISSEMENT, PAS REFUS : fabriquer un lien de participation pour un
     dossier qui n'en doit pas est presque toujours une erreur — mais pas
     toujours (on peut vouloir montrer au candidat qu'il est bien exonéré). On
     rend donc le lien ET l'avertissement, et c'est l'humain qui décide d'envoyer
     ou non. Refuser obligerait à contourner la route le jour où le cas légitime
     se présente. */
  const avertissements: string[] = [];
  if (type === "participation") {
    const etat = etatParticipation(c);
    if (etat !== "due") {
      avertissements.push(
        etat === "reglee" ? "La participation est déjà réglée : la page dira au candidat qu'il n'a rien à payer."
        : etat === "exoneree" ? "Le candidat est exonéré : la page le lui dira, aucun paiement ne sera demandé."
        : "Ce dossier n'est pas financé par le CPF : la page dira au candidat que cette participation ne le concerne pas.",
      );
    }
  }
  if (type === "devis" && c.devisAccepteLe) {
    avertissements.push("Le devis a déjà été accepté : la page affichera l'horodatage de l'acceptation.");
  }
  if (type === "devis" && !c.seances.length) {
    avertissements.push("Aucune séance au planning : le devis dira que les dates seront fixées ensemble.");
  }

  const r = await creerLien(dossier, type, auth.email ?? "equipe");
  if (!r.ok || !r.jeton) {
    return NextResponse.json({ ok: false, erreur: r.erreur ?? "Création impossible." }, { status: 500 });
  }

  const url = lienCandidat(baseCrm(), type, r.jeton);

  /* Tracé dans `journal` sur l'entité `dossiers` : c'est là que l'équipe regarde
     l'historique d'un dossier. Le jeton N'Y FIGURE PAS — un journal consultable
     ne doit pas contenir la clé d'accès qu'il décrit. */
  await journal("dossiers", dossier, "lien_candidat_cree", {
    type, expire_dans_jours: DUREE_JOURS[type], avertissements,
  }, auth.email ?? "equipe");

  return NextResponse.json({
    ok: true,
    type,
    url,
    expire_le: new Date(Date.now() + DUREE_JOURS[type] * 86_400_000).toISOString(),
    candidat: `${c.prenom} ${c.nom}`.trim(),
    email: c.email,
    avertissements,
  });
}
