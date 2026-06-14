/**
 * MYSTORY — Gabarits des documents formateur (charte + contrat de sous-traitance).
 * HTML autonome, fusionné en mémoire (pas de fichier), avec champ de signature DocuSeal
 * pour le rôle « Formateur ». L'organisme est pré-signé (mention texte). Lieu = Gagny.
 */

export type FormateurDoc = {
  id: string;
  civilite?: string | null;
  prenom?: string | null;
  nom: string;
  email?: string | null;
  telephone?: string | null;
  type?: string | null;
  raison_sociale?: string | null;
  siret?: string | null;
  adresse?: string | null;
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
function nomComplet(f: FormateurDoc): string {
  return [f.civilite, f.prenom, f.nom].filter(Boolean).map(esc).join(" ");
}
function jourFr(): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());
}

const STYLE = `
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:12px;line-height:1.5;margin:32px;}
  h1{color:#2F72DE;font-size:18px;margin:0 0 4px;}
  h2{color:#2F72DE;font-size:13px;margin:18px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:3px;}
  .entete{border-bottom:2px solid #2F72DE;padding-bottom:8px;margin-bottom:16px;}
  .muted{color:#666;font-size:11px;}
  table.parties{width:100%;border-collapse:collapse;margin:8px 0;}
  table.parties td{vertical-align:top;width:50%;padding:8px;border:1px solid #e5e7eb;}
  ul{margin:6px 0 6px 18px;padding:0;}
  li{margin:3px 0;}
  .sign{margin-top:28px;display:flex;justify-content:space-between;gap:24px;}
  .sign .bloc{width:46%;}
  .pied{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:8px;color:#666;font-size:10px;}
`;

function entete(): string {
  return `
  <div class="entete">
    <h1>MYSTORY</h1>
    <div class="muted">
      Organisme de formation — SASU · RCS Paris 913 423 083 · SIRET 913 423 083 00017<br>
      Déclaration d'activité enregistrée sous le n° 11756521775 (ne vaut pas agrément de l'État)<br>
      Site de formation : 3 bis avenue de Gagny, 93220 Gagny · contact@mystoryformation.fr
    </div>
  </div>`;
}
function pied(): string {
  return `<div class="pied">Document établi à Gagny, le ${jourFr()}. MYSTORY — la déclaration d'activité ne vaut pas agrément de l'État.</div>`;
}
function blocFormateur(f: FormateurDoc): string {
  return `
    <strong>Le formateur</strong><br>
    ${nomComplet(f)}<br>
    ${f.raison_sociale ? esc(f.raison_sociale) + "<br>" : ""}
    ${f.siret ? "SIRET : " + esc(f.siret) + "<br>" : ""}
    ${f.adresse ? esc(f.adresse) + "<br>" : ""}
    ${f.email ? esc(f.email) + "<br>" : ""}
    ${f.telephone ? esc(f.telephone) : ""}`;
}
function blocSignatures(): string {
  return `
  <div class="sign">
    <div class="bloc">
      <strong>Pour l'organisme MYSTORY</strong><br>
      Arudhan NATKUNASINGAM, Président<br>
      <span class="muted">Signé électroniquement par l'organisme.</span>
    </div>
    <div class="bloc">
      <strong>Le formateur</strong><br>
      Signature : <signature-field role="Formateur"></signature-field><br>
      Fait le : <date-field role="Formateur"></date-field>
    </div>
  </div>`;
}

export function charteHtml(f: FormateurDoc): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
  ${entete()}
  <h1>Charte du formateur</h1>
  <p class="muted">Engagements de qualité applicables à toute personne assurant des actions de formation pour MYSTORY.</p>

  <table class="parties"><tr><td>${blocFormateur(f)}</td><td>
    <strong>L'organisme</strong><br>MYSTORY (SASU)<br>Site : Gagny (93220)<br>NDA 11756521775
  </td></tr></table>

  <h2>1. Qualité pédagogique</h2>
  <ul>
    <li>Préparer et animer les séances conformément au programme et aux objectifs visés (référentiel CECRL).</li>
    <li>Adapter les contenus au niveau réel et aux besoins des apprenants.</li>
    <li>Évaluer les acquis de façon objective et tracée (évaluations initiale et finale cohérentes).</li>
  </ul>

  <h2>2. Conformité &amp; traçabilité</h2>
  <ul>
    <li>Émarger chaque demi-journée et faire émarger les apprenants (signatures non antidatées).</li>
    <li>Respecter les exigences Qualiopi et la réglementation de la formation professionnelle.</li>
    <li>Transmettre à l'organisme tout justificatif requis (qualification FLE, supports, suivis).</li>
  </ul>

  <h2>3. Déontologie</h2>
  <ul>
    <li>Ponctualité, assiduité et respect des apprenants ; neutralité et bienveillance.</li>
    <li>Confidentialité des données personnelles des apprenants (RGPD).</li>
    <li>Signalement à l'organisme de toute difficulté ou situation à risque.</li>
  </ul>

  <p>Le formateur déclare avoir pris connaissance de la présente charte et s'engage à la respecter.</p>
  ${blocSignatures()}
  ${pied()}
  </body></html>`;
}

export function contratHtml(f: FormateurDoc): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
  ${entete()}
  <h1>Contrat de sous-traitance de prestation de formation</h1>

  <h2>Entre les parties</h2>
  <table class="parties"><tr>
    <td><strong>Le donneur d'ordre</strong><br>MYSTORY (SASU)<br>SIRET 913 423 083 00017<br>Site : 3 bis av. de Gagny, 93220 Gagny<br>NDA 11756521775</td>
    <td>${blocFormateur(f)}<br><span class="muted">ci-après « le sous-traitant »</span></td>
  </tr></table>

  <h2>Article 1 — Objet</h2>
  <p>Le sous-traitant réalise, pour le compte de MYSTORY, des prestations d'animation de formation en français
  (FLE / préparation aux certifications TEF IRN et LEVELTEL), selon les programmes et plannings communiqués par l'organisme.</p>

  <h2>Article 2 — Obligations du sous-traitant</h2>
  <ul>
    <li>Assurer les prestations avec compétence, dans le respect de la Charte du formateur et des exigences Qualiopi.</li>
    <li>Justifier de sa qualification (notamment FLE) et de son statut professionnel à jour.</li>
    <li>Assurer l'émargement et la traçabilité ; ne jamais antidater de document.</li>
    <li>Respecter la confidentialité et le RGPD ; ne pas démarcher directement les apprenants.</li>
  </ul>

  <h2>Article 3 — Indépendance</h2>
  <p>Le sous-traitant agit en toute indépendance, sous sa propre responsabilité, sans lien de subordination.
  Il conserve la charge de ses obligations sociales et fiscales.</p>

  <h2>Article 4 — Rémunération</h2>
  <p>La rémunération des prestations est définie par bon de commande ou avenant, selon le volume horaire réalisé et tracé.</p>

  <h2>Article 5 — Confidentialité &amp; propriété</h2>
  <p>Les informations et supports échangés sont confidentiels. Les supports produits dans le cadre de la prestation
  peuvent être utilisés par l'organisme pour les besoins des formations.</p>

  <h2>Article 6 — Durée</h2>
  <p>Le présent contrat prend effet à sa signature et s'applique aux prestations confiées, jusqu'à dénonciation par l'une des parties.</p>

  <p>Fait à Gagny, en deux exemplaires.</p>
  ${blocSignatures()}
  ${pied()}
  </body></html>`;
}
