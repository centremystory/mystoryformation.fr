/**
 * MYSTORY — POST /api/edof/import  (Import EDOF §7, auth obligatoire)
 * Body : { csv: string, mode: "dry_run" | "apply", fichier?: string }
 * Sens unique EDOF→CRM. dry_run = rapport sans écriture ; apply = écrit + journalise.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { importerEdof } from "@/lib/edof";
import { creerDossiersManquants, type LigneEdof } from "@/lib/edofCreation";
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

  // 09/09/2026 — volet CREATION. L'import historique ne complete que les dossiers
  // deja saisis a la main ; une commande EDOF sans dossier restait a ressaisir en
  // entier. On analyse donc aussi ce qui pourrait etre cree, dans le meme passage.
  // Le mode suit celui de l'import : rien n'est ecrit tant que « Appliquer » n'a
  // pas ete clique.
  let creation = null;
  try {
    creation = await creerDossiersManquants(lignesBrutes(csv), {
      mode, auteur: user?.email ?? null,
    });
  } catch (e: any) {
    creation = { erreur: String(e?.message ?? e) };
  }
    if (mode === "apply") {
      await journal("import_edof", null, "import_applique", {
        fichier, total: rapport.total, crees: rapport.crees, mis_a_jour: rapport.mis_a_jour,
        rapproches_live: rapport.rapproches_live, conflits: rapport.conflits_total,
      });
    }
    return NextResponse.json({ ok: true, mode, rapport, creation });
  } catch (e) {
    return NextResponse.json({ ok: false, erreur: String(e) }, { status: 500 });
  }
}


/** Les lignes de l'export, en objets clé→valeur. Le parseur de lib/edof filtre déjà
 *  les colonnes qui l'intéressent ; la création a besoin de l'identité complète. */
function lignesBrutes(csv: string): LigneEdof[] {
  const lignes = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lignes.length < 2) return [];
  const sep = (lignes[0].match(/;/g) ?? []).length >= (lignes[0].match(/,/g) ?? []).length ? ";" : ",";
  const decoupe = (l: string) => {
    const out: string[] = []; let cur = "", guill = false;
    for (const ch of l) {
      if (ch === '"') { guill = !guill; continue; }
      if (ch === sep && !guill) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const entetes = decoupe(lignes[0]);
  return lignes.slice(1).map((l) => {
    const v = decoupe(l);
    const o: LigneEdof = {};
    entetes.forEach((e, i) => { o[e] = v[i] ?? ""; });
    return o;
  });
}
