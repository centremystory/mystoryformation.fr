/**
 * MYSTORY — POST /api/edof/import  (Import EDOF §7, auth obligatoire)
 * Body : { csv: string, mode: "dry_run" | "apply", fichier?: string }
 * Sens unique EDOF→CRM. dry_run = rapport sans écriture ; apply = écrit + journalise.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { importerEdof } from "@/lib/edof";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let user: any = null;
  try { user = await requireUser(req); }
  catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    throw e;
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }

  const csv = String(body?.csv ?? "");
  const mode = body?.mode === "apply" ? "apply" : "dry_run";
  const fichier = body?.fichier ? String(body.fichier) : null;
  if (!csv.trim()) return NextResponse.json({ ok: false, erreur: "Fichier CSV vide." }, { status: 400 });
  if (!csv.includes("NUMERO_DOSSIER")) {
    return NextResponse.json({ ok: false, erreur: "Ce fichier ne ressemble pas à un export EDOF (colonne NUMERO_DOSSIER absente)." }, { status: 400 });
  }

  try {
    const auteur = (user && (user.email || user.nom)) ? String(user.email || user.nom) : null;
    const rapport = await importerEdof(csv, { mode, fichier, auteur });
    if (mode === "apply") {
      await journal("import_edof", null, "import_applique", {
        fichier, total: rapport.total, crees: rapport.crees, mis_a_jour: rapport.mis_a_jour,
        rapproches_live: rapport.rapproches_live, conflits: rapport.conflits_total,
      });
    }
    return NextResponse.json({ ok: true, mode, rapport });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}
