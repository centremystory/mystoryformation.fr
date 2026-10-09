-- ============================================================================
-- Rendez-vous en ligne : confirmation par lien signé + péremption du créneau
-- Date : 09/10/2026 (complète la migration n° 79, le même jour)
--
-- ✅ APPLIQUÉE le 09/10/2026 sur le projet svepgknbbonrtwyvzaar
--    (migration `rendez_vous_confirmation_et_peremption`). Purement additive :
--    une colonne nullable et un index. Les rendez-vous déjà pris restent
--    valides, `confirme_le` à NULL.
--
-- ── POURQUOI CETTE COLONNE EXISTE ───────────────────────────────────────────
--
-- Une revue de sécurité a relevé, le jour même de la mise en service, un défaut
-- réel : rien n'empêchait de réserver tous les créneaux de tous les centres pour
-- des semaines. Et contrairement à une matinée de préparation, un rendez-vous
-- n'avait AUCUNE péremption — une fois pris, il restait pris pour toujours. Un
-- agenda saturé de faux rendez-vous, c'est du chiffre d'affaires perdu, et
-- personne ne s'en aperçoit avant le jour J.
--
-- Le motif de réponse n'est pas inventé : c'est celui de `matinees_preparation`
-- (migration n° 78), repris à l'identique. Un créneau est RETENU dès la
-- réservation — sinon deux candidats simultanés prendraient la même heure — mais
-- la retenue est COURTE tant que personne n'a prouvé qu'il existe.
--
-- La preuve, ici, c'est un clic sur un lien signé envoyé à l'adresse saisie
-- (HMAC du secret serveur, cf. lib/rendezVous.ts). Elle règle deux choses d'un
-- coup :
--   — l'épuisement des créneaux : un robot qui ne lit pas la boîte du candidat
--     ne confirme rien, et ses créneaux retombent ;
--   — l'adresse : une adresse qui ne clique jamais ne reçoit jamais rien de
--     notre part une seconde fois. Nous ne devenons pas un expéditeur ouvert vers
--     des tiers — ce qui, en cas de classement en indésirable, ferait cesser
--     d'arriver les CONVOCATIONS D'EXAMEN (panne vécue les 09 et 10/09/2026).
--
-- ── POURQUOI PAS UN STATUT « a_confirmer » ──────────────────────────────────
--
-- Parce qu'il faudrait réécrire la contrainte `check (statut in (…))`, donc la
-- supprimer puis la recréer. La règle du chantier interdit tout DROP, et elle a
-- raison : une contrainte supprimée pendant quelques millisecondes est une
-- fenêtre où n'importe quelle écriture passe.
--
-- Une colonne nullable suffit, et elle est même plus juste : la péremption
-- réutilise le statut `annule`, qui LIBÈRE déjà le créneau (l'index d'unicité
-- `rendez_vous_un_creneau_une_fois` est partiel, `where statut <> 'annule'`).
-- Rien n'est supprimé — règle MYSTORY — et `annule_par` dit pourquoi :
-- « peremption_non_confirme ».
-- ============================================================================

alter table rendez_vous
  add column if not exists confirme_le timestamptz;

-- Le balayage des réservations à périmer : « tiré, pas poussé ». Personne ne
-- balaie en tâche de fond — c'est la lecture suivante du calendrier, ou la
-- réservation suivante, qui nettoie (même principe que
-- `libererReservationsPerimees()` pour les matinées). L'index rend cette requête
-- immédiate quel que soit le volume de la table.
create index if not exists idx_rendez_vous_a_confirmer
  on rendez_vous (cree_le) where confirme_le is null and statut = 'confirme';

-- ============================================================================
-- À reporter dans migrations/MANIFEST.md sous le n° 80.
-- ============================================================================
