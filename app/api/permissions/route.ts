/**
 * MYSTORY — /api/permissions : éditeur des accès aux pages par rôle (Direction).
 *  GET → matrice (défauts + effectif + rôles + libellés + pages éditables).
 *  PUT { overrides: { page_cle: role[] } } → enregistre (contrôle total : accorder ou retirer
 *        tout rôle valide ; Direction toujours conservée ; finance/BPF et /comptes hors périmètre). Journalisé.
 * Le résultat est propagé au middleware Edge via /api/permissions/public.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PAGE_PERMISSIONS, PAGES_EDITABLES, PAGE_LABELS, ROLES, ROLE_LABEL } from "@/lib/roles";
import { mapEffective } from "@/lib/permissions";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deny(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction." }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  try { await requireRole(req, ["direction"]); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  const effectif = await mapEffective();
  const pages = PAGES_EDITABLES.map((cle) => ({
    cle,
    label: PAGE_LABELS[cle] ?? cle,
    defaut: PAGE_PERMISSIONS[cle],
    effectif: effectif[cle] ?? PAGE_PERMISSIONS[cle],
  }));
  const roles = ROLES.map((r) => ({ code: r, label: ROLE_LABEL[r] }));
  return NextResponse.json({ ok: true, pages, roles });
}

export async function PUT(req: NextRequest) {
  let u;
  try { u = await requireRole(req, ["direction"]); } catch (e) { const d = deny(e); if (d) return d; throw e; }
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, erreur: "JSON invalide." }, { status: 400 }); }
  const overrides = b?.overrides;
  if (!overrides || typeof overrides !== "object") return NextResponse.json({ ok: false, erreur: "overrides requis." }, { status: 400 });

  const editables = new Set(PAGES_EDITABLES);
  let n = 0;
  for (const [cle, demandes] of Object.entries(overrides)) {
    if (!editables.has(cle) || !Array.isArray(demandes)) continue;
    const def = PAGE_PERMISSIONS[cle];
    // Contrôle total : tout rôle VALIDE (accorder ou retirer), pas seulement ⊆ défaut.
    // Direction toujours conservée (anti-lockout).
    let allowed = ROLES.filter((r) => (demandes as string[]).includes(r)) as string[];
    if (!allowed.includes("direction")) allowed = ["direction", ...allowed];
    // Override inutile (= défaut) → on supprime la ligne pour garder la table minimale.
    const identiqueAuDefaut = allowed.length === def.length && def.every((r) => allowed.includes(r));
    if (identiqueAuDefaut) {
      await supabaseAdmin.from("permissions_pages").delete().eq("page_cle", cle);
    } else {
      await supabaseAdmin.from("permissions_pages").upsert(
        { page_cle: cle, roles: allowed, maj_le: new Date().toISOString(), maj_par: u.email ?? null },
        { onConflict: "page_cle" },
      );
    }
    n++;
  }
  await journal("permissions_pages", null, "permissions_maj", { pages: n }, u.email ?? null);
  return NextResponse.json({ ok: true, pages: n });
}
