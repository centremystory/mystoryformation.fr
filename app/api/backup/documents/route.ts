/**
 * MYSTORY — GET /api/backup/documents : export ZIP de tout le bucket `documents`.
 * Le PITR Supabase sauvegarde la BASE, pas le STORAGE → ce backup couvre les PDF signés
 * (conventions, attestations, avoirs, feuilles d'émargement…). Réservé au propriétaire
 * (arudhan@) OU à un automate de confiance (cron/n8n, jeton de service) pour l'automatiser.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireProprietaire, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const BUCKET = "documents";

/** Liste récursive de tous les chemins de fichiers du bucket (les dossiers ont id=null). */
async function listerTout(prefixe = ""): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(prefixe, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);
  for (const item of data ?? []) {
    const chemin = prefixe ? `${prefixe}/${item.name}` : item.name;
    if ((item as any).id == null) out.push(...await listerTout(chemin)); // dossier → récursion
    else out.push(chemin);
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    await requireProprietaire(req);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé au propriétaire." }, { status: 403 });
    throw e;
  }

  try {
    const chemins = await listerTout("");
    const zip = new JSZip();
    let ok = 0;
    for (const chemin of chemins) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(chemin);
      if (error || !data) continue;
      zip.file(chemin, Buffer.from(await data.arrayBuffer()));
      ok++;
    }
    // Manifeste (traçabilité de l'export).
    const stamp = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
    zip.file("_manifeste.txt", `Backup bucket "${BUCKET}" — MYSTORY\nExport du ${stamp}\nFichiers: ${ok}/${chemins.length}\n`);
    const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    // Cast : la lib DOM récente typre strictement BodyInit vs Uint8Array<ArrayBufferLike> (jszip).
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="mystory-backup-documents-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: `Export impossible : ${e?.message ?? e}` }, { status: 500 });
  }
}
