/**
 * MYSTORY — GET /api/dossiers/relances-satisfaction  (pour n8n, accès protégé)
 * Liste les dossiers terminés il y a 3 à 6 mois SANS réponse « à froid » :
 * n8n appelle cette route (Bearer JWT de service), envoie l'email au stagiaire
 * avec son lien personnel, et c'est tout — la route est idempotente (un dossier
 * disparaît de la liste dès que le stagiaire a répondu).
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const aujourdHui = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const ilYa3Mois = new Date(aujourdHui); ilYa3Mois.setMonth(ilYa3Mois.getMonth() - 3);
  const ilYa6Mois = new Date(aujourdHui); ilYa6Mois.setMonth(ilYa6Mois.getMonth() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("dossiers")
    .select("id, token, date_fin, certif, stagiaires ( civilite, prenom, nom, email )")
    .gte("date_fin", iso(ilYa6Mois))
    .lte("date_fin", iso(ilYa3Mois));
  if (error) return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });

  const { data: repondus } = await supabaseAdmin
    .from("satisfactions").select("dossier_id").eq("type", "froid");
  const dejaRepondu = new Set((repondus ?? []).map((r: any) => r.dossier_id));

  const origine = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const relances = (data ?? [])
    .filter((d: any) => !dejaRepondu.has(d.id) && d.stagiaires?.email)
    .map((d: any) => ({
      dossierId: d.id,
      certif: d.certif,
      dateFin: d.date_fin,
      civilite: d.stagiaires.civilite ?? "",
      prenom: d.stagiaires.prenom ?? "",
      nom: d.stagiaires.nom,
      email: d.stagiaires.email,
      lien: `${origine}/satisfaction?token=${d.token}&type=froid`,
    }));

  return NextResponse.json({ ok: true, relances });
}
