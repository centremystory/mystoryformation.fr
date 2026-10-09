/**
 * MYSTORY — POST /api/inscription-examen  (PUBLIC)
 *
 * Reçoit le formulaire d'inscription en ligne, crée la pré-inscription avec l'identité
 * COMPLÈTE, puis renvoie au candidat son lien de paiement.
 *
 * Trois règles qui tiennent tout :
 *
 * 1. **Le montant est recalculé ici.** Il n'est jamais lu depuis le formulaire. Un prix
 *    qui transite par le navigateur est un prix modifiable avec les outils de
 *    développement : on encaisserait 1 € pour un examen à 185 €.
 *
 * 2. **La session est relue ici.** Entre l'affichage de la page et l'envoi du
 *    formulaire, la dernière place a pu partir. On refuse plutôt que de vendre deux
 *    fois le même siège.
 *
 * 3. **Rien n'est compté comme vendu.** La pré-inscription reste « en_attente » tant
 *    que Mollie n'a pas confirmé l'encaissement. C'est exactement l'erreur qu'on a
 *    passé la journée à réparer en aval : une inscription enregistrée avant paiement,
 *    c'est un candidat attendu qui n'a peut-être jamais réglé.
 *
 * Si le relais de paiement n'est pas joignable, on NE PERD PAS le candidat : la
 * pré-inscription est conservée, le secrétariat est prévenu, et le message invite à
 * attendre le lien par e-mail. Un formulaire rempli est un client ; on ne le jette pas
 * parce qu'un appel réseau a échoué.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calculerMontant } from "@/lib/tarifsExamen";
import { lireSession, MOTIVATIONS_CCI, MENTIONS_CIVIQUE, jourLisible, euros } from "@/lib/inscriptionEnLigne";
import { envoyerEmail, gabaritEmail, adresseValide } from "@/lib/email";
import { creerPaiement, molliePret } from "@/lib/mollie";
import { urlDeBase } from "@/lib/appUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vente en ligne : attribuée à Aru (décision du 28/09/2026). */
const VENDEUR_EN_LIGNE = "Aru";
const AGENCE_EN_LIGNE = "Rosny";

const OBLIGATOIRES = [
  "session_id", "civilite", "genre", "nom", "prenom", "date_naissance", "lieu_naissance",
  "nationalite", "langue_maternelle", "telephone", "email", "adresse", "code_postal",
  "ville", "pays", "sous_type", "piece_identite",
] as const;

const s = (v: unknown) => String(v ?? "").trim();

/** Limite simple par IP : 5 inscriptions par quart d'heure suffisent largement. */
const recents = new Map<string, number[]>();
function tropDeTentatives(ip: string): boolean {
  const t = Date.now();
  const liste = (recents.get(ip) ?? []).filter((x) => t - x < 900_000);
  liste.push(t);
  recents.set(ip, liste);
  if (recents.size > 500) recents.clear(); // pas de fuite mémoire sur une instance chaude
  return liste.length > 5;
}

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 });
  }

  // Piège à robots : un humain ne remplit jamais ce champ, il est hors écran.
  if (s((corps as any).website)) return NextResponse.json({ ok: true, paiement: null });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (tropDeTentatives(ip)) {
    return NextResponse.json(
      { ok: false, erreur: "Trop de tentatives. Patientez quelques minutes, ou appelez-nous au 06 81 43 16 54." },
      { status: 429 },
    );
  }

  const manquants = OBLIGATOIRES.filter((c) => !s((corps as any)[c]));
  if (manquants.length) {
    return NextResponse.json(
      { ok: false, erreur: "Merci de remplir tous les champs obligatoires." },
      { status: 400 },
    );
  }

  const email = s((corps as any).email);
  if (!adresseValide(email)) {
    return NextResponse.json(
      { ok: false, erreur: "Cette adresse e-mail ne semble pas valide — c'est par là que partira votre convocation." },
      { status: 400 },
    );
  }

  const session = await lireSession(s((corps as any).session_id));
  if (!session) {
    return NextResponse.json(
      { ok: false, erreur: "Cette session vient d'être complétée ou fermée. Choisissez une autre date, ou appelez-nous au 06 81 43 16 54." },
      { status: 409 },
    );
  }

  // La motivation doit appartenir à la liste CCI : elle part telle quelle au certificateur.
  const sousType = s((corps as any).sous_type);
  const attendues: readonly string[] =
    session.type === "TEF_IRN" ? MOTIVATIONS_CCI : MENTIONS_CIVIQUE;
  if (!attendues.includes(sousType)) {
    return NextResponse.json({ ok: false, erreur: "Motif d'examen invalide." }, { status: 400 });
  }

  const devis = calculerMontant(session.type, session.date_examen);

  const { data: pre, error } = await supabaseAdmin
    .from("preinscriptions_examen")
    .insert({
      session_id: session.id,
      type_examen: session.type,
      sous_type: sousType,
      montant: devis.montant,
      statut: "en_attente",
      origine: "en_ligne",
      agence: AGENCE_EN_LIGNE,
      cree_par: VENDEUR_EN_LIGNE,
      candidat_nom: s((corps as any).nom).toUpperCase(),
      candidat_prenom: s((corps as any).prenom),
      candidat_email: email,
      candidat_telephone: s((corps as any).telephone),
      civilite: s((corps as any).civilite),
      genre: s((corps as any).genre),
      date_naissance: s((corps as any).date_naissance),
      lieu_naissance: s((corps as any).lieu_naissance),
      langue_maternelle: s((corps as any).langue_maternelle),
      nationalite: s((corps as any).nationalite),
      adresse: s((corps as any).adresse),
      code_postal: s((corps as any).code_postal),
      ville: s((corps as any).ville),
      pays: s((corps as any).pays) || "France",
      piece_identite: s((corps as any).piece_identite),
    })
    .select("id")
    .single();

  if (error || !pre) {
    return NextResponse.json(
      { ok: false, erreur: "Nous n'avons pas pu enregistrer votre inscription. Appelez-nous au 06 81 43 16 54, nous la finalisons avec vous." },
      { status: 500 },
    );
  }

  const ref = String((pre as any).id);
  const intitule =
    `${session.type === "TEF_IRN" ? "Examen TEF IRN" : "Examen civique"} — ` +
    `${jourLisible(session.date_examen)}, ${session.horaire}, ${session.centre_nom}`;

  const lien = await lienDePaiement(
    req, ref, devis.montant, intitule, email,
    devis.detail.map((d) => ({ libelle: d.libelle, prix: d.prix })),
    {
      prenom: s((corps as any).prenom),
      nom: s((corps as any).nom).toUpperCase(),
      adresse: s((corps as any).adresse),
      codePostal: s((corps as any).code_postal),
      ville: s((corps as any).ville),
      pays: s((corps as any).pays) || "France",
    },
  );

  if (lien) {
    await supabaseAdmin.from("preinscriptions_examen")
      .update({ lien_paiement: lien }).eq("id", ref);
    await journal("inscription_en_ligne", ref, { montant: devis.montant, session: session.id, email });
    return NextResponse.json({ ok: true, paiement: lien });
  }

  // Pas de lien : on garde le candidat et on prévient le secrétariat, qui prendra le relais.
  await journal("inscription_en_ligne_sans_lien", ref, { montant: devis.montant, session: session.id, email });
  await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "secretariat@mystoryformation.fr",
    objet: `Inscription en ligne à finaliser — ${s((corps as any).nom)} ${s((corps as any).prenom)} · ${euros(devis.montant)}`,
    html: gabaritEmail(
      "Lien de paiement à envoyer",
      `<p>Une inscription en ligne vient d'être enregistrée, mais le lien de paiement n'a pas pu être
       créé automatiquement. <b>Merci d'envoyer un lien de paiement de ${euros(devis.montant)}</b> depuis la
       page Pré-inscriptions du CRM.</p>
       <p><b>${s((corps as any).nom).toUpperCase()} ${s((corps as any).prenom)}</b><br>
       ${intitule}<br>${email} · ${s((corps as any).telephone)}</p>`,
    ),
    entite: "preinscriptions_examen",
    entiteId: ref,
  });

  return NextResponse.json({
    ok: false,
    erreur: "Votre inscription est bien enregistrée. Nous vous envoyons votre lien de paiement par e-mail dans quelques minutes — vous n'avez rien à refaire.",
  }, { status: 202 });
}

/**
 * Crée le paiement chez Mollie et renvoie la page de règlement.
 *
 * Choisi contre Qonto le 29/09/2026 : Qonto exige une application OAuth2 pour créer un lien
 * de paiement, et un lien Qonto générique ne sait pas qui paie. Mollie rattache l'encaissement
 * au candidat par nos métadonnées, et se pilote avec une simple clé API.
 *
 * Renvoie null si la clé manque ou si Mollie refuse — l'appelant bascule alors sur l'envoi
 * manuel, et aucune inscription n'est perdue.
 */
async function lienDePaiement(
  req: NextRequest, reference: string, montant: number, intitule: string, email: string,
  lignes?: Array<{ libelle: string; prix: number }>,
  adresse?: {
    prenom?: string; nom?: string; adresse?: string;
    codePostal?: string; ville?: string; pays?: string;
  },
): Promise<string | null> {
  if (!molliePret()) return null;
  const base = urlDeBase(req);
  try {
    const p = await creerPaiement({
      montant,
      description: `MYSTORY — ${intitule}`,
      reference,
      email,
      urlRetour: `${base}/inscription-examen/merci?r=${encodeURIComponent(reference)}`,
      urlWebhook: `${base}/api/paiements/mollie`,
      /* 09/10/2026 — `lignes` et `adresse` ne servent à rien pour nous : elles servent à
         faire apparaître KLARNA. Une vraie page de paiement n'offrait que « Cartes de
         crédit » et « iDEAL » alors que Klarna est bel et bien activé sur le compte
         Mollie ; la cause était ici, dans un paiement envoyé sans détail de commande ni
         adresse de facturation. Mollie masque alors Klarna SANS message d'erreur.
         Le formulaire collectait déjà tout : il n'y avait qu'à transmettre.
         ⚠️ La somme des lignes doit faire EXACTEMENT le total, sinon Mollie rejette le
         paiement entier — ici elles viennent du même devis que le montant. */
      lignes,
      adresse: adresse ? { ...adresse, email } : undefined,
    });
    await supabaseAdmin.from("preinscriptions_examen")
      .update({ reference_paiement: p.id }).eq("id", reference);
    return p.url;
  } catch (e) {
    await journal("paiement_mollie_echec", reference, {
      erreur: e instanceof Error ? e.message : "inconnue", montant,
    });
    return null;
  }
}

async function journal(evenement: string, entiteId: string, detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("journal").insert({
      entite: "preinscriptions_examen", entite_id: entiteId, evenement,
      nouvelle_valeur: detail, auteur: VENDEUR_EN_LIGNE,
    });
  } catch {
    /* le journal ne doit jamais faire échouer une inscription */
  }
}
