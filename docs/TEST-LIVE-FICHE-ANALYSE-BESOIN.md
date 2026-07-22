# TEST LIVE — Fiche d'analyse du besoin (génération depuis le suivi dossier)

Objectif : comprendre pourquoi, dans le suivi de dossier, la fiche d'analyse du besoin
« ne se génère pas pour remplir ». **Le bug n'est pas reproductible sans données réelles**
(base de dev vide) → ce test se fait sur la prod, encadré, sur un **dossier de test** qu'on
annule/archive ensuite. À faire à deux : Arudhan au clavier, l'Automatiseur/Claude en contrôle
des logs (réponse HTTP, journal, network).

> ⚠️ Ne modifier aucune vraie donnée client. Créer un dossier TEST. Aucune donnée
> personnelle réelle dans les rapports.

---

## 1. Préconditions
- **Compte** : un compte **direction** (ou staff) — pour avoir tous les droits de génération.
- **Environnement** : production `https://crm.mystoryformation.fr` (le bug ne sort qu'avec des données réelles).
- **Données de test** : un **dossier TEST** créé pour l'occasion (stagiaire « TEST ANALYSE », email interne type `arudhan+test@…`), financement **personnel** (surtout PAS CPF/EDOF → on n'envoie rien à la Caisse), formule courte (Express 6h).
- **RGPD** : pas de vraie identité ; à la fin, dossier **annulé** + stagiaire **archivé** (jamais supprimé).

## 2. Étapes exactes
1. Créer l'inscription TEST (`/inscriptions/nouvelle`) → obtenir un dossier.
2. Ouvrir **`/dossiers`**, rechercher le dossier TEST, le déplier.
3. Repérer la pièce **« Fiche d'analyse du besoin »** (groupe COMPLÉTABLES) et cliquer **« Compléter et générer »** (ou le bouton équivalent affiché).
4. **Observer** : le formulaire s'ouvre-t-il ? (oui / non / erreur).
5. Vérifier le **préremplissage** (identité, formation, financement déjà connus).
6. Renseigner les champs obligatoires (voir §5), notamment **l'objectif professionnel / de démarche**.
7. **Enregistrer / Valider** → observer la réponse (succès / erreur, message).
8. Vérifier la **génération du PDF** : brouillon si incomplet, final si complet.
9. Vérifier le **statut checklist** de la pièce (manquant → généré/complété).
10. Re-cliquer pour **régénérer** (versionnage par ré-archivage).

## 3. Points à observer (l'Automatiseur note en direct, SANS PII)
- **Console navigateur** : erreurs JS (F12 → Console).
- **Network** (F12 → Network) : la requête `POST /api/documents/completer` (ou `generate`) :
  - **statut HTTP** (200 / 4xx / 5xx),
  - **payload** envoyé (champs présents ?),
  - **réponse** (`{ ok, erreur?, recap? }`).
- **Logs serveur** : Vercel → Runtime Logs, et la table `journal` du CRM.
- Causes candidates à confirmer : verrou métier (objectif pro vide / case cohérence durée), **permission** (403), **template** absent (`templates/fiche_analyse_besoin.html`), **rendu PDF** (DocuSeal/Chromium) en échec, **mapping** de champ manquant, message d'erreur peu visible.

## 4. Résultats attendus (une fois OK)
La fiche doit être : **générable · préremplie · éditable · sauvegardable · exportable en PDF · versionnée · marquée complète/incomplète**.

## 5. Champs obligatoires à vérifier
identité apprenant · formation demandée · **objectif professionnel / objectif de démarche** ·
niveau initial · niveau visé · besoins identifiés · disponibilités · modalité · durée prévue ·
financement · prérequis · accessibilité/handicap si déclaré · recommandation pédagogique · validation.

## 6. Règle importante (CPF)
Pour un dossier **CPF**, **l'objectif professionnel / de démarche est OBLIGATOIRE**
(anti-démarchage). S'il manque → statut « incomplet », PDF « brouillon » seulement, pas de « dossier complet ».

## 7. Sécurité
- Ne pas modifier de vraie donnée client sans validation.
- Faire le test sur un **dossier TEST** (créé puis annulé/archivé).
- Aucune donnée personnelle réelle dans les rapports (`reports/live-test-needs-analysis-results.md`).

---

## Modèle de résultat (à remplir après le test) → `reports/live-test-needs-analysis-results.md`
```
- Bug reproduit : oui / non
- Où ça bloque (étape §2 n°…) :
- Statut HTTP observé :
- Message d'erreur (sans PII) :
- Cause identifiée :
- Fichier(s) concerné(s) :
- Correction proposée :
- Risque :
- Estimation :
- Validation nécessaire (oui/non) :
```
