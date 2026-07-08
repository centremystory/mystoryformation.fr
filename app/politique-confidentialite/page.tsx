// app/politique-confidentialite/page.tsx — Politique de confidentialité PUBLIQUE (RGPD art. 13)
// ⚠️ Ne pas confondre avec /confidentialite (gestion interne des contrats de confidentialité équipe).
// Page statique, accessible sans authentification (déclarée dans CHEMINS_PUBLICS du middleware).
// Référencée depuis : formulaires publics (QCM, satisfaction, kiosque, questionnaire formateur),
// pieds d'email (lib/email.ts) et documents remis aux stagiaires.

export const metadata = {
  title: "Politique de confidentialité — MYSTORY Formation",
  description:
    "Comment MYSTORY (organisme de formation FLE et centre d'examen TEF IRN) traite et protège vos données personnelles.",
};

const BLEU = "#2F72DE";
const MARINE = "#293A4A";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        color: MARINE,
        fontSize: 20,
        margin: "28px 0 8px",
        borderBottom: `2px solid ${BLEU}`,
        paddingBottom: 4,
      }}
    >
      {children}
    </h2>
  );
}

export default function PolitiqueConfidentialitePage() {
  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "32px 20px 60px",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#2b3949",
        lineHeight: 1.65,
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: BLEU, letterSpacing: 2 }}>MYSTORY</div>
        <h1 style={{ fontSize: 26, color: MARINE, margin: "8px 0 2px" }}>Politique de confidentialité</h1>
        <p style={{ color: "#6b7a8c", margin: 0 }}>Dernière mise à jour : 8 juillet 2026</p>
      </header>

      <p>
        MYSTORY accorde une grande importance à la protection de vos données personnelles. La présente
        politique explique quelles données nous collectons, pourquoi, combien de temps nous les conservons
        et quels sont vos droits, conformément au Règlement général sur la protection des données (RGPD)
        et à la loi Informatique et Libertés.
      </p>

      <H2>1. Responsable de traitement</H2>
      <p>
        <strong>MYSTORY</strong> — SASU au capital de 1 000 € · SIRET 913 423 083 00017 · organisme de
        formation (NDA 11756521775 — cet enregistrement ne vaut pas agrément de l&apos;État) et centre
        d&apos;examen TEF IRN.
        <br />
        Adresse : 3 bis avenue de Gagny, 93220 Gagny.
        <br />
        Contact données personnelles : <a href="mailto:contact@mystoryformation.fr">contact@mystoryformation.fr</a> · 06 81 43 16 54.
      </p>

      <H2>2. Données que nous collectons</H2>
      <ul>
        <li><strong>Identité et coordonnées</strong> : civilité, nom, prénom, e-mail, téléphone, adresse.</li>
        <li>
          <strong>Parcours de formation</strong> : résultats des tests de positionnement et des évaluations
          (y compris, le cas échéant, les enregistrements audio des épreuves d&apos;expression orale),
          niveaux CECRL, présence et émargements, documents contractuels signés.
        </li>
        <li><strong>Examens</strong> : inscriptions, convocations, résultats et attestations (TEF IRN, examen civique).</li>
        <li><strong>Facturation et financement</strong> : devis, factures, reçus, informations de prise en charge (CPF, OPCO, France Travail).</li>
        <li><strong>Échanges</strong> : messages envoyés via nos formulaires de contact ou de pré-inscription, réponses aux questionnaires de satisfaction.</li>
      </ul>
      <p>Nous ne collectons aucune donnée dite « sensible » et ne prenons aucune décision entièrement automatisée à votre égard.</p>

      <H2>3. Pourquoi nous traitons vos données (finalités et bases légales)</H2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: `2px solid ${BLEU}`, padding: "6px 8px", color: BLEU }}>Finalité</th>
            <th style={{ textAlign: "left", borderBottom: `2px solid ${BLEU}`, padding: "6px 8px", color: BLEU }}>Base légale</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Gestion de votre inscription, de votre formation et de vos examens (tests, planning, émargement, convocations, attestations)", "Exécution du contrat"],
            ["Obligations liées au financement et à la qualité : CPF / EDOF / Caisse des Dépôts, OPCO, France Travail, certification Qualiopi, bilan pédagogique et financier", "Obligation légale"],
            ["Facturation et comptabilité", "Obligation légale"],
            ["Réponse à vos demandes (contact, pré-inscription) et suivi de satisfaction", "Intérêt légitime / mesures précontractuelles"],
            ["Amélioration de nos services (statistiques anonymisées)", "Intérêt légitime"],
          ].map(([f, b]) => (
            <tr key={f as string}>
              <td style={{ borderBottom: "1px solid #d8e0ea", padding: "6px 8px" }}>{f}</td>
              <td style={{ borderBottom: "1px solid #d8e0ea", padding: "6px 8px", whiteSpace: "nowrap" }}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H2>4. Durées de conservation</H2>
      <ul>
        <li><strong>Dossier de formation et pièces de conformité</strong> (convention, émargements, évaluations, attestations…) : <strong>5 ans</strong> à compter de la fin de la formation (obligations Qualiopi / financeurs).</li>
        <li><strong>Documents comptables</strong> (factures, reçus) : <strong>10 ans</strong> (Code de commerce).</li>
        <li><strong>Prospects</strong> (contact, pré-inscription sans suite) : <strong>3 ans</strong> après le dernier échange.</li>
      </ul>
      <p>À l&apos;issue de ces durées, les données sont supprimées ou anonymisées.</p>

      <H2>5. Qui accède à vos données</H2>
      <p>
        Vos données sont traitées par l&apos;équipe MYSTORY (habilitée et soumise à confidentialité) et par
        nos sous-traitants techniques, chacun pour la seule mission qui le concerne :
      </p>
      <ul>
        <li>hébergement de l&apos;application et de la base de données (Vercel, Supabase) ;</li>
        <li>signature électronique des documents (DocuSeal) ;</li>
        <li>envoi d&apos;e-mails (IONOS) et téléphonie (Aircall) ;</li>
        <li>automatisation interne des relances et notifications (n8n).</li>
      </ul>
      <p>
        Certaines données sont transmises à des <strong>destinataires légaux</strong> lorsque votre parcours
        l&apos;exige : le certificateur (CCI Paris Île-de-France / Le Français des Affaires) pour
        l&apos;inscription et les résultats d&apos;examen, et vos financeurs (Caisse des Dépôts / EDOF, OPCO,
        France Travail). Vos données ne sont <strong>jamais vendues</strong>.
      </p>
      <p>
        Lorsqu&apos;un prestataire traite des données en dehors de l&apos;Union européenne, ce transfert est
        encadré par des garanties appropriées (clauses contractuelles types de la Commission européenne).
      </p>

      <H2>6. Sécurité</H2>
      <p>
        Accès à l&apos;espace de gestion protégé par authentification, chiffrement des échanges (HTTPS),
        documents stockés dans un espace privé avec liens d&apos;accès à durée limitée, journalisation des
        actions et principe de non-suppression des pièces contractuelles pendant leur durée légale de
        conservation.
      </p>

      <H2>7. Cookies</H2>
      <p>
        Nos pages n&apos;utilisent que des cookies strictement techniques (session de connexion de
        l&apos;équipe). Aucun cookie publicitaire ou de suivi n&apos;est déposé par cette application.
      </p>

      <H2>8. Vos droits</H2>
      <p>
        Vous disposez des droits d&apos;<strong>accès</strong>, de <strong>rectification</strong>,
        d&apos;<strong>effacement</strong>, de <strong>limitation</strong>, d&apos;<strong>opposition</strong> et
        de <strong>portabilité</strong> sur vos données. Pour les exercer, écrivez-nous à{" "}
        <a href="mailto:contact@mystoryformation.fr">contact@mystoryformation.fr</a> (réponse sous un mois).
        Certaines données ne peuvent toutefois pas être supprimées avant la fin de leur durée légale de
        conservation (dossiers de formation financés, pièces comptables).
      </p>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL :{" "}
        <a href="https://www.cnil.fr" rel="noopener noreferrer" target="_blank">www.cnil.fr</a>.
      </p>

      <H2>9. Médiation de la consommation</H2>
      <p>
        Pour tout litige de consommation non résolu après réclamation écrite, vous pouvez saisir
        gratuitement le médiateur <strong>CM2C</strong> (<a href="https://cm2c.net" rel="noopener noreferrer" target="_blank">cm2c.net</a>).
      </p>

      <footer style={{ marginTop: 36, paddingTop: 10, borderTop: "1px solid #d8e0ea", fontSize: 12.5, color: "#8a97a6", textAlign: "center" }}>
        MYSTORY — SASU · SIRET 913 423 083 00017 · 3 bis avenue de Gagny, 93220 Gagny ·
        contact@mystoryformation.fr · 06 81 43 16 54
      </footer>
    </main>
  );
}
