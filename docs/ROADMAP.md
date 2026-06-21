# 🧭 MYSTORY CRM — Feuille de route (ligne directrice)

> Source : idées équipe + directeur (20/06/2026), enrichies par l'Automatiseur.
> Méthode : **une brique à la fois**, options + reco, Arudhan tranche, build vérifié.
> Légende effort : 🟢 rapide · 🟡 moyen · 🔴 lourd. Priorité : **P1** (valeur immédiate) · **P2** (important) · **P3** (lourd ou dépend des comptes individuels).

---

## ✅ Avancement

**P1 — TERMINÉ (20/06).** Tous les chantiers P1 sont livrés et en ligne :
- A1/A2/A3 — accueil actionnable : indicateurs cliquables, « Dossiers à finaliser » (formation finie + dossier incomplet), clic → état des pièces.
- SD4 — satisfaction à froid : date d'envoi affichée au dossier.
- EX1 — vente plateforme séparée des examens (sous-groupe + badge).
- EX2/EX3 — session cliquable → candidats inscrits + report/remboursement par candidat.
- EC1/EC2 — mention civique affichée + import PDF des résultats étendu aux civiques + renvoi par email au candidat.
- SD5 — attestation de fin auto à la clôture + certificat de réalisation auto au « service fait validé EDOF » (séparation conformité), envoyés au stagiaire.
- SD1 — test initial (positionnement) & test final (niveau atteint) visibles au dossier.
- EJ1 — émargement du jour : recherche d'élèves + walk-in multi-sélection.

**Bugs/confusions :**
- ✅ **B2 — Planning / Calendrier fusionnés** : un seul onglet « Planning », bascule vue liste ↔ vue calendrier.
- ✅ **B3 — Espace pédagogique par module** : `/contenu-pedagogique` organise désormais cours / exercices / corrections **par module** (champ module + affichage groupé) ; lien vers le Séquençage pour la structure.
- ⏳ **B1 — émargement heures figées** : décision de conformité à prendre (heures réelles variables vs demi-journée).

**P2 — en cours (livré au fur et à mesure) :**
- ✅ **A6/A7 — accueil complété** : section « Examen — cette semaine » (places libres TEF IRN & civique des sessions de la semaine + liens de paiement en attente) ; widget « Classement du mois » (top vendeurs + top agences, Direction/Manager).
- ✅ **SE1/SE2 — suivi des élèves cours par cours** : table `suivi_cours` + API `/api/suivi-cours` + section « Suivi pédagogique — cours par cours » dans `/suivi-eleves` (contenu fait, points forts/faibles, satisfaction de fin de cours, archivage).
- 🟡 **TI — tests évolutifs (initial & final), en cours** :
  - Banque évolutive : tables `tests` (modèles versionnés par période), `test_questions` (choix unique + réponse libre/mots-clés, audios, images, points, blocs), `evaluations` (résultats initial/final).
  - Contenu versé : « Test initial – Référence (v3) » (CE /20, CO /10, appariement audio↔image) + « Test final – Juin 2026 » (CE /10, CO /10, audios rattachés).
  - Moteur de passation `/test/[token]` + API `/api/tests/passation` (correction CE/CO **côté serveur**) + `/api/tests/evaluation` (lien depuis le dossier).
  - Notation formatrice `/tests/a-noter` + API `/api/tests/notation` (EE/EO → niveau /20 → rattaché au dossier).
  - ✅ Diffusion : QR code + envoi par mail (`/api/tests/envoyer`) + **kiosque** `/test/kiosque` (`/api/tests/kiosque`, public rate-limité, « Candidat suivant »).
  - ✅ Éditeur de banque `/tests/banque` (+ `/tests/banque/[id]`) : créer/dupliquer/versionner, éditer questions (options, mots-clés, points, blocs), upload audio/images (`/api/tests/audio`), archivage. Ex.1 Q1 du final corrigé (option « bureau »).
  - ✅ Progression initial→final dans `/suivi-eleves` (`/api/tests/progression` : niveaux du dossier + évals complètes, bloc Initial→Visé→Atteint + détail CE/CO/EE/EO).
  - 🟡 Unification du QCM prospect (B) :
    - ✅ **B1 — pont A3 sur le nouveau moteur** : fonction `mystory_creer_stagiaire_dossier()` + trigger `trg_evaluation_to_dossier` (une évaluation initiale prospect passée à `complet` crée le stagiaire + dossier, comme `mystory_positionnement_to_dossier`). Colonne `evaluations.niveau_vise`. Le kiosque devient un point d'acquisition complet. Ancien système `positionnements` intact.
    - ✅ **B2 — oral enregistré** : `tests.oral_questions`, `/api/tests/oral` (dépôt par jeton, bucket privé), enregistreur micro dans `/test/[token]`, écoute via URLs signées dans `/tests/a-noter`, questions orales éditables dans la banque.
    - ✅ **B3 — kiosque enrichi** : civilité, niveau visé, **adresse/cp/ville** (parité dossier avec l'ancien QCM ; pont `mystory_creer_stagiaire_dossier` étendu).
    - ✅ **B4 — bascule activée** : `next.config` redirige `/qcm` et `/qcm.html` → `/test/kiosque` (temporaire, **réversible** : retirer les redirects + restaurer le rewrite). `qcm.html` conservé physiquement ; ancien système `positionnements` consultable. **Unification B terminée.**

**Reste P2 :** A8 (tâches par agence sur l'accueil), PL1 (planning grille jour×heures), guide techniques de vente, EV2 (satisfaction à chaud + évals plus complètes), satisfaction par fin de cours.

**B1 — Émargement heures réelles : FAIT.** Le trigger `planning_emargement_complete` ne fige plus `heures_realisees` à 3h (`coalesce(saisie, heures)`). Durée réelle ajustable sur les séances émargées (`/api/emargement/duree`, bouton ✎ dans `/emargement`, 0<h≤12, anti-antidate). Créneau standard 3h = défaut ; feuille d'émargement et total dossier suivent la durée réelle ; horaire recalculé (9h30 + 4h → 9h30–13h30).

**Module tâches + rapport hebdo — FAIT :** tâches (table `taches` : agence, assignee, échéance) + **temps passé** saisi à la clôture (`temps_minutes`). **Rapport hebdomadaire** (table `rapports_hebdo`) remplace le pointage : chacun note activité+durée par semaine ; les tâches clôturées de la semaine s'y collent automatiquement (jointes en lecture) ; Direction/Manager consultent via `?employe=`. Onglet « Pointage » → « Rapport hebdo ». Présence = relevé de connexion (DIR1 à venir). **B1 tranché : heures réelles, défaut créneau standard 3h (9h30–12h30 / 14h–17h) modifiable, total dossier = somme des durées réelles.**

**Contrat de confidentialité — FAIT :** tous postes (salariés + formateurs), signature électronique 1 signataire (le membre), annexe périmètre calculée depuis les rôles (union). Table `contrats_confidentialite` ; `lib/confidentialiteDoc` ; `createConfidentialiteSubmission` (external_id `confid:<id>`) ; webhook archive le PDF signé (bucket `documents`) ; page `/confidentialite` (RH, direction/manager), e-mail à la volée pour les personnes sans compte.

**Multi-rôles (polyvalence) — FAIT :** une personne peut cumuler plusieurs rôles. `utilisateurs.roles[]` (role conservé = roles[0]) ; helpers `lib/roles` acceptent rôle OU liste (union) ; `lib/auth` session `roles[]` + `requireRole` intersection ; login JWT `roles[]` ; `/api/me` expose `roles`+`roles_labels` ; AppShell + middleware filtrent sur `roles` ; `/comptes` attribue via cases à cocher (création + modif). Filet `staff` préservé. Le contrat de confidentialité lira ces rôles pour le périmètre.

**Fait P2 (avancement) :** TI (tests évolutifs) complet + unification QCM prospect (B1-B4). SD2/EV2 — **Fiche d'analyse de besoin signée FAITE** (champ disponibilités + signature DocuSeal stagiaire + centre `contact@`, archivage auto via webhook branche `fiche_besoin:`). Satisfaction à froid = **3 mois confirmé** (workflow n8n `AGyvOBXGtksJhHuD` déjà correct).

---

## 🐞 Bugs & confusions à régler en priorité

| # | Sujet | Constat | Action |
|---|-------|---------|--------|
| B1 | Émargement heures figées | Émargement structuré par **demi-journée** (Matin 9h30–12h30, Après-midi 14h–17h). Mettre 4h ou 1h ne change rien : le système compte la demi-journée. | ⚠️ Conformité : Qualiopi attend un émargement par demi-journée. **Décision à prendre** : autoriser des heures réelles variables (et comment rester conforme) OU garder la demi-journée et juste afficher l'horaire réel. 🟡 |
| B2 | Planning vs Calendrier | `/planning` = « Planning des élèves » ; `/calendrier` = « Séances élèves + planning équipe ». Redondant. | Fusionner en un seul calendrier avec filtres (élèves / équipe / site). 🟡 |
| B3 | Contenu pédagogique vs Séquençage | `/contenu-pedagogique` = bibliothèque de fichiers ; `/programmes` = « Séquençage des cours » (structure des modules). Deux notions proches. | Fusionner en **un espace pédagogique par module** (voir P2-PEDA). 🔴 |

---

## 🏠 PAGE D'ACCUEIL (tableau de bord)

- **A1 — Indicateurs cliquables** 🟢 **P1** : chaque KPI ouvre la page de travail correspondante (déjà partiellement fait sur les hubs ; à générraliser à l'accueil).
- **A2 — « Dossiers complets » → « Dossiers à finaliser »** 🟢 **P1** : remplacer par les dossiers de personnes **ayant fini la formation mais au dossier incomplet** (pièces manquantes) — bien plus utile.
- **A3 — Dossiers en cours cliquables** 🟢 **P1** : clic → état des pièces (envoyées / remplies / manquantes) du dossier.
- **A4 — « Formatrice en règle »** 🟢 **P2** : indicateur sur le dashboard (formatrices avec justificatif FLE + docs à jour).
- **A5 — « Conventions à relancer »** 🟡 **P2** : personnes ayant payé la participation forfaitaire mais pas le reste à charge (à préciser : quelle relance exacte).
- **A6 — Indicateurs examen** 🟡 **P2** : suivi des **liens de paiement** envoyés (inscriptions à distance) ; **places disponibles TEF IRN cette semaine** ; **places disponibles examen civique**.
- **A7 — Classement vendeurs & agences sur l'accueil** 🟢 **P2** : reprendre `/classement` en widget d'accueil.
- **A8 — Tâches par agence sur l'accueil** 🟡 **P2** : voir les tâches du jour par agence (lié à T-TÂCHES).

## ✅ TÂCHES (nouveau module)

- **T1 — Module tâches** ✅ **FAIT** (ex-🔴 P2) : attribution par le directeur / responsable, **par agence et par personne** ; à la clôture, la personne **coche** + saisit le **temps passé** ; les tâches d'agence réalisées **se collent automatiquement** au rapport hebdomadaire (voir RH).

## 📝 TEST INITIAL (positionnement à distance)

- **TI1 — Test à distance** 🟡 **P2** : envoyer un test initial à faire à distance (lien unique par candidat).
- **TI2 — QR code** 🟢 **P2** : générer un QR code pour faire le test sur téléphone.
- **TI3 — Diffusion** 🟢 **P2** : envoi par mail + page « kiosque » enregistrable sur les ordis du bureau pour faire passer le test sur place.

## 📂 SUIVI DES DOSSIERS

- **SD1 — Test initial & final visibles** 🟡 **P1** : afficher les tests enregistrés dans le dossier (conformité).
- **SD2 — Fiche d'analyse de besoin signée** ✅ **FAIT** : champ disponibilités + génération + signature DocuSeal stagiaire + centre (`contact@`), à distance ou sur place ; webhook archive la fiche signée. Reste possible : étoffer l'éval initiale/finale (EV2).
- **SD3 — Émargement consolidé** 🔴 **P2** : entrée/sortie libre → chaque élève signe seul à sa venue, et **ça s'affecte directement au dossier** ; la feuille regroupe toutes ses signatures.
- **SD4 — Satisfaction à froid : date d'envoi** 🟢 **P1** : afficher la date d'envoi du questionnaire à froid.
- **SD5 — Attestation + certificat auto** 🟡 **P1** : génération automatique en fin de formation + **envoi mail auto** (⚠️ le certificat de réalisation déclenche le paiement CDC — garde-fous).

## ✍️ ÉMARGEMENT DU JOUR

- **EJ1 — Multi-sélection + recherche** 🟡 **P1** : choisir plusieurs élèves parmi les inscrits, rechercher un élève (pour faire signer tout le monde rapidement, entrée/sortie libre).

## 📈 SUIVI DES ÉLÈVES

- **SE1 — Contenu réalisé + forces/faiblesses** 🟡 **P2** : à chaque formation, compléter ce qui a été fait (cours 1, 2, 3…), points forts / points faibles du stagiaire.
- **SE2 — Satisfaction à chaque fin de cours** 🟡 **P2** : mini-questionnaire par séance pour l'amélioration continue.

## 🗓️ PLANNING

- **PL1 — Vue grille jour × heures** 🟡 **P2** : colonnes = journées, lignes = heures.
- (PL2 = fusion planning/calendrier, voir B2.)

## 📚 PÉDAGOGIE

- **PE1 — Espace pédagogique par module** 🔴 **P2** : par module, les formateurs saisissent **cours, exercices et corrections** ; n'importe quel formateur retrouve le contenu et peut faire les exercices. (Fusionne contenu pédagogique + séquençage — voir B3.)

## 📋 ÉVALUATIONS & SATISFACTION

- **EV1 — Satisfaction à chaud plus complète** 🟢 **P2**.
- **EV2 — Fiche d'analyse de besoin, éval initiale & finale plus complètes** 🟡 **P2**.

## 🎫 EXAMEN — CANDIDATS

- **EC1 — Mentions civiques distinctes** 🟡 **P1** : différencier carte de séjour **pluriannuelle / résident / naturalisation** dans la liste candidats.
- **EC2 — Import & renvoi des résultats** 🟡 **P1** : importer les résultats d'examen, téléchargeables et renvoyables si le candidat ne les a pas reçus.

## 🎫 EXAMEN — INSCRIRE / SESSIONS

- **EX1 — Sortir la « plateforme » des examens** 🟢 **P1** : la vente de plateforme n'est pas un examen → traitement séparé et plus esthétique.
- **EX2 — Session → candidats inscrits** 🟢 **P1** : clic sur une session = voir les candidats inscrits (pratique au téléphone).
- **EX3 — Report / remboursement depuis le candidat** 🟡 **P1** : créer report et remboursement en cliquant directement sur le candidat.

## 👥 FORMATEURS / SALARIÉS

- **FS1 — Contrat de confidentialité** 🟡 **P2** : à la mise en relation d'un formateur ou salarié, envoyer un **contrat de confidentialité (données sensibles)** par signature électronique.

## 🕒 RH — POINTAGE → RAPPORT HEBDOMADAIRE

- **RH1 — Rapport hebdomadaire** ✅ **FAIT** (ex-🔴 P2) : transformer le pointage en rapport hebdo où chacun note ce qu'il fait + la durée ; les tâches d'agence réalisées (T1) s'y collent automatiquement.
- **RH2 — Planning équipe enrichi** 🟡 **P3** : voir les changements (congés), poser des questions à quelqu'un.

## 🛡️ DIRECTION

- **DIR1 — Journal d'activité salariés** 🔴 **P3** (dépend des comptes individuels — point E) : actions effectuées, modifications, **temps de connexion** par salarié.

## 💬 RELATION / GUIDE

- **GU1 — Techniques de vente** 🟡 **P2** : intégrer au guide MYSTORY des techniques de vente (examens + formations), reprises des infos importantes + ajouts de l'Automatiseur, mises à jour au fil de l'eau.

---

## 🔌 Vérifications transverses (questions du 20/06)

- **Mails** : SMTP IONOS (`contact@mystoryformation.fr`) est branché → les envois **applicatifs** (documents, factures, accusés) partent. Les **workflows n8n** (relances, nurturing, satisfaction froid, sauvegardes…) sont créés mais **en attente d'activation manuelle** côté Arudhan (sélection du credential Bearer + activation + Error Workflow = Sentinelle).
- **Sauvegarde Drive** : le workflow d'**archivage quotidien des dossiers sur Drive** existe (`dOiKdh3XWT4qSiSW`) mais **pas encore activé** : il faut sélectionner le dossier Drive cible + le credential Bearer sur les 2 nœuds HTTP + l'activer. Tant que ce n'est pas fait, rien ne part automatiquement sur le Drive.

---

## ✨ Propositions de l'Automatiseur (idées maison)

- **IA1 — Centre « À traiter »** : une file unique de tout ce qui attend une action (dossiers incomplets, conventions à relancer, résultats à saisir, liens de paiement en attente…), triée par urgence, avec accès direct.
- **IA2 — Score de conformité par dossier** : une jauge visuelle (0–100 %) par dossier, qui liste précisément les pièces manquantes pour un audit CDC serein.
- **IA3 — Relance automatique des liens de paiement** : si un lien de paiement examen reste impayé X jours → relance auto (n8n) + bascule en liste d'attente si la place est demandée ailleurs.
- **IA4 — Export comptable mensuel** : récap des factures / encaissements du mois, prêt pour Pennylane / l'expert-comptable.
- **IA5 — Détection proactive des dossiers à risque** : alerte quand un dossier approche d'une échéance de conformité (délai d'accès, identité CPF, participation forfaitaire impayée).
- **IA6 — Modèles de réponses commerciales** : bibliothèque de réponses-types (mail / SMS) conformes anti-démarchage CPF, pour gagner du temps et rester carré.

---

## 🔭 Déjà acquis (rappel) — point E à débloquer

Le **levier opérationnel majeur** reste les **comptes individuels** (`/comptes`) : créer chaque compte, faire connecter chacun, puis **couper le mot de passe d'équipe**. Cela débloque : le cockpit par rôle, le journal d'activité nominatif (DIR1), l'attribution des tâches (T1) et le rapport hebdo (RH1).
