/**
 * MYSTORY — POST /api/coordonnees  (PUBLIC, appelé par /coordonnees)
 *
 * Enregistre la relecture de l'état civil par le candidat : soit une simple
 * confirmation, soit des corrections.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 QUAND UNE CORRECTION EST ÉCRITE, ET QUAND ELLE NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * C'est la décision délicate de cette route, et elle mérite d'être lue avant
 * d'être « simplifiée ».
 *
 * Écrire directement : l'état civil est la donnée du candidat, lui seul sait
 * l'écrire, et l'équipe la retape de toute façon. C'est TOUT l'intérêt de la
 * page — sans écriture, elle ne supprime aucune saisie et ne valait pas d'être
 * construite.
 *
 * Mais il y a un cas où écrire serait grave : quand l'identité a DÉJÀ été
 * vérifiée par l'équipe (`verification_identite` dans un statut validé).
 * Écraser alors le nom, c'est défaire une vérification faite sur pièce — sur la
 * seule foi d'un lien reçu par e-mail — et laisser le dossier dans un état où il
 * se croit vérifié alors que les données ne sont plus celles qui ont été vues.
 *
 * D'où la règle :
 *   — identité NON encore validée → on écrit (c'est précisément le moment où
 *     ces données se préparent pour EDOF, et où la justesse compte le plus) ;
 *   — identité DÉJÀ validée       → on n'écrit RIEN, la correction part au
 *     secrétariat qui tranche, et le candidat est remercié sans qu'on lui parle
 *     de nos statuts internes.
 *
 * Dans les deux cas, l'avant/après complet va dans `journal` : rien n'est perdu,
 * et une correction peut être défaite.
 *
 * ⚠️ Les champs modifiables sont une LISTE FERMÉE. Pas de boucle sur les clés du
 * POST : sans cette liste, un champ ajouté au formulaire — ou inventé par
 * l'appelant — se retrouverait écrit en base. `agence`, `actif`,
 * `verification_identite` et tout le reste sont hors d'atteinte par construction.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ech } from "@/lib/html";
import { ipDeConfiance, limiteDepassee } from "@/lib/rateLimit";
import { ouvrirLien, contexteDossier, marquerUtilise } from "@/lib/liensCandidat";
import { journaliser, prevenirSecretariat, ligneInterne } from "@/lib/liensCandidatPages";
import { EMAIL_RE } from "@/lib/inscriptions/regles";
import { TEL_PUBLIC } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les statuts d'identité qui valent VALIDATION par l'équipe.
 *
 * Alignés sur `IDENTITE_STATUTS` de lib/identite.ts. Les deux autres
 * (`identite_numerique_a_creer`, `courrier_envoye`) sont des démarches EN COURS :
 * elles n'ont rien constaté, donc elles ne protègent rien et une correction peut
 * encore être écrite.
 */
const IDENTITE_VALIDEE = new Set([
  "identite_numerique_validee",
  "courrier_valide",
  "verification_en_ligne_validee",
]);

/** Les champs que le candidat peut corriger, et EUX SEULS. */
const CHAMPS = [
  "civilite", "nom", "prenom", "date_naissance", "ville_naissance",
  "nationalite", "telephone", "email", "adresse", "cp", "ville",
] as const;

const LIBELLE: Record<string, string> = {
  civilite: "Civilité", nom: "Nom", prenom: "Prénom",
  date_naissance: "Date de naissance", ville_naissance: "Ville de naissance",
  nationalite: "Nationalité", telephone: "Téléphone", email: "E-mail",
  adresse: "Adresse", cp: "Code postal", ville: "Ville",
};

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 });
  }
  const b = corps as Record<string, unknown>;

  if (String(b.website ?? "").trim()) return NextResponse.json({ ok: true });

  const ip = ipDeConfiance(req);
  if (await limiteDepassee(`coordonnees:ip:${ip}`, 20, 900)) {
    return NextResponse.json(
      { ok: false, erreur: `Trop de tentatives. Patientez quelques minutes, ou appelez-nous au ${TEL_PUBLIC}.` },
      { status: 429 },
    );
  }

  const lien = await ouvrirLien(b.j, "coordonnees");
  if (!lien) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}, nous vous en renvoyons un.` },
      { status: 410 },
    );
  }

  const c = await contexteDossier(lien.dossierId);
  if (!c) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 410 },
    );
  }

  const maintenant = new Date().toISOString();
  const nomActuel = `${c.prenom} ${c.nom}`.trim();

  /* ── CAS 1 : « tout est exact » ────────────────────────────────────────────
     Aucune écriture de données, juste la trace que le candidat a relu. C'est
     l'information qui manquait : aujourd'hui personne ne sait si l'état civil
     d'un dossier a été vérifié auprès de l'intéressé ou recopié d'un appel. */
  if (String(b.verdict ?? "").trim() !== "corriger") {
    const { error } = await supabaseAdmin.from("stagiaires")
      .update({ coordonnees_confirmees_le: maintenant })
      .eq("id", c.stagiaireId);
    if (error) {
      await journaliser("coordonnees_confirmation_echec", lien.dossierId, { erreur: error.message });
      return NextResponse.json(
        { ok: false, erreur: `Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 500 },
      );
    }
    await marquerUtilise(lien.id);
    await journaliser("coordonnees_confirmees", lien.dossierId, { stagiaire: c.stagiaireId });
    return NextResponse.json({ ok: true, corrige: false });
  }

  /* ── CAS 2 : des corrections ───────────────────────────────────────────────
     On ne retient que ce qui a VRAIMENT changé. Comparer avant d'écrire évite
     de marquer un dossier « corrigé » parce que le candidat a renvoyé le
     formulaire sans rien toucher — ce qui déclencherait une vérification des
     pièces déjà établies pour rien. */
  const actuel: Record<string, string> = {
    civilite: c.civilite ?? "", nom: c.nom ?? "", prenom: c.prenom ?? "",
    date_naissance: (c.dateNaissance ?? "").slice(0, 10),
    ville_naissance: c.villeNaissance ?? "", nationalite: c.nationalite ?? "",
    telephone: c.telephone ?? "", email: c.email ?? "",
    adresse: c.adresse ?? "", cp: c.cp ?? "", ville: c.ville ?? "",
  };

  const changements: Record<string, { avant: string; apres: string }> = {};
  const maj: Record<string, string> = {};

  for (const champ of CHAMPS) {
    // Champ absent du POST = champ non soumis : on ne le touche pas. Un formulaire
    // partiel ne doit pas vider des colonnes par omission.
    if (!(champ in b)) continue;
    const brut = String(b[champ] ?? "").trim().slice(0, 300);
    if (brut === actuel[champ]) continue;

    /* Les trois seuls contrôles qui refusent, parce qu'ils rendraient le dossier
       inutilisable : un nom vide, un prénom vide, une adresse e-mail invalide —
       c'est par elle que partent convocation, convention et attestation. */
    if ((champ === "nom" || champ === "prenom") && !brut) {
      return NextResponse.json(
        { ok: false, erreur: "Le nom et le prénom ne peuvent pas être vides." }, { status: 400 },
      );
    }
    if (champ === "email" && !EMAIL_RE.test(brut)) {
      return NextResponse.json(
        { ok: false, erreur: "Cette adresse e-mail ne semble pas valide. Vérifiez-la." }, { status: 400 },
      );
    }
    if (champ === "date_naissance" && brut && !/^\d{4}-\d{2}-\d{2}$/.test(brut)) {
      return NextResponse.json(
        { ok: false, erreur: "La date de naissance n'est pas lisible." }, { status: 400 },
      );
    }

    changements[champ] = { avant: actuel[champ], apres: brut };
    // Le NOM part en majuscules : c'est la forme attendue par EDOF et par la CCI,
    // et celle que le reste du CRM écrit déjà (cf. reserverCreneau dans lib/rendezVous).
    maj[champ] = champ === "nom" ? brut.toUpperCase() : brut;
  }

  // Le candidat a coché « il y a une erreur » puis n'a rien modifié : on traite ça
  // comme une confirmation plutôt que de lui renvoyer un reproche.
  if (!Object.keys(changements).length) {
    await supabaseAdmin.from("stagiaires")
      .update({ coordonnees_confirmees_le: maintenant }).eq("id", c.stagiaireId);
    await marquerUtilise(lien.id);
    await journaliser("coordonnees_confirmees_sans_changement", lien.dossierId, {});
    return NextResponse.json({ ok: true, corrige: false });
  }

  const identiteDejaValidee = IDENTITE_VALIDEE.has(String(c.verificationIdentite ?? ""));

  /* 🔴 L'identité a été vérifiée sur pièce : on n'écrase RIEN. La correction part
     au secrétariat, qui décidera s'il faut refaire la vérification. Voir l'en-tête. */
  if (!identiteDejaValidee) {
    const { error } = await supabaseAdmin.from("stagiaires")
      .update({ ...maj, coordonnees_confirmees_le: maintenant, coordonnees_corrigees_le: maintenant })
      .eq("id", c.stagiaireId);
    if (error) {
      await journaliser("coordonnees_correction_echec", lien.dossierId, {
        erreur: error.message, changements,
      });
      return NextResponse.json(
        { ok: false, erreur: `Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.` }, { status: 500 },
      );
    }
  } else {
    // Rien n'est écrit sur les données ; on garde quand même la trace de la relecture.
    await supabaseAdmin.from("stagiaires")
      .update({ coordonnees_confirmees_le: maintenant }).eq("id", c.stagiaireId);
  }

  await marquerUtilise(lien.id);

  const tableau = Object.entries(changements).map(([champ, v]) => `
    <p style="margin:4px 0"><b>${ech(LIBELLE[champ] ?? champ)}</b> :
    <span style="color:#9a0a1b;text-decoration:line-through">${ech(v.avant || "vide")}</span>
    → <b style="color:#12713a">${ech(v.apres || "vide")}</b></p>`).join("");

  const envoi = await prevenirSecretariat(
    identiteDejaValidee
      ? `⚠️ Coordonnées — ${nomActuel} corrige APRÈS validation d'identité`
      : `Coordonnées corrigées par le candidat — ${nomActuel}`,
    "Relecture de l'état civil par le candidat",
    `${identiteDejaValidee
      ? `<p style="padding:10px 12px;background:#fff8ec;border:1px solid #f6dcae;border-radius:8px">
         <b>⚠️ RIEN N'A ÉTÉ MODIFIÉ EN BASE.</b> L'identité de ce candidat a déjà été vérifiée
         sur pièce (statut : ${ech(c.verificationIdentite)}), et une page publique ne défait pas
         une vérification. À vous de trancher : appliquer la correction sur la fiche, et décider
         s'il faut refaire la vérification d'identité.</p>`
      : `<p>Le candidat a relu ses informations et corrigé ce qui suit.
         <b>Les corrections ont été appliquées</b> (son identité n'était pas encore
         vérifiée).</p>`}
     ${tableau}
     ${ligneInterne("Candidat", nomActuel)}
     ${ligneInterne("Agence", c.agence)}
     ${ligneInterne("N° dossier EDOF", c.numeroEdof)}
     ${ligneInterne("Statut d'identité", c.verificationIdentite ?? "non renseigné")}
     <p style="margin-top:14px"><b>À vérifier :</b> les pièces déjà établies (convention,
     convocation, attestation) portent l'ancienne orthographe. Si l'une est déjà partie, elle
     est à refaire — et le nom sur EDOF doit correspondre, sinon la vérification d'identité
     échouera.</p>`,
    lien.dossierId,
  );

  await journaliser(
    identiteDejaValidee ? "coordonnees_correction_differee" : "coordonnees_corrigees",
    lien.dossierId,
    {
      changements, identite_deja_validee: identiteDejaValidee,
      secretariat_prevenu: envoi.ok, secretariat_erreur: envoi.erreur ?? null,
    },
  );

  return NextResponse.json({ ok: true, corrige: true });
}
