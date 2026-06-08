# MYSTORY — Automatisation (Convention → signature)

Service Next.js déployé sur Vercel. Génère la Convention (lieu = Gagny),
l'envoie en signature DocuSeal, et met à jour Supabase. Piloté par n8n.

## Variables d'environnement (Vercel → Settings → Environment Variables)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_STORAGE_BUCKET = documents
- AUTH_SECRET
- DOCUSEAL_BASE_URL
- DOCUSEAL_API_KEY
- DOCUSEAL_WEBHOOK_SECRET
- DOCUSEAL_OF_EMAIL = contact@mystoryformation.fr
- DOCUSEAL_OF_SIGNATURE_URL
- DOCUSEAL_OF_AUTO_SIGN = true

## Endpoints
- POST /api/conventions/send      (protégé, appelé par n8n en Bearer)
- POST /api/webhooks/docuseal     (retour de signature DocuSeal)

## Note
La route de génération utilise Chromium (PDF). Si le PDF échoue par mémoire,
augmenter la mémoire de la fonction dans Vercel (Settings → Functions, ~2048 Mo).
