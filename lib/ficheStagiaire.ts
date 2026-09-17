/**
 * MYSTORY — La fiche stagiaire, générée depuis le dossier.
 *
 * 17/09/2026. Elle remplace trois gestes du pas-à-pas d'inscription décrit par
 * Sofin : les informations écrites au stylo sur la photocopie de la pièce
 * d'identité, la couverture du classeur papier, et la fiche recopiée à la main.
 *
 * Le constat qui l'a fait naître : QUATRE informations — le nombre d'heures, les
 * dates des cours, la date d'examen, et « dossier complet ou non » — étaient
 * recopiées CINQ fois, sur la photocopie, dans le tableau de vente, dans EDOF,
 * sur la fiche stagiaire et dans le message WhatsApp. Chaque recopie est une
 * occasion de divergence — et une durée qui diffère d'une pièce à l'autre, c'est
 * un dossier refusé au contrôle de la Caisse des dépôts.
 *
 * Deux versions, une seule source :
 *  - « equipe »    : la couverture du classeur. Porte la checklist des pièces et
 *                    dit ce qui manque encore. NE SE DONNE PAS AU STAGIAIRE.
 *  - « stagiaire » : ce qu'il emporte — ses dates, son volume, son examen.
 *                    Sans la checklist interne.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFiche } from "@/lib/crm";
import { renderPdf } from "@/lib/renderPdf";

export type Destinataire = "equipe" | "stagiaire";

export type FichePdf = { nom: string; contenu: Buffer };
export type EchecFiche = { erreur: string; code: number };

const BLEU = "#2F72DE", ENCRE = "#16202E";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function dateFr(v: unknown): string {
  const s = String(v ?? "").slice(0, 10);
  const p = s.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "—";
}

/** Les pièces du dossier, dans l'ordre réglementaire, avec un libellé lisible. */
const LIBELLE_PIECE: Record<string, string> = {
  fiche_analyse_besoin: "Fiche d'analyse du besoin",
  test_positionnement: "Test de positionnement",
  evaluation_initiale: "Évaluation initiale",
  convention: "Convention signée",
  programme: "Programme de formation",
  reglement_interieur: "Règlement intérieur",
  planning: "Planning",
  convocation: "Convocation",
  feuille_emargement: "Feuille d'émargement signée",
  test_final: "Test final",
  evaluation_finale: "Évaluation finale",
  satisfaction_chaud: "Questionnaire de satisfaction",
  attestation_fin: "Attestation de fin de formation",
  certificat_realisation: "Certificat de réalisation",
};

/** Une pièce est acquise dès qu'elle n'est plus « manquante ». */
const acquise = (statut: unknown) => String(statut ?? "manquant") !== "manquant";

export async function construireFicheStagiaire(
  dossierId: string,
  pour: Destinataire,
): Promise<FichePdf | EchecFiche> {
  const fiche: any = await getFiche(dossierId);
  if (!fiche) return { erreur: "Dossier introuvable.", code: 404 };

  const { data: pieces } = await supabaseAdmin
    .from("pieces")
    .select("type, ordre, optionnelle, statut")
    .eq("dossier_id", dossierId)
    .order("ordre");

  const obligatoires = (pieces ?? []).filter((p: any) => !p.optionnelle);
  const manquantes = obligatoires.filter((p: any) => !acquise(p.statut));
  const complet = obligatoires.length > 0 && manquantes.length === 0;

  // La date d'examen ne vit pas dans le dossier : elle est dans le suivi des
  // examens, rattachée au stagiaire. On prend la prochaine à venir.
  let examen = "—";
  const { data: dossier } = await supabaseAdmin
    .from("dossiers").select("stagiaire_id").eq("id", dossierId).maybeSingle();
  if (dossier?.stagiaire_id) {
    const { data: ex } = await supabaseAdmin
      .from("examens")
      .select("date_examen, horaire, type_examen, lieu_examen")
      .eq("stagiaire_id", dossier.stagiaire_id)
      .eq("actif", true)
      .order("date_examen", { ascending: true })
      .limit(5);
    const prochain = (ex ?? []).find((e: any) => String(e.date_examen ?? "") >= new Date().toISOString().slice(0, 10))
      ?? (ex ?? [])[0];
    if (prochain) {
      examen = `${dateFr(prochain.date_examen)}${prochain.horaire ? ` · ${prochain.horaire}` : ""}`
        + `${prochain.lieu_examen ? `<br><span class="pt">${esc(prochain.lieu_examen)}</span>` : ""}`;
    }
  }

  const seances = (fiche.planning ?? []) as Array<any>;
  const seancesTriees = [...seances].sort((a, b) =>
    String(a.date_seance ?? "").localeCompare(String(b.date_seance ?? "")));
  const datesCours = seancesTriees.length
    ? `${dateFr(seancesTriees[0].date_seance)} → ${dateFr(seancesTriees[seancesTriees.length - 1].date_seance)}`
      + `<br><span class="pt">${seancesTriees.length} séance${seancesTriees.length > 1 ? "s" : ""}</span>`
    : (fiche.dateDebut ? `${dateFr(fiche.dateDebut)} → ${dateFr(fiche.dateFin)}` : "à programmer");

  const heures = fiche.heuresPrevues != null ? `${fiche.heuresPrevues} h` : "—";
  const nom = [fiche.civilite, fiche.prenom, fiche.nom].filter(Boolean).join(" ").trim();

  const equipe = pour === "equipe";

  const lignesPieces = (pieces ?? []).map((p: any) => {
    const ok = acquise(p.statut);
    // Une pièce facultative absente n'est pas un défaut : elle reste en gris.
    const classe = ok ? "ok" : (p.optionnelle ? "pt" : "ko");
    return `<tr>
      <td class="case">${ok ? "✔" : "☐"}</td>
      <td class="${classe}">${esc(LIBELLE_PIECE[p.type] ?? p.type)}${p.optionnelle ? ' <span class="pt">(facultative)</span>' : ""}</td>
      <td class="st">${ok ? esc(p.statut) : (p.optionnelle ? "—" : "manquante")}</td>
    </tr>`;
  }).join("");

  const MOMENT: Record<string, string> = { "Matin": "matin", "Après-midi": "après-midi" };
  const lignesSeances = seancesTriees.map((s: any) =>
    `<span class="sc"><b>${dateFr(s.date_seance).slice(0, 5)}</b> `
    + `${esc(MOMENT[String(s.demi_journee ?? "")] ?? s.demi_journee ?? "")}`
    + `${s.heures != null ? ` · ${s.heures} h` : ""}</span>`).join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@page{size:A4 portrait;margin:12mm 13mm 9mm}
*{box-sizing:border-box}
body{margin:0;font:10.6px/1.5 "Helvetica Neue",Arial,sans-serif;color:${ENCRE}}
.hd{background:${BLEU};color:#fff;border-radius:9px;padding:14px 18px;display:flex;
    justify-content:space-between;align-items:flex-end}
.hd .t{font-size:22px;font-weight:800;letter-spacing:-.4px;line-height:1}
.hd .s{font-size:11px;opacity:.9;margin-top:4px}
.hd .r{text-align:right;font-size:10px;opacity:.9;line-height:1.5}
h2{font-size:11.5px;color:${BLEU};margin:16px 0 6px;text-transform:uppercase;letter-spacing:1.1px;
   font-weight:800;border-bottom:2px solid ${BLEU};padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:10.4px}
th{background:#eef3fb;color:#46536b;font-size:8.6px;text-transform:uppercase;letter-spacing:.9px;
   padding:5px 9px;text-align:left;font-weight:700}
td{border-bottom:1px solid #e6eaf1;padding:5px 9px;vertical-align:top}
tr:last-child td{border-bottom:0}
.c{text-align:center}
.pt{font-size:9px;color:#7a8496}
.quatre{display:flex;gap:9px;margin:12px 0 2px}
.q{flex:1;border:1.5px solid #dde4ee;border-radius:9px;padding:10px 12px}
.q .l{font-size:8.6px;text-transform:uppercase;letter-spacing:1px;color:#7a8496}
.q .v{font-size:17px;font-weight:800;color:${BLEU};margin-top:3px;line-height:1.25}
.q.complet{border-color:#9ad3b0;background:#f2fbf6}
.q.complet .v{color:#15663a;font-size:15px}
.q.incomplet{border-color:#eccfc7;background:#fdf4f1}
.q.incomplet .v{color:#B4462A;font-size:15px}
.id td{border:0;padding:3px 0}
.id .k{color:#7a8496;width:34%}
.case{width:18px;text-align:center;font-size:12px;color:${BLEU}}
.ok{color:${ENCRE}} .ko{color:#B4462A;font-weight:600}
.st{text-align:right;font-size:9px;color:#7a8496;text-transform:uppercase;letter-spacing:.4px}
.interne{background:#fdf4f1;border:1.5px solid #eccfc7;border-radius:7px;padding:9px 12px;
         margin-top:10px;font-size:10px;color:#7a2e1c}
.seances{display:flex;flex-wrap:wrap;gap:5px 7px;margin-top:2px}
.sc{border:1px solid #dde4ee;border-radius:5px;padding:3px 8px;font-size:9.8px;color:#46536b;white-space:nowrap}
.sc b{color:${ENCRE}}
.pied{margin-top:10px;padding-top:6px;border-top:1px solid #e6eaf1;color:#98a1b2;font-size:7.8px}
</style></head><body>
<div class="hd">
  <div><div class="t">Fiche stagiaire</div>
  <div class="s">${esc(nom) || "—"}</div></div>
  <div class="r">MYSTORY Formation${fiche.numeroDossier ? `<br>Dossier ${esc(fiche.numeroDossier)}` : ""}
  <br>Éditée le ${new Date().toLocaleDateString("fr-FR")}</div>
</div>

<div class="quatre">
  <div class="q"><div class="l">Heures prévues</div><div class="v">${esc(heures)}</div></div>
  <div class="q"><div class="l">Dates des cours</div><div class="v" style="font-size:13px">${datesCours}</div></div>
  <div class="q"><div class="l">Examen</div><div class="v" style="font-size:13px">${examen}</div></div>
  ${equipe
    ? `<div class="q ${complet ? "complet" : "incomplet"}"><div class="l">Dossier</div>
       <div class="v">${complet ? "COMPLET" : `${manquantes.length} pièce${manquantes.length > 1 ? "s" : ""} manquante${manquantes.length > 1 ? "s" : ""}`}</div></div>`
    : `<div class="q"><div class="l">Niveau visé</div><div class="v">${esc(fiche.niveauVise ?? "—")}</div></div>`}
</div>

<h2>Le stagiaire</h2>
<table class="id">
  <tr><td class="k">Nom et prénom</td><td><b>${esc(nom) || "—"}</b></td>
      <td class="k">Né(e) le</td><td>${dateFr(fiche.dateNaissance)}${fiche.villeNaissance ? ` à ${esc(fiche.villeNaissance)}` : ""}</td></tr>
  <tr><td class="k">Adresse</td><td>${esc([fiche.adresse, fiche.cp, fiche.ville].filter(Boolean).join(", ")) || "—"}</td>
      <td class="k">Téléphone</td><td>${esc(fiche.telephone ?? "—")}</td></tr>
  <tr><td class="k">Courriel</td><td>${esc(fiche.email ?? "—")}</td>
      <td class="k">Centre</td><td>${esc(fiche.agence ?? "—")}</td></tr>
</table>

<h2>Le parcours</h2>
<table class="id">
  <tr><td class="k">Niveau au test</td><td><b>${esc(fiche.niveauInitial ?? "à évaluer")}</b> &rarr; <b>${esc(fiche.niveauVise ?? "—")}</b></td>
      <td class="k">Formatrice</td><td>${esc(fiche.formatrice ?? "à désigner")}</td></tr>
  <tr><td class="k">Financement</td><td>${esc(fiche.financement ?? "—")}${fiche.montant != null ? ` · ${Number(fiche.montant)} €` : ""}</td>
      <td class="k">Heures réalisées</td><td>${fiche.heuresRealisees != null ? `${fiche.heuresRealisees} h` : "—"} sur ${esc(heures)}</td></tr>
</table>

${seancesTriees.length ? `<h2>Les séances &mdash; ${seancesTriees.length} au total</h2>
<div class="seances">${lignesSeances}</div>` : ""}

${equipe ? `<h2>Les pièces du dossier</h2>
<table><tbody>${lignesPieces || '<tr><td class="pt">Aucune pièce enregistrée pour ce dossier.</td></tr>'}</tbody></table>
<div class="interne"><b>Document interne — ne se remet pas au stagiaire.</b>
${complet
  ? "Toutes les pièces obligatoires sont au dossier."
  : `Il manque : ${esc(manquantes.map((p: any) => LIBELLE_PIECE[p.type] ?? p.type).join(" · "))}. Un dossier incomplet n'est pas remboursé par la Caisse des dépôts.`}
</div>` : `<h2>Ce qu'il faut apporter</h2>
<table><tbody>
  <tr><td>Votre <b>pièce d'identité en cours de validité</b>, le jour de l'examen comme aux séances.</td></tr>
  <tr><td>Votre <b>convocation</b> le jour de l'examen, et présentez-vous <b>15 minutes avant</b>.</td></tr>
  <tr><td>Une question ? <b>06 81 43 16 54</b> · secretariat@mystoryformation.fr</td></tr>
</tbody></table>`}

<div class="pied">MYSTORY Formation &middot; SASU &middot; SIRET 913 423 083 00017 &middot; NDA 11756521775
(cet enregistrement ne vaut pas agrément de l'État) &middot; certifié Qualiopi au titre des actions de formation.
${equipe ? "Document interne, ne pas diffuser hors de l'équipe." : "Document remis au stagiaire."}</div>
</body></html>`;

  try {
    const contenu = await renderPdf(html);
    const base = [fiche.nom, fiche.prenom].filter(Boolean).join("_") || "dossier";
    return {
      nom: `Fiche_stagiaire_${base.replace(/[^\p{L}\p{N}_-]+/gu, "_")}${equipe ? "" : "_remise"}.pdf`,
      contenu,
    };
  } catch (e: any) {
    return { erreur: "Rendu PDF échoué : " + (e?.message || String(e)), code: 500 };
  }
}

export function echecFiche(r: FichePdf | EchecFiche): r is EchecFiche {
  return (r as EchecFiche).erreur !== undefined;
}
