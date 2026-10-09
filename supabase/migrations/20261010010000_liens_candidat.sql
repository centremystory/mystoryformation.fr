-- ============================================================================
-- Les LIENS NOMINATIFS envoyés au candidat (identité · devis · participation)
-- Date : 09/10/2026 (soir)
--
-- Demande du dirigeant, mot pour mot : « sors moi tous les formulaires, je veux
-- un formulaire quand on fait le courrier de vérification d'identité en ligne ou
-- par courrier ou les 2, un lien pour dire qu'on a finalisé le devis, un en
-- attente de 150 euros à payer et tout ce qui te semble bon. »
--
-- ✅ APPLIQUÉE le 09/10/2026 sur le projet svepgknbbonrtwyvzaar (migration
--    `liens_candidat`). Purement additive : une table neuve, six colonnes
--    nullables sur des tables existantes, aucun DROP, aucun DELETE, aucune
--    donnée de production touchée. `if not exists` partout : elle se rejoue
--    sans effet.
--
--    Les contraintes ont été ÉPROUVÉES en production dans un bloc
--    `DO $$ … raise exception $$` — le `raise` annule la transaction, donc rien
--    n'est resté écrit (vérifié : 0 ligne après coup) :
--      1. deux liens portant le même jeton            → REFUSÉ (unique_violation)
--      2. type « peu_importe »                         → REFUSÉ (check)
--      3. voie d'identité « fax »                      → REFUSÉE (check)
--      4. un lien par type sur le même dossier         → ACCEPTÉ
--      5. deux liens du MÊME type sur le même dossier  → ACCEPTÉ (voir plus bas)
--
-- ── POURQUOI UNE TABLE DE LIENS, ET PAS `dossiers.token` ────────────────────
--
-- `dossiers.token` existe déjà et ouvre `/suivi` — la page de suivi du dossier,
-- en LECTURE SEULE. Il est unique par dossier, n'expire pas, et le candidat l'a
-- déjà reçu.
--
-- Les trois pages de ce chantier ÉCRIVENT : elles choisissent une voie de
-- vérification d'identité, acceptent un devis, encaissent 150 €. Les faire
-- ouvrir par le jeton de `/suivi` ferait trois choses qu'on ne veut pas :
--
--   1. un lien de consultation donné une fois deviendrait rétroactivement un
--      lien d'ACCEPTATION — tout candidat ayant reçu un lien de suivi pourrait
--      accepter son devis sans qu'on le lui ait jamais proposé ;
--   2. on ne pourrait RÉVOQUER aucun des trois sans casser le suivi ;
--   3. on ne saurait pas ce qui a été envoyé, ni quand, ni à qui — alors que
--      c'est précisément la trace qu'un contrôle DRIEETS demande d'un devis
--      accepté à distance.
--
-- D'où un lien par ENVOI, et non par dossier.
--
-- ── 🔴 LE MÉCANISME DU JETON : 32 OCTETS D'ALÉA RANGÉS EN BASE ──────────────
--
-- Repris TEL QUEL de `rendez_vous.jeton` (migration n° 81), dont le raisonnement
-- est écrit au long là-bas et vaut ici à l'identique. En résumé : une signature
-- dérivée de l'identifiant (`HMAC(AUTH_SECRET, id)`, cf. lib/jetonCorrection.ts)
-- est imprévisible et liée au dossier, mais elle n'EXPIRE jamais et ne peut pas
-- être RÉVOQUÉE sans faire tourner `AUTH_SECRET` — ce qui casserait du même coup
-- tous les autres liens signés du CRM.
--
-- Ici l'enjeu est plus lourd que pour un rendez-vous : ces liens acceptent un
-- engagement contractuel et déclenchent un paiement. Ils doivent pouvoir être
-- coupés un par un, le jour où un candidat nous dit « ce n'est pas moi qui ai
-- accepté ». D'où le jeton tiré au hasard et rangé ici.
--
-- ⚠️ Le jeton ne contient AUCUNE information : ni l'identifiant du dossier, ni
-- le nom, ni le montant. C'est volontaire — ce lien atterrit dans des boîtes,
-- des journaux de serveur et des antivirus de messagerie. Il sert de clé, pas
-- de message.
--
-- ── 🔴 CE JETON N'EST PAS EFFACÉ À L'USAGE, ET C'EST UNE DIVERGENCE VOULUE ──
--
-- `rendez_vous` efface son jeton au premier clic : il ne prouve qu'une chose
-- (l'adresse existe), et une fois la preuve faite il n'a plus d'objet.
--
-- Ici, non. Un candidat qui a accepté son devis rouvre son lien — depuis
-- l'e-mail, trois jours plus tard, pour relire ce qu'il a signé. Un candidat qui
-- a payé ses 150 € rouvre le lien pour vérifier que c'est bien passé. Si le
-- jeton était effacé, les deux tomberaient sur « lien invalide » juste après
-- avoir fait ce qu'on leur demandait — et appelleraient le secrétariat.
--
-- Les pages sont donc IDEMPOTENTES : `utilise_le` horodate l'action, et une
-- seconde ouverture montre l'état (« accepté le 9 octobre », « réglé »). Ce qui
-- borne le risque, ce n'est pas l'effacement, c'est `expire_le` — et la
-- révocation, qui devient possible parce que la ligne existe toujours.
--
-- ── POURQUOI PLUSIEURS LIENS DU MÊME TYPE SONT ACCEPTÉS ─────────────────────
--
-- Pas d'unicité sur (dossier_id, type), délibérément. Un devis renvoyé parce que
-- le premier e-mail est tombé dans les indésirables doit produire un lien NEUF,
-- pas réveiller l'ancien. Et l'historique des envois est exactement ce qu'on
-- veut garder : qui a reçu quoi, quand, et combien de fois on a relancé.
--
-- `lib/liensCandidat.ts` lit TOUJOURS le lien le plus récent non révoqué.
-- ============================================================================

create table if not exists liens_candidat (
  id          uuid primary key default gen_random_uuid(),

  -- 32 octets d'aléa en base64url (43 caractères). Jamais dérivé de quoi que ce
  -- soit : tiré par `randomBytes(32)` dans lib/liensCandidat.ts.
  jeton       text not null,

  -- À quoi sert ce lien. La liste est FERMÉE : un type inconnu doit être refusé
  -- par la base, pas interprété par l'application. Le jour où l'on en ajoute un,
  -- c'est une migration — donc une décision, pas un effet de bord.
  type        text not null
              check (type in ('identite', 'devis', 'participation', 'coordonnees')),

  dossier_id  uuid not null references dossiers(id) on delete cascade,

  cree_le     timestamptz not null default now(),
  -- Pas de défaut : la durée de vie est une DÉCISION de l'appelant, différente
  -- selon le type (un devis vit plus longtemps qu'un appel de fonds). Un défaut
  -- ici ferait que personne n'y penserait plus.
  expire_le   timestamptz not null,

  -- Horodatage de l'ACTION (voie choisie, devis accepté, paiement enregistré),
  -- pas de la simple ouverture. C'est lui qui rend les pages idempotentes.
  utilise_le  timestamptz,

  -- La coupure manuelle. Un lien révoqué est refusé comme un lien inconnu :
  -- la page ne dit jamais LAQUELLE des raisons s'applique (cf. plus bas).
  revoque_le  timestamptz,
  revoque_par text,

  -- Qui a demandé l'envoi. Sert au journal et aux questions d'après-coup.
  cree_par    text,

  constraint liens_candidat_expire_apres_creation check (expire_le > cree_le)
);

-- L'arbitre de l'unicité du jeton. Pas de clause partielle, contrairement à
-- `rendez_vous_jeton_unique` : ici le jeton n'est jamais remis à NULL, donc il
-- n'y a aucun NULL à épargner.
create unique index if not exists liens_candidat_jeton_unique
  on liens_candidat (jeton);

-- Lecture chaude : « le dernier lien vivant de ce dossier, pour ce type ».
create index if not exists idx_liens_candidat_dossier_type
  on liens_candidat (dossier_id, type, cree_le desc);

alter table liens_candidat enable row level security;
-- Aucune policy, comme partout dans ce CRM : l'accès passe par `service_role`
-- depuis les routes serveur. La clé publiable ne lit RIEN ici — et c'est
-- important : cette table est l'annuaire des clés d'accès aux dossiers.

-- ============================================================================
-- LA VOIE DE VÉRIFICATION D'IDENTITÉ CHOISIE PAR LE CANDIDAT
--
-- 🔴 DISTINCTE de `stagiaires.verification_identite`, et il ne faut pas les
-- confondre.
--
-- `verification_identite` est le STATUT INTERNE, tenu par l'équipe sur
-- /identites : « courrier envoyé », « courrier validé », « vérification en ligne
-- validée »… C'est une CONSTATATION — quelqu'un chez nous a vu la pièce.
--
-- `verification_identite_voie` est la DÉCLARATION DU CANDIDAT : par quelle voie
-- il veut s'y prendre. C'est une intention, pas une validation.
--
-- Les écrire dans la même colonne reviendrait à laisser un candidat valider sa
-- propre identité en cochant une case — exactement ce que la vérification
-- cherche à empêcher. La page candidat n'écrit donc JAMAIS
-- `verification_identite` : elle remplit la voie, et le secrétariat garde la
-- main sur le statut.
--
-- Ce que ça supprime concrètement : aujourd'hui la voie se demande au téléphone,
-- puis se retape dans la note de suivi. Là elle arrive renseignée.
-- ============================================================================

alter table stagiaires
  add column if not exists verification_identite_voie text,
  add column if not exists verification_identite_voie_le timestamptz;

-- `not valid` : la contrainte s'applique aux ÉCRITURES À VENIR sans relire les
-- lignes existantes. Toutes ont la colonne à NULL (elle vient de naître), donc
-- il n'y a rien à valider — mais l'habitude est la bonne sur une table de
-- production, et elle évite un verrou long le jour où ce ne sera plus vrai.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stagiaires_verification_identite_voie_connue'
  ) then
    alter table stagiaires
      add constraint stagiaires_verification_identite_voie_connue
      check (verification_identite_voie is null
             or verification_identite_voie in ('en_ligne', 'courrier', 'les_deux'))
      not valid;
  end if;
end $$;

-- ============================================================================
-- L'ACCEPTATION DU DEVIS PAR LE CANDIDAT
--
-- `devis_accepte_le` horodate le clic.
--
-- 🔴 `devis_accepte_vu` est le plus important des deux, et c'est le moins
-- évident. Il garde l'INSTANTANÉ de ce que le candidat avait sous les yeux au
-- moment d'accepter : intitulé, heures, dates des séances, lieu, montant,
-- financement.
--
-- Pourquoi : un dossier BOUGE. Les heures sont arrêtées après le test de
-- positionnement, le planning se décale, le montant suit. Six mois plus tard,
-- « le candidat a accepté » ne vaut rien si on ne peut plus dire ACCEPTÉ QUOI —
-- et c'est précisément la question que pose un contrôle. Sans cet instantané, la
-- seule réponse serait l'état ACTUEL du dossier, qui n'est pas celui qui a été
-- accepté.
--
-- En jsonb et non en colonnes : ce n'est pas une donnée qu'on interroge, c'est
-- une pièce qu'on relit. La figer en colonnes obligerait à migrer chaque fois
-- que le devis affiche un élément de plus.
-- ============================================================================

alter table dossiers
  add column if not exists devis_accepte_le timestamptz,
  add column if not exists devis_accepte_vu jsonb;

-- ============================================================================
-- LA PARTICIPATION FORFAITAIRE CPF : LA DEMANDE D'EXONÉRATION DU CANDIDAT
--
-- `participation_forfaitaire_reglee` et `participation_forfaitaire_exemptee`
-- existent déjà et restent la source de vérité (cf. lib/gates.ts).
--
-- Ce qui manquait : le cas du candidat qui pense ne rien devoir. La
-- participation n'est PAS due par un demandeur d'emploi inscrit à France
-- Travail, ni quand un employeur ou un financeur prend le relais. Aujourd'hui ce
-- candidat appelle, et quelqu'un cliquue « exonérer » après l'avoir cru.
--
-- 🔴 Ces deux colonnes n'EXONÈRENT PERSONNE. Elles enregistrent une DEMANDE.
-- L'exonération reste un geste d'équipe sur un justificatif — une page publique
-- qui exonérerait sur déclaration transformerait 150 € dus en 150 € perdus, et
-- se verrait au premier contrôle de la Caisse des dépôts.
-- ============================================================================

alter table dossiers
  add column if not exists exoneration_demandee_le timestamptz,
  add column if not exists exoneration_demandee_motif text;

-- ============================================================================
-- À reporter dans migrations/MANIFEST.md sous le n° 84.
-- ============================================================================
