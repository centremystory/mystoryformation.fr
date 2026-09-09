/**
 * Coordonnées laissées par le candidat à la fin du test de positionnement.
 *
 * 08/09/2026 — le test se passait sans qu'on sache toujours qui l'avait passé :
 * une passation depuis le site public pouvait n'avoir ni téléphone ni courriel, et
 * le prospect était perdu. Cette route complète la fiche APRÈS coup, une fois que
 * le candidat a vu son résultat — c'est le moment où il a le plus de raisons de
 * nous les donner.
 *
 * On ne remplace jamais une donnée déjà saisie par un conseiller : on ne comble
 * que les trous.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { journal } from "@/lib/examens";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";
import { envoyerEmail, gabaritEmail, EMAIL_ACTIF } from "@/lib/email";

const txt = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // Defense en profondeur : un retour a la ligne dans un nom ou un telephone
  // finirait dans l'objet d'un courriel, ou il permettrait d'injecter des en-tetes.
  // On le neutralise a l'entree, pas seulement a la sortie.
  return s.replace(/[\r\n]+/g, " ").slice(0, max);
};

export async function POST(req: NextRequest) {
  if (await limiteDepassee(`tests-contact:${ipDe(req)}`, 20, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({} as any));
  const token = txt(body.token, 80);
  if (!token) return NextResponse.json({ ok: false, erreur: "Jeton manquant." }, { status: 400 });
  // Le jeton est un gen_random_uuid() : imprevisible. Mais il vit aussi longtemps
  // que l'evaluation, alors qu'il n'a de raison de servir ici qu'une fois, juste
  // apres la remise de la copie. On borne donc le nombre d'ecritures par jeton.
  if (await limiteDepassee(`tests-contact-jeton:${token}`, 3, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop de tentatives." }, { status: 429 });
  }

  const { data: ev } = await supabaseAdmin
    .from("evaluations")
    .select("id, statut, nom, prenom, email, telephone, objectif, demarche, echeance, niveau_vise")
    .eq("token", token).maybeSingle();
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });

  const e = ev as any;
  // Cette route ne sert QU'a l'ecran de fin. Un test encore en cours, ou deja
  // traite par une formatrice, n'a pas a etre modifie par un appel public.
  if (e.statut !== "en_attente_formateur") {
    return NextResponse.json({ ok: false, erreur: "Ce test n'attend pas de coordonnées." },
                             { status: 409 });
  }
  // On ne comble que ce qui manque : un conseiller a pu saisir la fiche avant.
  const maj: Record<string, unknown> = {};
  const combler = (champ: string, valeur: string | null) => {
    if (valeur && !e[champ]) maj[champ] = valeur;
  };
  combler("nom", txt(body.nom, 120));
  combler("prenom", txt(body.prenom, 120));
  combler("email", txt(body.email, 200));
  combler("telephone", txt(body.telephone, 40));
  combler("objectif", txt(body.objectif, 1000));
  // Listes deroulantes : valeurs fermees, donc exploitables en statistique et en
  // relance. On accepte aussi le niveau vise, que la demarche pre-remplit.
  combler("demarche", txt(body.demarche, 40));
  combler("echeance", txt(body.echeance, 40));
  const niv = txt(body.niveauVise, 10);
  if (niv && ["A2", "B1", "B2"].includes(niv) && !e.niveau_vise) maj.niveau_vise = niv;
  maj.rappel_souhaite = true;

  const { error } = await supabaseAdmin.from("evaluations").update(maj).eq("id", e.id);
  if (error) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 502 });

  await journal("evaluation", e.id, "contact_candidat", { champs: Object.keys(maj) }, "candidat");

  // 09/09/2026 — un test passe doit produire un CONTACT dans le CRM, pas seulement
  // une evaluation. Sans cela, un prospect qui a donne ses coordonnees restait
  // invisible de l'equipe commerciale : il fallait penser a ouvrir l'ecran des
  // tests pour le voir.
  // 09/09/2026 — le formulaire promet « vous recevrez votre bilan par e-mail ».
  // Rien ne partait : le seul courriel ecrit allait a l'equipe. Une promesse faite
  // a un prospect et non tenue coute plus cher que pas de promesse du tout.
  // Le bilan DETAILLE part apres correction humaine ; celui-ci accuse reception
  // tout de suite, avec ce qui est deja mesure.
  const mailCandidat = (maj.email as string) ?? e.email;
  if (EMAIL_ACTIF && mailCandidat) {
    void accuserReception(e.id, mailCandidat, (maj.prenom as string) ?? e.prenom)
      .catch(async (err: any) => {
        await journal("evaluation", e.id, "accuse_reception_echec",
          { raison: String(err?.message ?? err) }, "systeme");
      });
  }

  await rattacherStagiaire(e.id, {
    nom: (maj.nom as string) ?? e.nom,
    prenom: (maj.prenom as string) ?? e.prenom,
    email: (maj.email as string) ?? e.email,
    telephone: (maj.telephone as string) ?? e.telephone,
  });
  return NextResponse.json({ ok: true });
}


/** Crée le contact dans le CRM, ou retrouve celui qui existe déjà.
 *
 *  On rapproche sur le courriel puis sur le téléphone : ce sont les deux seules
 *  données qu'un candidat saisit de façon fiable. On ne rapproche PAS sur le nom,
 *  qui produit trop de faux positifs (homonymes, translittérations variables).
 *  En cas de doute, on crée un contact de plus : un doublon se fusionne, une fiche
 *  écrasée ne se récupère pas.
 */
async function rattacherStagiaire(
  evaluationId: string,
  c: { nom?: string | null; prenom?: string | null; email?: string | null; telephone?: string | null },
): Promise<void> {
  if (!c.email && !c.telephone) return;          // rien pour rapprocher ni rappeler

  let stagiaireId: string | null = null;
  if (c.email) {
    const { data } = await supabaseAdmin
      .from("stagiaires").select("id").ilike("email", c.email).limit(1).maybeSingle();
    stagiaireId = (data as any)?.id ?? null;
  }
  if (!stagiaireId && c.telephone) {
    const tel = c.telephone.replace(/[^0-9]/g, "").slice(-9);   // on ignore l'indicatif
    if (tel.length >= 9) {
      const { data } = await supabaseAdmin
        .from("stagiaires").select("id, telephone").ilike("telephone", `%${tel}`).limit(1).maybeSingle();
      stagiaireId = (data as any)?.id ?? null;
    }
  }
  if (!stagiaireId) {
    const { data } = await supabaseAdmin.from("stagiaires").insert({
      nom: c.nom ?? null, prenom: c.prenom ?? null,
      email: c.email ?? null, telephone: c.telephone ?? null,
      source_import: "test_positionnement",
      actif: true,
    }).select("id").maybeSingle();
    stagiaireId = (data as any)?.id ?? null;
  }
  if (stagiaireId) {
    await supabaseAdmin.from("evaluations")
      .update({ stagiaire_id: stagiaireId }).eq("id", evaluationId);
    await journal("stagiaire", stagiaireId, "cree_depuis_test", { evaluationId }, "systeme");
  }
}


/** Accusé de réception immédiat au candidat : il vient de laisser ses coordonnées
 *  en échange d'un bilan, il doit voir arriver quelque chose tout de suite. */
async function accuserReception(id: string, email: string, prenom: string | null): Promise<void> {
  const { data } = await supabaseAdmin.from("evaluations")
    .select("niveau_calibre, heures_preconisees, niveau_vise, ce_sur10, co_sur10")
    .eq("id", id).maybeSingle();
  const d = (data ?? {}) as any;

  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

  const heures = d.heures_preconisees
    ? `<p style="margin:0 0 16px;padding:14px 16px;background:#eff6ff;border-radius:8px;font-size:15px">
         D'après vos réponses, nous vous recommandons
         <b style="font-size:19px">${Number(d.heures_preconisees)} heures</b> de formation
         pour atteindre le niveau ${esc(d.niveau_vise ?? "visé")}.</p>`
    : "";

  const corps = `
    <p style="margin:0 0 14px;font-size:15px">Bonjour${prenom ? " " + esc(prenom) : ""},</p>
    <p style="margin:0 0 14px;font-size:15px">
      Nous avons bien reçu votre test de positionnement. Merci d'avoir pris le temps de le passer.</p>
    ${heures}
    <p style="margin:0 0 14px;font-size:15px">
      <b>Ce qui arrive maintenant.</b> Une formatrice corrige votre rédaction et votre
      expression orale. Vous recevrez ensuite votre bilan complet : le détail des quatre
      épreuves, la correction commentée de votre écrit, et le parcours adapté à votre
      situation. Comptez 24 à 48 heures.</p>
    <p style="margin:0 0 14px;font-size:15px">
      Un conseiller vous rappelle également pour en parler de vive voix. Vous pouvez nous
      joindre à tout moment au <b>06 81 43 16 54</b>.</p>
    <p style="margin:0 0 6px;font-size:15px"><b>En attendant, entraînez-vous.</b></p>
    <p style="margin:0 0 14px;font-size:15px">
      <a href="https://passetontef.fr" style="color:#2F72DE">passetontef.fr</a> reprend les
      quatre épreuves du TEF IRN au format réel.
      Si vous devez aussi passer l'examen civique,
      <a href="https://prepcivique.fr" style="color:#2F72DE">prepcivique.fr</a> vous y prépare.</p>
    <p style="margin:22px 0 0;font-size:15px">À très bientôt,<br>L'équipe MYSTORY Formation</p>`;

  await envoyerEmail({
    a: email,
    objet: "Votre test de positionnement a bien été reçu",
    html: gabaritEmail("Votre test a bien été reçu", corps),
    entite: "evaluations", entiteId: id, auteur: "systeme",
  });
}
