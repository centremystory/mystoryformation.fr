# TEST LIVE — Parcours dossier complet (convention → facture)

Objectif : exercer UNE FOIS en production réelle la chaîne cœur du CPF, avec un dossier
de test qui sera **annulé/archivé** à la fin (jamais supprimé — compteurs préservés).
Durée estimée : 20 minutes, à deux (Arudhan au clavier, l'Automatiseur en contrôle).

## Préparation (Automatiseur, en début de session)
- [ ] Vérifier build vert + email actif (`EMAIL_ACTIF`) + webhook DocuSeal opérationnel
- [ ] Noter les compteurs AVANT (factures `MYS-…`, avoirs, conventions) pour contrôle après

## Déroulé (Arudhan, dans le CRM en prod)
1. [ ] **Inscription** : « Nouveau → Inscrire un stagiaire » — créer *TEST PARCOURS* (email : arudhan@…),
   financement **personnel** (pas CPF/EDOF : on n'envoie rien à la Caisse), formule Express 6 h,
   dates respectant le délai d'accès.
2. [ ] **Pièces** : vérifier que les 12 pièces de conformité sont semées (statut « manquant »).
3. [ ] **Test initial** : passer un mini-test via /test (sur place), le noter → vérifier
   email de résultats reçu + évaluation initiale « généré ».
4. [ ] **Convention** : générer + envoyer en signature DocuSeal → signer depuis l'email reçu
   → vérifier le retour webhook (pièce « signé », document archivé).
5. [ ] **Convocation** : générer/envoyer → email reçu.
6. [ ] **Émargement** : émarger une demi-journée (signature stagiaire + formatrice).
7. [ ] **Test final** : passer + noter → vérifier évaluation finale auto + email satisfaction
   à chaud reçu → répondre au questionnaire → pièce satisfaction « généré ».
8. [ ] **Clôture** : attestation de fin + certificat de réalisation → service fait → **facture**.
9. [ ] Ouvrir la **fiche client** : blocs Formation / Tests / Facturation cohérents.

## Contrôles (Automatiseur, pendant/après)
- [ ] Journal : chaque étape tracée, horodatages serveur
- [ ] Storage : chaque PDF archivé dans le bucket privé, URL signée fonctionnelle
- [ ] Facture numérotée dans la séquence, montants cohérents

## Remise à zéro (fin de test)
- [ ] Facture → **annulée** (statut, pas de suppression) ; avoir si un paiement réel a eu lieu
- [ ] Dossier → **annulé** ; stagiaire *TEST PARCOURS* → **archivé** (actif=false)
- [ ] Vérifier compteurs = AVANT + les numéros consommés (les séquences ne reculent jamais — normal)

Résultat attendu : ✅ chaîne complète validée en réel → feu vert pour les premiers vrais dossiers.
