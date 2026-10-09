-- ============================================================================
-- Rendez-vous pris EN LIGNE depuis le site (/rendez-vous)
-- Date : 09/10/2026
--
-- Consigne du dirigeant, mot pour mot : « le rendez vous doit être automatique
-- ils choisisent la date, l'heure, l'agence et on reçoit un mail recap juste. »
--
-- ✅ APPLIQUÉE le 09/10/2026 sur le projet svepgknbbonrtwyvzaar (migration
--    `rendez_vous_en_ligne`). Les contraintes ont été ÉPROUVÉES en production
--    par cinq insertions jouées dans un bloc `DO $$ … raise exception $$` — le
--    `raise` annule la transaction, donc rien n'est resté écrit (vérifié :
--    0 ligne après coup) :
--      1. le même créneau une seconde fois → REFUSÉ (unique_violation) ;
--      2. le même créneau après annulation du premier → ACCEPTÉ ;
--      3. agence « Pantin » → REFUSÉE (check) ;
--      4. heure « 9:30 » → REFUSÉE (check) ;
--      5. même date et même heure dans une AUTRE agence → ACCEPTÉE.
--
-- Jusqu'ici /rendez-vous composait un message WhatsApp : le candidat remplissait
-- quatre écrans et repartait avec une conversation à entretenir, pas un
-- rendez-vous. Cette table est ce qui transforme la demande en RÉSERVATION.
--
-- ── POURQUOI UNE TABLE À PART, ET PAS `rdv_centres` ─────────────────────────
--
-- `rdv_centres` existe déjà et porte des rendez-vous, mais ce n'est pas la même
-- chose : c'est un MIROIR RECONSTRUCTIBLE des trois agendas Google privés,
-- remplacé en bloc par le robot n8n « Agendas RDV → CRM » (cf.
-- app/api/rdv-centres/route.ts). Sa source de vérité est Google. Y écrire une
-- réservation du site, c'est écrire dans un cache : le prochain remplacement
-- l'efface, et le candidat se présente un mardi matin sans que personne
-- l'attende.
--
-- Ici, la source de vérité est NOUS. D'où une table propre, qui ne se fait
-- jamais remplacer. Le jour où l'on voudra que ces rendez-vous apparaissent
-- aussi dans les agendas Google, ce sera un robot qui les y POUSSERA — dans ce
-- sens-là, et pas l'inverse.
--
-- ── 🔴 LE COMPTE EST TENU PAR LA BASE, PAS PAR L'APPLICATION ────────────────
--
-- C'est le même raisonnement que les matinées de préparation (migration n° 78,
-- `matinees_preparation`), et il vaut ici à l'identique.
--
-- Un créneau de 30 minutes dans une agence n'accueille qu'UNE personne. La
-- tentation est d'écrire `select count(*)` puis `insert` : elle ne marche pas.
-- Deux candidats peuvent viser le dernier créneau de 14 h 30 à Rosny à la MÊME
-- SECONDE ; les deux lectures renvoient « libre », les deux insertions
-- passent, et deux personnes se présentent devant la même conseillère. Ce
-- défaut ne se voit pas en test — il se voit le jour où il y a du trafic, c'est-
-- à-dire le jour où il coûte quelque chose.
--
-- L'arbitre est donc l'index d'unicité ci-dessous. L'application tente
-- l'insertion et lit le code d'erreur : 23505 veut dire « quelqu'un a été plus
-- rapide », et c'est un cas NORMAL, pas une anomalie. Le candidat reçoit un
-- refus net et la liste rafraîchie, jamais un rendez-vous fantôme.
--
-- L'unicité est PARTIELLE — elle ne porte pas sur les rendez-vous annulés.
-- Sans cela, un rendez-vous annulé immobiliserait son créneau pour toujours, et
-- la règle MYSTORY interdit de supprimer une ligne : on annule, on n'efface pas.
--
-- ⚠️ MIGRATION PUREMENT ADDITIVE. Aucun DROP, aucun DELETE, aucun TRUNCATE,
-- `if not exists` partout : elle se rejoue sans effet.
-- ============================================================================

create table if not exists rendez_vous (
  id            uuid primary key default gen_random_uuid(),

  -- ─── LE CRÉNEAU ───────────────────────────────────────────────────────────
  -- L'agence fait partie de la clé : 14 h 30 peut être pris à Rosny et libre à
  -- Gagny. C'est exactement le défaut qui a fait vendre des places déjà prises
  -- sur les sessions d'examen en octobre (cf. lib/occupationSessions.ts) — on
  -- ne compte jamais un créneau sans son lieu.
  agence        text not null,
  date_rdv      date not null,
  -- `heure` en TEXTE « HH:MM » et non en `time`, volontairement : c'est la
  -- valeur qui circule entre le site, la route et cette table, et
  -- l'ordre lexicographique d'un horaire à deux chiffres EST l'ordre
  -- chronologique. Un `time` imposerait un formatage à chaque bord (« 09:30:00 »
  -- rendu au navigateur) pour aucun gain. Le format est verrouillé plus bas.
  heure         text not null,
  duree_minutes integer not null default 30 check (duree_minutes > 0),

  -- ─── LE CANDIDAT ──────────────────────────────────────────────────────────
  civilite      text,
  nom           text not null,
  prenom        text not null,
  email         text not null,
  telephone     text not null,

  -- ─── CE QU'IL VIENT FAIRE ─────────────────────────────────────────────────
  -- `motif` = la démarche (naturalisation, carte de résident, pluriannuelle…),
  -- `objectif` = ce qu'il cherche (financement CPF, préparation courte, examen).
  motif         text,
  objectif      text,
  -- 🔴 La situation du titre de séjour est OBLIGATOIRE, et ce n'est pas de la
  -- curiosité administrative : c'est elle qui détermine la marche à suivre sur
  -- moncompteformation.gouv.fr, et donc ce que le candidat doit APPORTER au
  -- rendez-vous. Un dossier CPF ne meurt presque jamais sur le choix de la
  -- formation, il meurt sur la vérification d'identité. Sans cette réponse, la
  -- visite sert à prendre un second rendez-vous.
  situation_titre text not null,
  message       text,

  -- ─── TRACE DE L'ENVOI DU RÉCAPITULATIF ────────────────────────────────────
  -- Le dirigeant ne demande qu'une chose en retour : « on reçoit un mail recap ».
  -- Alors il faut pouvoir répondre à « l'avons-nous reçu ? » sans fouiller le
  -- journal : l'horodatage du départ, et l'erreur si ça a échoué. Un échec
  -- d'envoi n'annule PAS le rendez-vous — la place est réservée, c'est la
  -- notification qui a manqué, et c'est une ligne à rattraper à la main.
  recap_envoye_le         timestamptz,
  recap_erreur            text,
  confirmation_envoyee_le timestamptz,

  -- ─── CYCLE DE VIE ─────────────────────────────────────────────────────────
  -- « honore » / « absent » servent au suivi après la visite. Ils NE libèrent
  -- PAS le créneau (il est passé, de toute façon) : seul « annule » le libère.
  statut        text not null default 'confirme'
                check (statut in ('confirme', 'annule', 'honore', 'absent')),
  origine       text not null default 'site',
  cree_le       timestamptz not null default now(),
  annule_le     timestamptz,
  annule_par    text,

  -- Les trois agences MYSTORY, et elles seules. Pantin est un site PARTENAIRE
  -- (IFIE Formation) : jamais un lieu de rendez-vous MYSTORY.
  constraint rendez_vous_agence_connue
    check (agence in ('Rosny', 'Gagny', 'Sarcelles')),
  -- Le format de l'heure est verrouillé ICI parce que l'unicité du créneau en
  -- dépend : « 9:30 » et « 09:30 » sont deux textes différents pour un index,
  -- donc deux rendez-vous acceptés sur le même créneau. La contrainte n'est pas
  -- cosmétique, elle garde l'arbitre honnête.
  constraint rendez_vous_heure_format
    check (heure ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$')
);

-- 🔴 L'ARBITRE. Un créneau, une personne — et seulement sur les rendez-vous
-- VIVANTS, pour qu'une annulation rende vraiment la place.
create unique index if not exists rendez_vous_un_creneau_une_fois
  on rendez_vous (agence, date_rdv, heure) where statut <> 'annule';

-- Lecture chaude : « quels créneaux sont pris dans cette agence sur les 4
-- semaines qui viennent ». C'est la requête que fait le site à chaque
-- changement d'agence.
create index if not exists idx_rendez_vous_agence_date
  on rendez_vous (agence, date_rdv) where statut <> 'annule';

-- Sert au plafond par adresse e-mail (anti-abus) et à retrouver un candidat.
create index if not exists idx_rendez_vous_email on rendez_vous (email);

alter table rendez_vous enable row level security;
-- Aucune policy, comme partout dans ce CRM : l'accès passe par `service_role`
-- depuis les routes serveur. La clé publiable du site ne lit RIEN ici — et
-- c'est important, parce que cette table contient des noms, des téléphones et
-- des situations de titre de séjour. Le site n'apprend les créneaux occupés que
-- par `GET /api/rendez-vous`, qui ne rend que des heures.

-- ============================================================================
-- À reporter dans migrations/MANIFEST.md sous le n° 79.
-- ============================================================================
