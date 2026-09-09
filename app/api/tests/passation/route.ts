/**
 * MYSTORY — Passation d'un test (initial ou final), accès PUBLIC par jeton.
 * GET  ?token=… : renvoie le test + questions SANS les corrigés (bonne_reponse / mots_cles exclus).
 * POST          : reçoit les réponses, corrige CE/CO CÔTÉ SERVEUR, enregistre, passe en attente de notation.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { corrigerAuto, calibrer, heuresRecommandees, texteLibreOk,
         epreuveLaPlusFaible, type QuestionCorrige, type Palier } from "@/lib/tests";
import { journal } from "@/lib/examens";
import { envoyerEmail, gabaritEmail, EMAIL_ACTIF } from "@/lib/email";
import { ipDe, limiteDepassee } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });

  const { data: ev, error } = await supabaseAdmin
    .from("evaluations")
    .select("id, test_id, phase, statut, nom, prenom, auteur")
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
  const evVise = (ev as any).niveau_vise;
  const evFiche = ev as any;
  if (ev.statut === "annule") return NextResponse.json({ ok: false, erreur: "Ce test a été annulé." }, { status: 410 });
  if (ev.statut !== "en_cours") return NextResponse.json({ ok: false, erreur: "Ce test a déjà été envoyé. Merci !", dejaFait: true }, { status: 409 });

  const { data: test } = await supabaseAdmin
    .from("tests").select("titre, phase, consigne_ecrit, consigne_oral, oral_questions, sujets_ecrit").eq("id", ev.test_id).maybeSingle();

  const { data: qs } = await supabaseAdmin
    .from("test_questions")
    .select("id, section, ordre, bloc, type, contexte, audio_path, enonce, options, points")
    .eq("test_id", ev.test_id).eq("actif", true)
    .order("section", { ascending: true })
    .order("ordre", { ascending: true });

  return NextResponse.json({
    ok: true,
    test: test ?? { titre: "Test", phase: ev.phase, consigne_ecrit: null, consigne_oral: null, oral_questions: null, sujets_ecrit: null },
    candidat: { nom: ev.nom, prenom: ev.prenom },
    mode: String(ev.auteur ?? "").startsWith("sur_place") ? "sur_place" : "distance",
    questions: qs ?? [],
  });
}

export async function POST(req: NextRequest) {
  // Anti-spam / anti-bruteforce de jeton : dépôt public d'un test par jeton.
  if (await limiteDepassee(`passation:${ipDe(req)}`, 60, 3600)) {
    return NextResponse.json({ ok: false, erreur: "Trop d'envois. Réessayez plus tard." }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "Requête invalide." }, { status: 400 }); }

  const token = String(body.token ?? "").trim();
  if (!token) return NextResponse.json({ ok: false, erreur: "Lien invalide." }, { status: 400 });
  const reponses = (body.reponses && typeof body.reponses === "object") ? body.reponses as Record<string, string> : {};
  const ecrit = body.ecrit == null ? null : String(body.ecrit).trim().slice(0, 8000) || null;
  const sujetEcrit = ["A1", "A2", "B1", "B2"].includes(String(body.sujet_ecrit)) ? String(body.sujet_ecrit) : null;

  const { data: ev, error } = await supabaseAdmin
    .from("evaluations")
    .select("id, test_id, statut, niveau_vise, nom, prenom, email, telephone, demarche, objectif, echeance, auteur")
    .eq("token", token).maybeSingle();
  if (error) return NextResponse.json({ ok: false, erreur: "Lecture impossible." }, { status: 502 });
  if (!ev) return NextResponse.json({ ok: false, erreur: "Test introuvable." }, { status: 404 });
  const evVise = (ev as any).niveau_vise;
  const evFiche = ev as any;
  if (ev.statut !== "en_cours") return NextResponse.json({ ok: false, erreur: "Ce test a déjà été envoyé." }, { status: 409 });

  const { data: qs } = await supabaseAdmin
    .from("test_questions")
    .select("id, section, type, bonne_reponse, mots_cles, points, niveau, enonce, options, ordre")
    .eq("test_id", ev.test_id).eq("actif", true);

  const questions: QuestionCorrige[] = (qs ?? []).map((q: any) => ({
    id: q.id, section: q.section, type: q.type,
    bonne_reponse: q.bonne_reponse, mots_cles: q.mots_cles, points: q.points ?? 1,
    niveau: q.niveau ?? "A2",
    // enonce et options ne servent qu'a la correction rendue au candidat ; ils ne
    // sont jamais renvoyes pour les questions reussies.
    enonce: q.enonce ?? null, options: q.options ?? null, ordre: q.ordre ?? 0,
  } as any));
  const { ceSur10, coSur10 } = corrigerAuto(questions, reponses);

  // 08/09/2026 — le niveau n'est plus un pourcentage. On retient le palier le plus
  // haut reellement tenu, et on en deduit le volume d'heures a proposer. Le candidat
  // ne doit JAMAIS lire « A0 » : c'est demoralisant, ce n'est pas un niveau du CECRL,
  // et cela fait fuir un prospect qu'on veut accompagner.
  const { paliers, niveau } = calibrer(questions as any, reponses);

  // 09/09/2026 — le detail par competence et par niveau. Un candidat convaincu par
  // ses propres erreurs s'inscrit ; un candidat a qui on annonce un niveau discute.
  // On lui montre OU ca casse, jamais les bonnes reponses : le corrige servirait a
  // repasser le test, et fausserait la mesure suivante.
  const detail = (["CE", "CO"] as const).flatMap((sec) =>
    (["A2", "B1", "B2"] as const).map((niv) => {
      const lot = questions.filter((q: any) => q.section === sec && (q.niveau ?? "A2") === niv);
      if (!lot.length) return null;
      const bons = lot.filter((q: any) => {
        const rep = reponses?.[q.id];
        return q.type === "texte_libre"
          ? texteLibreOk(rep, q.mots_cles)
          : rep != null && String(rep) === q.bonne_reponse;
      }).length;
      return {
        section: sec === "CE" ? "Compréhension écrite" : "Compréhension orale",
        niveau: niv, total: lot.length, reussies: bons,
        // Ce que ce lot de questions demandait vraiment.
        exige: sec === "CE"
          ? (niv === "A2" ? "trouver une information écrite noire sur blanc"
             : niv === "B1" ? "lire un document administratif et en déduire une conséquence"
             : "identifier un point de vue et distinguer le fait de l'opinion")
          : (niv === "A2" ? "comprendre un message simple, énoncé lentement"
             : niv === "B1" ? "suivre un échange à débit normal et en retenir l'essentiel"
             : "saisir l'implicite dans un échange rapide entre plusieurs personnes"),
      };
    }).filter(Boolean));

  // 09/09/2026 — demande d'Arudhan : « a la fin du test, si le client veut voir sa
  // correction, qu'il puisse la regarder ».
  //
  // Regle retenue : on ne renvoie le corrige QUE des questions manquees. Le candidat
  // comprend ses erreurs — c'est l'argument de vente le plus solide — sans qu'on lui
  // remette la totalite du corrige, qui circulerait et fausserait les passations
  // suivantes. Les questions reussies n'ont pas besoin d'explication.
  const correction = questions
    .map((q: any) => {
      const rep = reponses?.[q.id];
      const juste = q.type === "texte_libre"
        ? texteLibreOk(rep, q.mots_cles)
        : rep != null && String(rep) === q.bonne_reponse;
      return { q, rep, juste };
    })
    .filter((x: any) => !x.juste)
    .map(({ q, rep }: any) => ({
      section: q.section === "CE" ? "Compréhension écrite" : "Compréhension orale",
      niveau: q.niveau ?? "A2",
      enonce: q.enonce ?? null,
      options: q.options ?? null,
      votre_reponse: rep != null ? String(rep) : null,
      bonne_reponse: q.type === "texte_libre" ? null : q.bonne_reponse,
    }));
  const vise = (["A2", "B1", "B2"].includes(String(evVise)) ? evVise : "B1") as Palier;
  const reco = heuresRecommandees(niveau, vise);
  const faible = epreuveLaPlusFaible(Number(ceSur10 ?? 0), Number(coSur10 ?? 0), null, null);

  const { error: e2 } = await supabaseAdmin.from("evaluations").update({
    reponses, ce_sur10: ceSur10, co_sur10: coSur10, ecrit, sujet_ecrit: sujetEcrit,
    niveau_calibre: niveau, heures_preconisees: reco.heures,
    statut: "en_attente_formateur",
  }).eq("id", ev.id);
  if (e2) return NextResponse.json({ ok: false, erreur: "Enregistrement impossible." }, { status: 502 });

  await journal("evaluation", ev.id, "test_soumis", { ce_sur10: ceSur10, co_sur10: coSur10 }, "candidat");

  // 08/09/2026 — Alerte de correction. Sans elle, une rédaction pouvait dormir des
  // jours : rien ne prévenait l'équipe qu'un candidat attendait sa note. C'est aussi
  // la fiche commerciale du prospect : elle porte ses coordonnées, sa démarche, son
  // échéance et le volume d'heures a lui proposer.
  // L'envoi ne doit jamais faire echouer la soumission du candidat — mais un echec
  // SILENCIEUX est pire : le 09/09/2026, l'alerte n'est jamais partie et rien dans
  // le journal ne permettait de savoir pourquoi. On trace donc systematiquement.
  void alerterCorrection(ev.id, token, evFiche, {
    ceSur10, coSur10, paliers, niveau, vise, reco, faible, ecrit, sujetEcrit, detail,
    correction,
  }).catch(async (err: any) => {
    await journal("evaluation", ev.id, "alerte_correction_echec",
      { raison: String(err?.message ?? err), email_actif: EMAIL_ACTIF }, "systeme");
  });
  return NextResponse.json({
    ok: true,
    niveau_calibre: niveau,             // A2 | B1 | B2 | null (palier non tenu)
    niveau_vise: vise,
    paliers,                            // detail par palier, pour la restitution
    heures: reco.heures,
    ecart: reco.ecart,
    motif: reco.motif,
    // 09/09/2026 — le palier reellement visable par CE parcours, et le nombre de
    // parcours qui separent le candidat de son objectif. Sans cela, l'ecran
    // promettait le niveau reve en une seule formation.
    prochain: reco.prochain,
    etapes: reco.etapes,
    epreuve_faible: faible,             // celle qui fait tomber le niveau au TEF IRN
    detail,                             // par compétence et par niveau, sans les corrigés
    ce_sur10: ceSur10, co_sur10: coSur10,
  });
}


/** Prévient l'équipe qu'une copie attend sa correction, et lui donne de quoi
 *  rappeler le candidat tout de suite. */
async function alerterCorrection(
  id: string, token: string, c: any, r: any,
): Promise<void> {
  const nom = [c.prenom, c.nom].filter(Boolean).join(" ") || "Candidat sans nom";
  const base = process.env.APP_URL || "https://crm.mystoryformation.fr";
  const surPlace = String(c.auteur || "").startsWith("sur_place");

  // Tout ce qui suit vient du candidat : nom, telephone, objectif, redaction. Ces
  // valeurs partent dans un courriel HTML lu par l'equipe. Sans echappement, un
  // candidat pouvait y glisser un faux bouton ou un faux lien, dans un message qui
  // porte notre propre identite — c'est du hameconnage a nos frais.
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
  // Un retour a la ligne dans l'objet permettrait d'injecter des en-tetes.
  const objetSur = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

  const li = (cle: string, val: string) =>
    val ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap">${esc(cle)}</td>`
        + `<td style="padding:6px 0;font-weight:600;color:#111827">${esc(val)}</td></tr>` : "";

  const paliers = (r.paliers || [])
    .filter((p: any) => p.max > 0)
    .map((p: any) => `${esc(p.palier)} ${Math.round(p.taux * 100)} %${p.tenu ? " ✓" : ""}`)
    .join(" &nbsp;·&nbsp; ");

  const niveau = r.niveau
    ? `<b style="font-size:20px">${esc(r.niveau)}</b> atteint sur les épreuves automatiques`
    : `<b style="color:#b45309">palier A2 non tenu</b> sur les épreuves automatiques`;

  const corps = `
    <p style="margin:0 0 14px">Une copie attend sa correction.</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
      ${li("Candidat", nom)}
      ${li("Téléphone", c.telephone || "")}
      ${li("Courriel", c.email || "")}
      ${li("Démarche", c.demarche || "")}
      ${li("Niveau visé", c.niveau_vise || "")}
      ${li("Échéance annoncée", c.echeance || "")}
      ${li("Passation", surPlace ? "sur place" : "à distance")}
    </table>
    ${c.objectif ? `<p style="margin:0 0 18px;padding:12px 14px;background:#f9fafb;
       border-left:3px solid #2F72DE;font-size:14px"><b>Son objectif, dans ses mots :</b><br>
       ${esc(c.objectif)}</p>` : ""}

    <h3 style="font-size:15px;margin:0 0 8px">Ce que le test a déjà mesuré</h3>
    <p style="margin:0 0 6px;font-size:14px">${niveau}</p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Par palier : ${paliers || "&mdash;"}</p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b7280">
      Compréhension écrite ${Number(r.ceSur10)}/10 &nbsp;·&nbsp; compréhension orale ${Number(r.coSur10)}/10</p>
    ${r.faible ? `<p style="margin:0 0 6px;font-size:14px;color:#b45309">
      Épreuve décrochée : <b>${esc(r.faible.epreuve)}</b> (${Number(r.faible.note)}/10). Au TEF IRN, il faut
      tenir le score dans les quatre épreuves à la fois : c'est elle qui ferait tomber le niveau.</p>` : ""}
    <p style="margin:12px 0 18px;padding:12px 14px;background:#eff6ff;border-radius:6px;font-size:14px">
      <b>Volume à proposer : ${Number(r.reco.heures)} heures.</b><br>
      <span style="color:#4b5563">${esc(r.reco.motif)}</span></p>

    <h3 style="font-size:15px;margin:0 0 8px">Ce qui reste à faire, par vous</h3>
    <ol style="font-size:14px;margin:0 0 18px;padding-left:20px">
      <li>Corriger l'expression écrite${r.sujetEcrit ? ` (sujet ${esc(r.sujetEcrit)})` : ""} — le texte est ci-dessous.</li>
      <li>${surPlace ? "Faire passer l'expression orale et la noter." : "Écouter les enregistrements et noter l'expression orale."}</li>
      <li>Valider le niveau et le volume, puis rappeler le candidat.</li>
    </ol>
    ${r.ecrit ? `<h3 style="font-size:15px;margin:0 0 8px">Sa rédaction
      (${String(r.ecrit).trim().split(/\s+/).length} mots)</h3>
      <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;padding:14px;
        background:#fff;border:1px solid #e5e7eb;border-radius:6px">${
        esc(r.ecrit)}</div>`
      : `<p style="font-size:14px;color:#b45309">Aucune rédaction n'a été rendue.</p>`}
    <p style="margin:22px 0 0">
      <a href="${base}/tests/a-noter" style="display:inline-block;background:#2F72DE;color:#fff;
        text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600">
        Noter cette copie</a>
      &nbsp;&nbsp;<a href="${base}/tests/${id}" style="color:#2F72DE">voir le détail</a>
    </p>`;

  await envoyerEmail({
    a: process.env.EMAIL_CORRECTIONS || "contact@mystoryformation.fr",
    objet: objetSur(`Test de positionnement à corriger — ${nom}${c.telephone ? " · " + c.telephone : ""}`),
    html: gabaritEmail("Une copie attend sa correction", corps),
    entite: "evaluations", entiteId: id, auteur: "systeme",
  });
}
