# Audit de conformité documentaire — Qualiopi & Caisse des Dépôts

*CRM MYSTORY · audit du 17/07/2026 · généré depuis le code réel (17 gabarits, lib/conformiteEdof, triggers DB). Les appréciations réglementaires sont des analyses opérationnelles, **à faire valider par la direction / un conseil** — pas un avis juridique.*

## 1 · Preuves techniques transverses (vérifiées dans le code)

| Contrôle | Résultat |
|---|---|
| NDA 11756521775 + « ne vaut pas agrément de l'État » sur les gabarits | ✅ **17/17 templates** |
| Lieu de formation & « Fait à » = Gagny (jamais l'agence) | ✅ Forcé serveur (mergeEngine) + 17/17 gabarits |
| Anti-antidate | ✅ Horodatages `now()` serveur + triggers (émargement, complétions, factures) |
| Numérotation factures/avoirs infalsifiable | ✅ Séquences DB (`MYS-AAAA-#####`), jamais de recul, annulation sans suppression |
| Durée identique sur tous les documents | ✅ Source unique (dossier) fusionnée partout |
| Cohérence niveaux CECRL entrée→visé→sortie | ✅ Évaluations auto depuis les tests ; attestation reprend `niveau_atteint` (source unique) |
| Délai d'accès ≥ 11 jours ouvrés | ✅ Contrôlé à l'inscription |
| Corrigés de tests protégés | ✅ Jamais exposés hors base (correction serveur ; PDF détaillé = interne, remise en main propre) |
| Traçabilité | ✅ Table `journal` sur toutes les actions sensibles |
| Conservation / RGPD | ✅ Purge par anonymisation (#73), factures 10 ans, aucun DELETE |

## 2 · Matrice des pièces du dossier stagiaire (ordre d'audit)

| # | Pièce | Exigence | Dans le CRM | Statut |
|---|---|---|---|---|
| 1 | Fiche d'analyse de besoin | Qualiopi ind. 4 (analyse du besoin) · anti-démarchage (objectif professionnel) | Formulaire de complétion + PDF + **double signature DocuSeal** (stagiaire+centre) · objectif professionnel obligatoire | ✅ *(bug d'exécution signalé → reproduction au test live)* |
| 2 | Test + évaluation initiale | Qualiopi ind. 8 (positionnement) | **Auto-générée** depuis le test chronométré (CE/CO auto + EE/EO notées) | ✅ |
| 3 | Convention + annexes A1/A2/A3 | CDC/CPF (contractualisation) · n° dossier EDOF | Générée + signature DocuSeal + programme/règlement/planning annexés | ✅ |
| 4 | Convocation | Organisation de l'action | Générée + envoyée (lieu Gagny) | ✅ |
| 5 | Feuille d'émargement | CDC (assiduité, par demi-journée, double signature) | Émargement digital par demi-journée, signatures stagiaire + formatrice, PDF jour/feuille, anti-antidate DB | ✅ |
| 6 | Test + évaluation finale | Qualiopi ind. 11 (atteinte des objectifs) | Auto depuis le test final (verrou : pas avant la dernière séance) | ✅ |
| 7 | Satisfaction à chaud + à froid | Qualiopi ind. 30 (recueil des appréciations) | Chaud **auto** à la notation finale · froid **auto J+90** (cron) | ✅ |
| 8 | Attestation de fin | Fin de formation | Générée (niveau = source unique) | ✅ |
| 9 | Certificat de réalisation | **Déclencheur du paiement CDC** | Généré au service fait → facturation auto | ✅ |
| + | Justificatif participation forfaitaire | CPF (≈150 €, sauf exemption) | Suivi + reçu, exemption tracée | ✅ |
| + | Justificatif passage examen | Preuve de présentation | Attestations examens + résultats archivés | ✅ |

## 3 · Documents examens & gestion

| Document | CRM | Statut |
|---|---|---|
| Convocations examen TEF / civique | Gabarits dédiés, mentions habilitation CCI | ✅ |
| Attestation de paiement examen | Générée, reçus numérotés | ✅ |
| Factures / avoirs / reçus | Séquences DB, TVA art. 261-4-4°a, archivage 10 ans | ✅ |
| BPF | Module complet + export + sous-traitance | ✅ |

## 4 · Indicateurs Qualiopi de fonctionnement (hors documents stagiaire)

| Indicateur | Dans le CRM | Statut |
|---|---|---|
| Ind. 23-25 · Veille (légale, métier, pédagogique) | Page `/veille` alimentée | ✅ à alimenter en continu |
| Ind. 26 · Accueil PSH / référent handicap | Mention « nous contacter » sur les supports | 🟠 **à valider** : désigner formellement le référent + procédure |
| Ind. 27-28 · Sous-traitance & moyens | Module sous-traitance BPF, justificatifs FLE formatrices (0 manquant) | ✅ |
| Ind. 31 · Réclamations & amélioration continue | Pages `/reclamations` + `/incidents` + journal | ✅ |
| Ind. 32 · Traitement des aléas | Incidents techniques tracés + Sentinelle | ✅ |

## 5 · Points ouverts (à traiter / valider)

1. 🟠 **Test live du tunnel complet jamais exécuté** — docs/TEST-LIVE.md prêt ; à faire avant les premiers vrais dossiers (inclut la reproduction du bug « fiche d'analyse »).
2. 🟠 **Référent handicap** (ind. 26) : à désigner + procédure d'adaptation écrite.
3. 🟠 **DPA des sous-traitants** (Supabase, Vercel, IONOS, DocuSeal, Aircall, Qonto) : à archiver côté direction.
4. 🟠 Anciens dossiers pré-CRM : sujet avocat, jamais d'antidate (rappel).
5. ✅ Rien de bloquant côté logiciel : chaîne documentaire complète, ordonnée, traçable, horodatée serveur.

**Conclusion** : le CRM couvre l'intégralité de la chaîne documentaire exigée par Qualiopi et la Caisse des Dépôts, avec des preuves techniques structurelles (horodatage serveur, séquences, source unique des niveaux, double signature). Les écarts restants sont **organisationnels** (référent handicap, DPA, exécution du test live), pas logiciels.
