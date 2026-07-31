# Agent WhatsApp MYSTORY (n8n)

Agent IA qui répond automatiquement aux messages reçus sur le compte **WhatsApp Business** de MYSTORY : formations FLE (A2 / B1 / B2 / Intensif), tarifs, TEF IRN, CPF, adresses, horaires, parcours d'inscription.

Le code source du workflow (SDK n8n) est dans [`agent-whatsapp-mystory.workflow.ts`](./agent-whatsapp-mystory.workflow.ts).

## Fonctionnement

```
Message WhatsApp reçu (trigger Meta)
  → Est-ce un message entrant ? (ignore les accusés de lecture/livraison)
  → Normaliser le message (téléphone, nom, texte, phone_number_id)
  → Agent MYSTORY (IA)
      ├─ Modèle : OpenAI (gpt-5.4)
      ├─ Mémoire : 10 derniers échanges par numéro WhatsApp
      └─ Outil : Alerter_equipe_MYSTORY → email à contact@mystoryformation.fr
  → Répondre sur WhatsApp (au même numéro)
```

Comportement de l'agent :

- Répond en **français simple**, vouvoiement, format court adapté à WhatsApp (~600 caractères max, pas de Markdown).
- Ne répond **qu'avec la base de connaissances** intégrée (catalogue v6 du 28/07/2026 : offres A2/B1/B2/Intensif, prix nets examen TEF IRN inclus, coordonnées Gagny/Sarcelles, financement CPF/OPCO/France Travail). Si l'info manque, il oriente vers le 06 81 43 16 54 ou contact@mystoryformation.fr.
- **CPF : discours strictement factuel** (conformité loi anti-démarchage), tarif CPF non négociable.
- **Escalade humaine** : inscription, demande de rappel, litige, réclamation, question sur un dossier personnel → email automatique à `contact@mystoryformation.fr` (via le credential Gmail secretariat) + message au client qu'un conseiller le recontactera.

## Installation dans n8n

1. Créer le workflow depuis le fichier `.workflow.ts` (via Claude + MCP n8n : outil `create_workflow_from_code`, code déjà validé), ou reconstruire les nœuds à la main dans l'éditeur.
2. Connecter les credentials :
   - **WhatsApp Trigger MYSTORY** (`whatsAppTriggerApi`) : Client ID + Client Secret de l'app Meta (developers.facebook.com → votre app WhatsApp Business). La vérification du webhook est automatique à l'activation.
   - **WhatsApp MYSTORY** (`whatsAppApi`) : Access Token (permanent, System User conseillé) + Business Account ID.
   - **OpenAI** (`openAiApi`) : clé API OpenAI.
   - **Gmail secretariat** : credential existant dans n8n, à sélectionner sur l'outil `Alerter_equipe_MYSTORY`.
3. Activer le workflow (le webhook Meta est enregistré automatiquement par n8n).
4. Tester : envoyer « Bonjour, quel est le prix de la formation B1 ? » au numéro WhatsApp Business.

## Points d'attention

- **Fenêtre de 24 h Meta** : WhatsApp n'autorise les messages libres que dans les 24 h suivant le dernier message du client — ce workflow répond immédiatement, donc toujours dans la fenêtre.
- Le `phone_number_id` est lu dynamiquement depuis chaque message entrant : le workflow fonctionne tel quel si le numéro WhatsApp change.
- Les messages vocaux / images ne sont pas transcrits : l'agent demande poliment de reformuler par écrit.
- **Mise à jour des tarifs** : la base de connaissances est dans le paramètre *System Message* du nœud « Agent MYSTORY ». À mettre à jour à chaque évolution du catalogue (`lib/inscriptions/regles.ts`).
