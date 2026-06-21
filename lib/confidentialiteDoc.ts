/**
 * MYSTORY — Contrat / engagement de confidentialité (tous postes).
 * Tronc commun identique pour tous + annexe « périmètre d'accès » calculée depuis les
 * rôles de la personne (union, polyvalence). Lieu = Gagny. Signataire unique (le membre).
 * Texte validé par la Direction (modèle standard, aligné RGPD). 1 signataire DocuSeal.
 */
import { ROLE_LABEL, type Role } from "@/lib/roles";

export type CibleConfidentialite = {
  nom: string;
  prenom?: string | null;
  email: string;
  poste?: string | null;
  roles: string[]; // rôles CRM → périmètre (union)
};

/** Périmètre d'accès affiché dans l'annexe, par rôle. */
const PERIMETRES: Record<Role, string> = {
  direction: "Accès complet à l'ensemble des données et fonctions du CRM.",
  manager:
    "Périmètre élargi : suivi de l'équipe, reporting, dossiers et examens — hors données financières sensibles réservées à la Direction.",
  commercial:
    "Prospects, inscriptions, ventes d'examens et coordonnées des candidats.",
  formatrice:
    "Données pédagogiques des stagiaires (identité, niveau, tests, émargement), contenus et séquençage.",
  back_office:
    "Dossiers stagiaires, documents administratifs, conventions, facturation et pièces justificatives.",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function jourFr(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

function nomComplet(c: CibleConfidentialite): string {
  return `${esc(c.prenom ?? "")} ${esc(c.nom)}`.trim();
}

/** Lignes d'annexe = union des périmètres des rôles (déduplliqué, ordre stable). */
function lignesPerimetre(roles: string[]): string {
  const ordre: Role[] = ["direction", "manager", "commercial", "formatrice", "back_office"];
  const actifs = ordre.filter((r) => roles.includes(r));
  if (actifs.length === 0) {
    return `<tr><td><strong>Périmètre</strong></td><td>Données auxquelles la personne accède dans le cadre de sa mission, selon les habilitations qui lui sont accordées.</td></tr>`;
  }
  return actifs
    .map((r) => `<tr><td><strong>${esc(ROLE_LABEL[r])}</strong></td><td>${esc(PERIMETRES[r])}</td></tr>`)
    .join("\n");
}

export function contratConfidentialiteHtml(c: CibleConfidentialite): string {
  const poste = c.poste ? esc(c.poste) : (c.roles.length > 0 ? c.roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(" · ") : "Membre de l'équipe");
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Engagement de confidentialité — ${nomComplet(c)}</title>
<style>
:root{--blue:#2F72DE;--navy:#1A4488;--grey:#5A6472;--bord:#C9D7EF;--ink:#23303f;}
*{box-sizing:border-box;}
body{font-family:'Segoe UI',Calibri,Arial,sans-serif;color:var(--ink);margin:0;background:#fff;line-height:1.5;font-size:10.5pt;}
.sheet{max-width:800px;margin:0 auto;padding:26px 34px 30px;}
.brand{font-size:22px;font-weight:800;color:var(--blue);letter-spacing:1px;}
.head{border-bottom:2px solid var(--blue);padding-bottom:8px;margin-bottom:14px;}
.head .sub{font-size:8.6pt;color:var(--grey);}
h1{font-size:15pt;color:var(--navy);text-align:center;margin:6px 0 14px;}
h2{font-size:11pt;color:var(--navy);margin:14px 0 4px;}
p{margin:5px 0;}
table{border-collapse:collapse;width:100%;margin:8px 0;}
td{border:1px solid var(--bord);padding:6px 8px;vertical-align:top;font-size:9.6pt;}
.parties td{width:50%;}
.sig{margin-top:22px;display:flex;justify-content:flex-end;}
.sigbox{width:300px;}
.sigwho{font-size:9pt;color:var(--grey);margin-bottom:2px;}
.pied{margin-top:18px;font-size:8.2pt;color:var(--grey);border-top:1px solid var(--bord);padding-top:6px;}
</style></head>
<body><div class="sheet">

  <div class="head">
    <div class="brand">MYSTORY</div>
    <div class="sub">SASU · NDA 11756521775 · SIRET 913 423 083 00017 · Site de formation : 3 bis avenue de Gagny, 93220 Gagny · contact@mystoryformation.fr</div>
  </div>

  <h1>Engagement de confidentialité</h1>

  <table class="parties"><tr>
    <td><strong>L'Organisme</strong><br>MYSTORY (SASU)<br>SIRET 913 423 083 00017 · NDA 11756521775<br>3 bis avenue de Gagny, 93220 Gagny<br>Représentée par M. Arudhan NATKUNASINGAM, Président</td>
    <td><strong>Le Signataire</strong><br>${nomComplet(c)}<br>Poste : ${poste}<br>${esc(c.email)}</td>
  </tr></table>

  <p><strong>Préambule.</strong> Dans l'exercice de ses fonctions, le Signataire accède à des informations confidentielles, en particulier à des <strong>données à caractère personnel de stagiaires et de candidats</strong> (identité, coordonnées, parcours, résultats d'évaluation), ainsi qu'à des informations pédagogiques, commerciales, administratives et financières de l'Organisme.</p>

  <h2>Article 1 — Objet</h2>
  <p>Le présent engagement définit les obligations de confidentialité du Signataire pendant et après sa collaboration avec l'Organisme.</p>

  <h2>Article 2 — Informations confidentielles</h2>
  <p>Constitue une information confidentielle toute information non publique portée à la connaissance du Signataire, notamment : données personnelles des stagiaires et candidats, dossiers de formation, résultats et copies d'examens, fichiers de prospects, informations financières et tarifaires, méthodes et supports pédagogiques, identifiants et accès au système d'information.</p>

  <h2>Article 3 — Engagements du Signataire</h2>
  <p>Le Signataire s'engage à : ne pas divulguer ces informations à des tiers ; ne les utiliser que pour les besoins stricts de sa mission ; ne pas les copier, extraire ou conserver hors du cadre professionnel ; protéger ses identifiants d'accès ; et signaler sans délai toute perte, fuite ou accès anormal.</p>

  <h2>Article 4 — Protection des données personnelles (RGPD)</h2>
  <p>Le Signataire agit sous l'autorité de l'Organisme, responsable de traitement. Il ne traite les données personnelles que pour les finalités liées à sa mission, dans la limite de son périmètre d'accès (Annexe), respecte leur sécurité et leur secret, et ne les conserve pas hors du système d'information de l'Organisme.</p>

  <h2>Article 5 — Périmètre d'accès</h2>
  <p>Le périmètre des données et fonctions auxquelles le Signataire a accès est défini en Annexe, selon son ou ses rôles. Tout accès à des données hors de ce périmètre est interdit.</p>

  <h2>Article 6 — Durée</h2>
  <p>Le présent engagement s'applique pendant toute la durée de la collaboration du Signataire avec l'Organisme. L'obligation de secret portant sur les <strong>données à caractère personnel demeure de plein droit après le terme de la collaboration</strong>, en application du Règlement général sur la protection des données et de l'article 226-13 du Code pénal.</p>

  <h2>Article 7 — Restitution</h2>
  <p>À la fin de la collaboration, le Signataire restitue ou détruit tout support contenant des informations confidentielles et cesse tout accès au système d'information.</p>

  <h2>Article 8 — Manquement</h2>
  <p>Tout manquement engage la responsabilité du Signataire et peut constituer une faute (sanction disciplinaire ou rupture de la collaboration), sans préjudice des poursuites prévues par la loi, notamment l'article 226-13 du Code pénal et le RGPD.</p>

  <h2>Annexe — Périmètre d'accès</h2>
  <table>${lignesPerimetre(c.roles)}</table>

  <p style="margin-top:14px;">Fait à Gagny, le ${jourFr()}.</p>

  <div class="sig"><div class="sigbox">
    <div class="sigwho">Le Signataire (lu et approuvé)</div>
    <signature-field name="Signature" role="Signataire" required="true" style="width:240px;height:52px;display:block;"></signature-field>
    <div style="margin-top:6px;">Le <date-field name="Date" role="Signataire" format="DD/MM/YYYY" required="true" style="width:110px;height:18px;display:inline-block;"></date-field></div>
  </div></div>

  <div class="pied">Document établi à Gagny. MYSTORY — la déclaration d'activité ne vaut pas agrément de l'État.</div>
</div></body></html>`;
}
