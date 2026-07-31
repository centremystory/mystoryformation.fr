// Workflow n8n : Agent WhatsApp MYSTORY
// Code SDK n8n (@n8n/workflow-sdk) — validé via l'outil validate_workflow (10 nœuds).
// Voir docs/n8n/agent-whatsapp-mystory.md pour le guide d'installation.

import { workflow, node, trigger, sticky, newCredential, ifElse, languageModel, memory, tool, fromAi, expr, nodeJson } from '@n8n/workflow-sdk';

const whatsAppTrigger = trigger({
  type: 'n8n-nodes-base.whatsAppTrigger',
  version: 1,
  config: {
    name: 'Message WhatsApp reçu',
    parameters: { updates: ['messages'] },
    credentials: { whatsAppTriggerApi: newCredential('WhatsApp Trigger MYSTORY') },
    position: [-460, 300]
  },
  output: [{ messaging_product: 'whatsapp', metadata: { display_phone_number: '33681431654', phone_number_id: '123456789' }, contacts: [{ profile: { name: 'Amina' }, wa_id: '33612345678' }], messages: [{ from: '33612345678', id: 'wamid.XXX', timestamp: '1722400000', text: { body: 'Bonjour, quel est le prix de la formation B1 ?' }, type: 'text' }] }]
});

const estUnMessage = ifElse({
  version: 2.2,
  config: {
    name: 'Est-ce un message entrant ?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.messages }}'), operator: { type: 'array', operation: 'notEmpty' } }],
        combinator: 'and'
      }
    },
    position: [-220, 300]
  }
});

const normaliserMessage = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normaliser le message',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'telephone', name: 'telephone', value: expr('{{ $json.messages[0].from }}'), type: 'string' },
          { id: 'nom', name: 'nom', value: expr('{{ $json.contacts?.[0]?.profile?.name ?? "Client" }}'), type: 'string' },
          { id: 'texte', name: 'texte', value: expr('{{ $json.messages[0].text?.body ?? $json.messages[0].interactive?.button_reply?.title ?? $json.messages[0].button?.text ?? "[Le client a envoyé un message vocal ou un média — demande-lui poliment de reformuler par écrit]" }}'), type: 'string' },
          { id: 'phoneNumberId', name: 'phoneNumberId', value: expr('{{ $json.metadata.phone_number_id }}'), type: 'string' }
        ]
      }
    },
    position: [20, 200]
  },
  output: [{ telephone: '33612345678', nom: 'Amina', texte: 'Bonjour, quel est le prix de la formation B1 ?', phoneNumberId: '123456789' }]
});

const modeleOpenAi = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'Modèle OpenAI',
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-5.4', cachedResultName: 'gpt-5.4' }, options: { temperature: 0.3 } },
    credentials: { openAiApi: newCredential('OpenAI') },
    position: [120, 460]
  }
});

const memoireConversation = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  version: 1.4,
  config: {
    name: 'Mémoire par numéro',
    parameters: { sessionIdType: 'customKey', sessionKey: nodeJson(whatsAppTrigger, 'messages.0.from'), contextWindowLength: 10 },
    position: [300, 460]
  }
});

const alerterEquipe = tool({
  type: 'n8n-nodes-base.gmailTool',
  version: 2.2,
  config: {
    name: 'Alerter_equipe_MYSTORY',
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: 'contact@mystoryformation.fr',
      subject: fromAi('sujet', 'Sujet court de l’alerte, ex: "WhatsApp — demande de rappel de Amina (33612345678)"'),
      emailType: 'text',
      message: fromAi('contenu', 'Résumé de la demande du client : nom, numéro WhatsApp, formation concernée, question posée, action attendue de l’équipe'),
      options: { appendAttribution: false, senderName: 'Agent WhatsApp MYSTORY' }
    },
    credentials: { gmailOAuth2: newCredential('Gmail secretariat') },
    position: [480, 460]
  }
});

const agentMystory = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Agent MYSTORY',
    parameters: {
      promptType: 'define',
      text: expr('Message WhatsApp reçu de {{ $json.nom }} (numéro {{ $json.telephone }}), le {{ $now.setZone("Europe/Paris").toFormat("dd/MM/yyyy à HH:mm") }} :\n\n{{ $json.texte }}'),
      options: {
        systemMessage: 'Tu es l’assistant WhatsApp officiel de MYSTORY (mystoryformation.fr), organisme de formation de Français Langue Étrangère (FLE) certifié Qualiopi, situé à Gagny. Tu réponds aux prospects et élèves en français simple et chaleureux (beaucoup ne sont pas francophones natifs : phrases courtes, vocabulaire accessible). Tutoiement interdit : vouvoie toujours le client.\n\n=== RÈGLES DE RÉPONSE ===\n- Réponds UNIQUEMENT avec les informations ci-dessous. Si une information n’y figure pas, ne l’invente jamais : propose d’appeler le 06 81 43 16 54 ou d’écrire à contact@mystoryformation.fr.\n- Réponses courtes adaptées à WhatsApp : maximum 600 caractères environ, aère avec des sauts de ligne, quelques emojis sobres autorisés (📍📞✅). Jamais de tableaux ni de Markdown (pas de **, pas de #).\n- Sur le CPF : reste strictement factuel, jamais de promesse ni d’incitation commerciale (loi anti-démarchage CPF). Le tarif CPF n’est pas négociable. Les remises éventuelles ne concernent que les paiements sur fonds propres.\n- Si le client veut s’inscrire, être rappelé, a un litige, une réclamation, une question sur SON dossier personnel, ou si tu ne sais pas répondre après 2 échanges : utilise l’outil Alerter_equipe_MYSTORY pour prévenir l’équipe (avec nom, numéro, résumé), puis dis au client qu’un conseiller va le recontacter rapidement.\n- Ne communique jamais d’information personnelle sur d’autres clients. Ne traite aucune demande hors sujet MYSTORY (réponds poliment que tu es l’assistant de MYSTORY).\n\n=== MYSTORY EN BREF ===\n- MYSTORY Formation : centre de formation FLE certifié Qualiopi, centre d’examen TEF IRN agréé (habilité CCI Paris Île-de-France).\n- Baseline : « Votre histoire, notre fierté ». Plus de 550 stagiaires formés, 95 % de satisfaction, 90 % de réussite, note 4,9/5.\n- Site : mystoryformation.fr — Test de niveau gratuit en ligne : test.mystoryformation.fr\n\n=== COORDONNÉES ===\n- 📞 Téléphone : 06 81 43 16 54\n- ✉️ Email : contact@mystoryformation.fr\n- 📍 Centre principal (formations + examens) : 3 bis avenue de Gagny, 93220 Gagny (accessible PMR)\n- 📍 Point d’inscription Sarcelles : 18 avenue du 8 Mai 1945, 95200 Sarcelles\n- Accueil : lundi au samedi, 9h30 – 17h30\n\n=== FORMATIONS (prix nets, examen TEF IRN INCLUS) ===\nObjectif A2 — carte de séjour pluriannuelle :\n- Consolidation 12h : 690 € | Standard 24h : 1 110 € | Renforcée 36h : 1 410 €\nObjectif B1 — carte de résident :\n- Éclair 9h : 555 € | Consolidation 21h : 990 € | Standard 33h : 1 305 € | Complète 45h : 1 500 €\nObjectif B2 — naturalisation française :\n- Consolidation 15h : 825 € | Standard 27h : 1 230 € | Complète 39h : 1 515 €\nFormule Intensif — stratégies d’examen + examens blancs :\n- Express 6h : 420 € | Complet 18h : 870 € | Sérénité 30h : 1 200 €\n\n=== ORGANISATION DES COURS ===\n- Présentiel uniquement, à Gagny. Entrées et sorties libres : Matin 9h30–12h30, Après-midi 14h–17h. Émargement à chaque venue.\n- Prérequis : avoir au moins 16 ans, savoir lire des phrases simples en français. Le niveau d’entrée est vérifié par un test de positionnement gratuit (45 minutes).\n- Délai d’accès : minimum 11 jours ouvrés après validation de la commande (CPF/EDOF).\n- Examen TEF IRN passé à Gagny, généralement 2 à 4 semaines après la fin de la formation (sessions lundi et vendredi).\n\n=== FINANCEMENT ===\n- CPF (via Mon Compte Formation / EDOF), OPCO, France Travail, ou paiement personnel.\n- Pour vérifier son solde CPF : moncompteformation.gouv.fr\n\n=== PARCOURS D’INSCRIPTION (à proposer) ===\n1) Faire le test de niveau gratuit : test.mystoryformation.fr (ou au centre)\n2) Choisir la formule adaptée avec un conseiller\n3) Valider l’inscription (CPF ou autre financement)\n➡️ Pour toute inscription ou rappel : utilise l’outil Alerter_equipe_MYSTORY et confirme au client qu’un conseiller le recontactera.',
        maxIterations: 6
      }
    },
    subnodes: { model: modeleOpenAi, memory: memoireConversation, tools: [alerterEquipe] },
    position: [240, 200]
  },
  output: [{ output: 'Bonjour Amina 👋\nLa formation Objectif B1 (carte de résident) existe en 4 formules, examen TEF IRN inclus :\n- Éclair 9h : 555 €\n- Consolidation 21h : 990 €\n- Standard 33h : 1 305 €\n- Complète 45h : 1 500 €\nSouhaitez-vous être rappelée par un conseiller ? 📞 06 81 43 16 54' }]
});

const repondreWhatsApp = node({
  type: 'n8n-nodes-base.whatsApp',
  version: 1.1,
  config: {
    name: 'Répondre sur WhatsApp',
    parameters: {
      resource: 'message',
      operation: 'send',
      phoneNumberId: expr("{{ $('Normaliser le message').item.json.phoneNumberId }}"),
      recipientPhoneNumber: expr("{{ $('Normaliser le message').item.json.telephone }}"),
      messageType: 'text',
      textBody: expr('{{ $json.output }}')
    },
    credentials: { whatsAppApi: newCredential('WhatsApp MYSTORY') },
    position: [560, 200]
  },
  output: [{ messaging_product: 'whatsapp', contacts: [{ input: '33612345678', wa_id: '33612345678' }], messages: [{ id: 'wamid.YYY' }] }]
});

const noteConfig = sticky(
  '## ⚙️ Configuration requise\n1. **WhatsApp Trigger MYSTORY** (App Meta : Client ID + Client Secret de votre app WhatsApp Business)\n2. **WhatsApp MYSTORY** (credential WhatsApp API : Access Token + Business Account ID)\n3. **OpenAI** (clé API pour le modèle)\n4. Vérifier le **Phone Number ID** — il est lu automatiquement depuis le message entrant\n\nL’outil email utilise le credential existant **Gmail secretariat** pour alerter contact@mystoryformation.fr quand un client veut s’inscrire ou être rappelé.',
  [whatsAppTrigger, estUnMessage],
  { color: 4 }
);

const noteAgent = sticky(
  '## 🤖 Agent MYSTORY\nRépond en français simple aux questions : formations A2/B1/B2/Intensif, tarifs, TEF IRN, CPF, adresses, horaires.\n\nMémoire par numéro WhatsApp (10 derniers échanges).\n\nEscalade vers l’équipe par email pour : inscription, rappel, litige, dossier personnel.',
  [agentMystory],
  { color: 5 }
);

export default workflow('whatsapp-agent-mystory', 'Agent WhatsApp MYSTORY')
  .add(whatsAppTrigger)
  .to(estUnMessage.onTrue(normaliserMessage.to(agentMystory.to(repondreWhatsApp))))
  .add(noteConfig)
  .add(noteAgent);
