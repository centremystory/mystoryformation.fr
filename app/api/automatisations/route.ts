import { NextRequest, NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BASE = (process.env.N8N_BASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.N8N_API_KEY ?? "";

async function n8nGet(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "X-N8N-API-KEY": KEY, accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`n8n ${path} -> ${r.status} ${t.slice(0, 120)}`);
  }
  return r.json();
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ["direction", "manager"]);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ ok: false, erreur: "Non authentifié" }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false, erreur: "Réservé à la Direction et aux managers." }, { status: 403 });
    throw e;
  }
  if (!BASE || !KEY) {
    return NextResponse.json({ ok: false, erreur: "n8n non configuré (N8N_BASE_URL / N8N_API_KEY)." }, { status: 500 });
  }

  try {
    const [wfRes, exRes] = await Promise.all([
      n8nGet("/workflows?limit=100"),
      n8nGet("/executions?limit=100&includeData=false"),
    ]);
    const workflowsRaw: any[] = Array.isArray(wfRes?.data) ? wfRes.data : [];
    const execsRaw: any[] = Array.isArray(exRes?.data) ? exRes.data : [];

    const statutExec = (x: any): string => {
      if (typeof x?.status === "string") return x.status;
      if (x?.finished === true) return "success";
      if (x?.stoppedAt && x?.finished === false) return "error";
      return "running";
    };

    const executions = execsRaw.map((x) => ({
      id: String(x?.id ?? ""),
      workflowId: String(x?.workflowId ?? ""),
      status: statutExec(x),
      startedAt: x?.startedAt ?? null,
      stoppedAt: x?.stoppedAt ?? null,
      mode: x?.mode ?? null,
    }));

    const parWf = new Map<string, { dernier: any | null; erreurs: number }>();
    for (const e of executions) {
      let cur = parWf.get(e.workflowId);
      if (!cur) { cur = { dernier: null, erreurs: 0 }; parWf.set(e.workflowId, cur); }
      if (!cur.dernier) cur.dernier = e;
      if (e.status === "error" || e.status === "crashed") cur.erreurs += 1;
    }

    const workflows = workflowsRaw.map((w) => {
      const info = parWf.get(String(w?.id ?? "")) ?? { dernier: null, erreurs: 0 };
      return {
        id: String(w?.id ?? ""),
        name: String(w?.name ?? "(sans nom)"),
        active: !!w?.active,
        dernier: info.dernier,
        erreurs: info.erreurs,
      };
    });

    const erreursRecentes = executions
      .filter((e) => e.status === "error" || e.status === "crashed")
      .slice(0, 10)
      .map((e) => {
        const w = workflows.find((x) => x.id === e.workflowId);
        return { ...e, workflowName: w ? w.name : e.workflowId };
      });

    return NextResponse.json({ ok: true, workflows, erreursRecentes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e?.message ?? String(e) }, { status: 502 });
  }
}
