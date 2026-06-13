/**
 * MYSTORY — Export BPF (CSV + HTML calé sur le Cerfa 10443*17).
 * Le HTML est rendu en PDF via lib/renderPdf. Objectif : pré-remplir tout ce que le CRM
 * sait, et marquer « à compléter » ce qui relève de la compta/RH (charges, salaires).
 * Ce document est un AIDE À LA TÉLÉDÉCLARATION — le dépôt officiel reste en ligne.
 */
import type { BpfSynthese } from "./bpf";

const OF = {
  nda: "11756521775", siret: "913 423 083 00017", naf: "8559A",
  nom: "MYSTORY (SASU)", adresse: "14 rue Bichat, 75010 Paris",
  tel: "06 81 43 16 54", email: "contact@mystoryformation.fr",
  dirigeant: "Arudhan NATKUNASINGAM", qualite: "Président",
};

const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €";
const hh = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " h";

// Mapping origine de fonds CRM → ligne du cadre C
const LIGNE_C: Record<string, string> = {
  Entreprise: "1 — Entreprises (salariés)", CPF_CDC: "2e — Compte personnel de formation (CPF)",
  France_Travail: "7 — France Travail", Region_Etat: "6 — Conseils régionaux",
  Particulier: "9 — Contrats individuels (frais propres)", Autre_OF: "10 — Autres organismes de formation",
  Autre: "11 — Autres produits", OPCO: "2h — Plan / autres dispositifs (OPCO)",
};

export function bpfCsv(s: BpfSynthese): string {
  const L: string[] = [];
  const row = (...c: (string | number)[]) => L.push(c.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";"));
  row("Section", "Poste", "Valeur");
  row("A. Identification", "NDA", OF.nda);
  row("A. Identification", "SIRET", OF.siret);
  row("A. Identification", "Dénomination", OF.nom);
  row("B. Exercice", "Période", `01/01/${s.annee} – 31/12/${s.annee}`);
  row("C. Produits", "", "");
  for (const p of s.produits.par_origine) row("C. Produits", LIGNE_C[p.origine] ?? p.libelle, p.montant);
  row("C. Produits", "TOTAL DES PRODUITS", s.produits.total);
  row("D. Charges", "dont Achats de prestations (sous-traitance CRM)", s.charges.sous_traitance_total);
  row("D. Charges", "Total charges / Salaires formateurs", "à compléter (comptabilité)");
  row("E/F. Pédagogique", "Nombre de stagiaires", s.nb_stagiaires);
  row("E/F. Pédagogique", "Heures-stagiaires (total)", s.heures_stagiaires.total);
  row("E/F. Pédagogique", "dont émargées (vivant)", s.heures_stagiaires.emargees);
  row("E/F. Pédagogique", "dont estimées (historique)", s.heures_stagiaires.estimees);
  row("F-3b. Objectif", "Certification/habilitation RS — stagiaires", s.nb_stagiaires);
  for (const c of s.par_certif) row("Par certification", `${c.code} ${c.intitule}`, `${c.dossiers} dossiers / ${c.produits} € / ${c.heures} h`);
  if (s.depot) for (const e of s.ecarts) row("Réconciliation (CRM vs déposé)", e.poste, `CRM ${e.crm} / déposé ${e.depose} / écart ${e.ecart}`);
  return "\uFEFF" + L.join("\r\n");
}

const ac = '<span style="color:#b91c1c;font-style:italic">à compléter (compta/RH)</span>';

export function bpfHtml(s: BpfSynthese): string {
  const ligneC = s.produits.par_origine
    .map((p) => `<tr><td>${LIGNE_C[p.origine] ?? p.libelle}</td><td class="r">${eur(p.montant)}</td></tr>`).join("");
  const certifs = s.par_certif
    .map((c) => `<tr><td>${c.code}${c.intitule ? " — " + c.intitule : ""}</td><td class="r">${c.dossiers}</td><td class="r">${hh(c.heures)}</td></tr>`).join("");
  const recon = s.depot ? `
    <h2>Réconciliation CRM ↔ BPF déposé${s.depot.cerfa ? ` (Cerfa ${s.depot.cerfa})` : ""}</h2>
    <table><thead><tr><th>Poste</th><th class="r">CRM</th><th class="r">Déposé</th><th class="r">Écart</th></tr></thead><tbody>
    ${s.ecarts.map((e) => `<tr><td>${e.poste}</td><td class="r">${eur(e.crm)}</td><td class="r">${eur(e.depose)}</td><td class="r" style="color:${Math.abs(e.ecart) < 1 ? "#15803d" : "#b91c1c"}">${Math.abs(e.ecart) < 1 ? "0" : (e.ecart > 0 ? "+" : "") + eur(e.ecart)}</td></tr>`).join("")}
    </tbody></table>` : "";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111; font-size:11px; }
  h1 { font-size:16px; color:#2F72DE; margin:0 0 2px; }
  .sub { color:#555; font-size:10px; margin-bottom:10px; }
  h2 { font-size:12px; background:#eef3fc; color:#1f3a66; padding:5px 8px; margin:14px 0 6px; border-radius:4px; }
  table { width:100%; border-collapse:collapse; margin:4px 0; }
  td, th { border-bottom:1px solid #e5e7eb; padding:4px 6px; text-align:left; vertical-align:top; }
  th { color:#555; font-weight:600; }
  .r { text-align:right; }
  .tot td { font-weight:700; color:#2F72DE; border-top:2px solid #2F72DE; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 16px; }
  .k { color:#555; } .v { font-weight:600; }
  .note { font-size:9px; color:#777; margin-top:10px; border-top:1px solid #eee; padding-top:6px; }
  </style></head><body>
  <h1>Bilan Pédagogique et Financier — Préparation</h1>
  <div class="sub">Exercice 01/01/${s.annee} – 31/12/${s.annee} · Cerfa 10443*17 · dépôt en ligne avant le 30 avril sur monactiviteformation.emploi.gouv.fr — aide au remplissage, valeurs calculées par le CRM</div>

  <h2>A. Identification de l'organisme</h2>
  <div class="grid">
    <div><span class="k">N° déclaration :</span> <span class="v">${OF.nda}</span></div>
    <div><span class="k">SIRET :</span> <span class="v">${OF.siret}</span> · <span class="k">NAF :</span> <span class="v">${OF.naf}</span></div>
    <div><span class="k">Dénomination :</span> <span class="v">${OF.nom}</span></div>
    <div><span class="k">Adresse :</span> <span class="v">${OF.adresse}</span></div>
    <div><span class="k">Tél :</span> <span class="v">${OF.tel}</span></div>
    <div><span class="k">Email :</span> <span class="v">${OF.email}</span></div>
  </div>

  <h2>C. Origine des produits (HT)</h2>
  <table>${ligneC}<tr class="tot"><td>TOTAL DES PRODUITS RÉALISÉS</td><td class="r">${eur(s.produits.total)}</td></tr></table>

  <h2>D. Charges</h2>
  <table>
    <tr><td>dont Achats de prestations de formation (sous-traitance saisie)</td><td class="r">${eur(s.charges.sous_traitance_total)}</td></tr>
    <tr><td>dont Salaires des formateurs</td><td class="r">${ac}</td></tr>
    <tr><td>Total des charges liées à la formation</td><td class="r">${ac}</td></tr>
  </table>

  <h2>E / F. Bilan pédagogique</h2>
  <table>
    <tr><td>Nombre de stagiaires (F-1 total)</td><td class="r">${s.nb_stagiaires}</td></tr>
    <tr><td>Heures-stagiaires suivies — total</td><td class="r">${hh(s.heures_stagiaires.total)}</td></tr>
    <tr><td>&nbsp;&nbsp;dont émargées (dossiers vivants)</td><td class="r">${hh(s.heures_stagiaires.emargees)}</td></tr>
    <tr><td>&nbsp;&nbsp;dont estimées (historique, tarif × taux)</td><td class="r">${hh(s.heures_stagiaires.estimees)}</td></tr>
    <tr><td>F-3b — Certification / habilitation RS (TEF IRN, LEVELTEL)</td><td class="r">${s.nb_stagiaires} stag. / ${hh(s.heures_stagiaires.total)}</td></tr>
    <tr><td>F-1 ventilation par type de stagiaire · F-4 spécialité (FLE)</td><td class="r">${ac}</td></tr>
  </table>
  <table><thead><tr><th>Par certification</th><th class="r">Dossiers</th><th class="r">Heures</th></tr></thead><tbody>${certifs}</tbody></table>

  ${recon}

  <h2>H. Dirigeant</h2>
  <div class="grid">
    <div><span class="k">Nom :</span> <span class="v">${OF.dirigeant}</span></div>
    <div><span class="k">Qualité :</span> <span class="v">${OF.qualite}</span></div>
    <div><span class="k">Fait à :</span> <span class="v">Gagny</span></div>
    <div><span class="k">Le :</span> <span class="v">${new Date().toLocaleDateString("fr-FR")}</span></div>
  </div>

  <p class="note">Heures historiques estimées (l'export EDOF ne contient pas les heures) ; à rapprocher des heures déclarées EDOF. Charges et salaires à compléter depuis la comptabilité. Ce document prépare la télédéclaration, il ne la remplace pas.</p>
  </body></html>`;
}
