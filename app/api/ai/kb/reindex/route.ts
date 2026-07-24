/**
 * MYSTORY — /api/ai/kb/reindex (réindexation de la base de connaissance)
 * POST → vectorise la FAQ + les techniques de vente (actives) via Mistral et remplace kb_documents.
 * Auth : session OU token de service Bearer (patron /api/incidents). À relancer quand le contenu change.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedMistral, versVecteurSql } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }
  if (!process.env.MISTRAL_API_KEY) return NextResponse.json({ ok: false, erreur: "MISTRAL_API_KEY manquante côté serveur." }, { status: 503 });

  // 1 — Rassembler les documents à indexer.
  const docs: { source: string; ref_id: string; titre: string; categorie: string | null; contenu: string }[] = [];
  const { data: faq } = await supabaseAdmin.from("faq").select("id,categorie,question,reponse").eq("actif", true);
  for (const f of faq ?? []) {
    const x = f as any;
    docs.push({ source: "faq", ref_id: x.id, titre: String(x.question || ""), categorie: x.categorie ?? null, contenu: `Q : ${x.question}\nR : ${x.reponse}` });
  }
  const { data: tv } = await supabaseAdmin.from("techniques_vente").select("id,categorie,titre,contenu").eq("actif", true);
  for (const t of tv ?? []) {
    const x = t as any;
    docs.push({ source: "technique_vente", ref_id: x.id, titre: String(x.titre || ""), categorie: x.categorie ?? null, contenu: `${x.titre}\n${x.contenu}` });
  }
  // Tarifs (formules)
  const { data: fm } = await supabaseAdmin.from("formules").select("id,certif,heures,prix_eur,libelle,financement,frais_examen_inclus").eq("actif", true);
  for (const f of fm ?? []) {
    const x = f as any;
    const titre = `Tarif ${x.certif} — ${x.heures} h${x.financement ? ` (${x.financement})` : ""}`;
    docs.push({ source: "tarif", ref_id: x.id, titre, categorie: "tarifs", contenu: `${titre} : ${x.prix_eur} €${x.frais_examen_inclus ? ", examen inclus" : ""}. ${x.libelle || ""}`.trim() });
  }
  // Centres
  const { data: ce } = await supabaseAdmin.from("centres").select("code,nom,adresse,acces,accueille_formation,accueille_examen").eq("actif", true);
  for (const c of ce ?? []) {
    const x = c as any;
    const accueille = [x.accueille_formation ? "formation" : null, x.accueille_examen ? "examen" : null].filter(Boolean).join(" et ");
    docs.push({ source: "centre", ref_id: null, titre: `Centre ${x.nom}`, categorie: "centres", contenu: `Centre ${x.nom} (${x.code}). Adresse : ${x.adresse || "-"}. Accès : ${x.acces || "-"}. Accueille : ${accueille || "-"}.` });
  }
  // Référence métier (réglementation, offres, économie) — non-personnelle, éditable
  const { data: kr } = await supabaseAdmin.from("kb_reference").select("id,categorie,titre,contenu").eq("actif", true);
  for (const r of kr ?? []) {
    const x = r as any;
    docs.push({ source: "reference", ref_id: x.id, titre: String(x.titre || ""), categorie: x.categorie ?? null, contenu: `${x.titre}\n${x.contenu}` });
  }
  if (!docs.length) return NextResponse.json({ ok: true, indexes: 0, message: "Aucun document actif à indexer." });

  // 2 — Embeddings par lots.
  const BATCH = 32;
  const lignes: any[] = [];
  for (let i = 0; i < docs.length; i += BATCH) {
    const lot = docs.slice(i, i + BATCH);
    let vecs: number[][];
    try {
      vecs = await embedMistral(lot.map((d) => (d.titre + "\n" + d.contenu).slice(0, 4000)));
    } catch (e: any) {
      return NextResponse.json({ ok: false, erreur: "Échec embeddings Mistral : " + (e?.message || String(e)) }, { status: 502 });
    }
    lot.forEach((d, k) => lignes.push({ source: d.source, ref_id: d.ref_id, titre: d.titre, categorie: d.categorie, contenu: d.contenu, embedding: versVecteurSql(vecs[k] || []) }));
  }

  // 3 — Remplacer l'index (purge + insertion).
  await supabaseAdmin.from("kb_documents").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabaseAdmin.from("kb_documents").insert(lignes);
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, indexes: lignes.length });
}
