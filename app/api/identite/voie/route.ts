/**
 * MYSTORY — POST /api/identite/voie  (PUBLIC, appelé par /identite)
 *
 * Enregistre la voie de vérification d'identité choisie par le candidat, et
 * prévient le secrétariat.
 *
 * ── 🔴 CE QUE CETTE ROUTE N'ÉCRIT PAS ───────────────────────────────────────
 *
 * `stagiaires.verification_identite` — le STATUT. Jamais.
 *
 * Elle n'écrit que `verification_identite_voie`, la DÉCLARATION du candidat. Le
 * statut est une constatation faite par l'équipe sur /identites après avoir vu
 * la pièce ; l'écrire ici reviendrait à faire valider une identité par la
 * personne même qu'il s'agit de vérifier, sur la seule foi d'un lien reçu par
 * e-mail. C'est la ligne rouge de ce chantier, et elle est aussi écrite dans la
 * migration 84 et dans lib/liensCandidat.ts — à trois endroits parce qu'elle se
 * franchirait sans y penser, en « complétant » le flux.
 *
 * ── IDEMPOTENCE ─────────────────────────────────────────────────────────────
 *
 * Un second envoi écrase la voie (le candidat a le droit de changer d'avis) mais
 * `marquerUtilise` n'horodate que la première fois, et le secrétariat est
 * prévenu à chaque fois — un changement d'avis est précisément ce qu'il doit
 * savoir.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ech } from "@/lib/html";
import { ipDeConfiance, limiteDepassee } from "@/lib/rateLimit";
import { ouvrirLien, contexteDossier, marquerUtilise } from "@/lib/liensCandidat";
import { journaliser, prevenirSecretariat, ligneInterne } from "@/lib/liensCandidatPages";
import { TEL_PUBLIC } from "@/lib/pagePublique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les trois seules valeurs acceptées. La base les contrôle aussi (migration 84). */
const VOIES = new Set(["en_ligne", "courrier", "les_deux"]);

const LIBELLE: Record<string, string> = {
  en_ligne: "En ligne (moncompteformation.gouv.fr)",
  courrier: "Par courrier postal",
  les_deux: "Les deux en parallèle",
};

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== "object") {
    return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 });
  }
  const b = corps as Record<string, unknown>;

  /* Piège à robots : un humain ne remplit jamais ce champ, il est hors écran.
     On répond « ok » sans rien écrire — un robot qui voit un refus recommence. */
  if (String(b.website ?? "").trim()) return NextResponse.json({ ok: true });

  /* `ipDeConfiance` et non `ipDe` : la première valeur de `x-forwarded-for` est
     écrite par le client, donc une boucle qui change d'en-tête n'est jamais
     limitée. Les nouvelles routes utilisent la version de confiance — voir la
     note dans lib/rateLimit.ts. */
  const ip = ipDeConfiance(req);
  if (await limiteDepassee(`identite:voie:ip:${ip}`, 20, 900)) {
    return NextResponse.json(
      { ok: false, erreur: `Trop de tentatives. Patientez quelques minutes, ou appelez-nous au ${TEL_PUBLIC}.` },
      { status: 429 },
    );
  }

  const lien = await ouvrirLien(b.j, "identite");
  // Même réponse que pour un jeton inconnu, périmé ou révoqué : on ne dit pas laquelle.
  if (!lien) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}, nous vous en renvoyons un.` },
      { status: 410 },
    );
  }

  const voie = String(b.voie ?? "").trim();
  if (!VOIES.has(voie)) {
    return NextResponse.json({ ok: false, erreur: "Choisissez une des trois options." }, { status: 400 });
  }
  const adresseACorriger = String(b.adresse_a_corriger ?? "").trim().toLowerCase() === "oui";

  const c = await contexteDossier(lien.dossierId);
  if (!c) {
    return NextResponse.json(
      { ok: false, erreur: `Ce lien n'est plus valable. Appelez-nous au ${TEL_PUBLIC}.` },
      { status: 410 },
    );
  }

  const { error } = await supabaseAdmin
    .from("stagiaires")
    .update({
      verification_identite_voie: voie,
      verification_identite_voie_le: new Date().toISOString(),
      /* `verification_identite` (le statut) N'EST PAS TOUCHÉ — voir l'en-tête.
         On n'écrit pas non plus la note de suivi : elle appartient à l'équipe, et
         l'écraser ferait perdre ce qu'une conseillère y a mis. */
    })
    .eq("id", c.stagiaireId);

  if (error) {
    await journaliser("identite_voie_echec", lien.dossierId, { voie, erreur: error.message });
    return NextResponse.json(
      { ok: false, erreur: `Enregistrement impossible. Appelez-nous au ${TEL_PUBLIC}.` },
      { status: 500 },
    );
  }

  await marquerUtilise(lien.id);

  const nom = `${c.prenom} ${c.nom}`.trim();
  const envoi = await prevenirSecretariat(
    `Identité — ${nom} a choisi : ${LIBELLE[voie]}`,
    "Voie de vérification d'identité choisie",
    `<p>Le candidat a choisi sa voie de vérification d'identité depuis le lien qui lui a été
     envoyé.</p>
     ${ligneInterne("Candidat", nom)}
     ${ligneInterne("Voie choisie", LIBELLE[voie])}
     ${ligneInterne("Téléphone", c.telephone)}
     ${ligneInterne("E-mail", c.email)}
     ${ligneInterne("Agence", c.agence)}
     ${ligneInterne("N° dossier EDOF", c.numeroEdof)}
     ${adresseACorriger
       ? `<p style="margin:14px 0;padding:10px 12px;background:#fff8ec;border:1px solid #f6dcae;border-radius:8px">
          <b>⚠️ Le candidat signale que son adresse postale n'est plus la bonne.</b><br>
          Adresse au dossier : ${ech([c.adresse, c.cp, c.ville].filter(Boolean).join(", ") || "aucune")}<br>
          Le rappeler AVANT d'envoyer le courrier.</p>`
       : ligneInterne("Adresse au dossier", [c.adresse, c.cp, c.ville].filter(Boolean).join(", "))}
     <p style="margin-top:14px"><b>Le statut de vérification n'a pas été modifié</b> — c'est une
     déclaration du candidat, pas une validation. À suivre sur la page Identités du CRM.</p>`,
    lien.dossierId,
  );

  await journaliser("identite_voie_choisie", lien.dossierId, {
    voie, adresse_a_corriger: adresseACorriger,
    secretariat_prevenu: envoi.ok, secretariat_erreur: envoi.erreur ?? null,
  });

  return NextResponse.json({ ok: true, voie });
}
