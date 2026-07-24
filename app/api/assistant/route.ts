// app/api/assistant/route.ts
// Assistant CRM — boucle "agent à outils" via OpenRouter. LECTURE SEULE.
// Le LLM choisit des outils cadrés (lib/assistant/outils.ts) ; jamais de SQL libre.
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { OUTILS } from "@/lib/assistant/outils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["direction", "manager"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Accès réservé à la direction / au management." }, { status: 403 });
    throw e;
  }

  const cle = process.env.OPENROUTER_API_KEY;
  if (!cle) return NextResponse.json({ ok: false, erreur: "Assistant non configuré : la clé OPENROUTER_API_KEY est absente côté serveur." }, { status: 503 });
  const modele = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const historique = Array.isArray(b?.messages) ? b.messages : [];
  if (!historique.length) return NextResponse.json({ ok: false, erreur: "Aucun message." }, { status: 400 });
  // On ne garde que role + content côté entrée client (anti-injection de tool_calls).
  const messagesClient = historique
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  if (!messagesClient.length) return NextResponse.json({ ok: false, erreur: "Aucun message valide." }, { status: 400 });

  const auj = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full" }).format(new Date());
  const systeme = {
    role: "system",
    content:
      `Tu es l'assistant interne du CRM de MYSTORY (centre de formation FLE et centre d'examen TEF IRN, sites Gagny/Sarcelles/Rosny). ` +
      `Nous sommes le ${auj} (heure de Paris). ` +
      `Tu réponds en français, de façon concise et concrète, aux questions de l'équipe sur les données réelles du CRM. ` +
      `Utilise TOUJOURS les outils pour obtenir des chiffres ou des faits — n'invente JAMAIS une donnée, un nom ou un montant. ` +
      `Si un outil ne renvoie rien, dis-le clairement plutôt que d'inventer. ` +
      `Pour une période exprimée en langage courant, déduis les dates (ex. « cette semaine » = lundi de la semaine en cours jusqu'à aujourd'hui) et passe-les au format AAAA-MM-JJ. ` +
      `Tu es en lecture seule : tu ne peux pas modifier le CRM. Termine par une réponse claire, pas par du JSON brut.`,
  };

  const tools = Object.values(OUTILS).map((o) => o.schema);
  const messages: any[] = [systeme, ...messagesClient];
  const outilsUtilises: string[] = [];

  for (let i = 0; i < 5; i++) {
    let r: Response;
    try {
      r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cle}`,
          "Content-Type": "application/json",
          "X-Title": "MYSTORY CRM Assistant",
        },
        body: JSON.stringify({ model: modele, messages, tools, tool_choice: "auto", temperature: 0.1 }),
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, erreur: "Impossible de joindre le service IA : " + (e?.message || String(e)) }, { status: 502 });
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json({ ok: false, erreur: `Erreur du service IA (${r.status}). ${t.slice(0, 200)}` }, { status: 502 });
    }
    const j = await r.json();
    const msg = j?.choices?.[0]?.message;
    if (!msg) return NextResponse.json({ ok: false, erreur: "Réponse IA vide." }, { status: 502 });
    messages.push(msg);

    const calls = msg.tool_calls;
    if (!calls || !calls.length) {
      return NextResponse.json({ ok: true, reponse: msg.content || "", outils: [...new Set(outilsUtilises)] });
    }
    for (const c of calls) {
      const nom = c?.function?.name;
      let args: any = {};
      try { args = JSON.parse(c?.function?.arguments || "{}"); } catch { args = {}; }
      outilsUtilises.push(nom);
      let resultat: any;
      try {
        resultat = OUTILS[nom] ? await OUTILS[nom].run(args) : { erreur: "Outil inconnu : " + nom };
      } catch (e: any) {
        resultat = { erreur: "Échec de l'outil : " + (e?.message || String(e)) };
      }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(resultat).slice(0, 6000) });
    }
  }
  return NextResponse.json({ ok: true, reponse: "Je n'ai pas réussi à conclure après plusieurs étapes — peux-tu reformuler ta question ?", outils: [...new Set(outilsUtilises)] });
}
