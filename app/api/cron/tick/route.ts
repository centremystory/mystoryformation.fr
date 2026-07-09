/**
 * MYSTORY — GET /api/cron/tick : l'horloge du CRM (cron Vercel natif, quotidien).
 * Rend les relances AUTONOMES : plus aucune dépendance à n8n pour les envois planifiés
 * (n8n reste une couche optionnelle par-dessus).
 *
 * Sécurité (fail-closed) :
 *  - Vercel Cron appelle en GET avec `Authorization: Bearer ${CRON_SECRET}` (automatique
 *    dès que la variable d'environnement CRON_SECRET existe sur le projet).
 *  - Sans CRON_SECRET configuré → 503, jamais d'exécution par défaut.
 *  - Le tick signe ensuite lui-même un jeton de service (AUTH_SECRET, 5 min, sans rôle
 *    = motif « automate » de lib/roles) et POSTe sur ses propres routes de relance,
 *    qui gardent chacune leurs verrous d'idempotence (un envoi par cible).
 */
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { journal } from "@/lib/examens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CIBLES = [
  "/api/cron/anomalies",
  "/api/cron/relances-anomalie",
  "/api/dossiers/relances-satisfaction",
  "/api/formation/relances-identite",
  "/api/formation/relances-sans-venue",
  "/api/prospects/relances",
  "/api/factures/relances",
] as const;

function baseUrl(): string | null {
  const app = process.env.APP_URL?.trim();
  if (app) return app.replace(/\/+$/, "");
  const v = process.env.VERCEL_URL?.trim();
  if (v) return `https://${v}`;
  return null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, erreur: "CRON_SECRET non configuré." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, erreur: "Non autorisé." }, { status: 401 });
  }

  const authSecret = process.env.AUTH_SECRET?.trim();
  const base = baseUrl();
  if (!authSecret || !base) return NextResponse.json({ ok: false, erreur: "AUTH_SECRET ou URL de base manquant." }, { status: 503 });

  // Jeton de service éphémère (sans rôle → motif automate, comme les jetons n8n).
  const jeton = await new SignJWT({ email: "cron@mystoryformation.fr", nom: "Horloge CRM" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("cron-tick")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(authSecret));

  const resultats: Record<string, { status: number; ok: boolean; detail?: unknown }> = {};
  for (const cible of CIBLES) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 35000);
      const r = await fetch(`${base}${cible}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
        body: "{}",
        signal: ctl.signal,
        cache: "no-store",
      });
      clearTimeout(t);
      let detail: unknown = null;
      try { detail = await r.json(); } catch { /* corps non JSON */ }
      resultats[cible] = { status: r.status, ok: r.ok, detail };
    } catch (e: any) {
      resultats[cible] = { status: 0, ok: false, detail: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
    }
  }

  const echecs = Object.values(resultats).filter((r) => !r.ok).length;
  try { await journal("cron", null, "tick_quotidien", { echecs, resultats }, "cron@mystoryformation.fr"); } catch { /* best-effort */ }
  return NextResponse.json({ ok: echecs === 0, echecs, resultats });
}
