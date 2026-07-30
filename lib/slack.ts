// MYSTORY — envoi Slack via incoming webhook (un webhook = un canal).
// Best-effort : si le webhook n'est pas configuré, on n'envoie rien (aucune erreur).

/** Poste un message dans le canal Slack correspondant au webhook fourni. */
export async function postSlack(webhook: string | undefined, texte: string): Promise<boolean> {
  if (!webhook) return false;
  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texte }),
    });
    return r.ok;
  } catch (e) {
    console.warn("[slack] post ignoré:", String(e));
    return false;
  }
}
