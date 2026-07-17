# CRM MYSTORY — Dossier de référence complet

> **Source de vérité technique et métier.** Généré depuis le code et la base le 17/07/2026.
> À lire en premier par tout auditeur (humain ou Claude Code) avant d'analyser ou de modifier quoi que ce soit.

## 1 · Identité & mission

CRM back-office de **MYSTORY SASU** (organisme de formation FLE, certifié Qualiopi, centre d'examen TEF IRN — RS6775, habilité CCI Paris IDF ; LEVELTEL RS6427 sans centre d'examen). Triple mission : gagner du temps (zéro saisie manuelle), sécuriser la conformité (zéro pièce manquante en audit CDC/Qualiopi), suivre en temps réel chaque dossier.

- **Production** : https://crm.mystoryformation.fr (Vercel, team `mystoryformationfr`, projet `mystory-automatisation`)
- **Porte d'entrée candidats** : https://test.mystoryformation.fr (redirection IONOS → `/test`)
- **Repo** : `centremystory/mystoryformation.fr`, branche `main` — chaque push = déploiement (CI GitHub types+build en filet)
- **Volume** : 76 pages · 132 routes API · 37 modules lib · **36 203 lignes** TS/TSX

## 2 · Stack

Next.js **14.2.35** (App Router) · Supabase Pro (Postgres, projet `svepgknbbonrtwyvzaar`, eu-west-1, sauvegardes quotidiennes) · Vercel (+ Vercel Cron) · DocuSeal (signature eIDAS) · SMTP IONOS (`contact@mystoryformation.fr`) · n8n (`mystoryformation.app.n8n.cloud`, couche optionnelle) · puppeteer-core + @sparticuz/chromium (PDF) · pdf-lib (fusion) · Inter auto-hébergée.

## 3 · Règles absolues (invariants — ne jamais enfreindre)

1. **Aucun DELETE** : archivage `actif=false` ou statut `annule` ; purge RGPD par **anonymisation** (#73).
2. **Horodatages serveur** (`now()`, triggers) pour tout ce qui est comptable/conformité — anti-antidate structurel.
3. **Lieu de formation & « Fait à » = toujours Gagny** (seul site Qualiopi formation+examen). Sarcelles = point d'inscription. Rosny = à venir. `agence` = donnée interne.
4. **RPC `creer_inscription_formation` intouchable.**
5. **Les corrigés (`test_questions.reponse`) ne quittent jamais la base** — correction côté serveur uniquement.
6. Vocabulaire : « déclaré / habilité », **jamais « agréé »** ; le NDA ne vaut pas agrément. Communication CPF factuelle (loi anti-démarchage), remises sur fonds propres uniquement.
7. EDOF / identité numérique / CCI : **pas d'API publique** → étapes humaines pré-préparées, jamais « automatisées ».
8. Durée en heures identique sur tous les documents et EDOF · délai d'accès ≥ 11 jours ouvrés · émargement par demi-journée signé stagiaire+formateur · certificat de réalisation = déclencheur du paiement CDC.
9. Chiffres publics officiels : **556 stagiaires formés · 95 % satisfaits · 90 % de réussite · 4,9/5 (500 avis)**. Pas de formation civique (examen + plateformes partenaires).

## 4 · Sécurité & accès

- **Middleware** (`middleware.ts`) : tout est protégé par session sauf liste publique explicite (test, satisfaction, émargement signé, positionnement, kiosque, contact, pré-inscription, portail partenaire, politiques, webhooks…) — chaque chemin public est gardé par **jeton capability** et/ou **rate-limit IP + honeypot**.
- **Rôles** (`lib/roles.ts`) : `direction · manager · commercial · formatrice · back_office` (+ `partenaire` portail, + filet transitoire `staff` via ACCESS_PASSWORD, à couper une fois les connexions individuelles actives — 7 comptes créés, mots de passe définis). Gating pages (`PAGE_PERMISSIONS`) + actions (`peut()`), jetons de service sans rôle = automates (n8n/cron).
- **Base** : API REST verrouillée (#72) — anon/authenticated révoqués, tout passe par `service_role` côté serveur (`lib/supabaseAdmin`). RLS activé partout (sans policy = accès nul hors service_role). Advisors sécurité + performance : **zéro alerte critique**.
- **Sous-domaines** gérés par le middleware : `test.` → `/test` (+ variantes testinitiale/testfinale → `/test/finale`).

## 5 · Modules (par domaine)

### 🧲 Avant-vente & accueil
`/contact` + `/pre-inscription` (formulaires publics rate-limités) · `/messages` (prospects) · `/positionnements` + `/positionnement/[token]` (ancien positionnement) · `/seances-accueil` (kiosque du bureau) · `/recherche` globale · `/classement` (ventes) · `/techniques-vente` + `/faq` (base de connaissances : 77 fiches + 21 techniques) · `/test-qr` (QR & lien à diffuser, bouton « Nouveau »).

### 📝 Test de niveau (v2, chronométré)
`/test` (porte d'entrée : sur place avec accompagnant tracé / à distance) · `/test/[token]` passation **chronométrée 65 min : CE 20' → CO 20' à écoute unique → EE 15' (cartes de sujets + compteur de mots) → EO 10' (3 audios micro)** — verrouillage anti-retour, envoi auto en fin de temps · `/test/kiosque` (enchaînement tablette) · `/test/finale` (porte du test final par code/lien) · `/tests/a-noter` (notation EE/EO formatrice) · `/tests/[id]` (récap à vie : scores, rédaction, audios, conseils, encart « comment traiter ») · `/tests/banque` (+`[id]`) gestion de la banque (corrigés serveur only) · niveau provisoire CE/CO affiché au candidat · **email automatique résultats + conseils** (`lib/conseilsTest.ts` : écart niveau visé/atteint → Express 6h / Essentiel 18h / Confort 30h / Réussite 42h) · évaluation initiale/finale **PDF auto-générée** · satisfaction à chaud **auto-envoyée** à la notation du test final.

### 🎓 Formation & dossiers
`/inscriptions/nouvelle` (RPC atomique) · `/dossiers` (pièces de conformité, complétion fiche d'analyse besoin & évaluation finale, tunnel documentaire, export ZIP) · `/dossiers/conformite` + `/dossiers/edof` + `/edof` (cohérence EDOF, imports) · `/formation` (espace formation, alertes) · `/identites` (pipeline vérification d'identité 5 statuts + note de suivi) · `/suivi-eleves` · `/emargement` (+signature publique par jeton, PDF jour/feuille, scan) · `/calendrier` · `/programmes` (+modules) · `/contenu-pedagogique` · `/satisfaction-cours` · `/guide-formatrices`.

### 🎯 Examens (TEF IRN + civique)
`/examens` hub + sessions (+[id]), candidats, vente & vente-groupe, pré-inscriptions (+relances), liste d'attente, corrections, résultats, taux de réussite, croisé, jour de l'examen, remboursements (workflow avoirs), attestations de paiement · anti-surbook (trigger capacité) · carence (`lib/examenCarence`) · machine à états (`lib/statutExamen`).

### 💶 Facturation & comptabilité
`/factures` (séquence `MYS-AAAA-#####` infalsifiable, factures auto au service fait, relances) · avoirs (numérotés, jamais de suppression) · reçus de paiement · BPF (`/bpf`, dépôts, export, sous-traitance).

### 👥 RH & interne
`/equipe` (justificatifs FLE obligatoires) · `/formateurs` (+fiche, conformité, questionnaire public, circuit DocuSeal charte/contrat) · `/planning` + `/planning-employes` + `/pointage` + `/conges` · `/taches` · `/interne` (questions internes) · `/veille` · `/rapport-hebdo` · `/validations` (validations direction) · `/incidents` · `/reclamations` · `/anomalies` (+relances) · `/journal` (traçabilité) · `/direction` (cockpit) · `/comptes` (utilisateurs/rôles) · `/automatisations` · `/rgpd` (purge par anonymisation) · `/confidentialite` (NDA interne).

### 🤝 Portail partenaire
`/partenaire/[token]` (dépôts de candidats par les partenaires, jeton dédié).

## 6 · Automatisations

- **Vercel Cron natif** : `GET /api/cron/tick` chaque jour **07:10 UTC** (gardé `CRON_SECRET`, fail-closed) → signe un jeton de service 5 min et déclenche : anomalies · relances-anomalie · relances-satisfaction (chaud/froid J+90) · relances-identite (CPF J+14) · relances-sans-venue · prospects/relances · factures/relances. Chaque route garde son **verrou d'idempotence**. Résultat journalisé (`tick_quotidien`).
- **Webhook DocuSeal** (`/api/webhooks/docuseal`) : routage par `external_id` (`formateur:<id>:<type>` → circuit formateur ; `fiche_besoin:<dossierId>` ; défaut → dossier), archivage du signé, MAJ pièce.
- **n8n (couche optionnelle, non requise)** : sauvegardes Drive quotidienne/hebdo, nurturing, satisfaction à froid, rappel identité, rapport hebdo, Sentinelle incidents — workflows créés, activation manuelle. Workflow Aircall→Meta CAPI **interdit d'activation** sans brique consentement préalable.
- **Emails** : IONOS SMTP via `lib/email.ts` (journalisés, best-effort, idempotence par gardes `*_envoye_le`).

## 7 · Génération documentaire

Moteur `lib/mergeEngine.ts` (templates HTML à balises) + `lib/renderPdf.ts` (Chromium) + `lib/pdfMerge.ts` : convention (+annexes programme/règlement/planning), convocation, fiche d'analyse du besoin (complétable + DocuSeal double signature), évaluations initiale/finale (auto depuis les tests), attestation de fin, certificat de réalisation, émargements, factures/avoirs/reçus, justificatifs. **12 pièces de conformité** semées à la création du dossier (`lib/conformiteEdof.ts`), ordre d'audit respecté, stockage bucket privé `documents` (URLs signées), bucket public `qcm` (médias du test).

## 8 · Base de données (68 tables · 55 triggers · 48 fonctions · 142 migrations)

Garde-fous DB : séquences de numérotation (factures/avoirs), triggers anti-surbook, anti-antidate (maj serveur), création auto stagiaire+dossier depuis évaluation complète (`trg_evaluation_to_dossier`), contraintes CHECK sur les statuts. **MANIFEST** : `supabase/migrations/MANIFEST.md`.

|   |   |   |   |
|---|---|---|---|
| `archives` | `attestations_tef` | `avoirs` | `bpf_depots` |
| `classement_cache` | `commerciaux` | `completions` | `compteurs_facture` |
| `conges` | `contenu_pedagogique` | `contrats_confidentialite` | `corrections` |
| `demandes_inscription_partenaire` | `dossiers` | `dossiers_edof` | `emargements_papier` |
| `evaluations` | `examens` | `facture_lignes` | `factures` |
| `faq` | `formateur_documents` | `formateur_questionnaire` | `formateurs` |
| `formatrices` | `formules` | `guide_formatrices` | `imports_edof` |
| `incidents_techniques` | `journal` | `liste_attente_examen` | `messages_internes` |
| `messages_prospects` | `partenaire_depots` | `partenaires` | `pieces` |
| `planning` | `planning_employes` | `pointages` | `positionnements` |
| `preinscriptions_examen` | `programme_modules` | `programmes` | `questions_internes` |
| `rapports_hebdo` | `rate_buckets` | `reclamations` | `recus_paiement` |
| `relances_anomalie` | `remarques` | `remboursements_examen` | `resultats_examen` |
| `satisfaction_seance` | `satisfactions` | `seances_accueil` | `sessions_examen` |
| `sous_traitance` | `stagiaires` | `suivi_cours` | `taches` |
| `techniques_vente` | `test_questions` | `tests` | `utilisateurs` |
| `validations_direction` | `veille` | `ventes_examen` | `webhook_events` |

## 9 · Pages (79)

|   |   |   |   |
|---|---|---|---|
| `/` | `/acces-refuse` | `/anomalies` | `/attestations-paiement` |
| `/automatisations` | `/bilan-satisfaction` | `/bpf` | `/calendrier` |
| `/classement` | `/comptes` | `/confidentialite` | `/conges` |
| `/connexion` | `/contact` | `/contenu-pedagogique` | `/direction` |
| `/dossiers` | `/dossiers/conformite` | `/dossiers/edof` | `/edof` |
| `/emargement` | `/emargement/signer` | `/equipe` | `/examen` |
| `/examens` | `/examens/candidats` | `/examens/corrections` | `/examens/croise` |
| `/examens/jour` | `/examens/liste-attente` | `/examens/preinscriptions` | `/examens/remboursements` |
| `/examens/sessions` | `/examens/sessions/[id]` | `/examens/taux` | `/examens/vente` |
| `/examens/vente-groupe` | `/factures` | `/faq` | `/fiche/[id]` |
| `/formateur-questionnaire` | `/formateurs` | `/formateurs/[id]` | `/formation` |
| `/guide-formatrices` | `/identites` | `/incidents` | `/inscriptions/nouvelle` |
| `/interne` | `/journal` | `/messages` | `/partenaire/[token]` |
| `/planning` | `/planning-employes` | `/pointage` | `/politique-confidentialite` |
| `/positionnement/[token]` | `/positionnements` | `/programmes` | `/rapport-hebdo` |
| `/recherche` | `/reclamations` | `/reinitialiser` | `/rgpd` |
| `/satisfaction-cours` | `/suivi-eleves` | `/taches` | `/techniques-vente` |
| `/test` | `/test-qr` | `/test/[token]` | `/test/finale` |
| `/test/kiosque` | `/tests/[id]` | `/tests/a-noter` | `/tests/banque` |
| `/tests/banque/[id]` | `/validations` | `/veille` | |

## 10 · Routes API (132)

|   |   |   |
|---|---|---|
| `/api/admin/backup` | `/api/attestations-paiement` | `/api/auth/login` |
| `/api/auth/logout` | `/api/auth/mot-de-passe-oublie` | `/api/auth/reinitialiser` |
| `/api/automatisations` | `/api/avoirs` | `/api/bpf` |
| `/api/bpf/depot` | `/api/bpf/export` | `/api/bpf/sous-traitance` |
| `/api/classement` | `/api/classement/global` | `/api/cloture` |
| `/api/comptes` | `/api/confidentialite` | `/api/conges` |
| `/api/contact` | `/api/contenu-pedagogique` | `/api/conventions/send` |
| `/api/cron/anomalies` | `/api/cron/relances-anomalie` | `/api/cron/tick` |
| `/api/direction` | `/api/documents/completer` | `/api/documents/envoyer-dossier` |
| `/api/documents/evaluation` | `/api/documents/generate` | `/api/documents/justificatif` |
| `/api/documents/url` | `/api/dossiers` | `/api/dossiers/conformite-edof` |
| `/api/dossiers/export-zip` | `/api/dossiers/fiche-edof` | `/api/dossiers/liste-archivage` |
| `/api/dossiers/relances-satisfaction` | `/api/dossiers/remarques` | `/api/dossiers/satisfaction-envoyer` |
| `/api/dossiers/tunnel` | `/api/edof/coherence` | `/api/edof/import` |
| `/api/emargement/duree` | `/api/emargement/feuille/pdf` | `/api/emargement/jour` |
| `/api/emargement/jour/pdf` | `/api/emargement/jour/scan` | `/api/emargement/signer` |
| `/api/emargement/walk-in` | `/api/equipe` | `/api/equipe/commerciaux` |
| `/api/equipe/justificatif` | `/api/equipe/roles` | `/api/examens/alertes` |
| `/api/examens/attestations` | `/api/examens/attestations/renvoyer` | `/api/examens/candidats` |
| `/api/examens/corrections` | `/api/examens/documents` | `/api/examens/jour` |
| `/api/examens/liste-attente` | `/api/examens/preinscriptions` | `/api/examens/preinscriptions/relances` |
| `/api/examens/remboursements` | `/api/examens/resultats` | `/api/examens/sessions` |
| `/api/examens/sessions/candidats` | `/api/examens/taux` | `/api/examens/ventes` |
| `/api/examens/ventes-groupe` | `/api/factures` | `/api/factures/auto` |
| `/api/factures/relances` | `/api/faq` | `/api/fiche/[id]` |
| `/api/formateur-questionnaire` | `/api/formateurs` | `/api/formateurs/[id]` |
| `/api/formateurs/conformite` | `/api/formateurs/envoyer` | `/api/formation/alertes` |
| `/api/formation/rapport-hebdo` | `/api/formation/relances-identite` | `/api/formation/relances-sans-venue` |
| `/api/guide-formatrices` | `/api/identites` | `/api/incidents` |
| `/api/inscriptions` | `/api/interne` | `/api/journal` |
| `/api/me` | `/api/partenaire/[token]` | `/api/partenaire/[token]/depot` |
| `/api/planning` | `/api/planning-employes` | `/api/planning/absence` |
| `/api/pointage` | `/api/positionnement` | `/api/positionnement/[token]` |
| `/api/positionnements` | `/api/pre-inscription` | `/api/programmes` |
| `/api/programmes/modules` | `/api/prospects/relances` | `/api/rapport-hebdo` |
| `/api/recherche` | `/api/reclamations` | `/api/reclamations/export` |
| `/api/recu-paiement` | `/api/rgpd/purge` | `/api/satisfaction` |
| `/api/satisfaction-cours` | `/api/satisfaction/bilan` | `/api/seances-accueil` |
| `/api/suivi-cours` | `/api/suivi-eleves` | `/api/taches` |
| `/api/techniques-vente` | `/api/tests/[id]` | `/api/tests/audio` |
| `/api/tests/banque` | `/api/tests/envoyer` | `/api/tests/evaluation` |
| `/api/tests/kiosque` | `/api/tests/notation` | `/api/tests/oral` |
| `/api/tests/passation` | `/api/tests/progression` | `/api/utilisateurs` |
| `/api/validations` | `/api/veille` | `/api/webhooks/docuseal` |

## 11 · Modules lib (37)

|   |   |   |   |
|---|---|---|---|
| `anomalies.ts` | `appUrl.ts` | `auth.ts` | `avoir.ts` |
| `bpf-export.ts` | `bpf.ts` | `confidentialiteDoc.ts` | `conformiteEdof.ts` |
| `conformiteFormateurs.ts` | `conseilsTest.ts` | `crm.ts` | `documentsAuto.ts` |
| `docuseal.ts` | `edof.ts` | `email.ts` | `emargement.ts` |
| `evaluationDoc.ts` | `examenCarence.ts` | `examens.ts` | `factures.ts` |
| `formateurDocs.ts` | `gates.ts` | `identite.ts` | `incidents.ts` |
| `inscriptions` | `mergeEngine.ts` | `partenaire.ts` | `pdfMerge.ts` |
| `rateLimit.ts` | `recu.ts` | `renderPdf.ts` | `roles.ts` |
| `sites.ts` | `statutExamen.ts` | `supabaseAdmin.ts` | `tests.ts` |
| `validations.ts` | | | |

## 12 · Variables d'environnement attendues (Vercel)

`SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `AUTH_SECRET` (JWT sessions) · `ACCESS_PASSWORD` (filet transitoire) · `CRON_SECRET` (Vercel Cron) · `APP_URL=https://crm.mystoryformation.fr` (liens emails) · SMTP IONOS (`SMTP_*`) · DocuSeal (`DOCUSEAL_*`) · `EMAIL_ACTIF`.

## 13 · État & jalons (au 17/07/2026)

- ✅ Prod propre : base remise à zéro (données de test annulées/archivées, séquences intactes — prochaine facture MYS-2026-01516)
- ✅ Parcours candidat bouclé : QR → test chronométré → notation → email conseils → récap à vie
- 🔜 **Test live du tunnel complet** (docs/TEST-LIVE.md) — dernière validation avant vrais dossiers
- 🔜 Bascule comptes individuels → coupure ACCESS_PASSWORD → TIER1 (journal direction nominatif, cockpit par rôle)
- 🔜 Migration Next 15 (brique dédiée) · refactor `/dossiers` · réduction des `any`
- 🔜 Reprise du site vitrine (Git promis par les anciens développeurs) puis claim du domaine sur le team

---
*Régénération : relancer l'inventaire (find app/api, information_schema) et mettre à jour ce fichier. Toute modification du CRM doit respecter la section 3.*
