-- ============================================================================
-- Commandes composées en ligne + matinées de préparation
-- Date : 09/10/2026
--
-- ✅ APPLIQUÉE le 09/10/2026 sur le projet svepgknbbonrtwyvzaar, en deux temps
--    (`commandes_en_ligne_et_matinees`, puis `matinees_preparation_et_lien_preinscriptions`).
--    Les trois contraintes ont été ÉPROUVÉES en production, par trois insertions
--    interdites jouées dans un bloc annulé : préparation sur un civique seul,
--    commande sans examen, 9 h déclarées pour 2 matinées. Les trois ont été
--    refusées par la base, et rien n'est resté écrit.
--    Les 8 pré-inscriptions existantes sont intactes, `commande_id` à NULL.
--
-- ── POURQUOI DEUX NOUVELLES TABLES, ET PAS UNE COLONNE JSON ─────────────────
--
-- `preinscriptions_examen` décrit UN examen : un `session_id`, un `type_examen`,
-- un `sous_type`, un `montant`. C'est cette ligne-là qu'un robot n8n convertit
-- toutes les 5 minutes (workflow « Inscriptions en ligne payées → conversion »,
-- 2 920 exécutions à ce jour), et c'est la conversion qui produit l'attestation,
-- la convocation et la facture. On ne touche pas à cette forme.
--
-- Une commande composée porte jusqu'à DEUX examens, une préparation et des
-- plateformes. Trois pistes ont été pesées :
--
--   (a) une colonne JSON `commande` sur la pré-inscription. Rejetée : il
--       faudrait alors que la conversion sache lire ce JSON pour créer la
--       deuxième inscription et la vente de plateforme — donc modifier la
--       conversion, c'est-à-dire exactement ce qu'il ne faut pas faire.
--
--   (b) une table de lignes de commande que la conversion devrait parcourir.
--       Même défaut : elle déplace le travail dans la conversion.
--
--   (c) RETENUE — la commande vit dans sa propre table, et chaque élément
--       convertible devient UNE pré-inscription ordinaire, indiscernable de
--       celles que les vendeuses saisissent à la main. Le robot les convertit
--       une par une sans savoir qu'elles appartiennent à une commande. La seule
--       modification de la table existante est une colonne `commande_id`
--       NULLABLE que personne ne lit encore : rien ne change pour l'existant.
--
-- Conséquence assumée : une commande de 2 examens + 1 plateforme produit 3
-- ventes, 3 factures et 3 notifications. C'est déjà le modèle du CRM — une
-- vente de plateforme est une vente distincte — et c'est le prix à payer pour
-- ne pas toucher à une conversion qui marche.
--
-- Ce qui N'EST PAS converti : les HEURES de préparation. Il n'existe aucun
-- chemin automatique pour vendre et facturer une prestation de formation
-- (`ventes_formation` est une table d'import, vide). Elles restent sur la
-- commande, et le secrétariat est prévenu par e-mail. Décision attendue.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) La commande : l'objet qui porte le PAIEMENT
-- ─────────────────────────────────────────────────────────────────────────────
-- Le paiement est unique (une transaction pour le total) alors que les
-- pré-inscriptions sont multiples : c'est la commande qui détient la référence
-- du paiement et le montant à vérifier. Le webhook ne peut pas contrôler le
-- montant contre une ligne isolée — il le contrôle contre ce total.
create table if not exists commandes_en_ligne (
  id                 uuid primary key default gen_random_uuid(),

  -- Ce qui a été commandé. Les sessions sont des références, pas des copies :
  -- la date et l'horaire se relisent toujours dans sessions_examen.
  session_tef_id     uuid references sessions_examen(id),
  session_civique_id uuid references sessions_examen(id),
  -- Libellé de la mention (« Naturalisation »…), jamais le code CSP/CR/NAT :
  -- c'est le libellé qui part en convocation et en facture.
  mention            text,
  preparation_heures integer not null default 0,
  matinees           date[]  not null default '{}',
  options            text[]  not null default '{}',
  centre_matinees    text,

  -- Le montant RECALCULÉ côté serveur, et le détail ligne à ligne tel qu'il a
  -- été affiché au candidat. Le détail est conservé pour pouvoir répondre, dans
  -- six mois, à « pourquoi ai-je payé 660 € » sans rejouer la grille de l'époque.
  montant            numeric not null,
  detail             jsonb   not null default '[]'::jsonb,
  urgence            boolean not null default false,

  -- Identité du candidat, saisie une fois pour toute la commande.
  civilite           text, genre text,
  candidat_nom       text not null,
  candidat_prenom    text not null,
  candidat_email     text not null,
  candidat_telephone text,
  date_naissance     date, lieu_naissance text,
  nationalite        text, langue_maternelle text,
  adresse            text, code_postal text, ville text,
  pays               text default 'France',
  piece_identite     text,

  -- Le paiement. `moyen` = 'mollie' | 'lenbox'.
  moyen_paiement     text,
  lien_paiement      text,
  reference_paiement text,
  -- Identifiant de la SESSION Lenbox, rendu à la création du financement. Conservé à
  -- part de `reference_paiement` parce que Lenbox distingue la session (création) de la
  -- demande (notification) : c'est lui qui permet de vérifier qu'un dossier financé
  -- correspond bien à CETTE commande, et pas à celle d'un tiers.
  lenbox_session_id  text,
  paye_le            timestamptz,

  statut             text not null default 'en_attente'
                     check (statut in ('en_attente', 'payee', 'annulee', 'expiree')),
  agence             text not null default 'Rosny',
  cree_par           text,
  cree_le            timestamptz not null default now(),
  -- Suivi humain de ce que la conversion ne sait pas faire (les heures de cours).
  traitee_le         timestamptz,
  traitee_par        text,

  -- Une commande sans examen n'a pas de sens : elle ne produirait ni convocation
  -- ni place réservée.
  constraint commande_au_moins_un_examen
    check (session_tef_id is not null or session_civique_id is not null),
  -- 🔴 Aucune préparation sans TEF IRN. MYSTORY ne dispense AUCUNE formation
  -- civique : le contrat d'intégration républicaine est délivré exclusivement
  -- par l'OFII. Le contrôle existe déjà dans la route ; il est aussi posé ICI,
  -- parce qu'une ligne rouge réglementaire ne doit pas dépendre d'un seul
  -- fichier TypeScript qu'une refonte pourrait réécrire.
  constraint commande_pas_de_preparation_civique
    check (preparation_heures = 0 or session_tef_id is not null),
  -- Autant de matinées que de tranches de 3 h, ni plus ni moins.
  constraint commande_matinees_coherentes
    check (coalesce(array_length(matinees, 1), 0) = preparation_heures / 3)
);

create index if not exists idx_commandes_en_ligne_statut on commandes_en_ligne (statut, cree_le desc);
/* Un paiement ne règle qu'UNE commande.
 *
 * Sans cette unicité, un même dossier Lenbox (ou un même paiement Mollie) pourrait être
 * rattaché à plusieurs commandes et en valider plusieurs avec un seul encaissement. La
 * route le vérifie déjà, mais une contrainte applicative dépend de l'ordre des appels :
 * celle-ci n'en dépend pas. Partielle, parce qu'une commande non payée n'a pas encore de
 * référence et qu'elles seraient toutes en conflit sur NULL. */
create unique index if not exists commandes_en_ligne_paiement_unique
  on commandes_en_ligne (reference_paiement) where reference_paiement is not null;

create unique index if not exists commandes_en_ligne_session_lenbox_unique
  on commandes_en_ligne (lenbox_session_id) where lenbox_session_id is not null;

alter table commandes_en_ligne enable row level security;
-- Aucune policy : l'accès se fait par `service_role` depuis les routes serveur,
-- comme partout dans ce CRM. Un client anonyme ne lit rien.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Les matinées réservées : une ligne = une chaise
-- ─────────────────────────────────────────────────────────────────────────────
-- Une matinée accueille 15 personnes (décision du dirigeant du 09/10/2026 — c'est
-- la capacité de la SALLE). Le compte doit être tenu par la base, pas par
-- l'application : deux candidats peuvent remplir la dernière place à la même
-- seconde, et un `select count(*)` suivi d'un `insert` laisse passer les deux.
--
-- D'où le numéro de place et la contrainte d'unicité : l'application prend la
-- plus petite place libre entre 1 et la capacité, et si deux requêtes visent la
-- même, PostgreSQL n'en accepte qu'une. L'autre reçoit un refus net plutôt
-- qu'une inscription fantôme.
--
-- C'est volontairement l'unicité et non un trigger à seuil : le nombre 15 reste
-- alors écrit à UN SEUL endroit, `CAPACITE_MATINEE` dans lib/commande.ts. Un
-- trigger aurait dupliqué la capacité dans le schéma, et les deux auraient
-- divergé le jour du changement de salle.
--
-- ⚠️ UNE RÉSERVATION IMPAYÉE NE VIT QUE 30 MINUTES (`RESERVATION_MINUTES`).
-- Une place est retenue dès la création de la commande, donc avant paiement —
-- sinon deux candidats simultanés achètent la même chaise. Mais la retenue est
-- COURTE : sans cela, il suffirait de créer des commandes jamais payées pour
-- stériliser les 15 places d'un samedi matin, et de simples abandons y
-- suffiraient. La péremption est appliquée par l'application, à la lecture
-- suivante (« tiré, pas poussé », comme l'occupation des sessions d'examen) :
-- elle passe `actif` à false et la commande à `expiree`.
--
-- La péremption DOIT être matérialisée dans `actif`, et non calculée à la
-- lecture : l'index d'unicité ci-dessous ne porte que sur les lignes actives,
-- donc une ligne périmée restée active continuerait d'interdire son numéro de
-- place à tout le monde — le compteur dirait « libre » et l'insertion
-- échouerait quand même.
create table if not exists matinees_preparation (
  id            uuid primary key default gen_random_uuid(),
  commande_id   uuid not null references commandes_en_ligne(id),
  date_matinee  date not null,
  -- Le centre fait partie de la clé : la même date peut être pleine à Rosny et
  -- vide à Gagny. C'est exactement le défaut qui a fait vendre des places déjà
  -- prises sur les sessions d'examen en octobre (cf. lib/occupationSessions.ts).
  centre        text not null,
  place         integer not null check (place >= 1),
  -- Règle MYSTORY : aucun DELETE. Une réservation abandonnée passe à `actif = false`
  -- et libère sa chaise, parce que l'index d'unicité ci-dessous est PARTIEL. Sans ce
  -- drapeau, une commande annulée immobiliserait un numéro de place pour toujours.
  actif         boolean not null default true,
  cree_le       timestamptz not null default now()
);

-- L'unicité ne porte que sur les réservations VIVES : c'est elle qui arbitre la
-- course entre deux candidats qui visent la même dernière chaise.
create unique index if not exists matinee_une_chaise_une_fois
  on matinees_preparation (date_matinee, centre, place) where actif;

create index if not exists idx_matinees_preparation_date on matinees_preparation (centre, date_matinee) where actif;
create index if not exists idx_matinees_preparation_commande on matinees_preparation (commande_id);

alter table matinees_preparation enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Le lien vers les pré-inscriptions : additif, et personne ne le lit encore
-- ─────────────────────────────────────────────────────────────────────────────
-- Nullable, sans valeur par défaut, sans contrainte sur l'existant : les 8 lignes
-- actuelles restent valides, la conversion n8n ne voit aucune différence, et
-- `GET /api/examens/preinscriptions` (qui fait `select *`) renvoie simplement une
-- colonne de plus, que son code ignore.
alter table preinscriptions_examen
  add column if not exists commande_id uuid references commandes_en_ligne(id);

create index if not exists idx_preinscriptions_commande on preinscriptions_examen (commande_id);

-- ============================================================================
-- Reporté dans migrations/MANIFEST.md sous le n° 78.
-- ============================================================================
