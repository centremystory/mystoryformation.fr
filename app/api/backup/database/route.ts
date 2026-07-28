/**
 * MYSTORY — GET /api/backup/database : export logique (JSON) de toutes les tables publiques.
 * Alternative GRATUITE au PITR : combiné aux sauvegardes quotidiennes Supabase (incluses) et à
 * l'export du storage (/api/backup/documents), couvre l'ensemble des données sans add-on payant.
 * Réservé au propriétaire (arudhan@) OU à un automate de confiance (cron/n8n) pour l'automatiser.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireProprietaire, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Toutes les lignes d'une table, paginées par 1000 (contourne le plafond PostgREST). */
async function toutesLesLignes(table: string): Promise<any[]> {
  const out: any[] = [];
  const PAS = 1000;
  for (let from = 0; ; from += PAS) {
    const { data, error } = await supabaseAdmin.from(table).select("*").range(from, from + PAS - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAS) break;
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
    const { data: tables, error } = await supabaseAdmin.rpc("tables_publiques");
    if (error) throw new Error(error.message);
    const noms = ((tables as string[]) ?? []).sort();

    const zip = new JSZip();
    const manifeste: string[] = [];
    for (const t of noms) {
      try {
        const rows = await toutesLesLignes(t);
        zip.file(`${t}.json`, JSON.stringify(rows));
        manifeste.push(`${t}: ${rows.length}`);
      } catch (e: any) {
        manifeste.push(`${t}: ERREUR (${e?.message ?? e})`);
      }
    }
    const stamp = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
    zip.file("_manifeste.txt", `Backup base "public" — MYSTORY\nExport du ${stamp}\nTables: ${noms.length}\n\n${manifeste.join("\n")}\n`);
    const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="mystory-backup-base-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: `Export impossible : ${e?.message ?? e}` }, { status: 500 });
  }
}
