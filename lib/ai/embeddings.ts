// lib/ai/embeddings.ts — embeddings Mistral (mistral-embed, 1024 dims) pour la base de connaissance.
export async function embedMistral(inputs: string[]): Promise<number[][]> {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) throw new Error("MISTRAL_API_KEY manquante côté serveur.");
  const r = await fetch("https://api.mistral.ai/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: "mistral-embed", input: inputs }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Mistral embeddings ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return (j?.data ?? []).map((d: any) => d.embedding as number[]);
}

/** Format texte pgvector : '[0.1,0.2,...]' (accepté en insertion et en paramètre RPC). */
export function versVecteurSql(v: number[]): string {
  return "[" + v.join(",") + "]";
}
