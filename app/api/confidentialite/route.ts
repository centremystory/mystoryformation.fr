/**
 * MYSTORY — Contrats de confidentialité (tous postes).
 *  GET  → liste des personnes (salariés depuis utilisateurs + formateurs depuis equipe)
 *         avec le statut de leur dernier contrat.
 *  POST → génère + envoie à signer (1 signataire = le membre). external_id = "confid:<id>".
 * Réservé direction/manager. E-mail saisi à la volée pour les personnes sans compte.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { contratConfidentialiteHtml } from "@/lib/confidentialiteDoc";
import { createConfidentialiteSubmission } from "@/lib/docuseal";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["direction", "manager"]);

    const [{ data: users }, { data: forms }, { data: contrats }] = await Promise.all([
      supabaseAdmin.from("utilisateurs").select("id, nom, prenom, email, role, roles, actif").eq("actif", true),
      supabaseAdmin.from("equipe").select("id, nom, prenom, actif").eq("actif", true),
      supabaseAdmin.from("contrats_confidentialite").select("id, personne_type, personne_ref, statut, envoye_le, signe_le, cree_le").order("cree_le", { ascending: false }),
    ]);

    const dernier = new Map<string, any>();
    for (const c of contrats ?? []) {
      const k = `${c.personne_type}:${c.personne_ref}`;
      if (!dernier.has(k)) dernier.set(k, c);
    }

    const salaries = (users ?? []).map((u: any) => ({
      personne_type: "salarie" as const, ref: u.id, nom: u.nom, prenom: u.prenom, email: u.email,
      roles: (Array.isArray(u.roles) && u.roles.length > 0) ? u.roles : (u.role ? [u.role] : []),
      contrat: dernier.get(`salarie:${u.id}`) ?? null,
    }));
    const formateurs = (forms ?? []).map((f: any) => ({
      personne_type: "formateur" as const, ref: f.id, nom: f.nom, prenom: f.prenom, email: null,
      roles: ["formatrice"], contrat: dernier.get(`formateur:${f.id}`) ?? null,
    }));

    return NextResponse.json({ ok: true, personnes: [...salaries, ...formateurs] });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction / au Manager." }, { status: 403 });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await requireRole(req, ["direction", "manager"]);
    const b = await req.json().catch(() => ({}));

    const personne_type = b?.personne_type === "formateur" ? "formateur" : "salarie";
    const personne_ref = b?.personne_ref ? String(b.personne_ref) : null;
    const nom = String(b?.nom ?? "").trim();
    const prenom = String(b?.prenom ?? "").trim() || null;
    const email = String(b?.email ?? "").trim();
    const poste = String(b?.poste ?? "").trim() || null;
    const roles: string[] = Array.isArray(b?.roles) ? b.roles.map((r: any) => String(r).trim()).filter(Boolean) : [];

    if (!nom) return NextResponse.json({ ok: false, erreur: "Nom requis." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, erreur: "E-mail du signataire requis (saisis-le si la personne n'en a pas dans le CRM)." }, { status: 400 });

    const { data: ins, error } = await supabaseAdmin
      .from("contrats_confidentialite")
      .insert({ personne_type, personne_ref, nom, prenom, email, poste, roles, statut: "genere", auteur: u.email ?? null })
      .select("id").single();
    if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
    const id = (ins as any).id as string;

    const html = contratConfidentialiteHtml({ nom, prenom, email, poste, roles });
    try {
      const sub = await createConfidentialiteSubmission({
        html,
        signataire: { email, nom, prenom: prenom ?? undefined },
        externalId: `confid:${id}`,
        documentName: `Engagement de confidentialité — ${prenom ?? ""} ${nom}`.trim(),
        sendEmail: true,
      });
      await supabaseAdmin.from("contrats_confidentialite")
        .update({ statut: "envoye_a_signer", docuseal_submission_id: sub.submissionId, envoye_le: new Date().toISOString() })
        .eq("id", id);
      await journal("confidentialite", id, "confid_envoye_signature", { submission_id: sub.submissionId, email }, u.email ?? null);
      return NextResponse.json({ ok: true, id, status: "envoye_a_signer", signUrl: sub.signUrl ?? null });
    } catch (e) {
      return NextResponse.json({ ok: false, erreur: `Contrat créé mais envoi à signer impossible : ${String(e)}`, id }, { status: 502 });
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié." }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction / au Manager." }, { status: 403 });
    throw e;
  }
}
