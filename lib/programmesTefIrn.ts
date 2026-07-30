/**
 * MYSTORY — Programmes TEF IRN par offre (Annexe 1 de la convention).
 *
 * Le programme n'est plus générique : il s'adapte à l'offre suivie par le stagiaire
 * (Objectif A2 / B1 / B2 / Intensif). L'offre est déduite des `heuresPrevues` du
 * dossier — les durées sont uniques dans le catalogue v6 (cf. formuleParHeures).
 *
 * Le fragment renvoyé est injecté en HTML BRUT dans convention.html (marqueur
 * <!--PROGRAMME_OFFRE-->), AVANT la substitution des {{balises}} : on peut donc y
 * conserver {{certif_code}}, {{duree_heures}}, {{of_email}}, {{of_tel}}.
 *
 * Source de vérité des tarifs/durées : lib/inscriptions/regles.ts (CATALOGUE).
 * Contenu pédagogique : programmes officiels MYSTORY (fiches EDOF TEF IRN, RS6775).
 */
import { CATALOGUE, formuleParHeures, type Offre } from "@/lib/inscriptions/regles";

type Sequence = { titre: string; objectif: string };

type ProgSpec = {
  intitule: string;      // h2
  soustitre: string;     // .subt
  niveauSortie: string;  // ligne « Objectif général · Niveau de sortie »
  publicVise: string;    // ligne « Public »
  prerequis: string;     // ligne « Prérequis »
  finalite: string;      // 1er paragraphe « Objectif pédagogique »
  capacites: string[];   // « À l'issue, le participant sera capable de… »
  sequences: Sequence[]; // « Contenu » — les modules/séquences du parcours
  examensBlancs: string; // nb d'examens blancs selon la formule
};

// Compétences attestées par la fiche RS6775 — communes aux 4 offres.
const RS6775 =
  "Le parcours développe, au niveau visé, les quatre compétences attestées par la fiche RS6775 : " +
  "analyser des documents écrits courts · analyser des énoncés oraux personnels et professionnels · " +
  "rédiger des textes courts en situation courante ou professionnelle · interagir à l'oral avec le " +
  "registre et le vocabulaire adéquats.";

const SPECS: Record<Offre, ProgSpec> = {
  A2: {
    intitule: "Français du quotidien et de l'emploi — Objectif A2",
    soustitre: "Préparer son TEF IRN — de A1 vers A2 (CECRL)",
    niveauSortie: "A2 (CECRL) — de A1 vers A2, validé par le TEF IRN (RS6775)",
    publicVise:
      "Personne étrangère/non francophone en situation régulière visant l'emploi, la formation ou " +
      "l'intégration. Le niveau A2 est exigé depuis le 01/01/2026 pour la carte de séjour pluriannuelle.",
    prerequis:
      "Niveau A1 (CECRL) vérifié par le test de positionnement gratuit (ou justificatif de moins de 2 ans) ; " +
      "être âgé d'au moins 16 ans ; savoir lire des phrases simples ; ne pas être en situation d'analphabétisme.",
    finalite:
      "Ce parcours permet d'acquérir les compétences de communication en français nécessaires pour accéder " +
      "à un emploi, suivre une formation professionnelle ou s'intégrer durablement dans un environnement de " +
      "travail francophone. Il prépare des candidats de niveau A1 à atteindre le niveau A2 du CECRL et à le " +
      "valider par la certification TEF IRN (RS6775).",
    capacites: [
      "Comprendre des messages oraux simples de la vie quotidienne et professionnelle (annonces, messages, échanges de service).",
      "Lire et comprendre des documents courts et courants (consignes, affiches, formulaires, messages).",
      "Se présenter, demander et donner des informations simples, interagir dans les situations courantes.",
      "Rédiger un message court (≈ 40 mots) et une lettre simple (≈ 100 mots) selon les consignes du TEF IRN.",
      "Maîtriser le format des 4 épreuves et les stratégies de réussite au niveau A2.",
    ],
    sequences: [
      { titre: "Séquence 0 — Positionnement initial", objectif: "Évaluer le niveau réel dans les 4 compétences du CECRL et définir la formule du parcours (test de 45 min + entretien individuel, avant l'entrée en formation)." },
      { titre: "Séquence 1 — Se présenter, parler de soi et de son environnement", objectif: "Comprendre et produire des énoncés simples sur soi, sa famille, son logement, son quotidien." },
      { titre: "Séquence 2 — Les démarches et les services du quotidien", objectif: "Interagir dans les services essentiels : poste, mairie, transports, pharmacie, médecin." },
      { titre: "Séquence 3 — Le travail au quotidien", objectif: "Communiquer simplement dans son environnement de travail et dans sa recherche d'emploi." },
      { titre: "Séquence 4 — Le TEF IRN en pratique", objectif: "Maîtriser le format exact des 4 épreuves et les stratégies de réussite au niveau A2." },
      { titre: "Séquence 5 — Examens blancs et derniers réglages", objectif: "Se préparer aux conditions réelles et combler les dernières lacunes avant le passage." },
      { titre: "Formule Renforcée — 4 séances supplémentaires", objectif: "Consolider les bases d'un niveau A1 fragile : phonétique, ateliers d'écriture, vocabulaire professionnel, examen blanc supplémentaire." },
    ],
    examensBlancs: "2 à 3",
  },
  B1: {
    intitule: "Gagner en autonomie professionnelle et administrative — Objectif B1",
    soustitre: "Préparer son TEF IRN — de A2 vers B1 (CECRL)",
    niveauSortie: "B1 (CECRL) — de A2 vers B1, validé par le TEF IRN (RS6775)",
    publicVise:
      "Personne étrangère/non francophone en situation régulière souhaitant sécuriser son emploi, élargir ses " +
      "missions et réussir ses démarches. Le niveau B1 est exigé depuis le 01/01/2026 pour la carte de résident.",
    prerequis:
      "Niveau A2 (CECRL) vérifié par le test de positionnement gratuit (ou justificatif de moins de 2 ans) ; " +
      "être âgé d'au moins 16 ans ; savoir lire des phrases simples ; ne pas être en situation d'analphabétisme.",
    finalite:
      "Ce parcours permet de gagner en autonomie en français pour sécuriser son emploi, élargir ses missions, " +
      "réussir ses démarches professionnelles et administratives et accéder à de nouvelles opportunités. Il " +
      "prépare des candidats de niveau A2 à atteindre le niveau B1 du CECRL et à le valider par la certification " +
      "TEF IRN (RS6775).",
    capacites: [
      "Comprendre l'essentiel de messages et conversations sur des sujets familiers, sociaux et professionnels.",
      "Lire des textes courants (courriers administratifs, articles simples) et en dégager l'information pertinente.",
      "Raconter une expérience, décrire un projet, exprimer et justifier une opinion simple à l'oral.",
      "Rédiger un message structuré et une lettre exposant une demande ou un point de vue (critères TEF IRN).",
      "Conduire des démarches administratives courantes en français, à l'oral comme à l'écrit.",
    ],
    sequences: [
      { titre: "Séquence 0 — Positionnement initial", objectif: "Évaluer le niveau réel dans les 4 compétences du CECRL et définir la formule du parcours (test de 45 min + entretien individuel, avant l'entrée en formation)." },
      { titre: "Séquence 1 — Diagnostic et consolidation des acquis A2", objectif: "Sécuriser les fondamentaux nécessaires à la montée vers B1." },
      { titre: "Séquence 2 — Raconter, décrire, donner son avis", objectif: "Raconter une expérience, décrire une situation, exprimer une opinion simple et la justifier." },
      { titre: "Séquence 3 — L'administration sans peur", objectif: "Conduire une démarche administrative complète, à l'oral comme à l'écrit." },
      { titre: "Séquence 4 — Le français du travail", objectif: "Interagir efficacement dans son environnement professionnel." },
      { titre: "Séquence 5 — Stratégies d'examen au niveau B1", objectif: "Maîtriser la méthode de chaque épreuve pour viser la tranche 300-399 points." },
      { titre: "Séquence 6 — Examens blancs et préparation finale", objectif: "Se préparer aux conditions réelles et sécuriser le score B1." },
      { titre: "Formule Complète — 4 séances supplémentaires", objectif: "Renforcer une entrée A2 fragile : récit et description, courriers administratifs, simulations professionnelles, examen blanc supplémentaire." },
    ],
    examensBlancs: "3 à 4",
  },
  B2: {
    intitule: "Argumenter et évoluer en contexte professionnel — Objectif B2",
    soustitre: "Préparer son TEF IRN — de B1 vers B2 (CECRL)",
    niveauSortie: "B2 (CECRL) — de B1 vers B2, validé par le TEF IRN (RS6775)",
    publicVise:
      "Personne étrangère/non francophone en situation régulière souhaitant évoluer vers des postes qualifiés " +
      "et élargir sa mobilité. Le niveau B2 est exigé depuis le 01/01/2026 pour la naturalisation française.",
    prerequis:
      "Niveau B1 (CECRL) vérifié par le test de positionnement gratuit (ou justificatif de moins de 2 ans) ; " +
      "être âgé d'au moins 16 ans ; savoir lire des phrases simples ; ne pas être en situation d'analphabétisme.",
    finalite:
      "Ce parcours permet de maîtriser un français précis et nuancé pour évoluer vers des postes qualifiés, " +
      "réussir des échanges professionnels exigeants et élargir sa mobilité professionnelle. Il prépare des " +
      "candidats de niveau B1 à atteindre le niveau B2 du CECRL et à le valider par la certification TEF IRN (RS6775).",
    capacites: [
      "Comprendre des interventions orales développées (débats, reportages, entretiens).",
      "Lire et analyser des textes relativement complexes (presse, courriers argumentés, documents institutionnels).",
      "S'exprimer avec aisance, défendre un point de vue argumenté et nuancé dans une discussion.",
      "Rédiger des textes structurés et argumentés répondant aux critères du niveau B2 du TEF IRN.",
      "Adapter son registre de langue aux contextes professionnel, administratif et citoyen.",
    ],
    sequences: [
      { titre: "Séquence 0 — Positionnement initial", objectif: "Évaluer le niveau réel dans les 4 compétences du CECRL et définir la formule du parcours (test de 45 min + entretien individuel, avant l'entrée en formation)." },
      { titre: "Séquence 1 — Consolidation B1", objectif: "Sécuriser les structures du niveau B1 indispensables à la montée vers B2." },
      { titre: "Séquence 2 — Lire et écouter des documents exigeants", objectif: "Dégager la structure, le point de vue et l'implicite de documents développés." },
      { titre: "Séquence 3 — Argumenter à l'écrit", objectif: "Rédiger une prise de position structurée répondant aux critères B2 de l'épreuve d'expression écrite." },
      { titre: "Séquence 4 — Argumenter à l'oral et interagir", objectif: "Défendre un point de vue argumenté et nuancé face à un interlocuteur qui objecte." },
      { titre: "Séquence 5 — Registres et écrits formels", objectif: "Adapter registre et vocabulaire aux contextes professionnel, administratif et citoyen." },
      { titre: "Séquence 6 — Méthodologie et examens blancs", objectif: "Viser la tranche 400-499 points à chaque épreuve dans les conditions réelles." },
      { titre: "Formule Complète — 2 séances supplémentaires", objectif: "Renforcer une entrée B1 fragile sur l'écrit argumenté et multiplier les passages en conditions réelles." },
    ],
    examensBlancs: "4 à 5",
  },
  INTENSIF: {
    intitule: "Intensif — stratégies et examens blancs (A2 à B2)",
    soustitre: "Préparer son TEF IRN — sécuriser le score au niveau cible déjà atteint",
    niveauSortie: "Sécuriser le score au niveau cible déjà atteint (A2, B1 ou B2), validé par le TEF IRN (RS6775)",
    publicVise:
      "Personne étrangère/non francophone en situation régulière dont le niveau cible est déjà atteint et qui " +
      "doit le faire certifier (candidature, entrée en formation, évolution de poste, démarche administrative).",
    prerequis:
      "Niveau cible déjà atteint (A2, B1 ou B2 selon le projet), obligatoirement vérifié au test de positionnement " +
      "gratuit (ou justificatif de moins de 2 ans) ; être âgé d'au moins 16 ans ; savoir lire des phrases simples ; " +
      "ne pas être en situation d'analphabétisme.",
    finalite:
      "Ce parcours court ne vise pas une montée en niveau linguistique mais la maîtrise du format de l'examen et " +
      "des stratégies de réussite, pour sécuriser le score attendu le jour du passage. Les candidats dont le niveau " +
      "cible n'est pas atteint sont orientés vers les parcours Objectif A2, B1 ou B2.",
    capacites: [
      "Identifier le déroulement, les consignes et les critères d'évaluation des 4 épreuves du TEF IRN.",
      "Appliquer des stratégies efficaces de gestion du temps et de traitement des questions (CO / CE).",
      "Mobiliser une méthodologie éprouvée pour les tâches d'expression écrite et orale.",
      "Gérer son stress et organiser ses réponses dans les conditions réelles de l'examen.",
    ],
    sequences: [
      { titre: "Séquence 0 — Positionnement initial", objectif: "Vérifier que le niveau cible est atteint et définir la formule (test de 45 min + entretien individuel, avant l'entrée en formation)." },
      { titre: "Séquence 1 — Diagnostic complet et stratégies de compréhension", objectif: "Connaître ses forces et faiblesses par épreuve ; maîtriser les stratégies des épreuves de compréhension écrite et orale." },
      { titre: "Séquence 2 — Stratégies d'expression et examen blanc ciblé", objectif: "Maîtriser la méthode des épreuves d'expression et sécuriser les épreuves les plus faibles." },
      { titre: "Formule Complet — entraînements intégraux + examen blanc", objectif: "Automatiser la gestion des épreuves de compréhension et d'expression, puis vivre un examen blanc intégral des 4 épreuves." },
      { titre: "Formule Sérénité — 4 séances supplémentaires", objectif: "Multiplier les passages en conditions réelles (examens blancs intégraux) jusqu'à stabiliser le score attendu." },
    ],
    examensBlancs: "1 à 3",
  },
};

/** Déduit l'offre TEF IRN à partir des heures prévues (durées uniques dans le catalogue). */
export function offreParHeures(heures?: number | null): Offre | null {
  if (heures == null) return null;
  const code = formuleParHeures(Number(heures));
  return code ? CATALOGUE[code].offre : null;
}

function li(items: string[]): string {
  return items.map((t) => `<li>${t}</li>`).join("");
}

function tableFormules(offre: Offre): string {
  const rows = Object.values(CATALOGUE)
    .filter((f) => f.offre === offre)
    .sort((a, b) => a.dureeHeures - b.dureeHeures)
    .map((f) => `<tr><td class="k">${f.nomFormule} — ${f.dureeHeures} h</td><td class="v">${f.prixEuros} € net · examen TEF IRN inclus</td></tr>`)
    .join("");
  return `<table class="fields">${rows}</table>`;
}

function renduOffre(offre: Offre): string {
  const s = SPECS[offre];
  const sequences = s.sequences
    .map((sq) => `<p class="clause"><span class="h">${sq.titre}.</span> ${sq.objectif}</p>`)
    .join("\n    ");
  return `<h2>${s.intitule}</h2>
    <div class="subt">${s.soustitre}</div>

    <table class="fields">
      <tr><td class="k">Certification</td><td class="v">TEF IRN — {{certif_code}} (valable jusqu'au 01/10/2027) · certificateur : Le français des affaires (CCI Paris IDF)</td></tr>
      <tr><td class="k">Objectif général · Niveau de sortie</td><td class="v">${s.niveauSortie}</td></tr>
      <tr><td class="k">Durée · Modalité · Lieu</td><td class="v">{{duree_heures}} heures · 100 % présentiel · Gagny — 3 bis av. de Gagny, 93220 Gagny</td></tr>
      <tr><td class="k">Public</td><td class="v">${s.publicVise}</td></tr>
      <tr><td class="k">Prérequis</td><td class="v">${s.prerequis}</td></tr>
      <tr><td class="k">Délai d'accès</td><td class="v">Min. 11 jours ouvrés entre la validation EDOF et le démarrage</td></tr>
      <tr><td class="k">Type de parcours</td><td class="v">Modularisé — la formule (durée) est fixée par le test de positionnement</td></tr>
    </table>

    <h4>Objectif pédagogique</h4>
    <p class="clause">${s.finalite}</p>
    <p class="clause">${RS6775}</p>
    <p class="clause">À l'issue de la formation, le participant sera capable de :</p>
    <ul>${li(s.capacites)}</ul>

    <h4>Contenu — organisation modulaire</h4>
    <p class="clause">Chaque séquence est un module avec ses propres objectifs, activités et évaluation. Les séquences effectivement suivies dépendent de la formule fixée au positionnement.</p>
    ${sequences}

    <h4>Formules du parcours</h4>
    ${tableFormules(offre)}

    <h4>Évaluation et suivi</h4>
    <p class="clause">Test de positionnement initial gratuit (45 min, 4 compétences + entretien) avant l'entrée ; évaluations formatives à chaque séance (quiz CO/CE, productions EE/EO corrigées sur grilles critériées) ; évaluation intermédiaire en fin de chaque séquence avec point d'étape individuel ; ${s.examensBlancs} examens blancs complets en conditions réelles selon la formule. <strong>Évaluation finale obligatoire : le passage de l'examen TEF IRN</strong>, organisé dans les locaux de Gagny (centre d'examen agréé), inscription effectuée par MYSTORY, programmé sous 2 à 4 semaines après la fin de formation. Prix du test inclus.</p>

    <h4>Points forts · Références de la certification</h4>
    <p class="clause">Formateurs FLE qualifiés et expérimentés, supports originaux MYSTORY au format officiel. Le TEF IRN comporte 4 épreuves obligatoires et insécables (durée totale 1 h 30, format adaptatif depuis le 01/04/2025) : compréhension écrite (20 questions, 30 min), compréhension orale (20 questions, 20 min), expression écrite (2 sections), expression orale (2 sections de 5 min). Niveaux CECRL attestés : A2 (200-299) · B1 (300-399) · B2 (400-499). Chaque candidat reçoit une attestation officielle de résultats délivrée par Le français des affaires (CCI Paris IDF). Code NSF 136 · Formacode 15235 (FLE).</p>

    <h4>Équipe, ressources, accessibilité</h4>
    <p class="clause">Formateurs FLE qualifiés (CV/diplômes disponibles). Salle équipée, supports papier et numériques, manuels TEF IRN, outils de simulation. Locaux accessibles PMR — référent handicap : Arudhan NATKUNASINGAM ({{of_email}} · {{of_tel}}). Indicateurs de résultats (réussite, satisfaction, recommandation) publiés sur le site.`;
}

/**
 * Fragment HTML (Annexe 1 — Programme) adapté à l'offre du dossier.
 * Fallback : si le certif n'est pas TEF IRN ou si l'offre est indéterminée,
 * renvoie le programme TEF IRN générique (comportement historique préservé).
 */
export function programmeTefIrnAnnexe(params: { certif: string; heuresPrevues?: number | null }): string {
  if (params.certif !== "TEF_IRN") return PROGRAMME_GENERIQUE;
  const offre = offreParHeures(params.heuresPrevues);
  return offre ? renduOffre(offre) : PROGRAMME_GENERIQUE;
}

// Programme TEF IRN générique — utilisé en repli (offre indéterminée).
const PROGRAMME_GENERIQUE = `<h2>Préparer son test d'évaluation de français (TEF IRN)</h2>
    <div class="subt">Intégration, résidence et nationalité</div>

    <table class="fields">
      <tr><td class="k">Certification</td><td class="v">TEF IRN — {{certif_code}} (valable jusqu'au 01/10/2027) · certificateur : Le français des affaires (CCI Paris IDF)</td></tr>
      <tr><td class="k">Objectif général · Niveau de sortie</td><td class="v">Certification · A1 à B2 (CECRL)</td></tr>
      <tr><td class="k">Durée · Modalité · Lieu</td><td class="v">{{duree_heures}} heures · 100 % présentiel · Gagny — 3 bis av. de Gagny, 93220 Gagny</td></tr>
      <tr><td class="k">Public</td><td class="v">Personne étrangère/non francophone en situation régulière, visant A1 à B2 (séjour, résidence, naturalisation)</td></tr>
      <tr><td class="k">Prérequis</td><td class="v">Niveau d'entrée justifié (test de positionnement ou justificatif) ; ne pas être en situation d'analphabétisme</td></tr>
      <tr><td class="k">Délai d'accès</td><td class="v">Min. 11 jours ouvrés entre la validation EDOF et le démarrage</td></tr>
      <tr><td class="k">Type de parcours</td><td class="v">Modularisé, selon les modules nécessaires</td></tr>
    </table>

    <h4>Objectif pédagogique</h4>
    <p class="clause">Le TEF IRN mesure le niveau de compétences en français (expression et compréhension orales et écrites, interaction) en contexte professionnel et quotidien, du niveau A1 au B2 du CECRL. Il s'adresse à toute personne étrangère/non francophone en situation régulière souhaitant certifier son niveau pour une naturalisation (B2) ou une carte de résident de longue durée (A2) ; il répond aux besoins d'intégration professionnelle (accès à la formation, à l'emploi, mobilité) et sociale.</p>
    <p class="clause">À l'issue de la formation, le participant sera capable de :</p>
    <ul>
      <li>Comprendre des messages oraux simples liés à la vie quotidienne et professionnelle.</li>
      <li>Lire et comprendre des textes courts (documents d'information, correspondances simples).</li>
      <li>S'exprimer oralement de manière simple et cohérente (présenter, demander, répondre, échanger).</li>
      <li>Rédiger un texte court et structuré (formulaire, lettre, message) selon les consignes du TEF IRN.</li>
      <li>Se familiariser avec le format et les consignes du TEF IRN (entraînements, simulations).</li>
      <li>Acquérir des stratégies de réussite (gestion du temps, compréhension des consignes, organisation des réponses).</li>
    </ul>

    <h4>Contenu</h4>
    <p class="clause"><span class="h">Module I — Compréhension écrite.</span> Lire et comprendre des documents de la vie quotidienne et administrative ; repérer les informations clés (dates, lieux, montants, consignes) ; comprendre la structure et l'intention d'un message écrit ; gérer le temps imparti et la stratégie de réponse au QCM ; enrichir le vocabulaire thématique (logement, santé, travail, démarches).</p>
    <p class="clause"><span class="h">Module II — Compréhension orale.</span> Comprendre messages, annonces et dialogues de la vie courante à débit normal ; identifier l'essentiel (qui, quoi, où, quand) ; reconnaître accents, registres et situations ; s'entraîner à l'écoute unique dans les conditions de l'examen ; décoder consignes et informations pratiques.</p>
    <p class="clause"><span class="h">Module III — Expression écrite.</span> Rédiger des textes courts et structurés (message, courrier simple, formulaire) ; utiliser un vocabulaire et une grammaire adaptés ; organiser ses idées clairement ; respecter consignes et format TEF IRN ; s'entraîner à la production écrite chronométrée.</p>
    <p class="clause"><span class="h">Module IV — Expression orale.</span> S'exprimer de façon claire et cohérente ; participer à un entretien et interagir ; argumenter simplement et exprimer son opinion ; mobiliser le vocabulaire des situations courantes ; s'entraîner à l'entretien individuel dans les conditions de l'examen.</p>
    <p class="clause"><span class="h">Module V — Préparation et simulation de l'examen.</span> Épreuves blanches en conditions réelles ; feedback individualisé sur les 4 compétences ; stratégies de gestion du temps et du stress ; derniers conseils avant le passage.</p>

    <h4>Points forts · Résultats attendus</h4>
    <p class="clause">Formateurs expérimentés (plus de trois ans), connaissant les exigences des tests officiels et les stratégies de réussite. Le TEF IRN comporte 4 épreuves obligatoires et indissociables (CE, CO, EE, EO), évaluant de A1 à B2 (scores : A1 = 100-199 · A2 = 200-299 · B1 = 300-399 · B2 = 400-499). Chaque candidat reçoit une attestation de résultats précisant le niveau global atteint.</p>

    <h4>Équipe, ressources, accessibilité</h4>
    <p class="clause">Formateurs FLE qualifiés (CV/diplômes disponibles). Salle équipée, supports papier et numériques, manuels TEF IRN, outils de simulation. Locaux accessibles PMR — référent handicap : Arudhan NATKUNASINGAM ({{of_email}} · {{of_tel}}). Indicateurs de résultats (réussite, satisfaction, recommandation) publiés sur le site.`;
