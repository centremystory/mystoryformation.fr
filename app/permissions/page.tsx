"use client";
// app/permissions/page.tsx — Éditeur des accès aux onglets par rôle (Direction).
// Tighten-only : on ne peut que RETIRER un rôle d'une page (jamais dépasser le défaut).
// La Direction est toujours cochée + verrouillée (anti-lockout). Finance/BPF hors périmètre.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Save } from "lucide-react";

type PageDef = { cle: string; label: string; defaut: string[]; effectif: string[] };
type RoleDef = { code: string; label: string };

export default function PagePermissions() {
  const [pages, setPages] = useState<PageDef[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [charge, setCharge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setCharge(true);
    try {
      const j = await fetch("/api/permissions", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) {
        setPages(j.pages); setRoles(j.roles);
        const s: Record<string, Set<string>> = {};
        for (const p of j.pages as PageDef[]) s[p.cle] = new Set(p.effectif);
        setSel(s);
      }
    } finally { setCharge(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  function toggle(cle: string, role: string, defaut: string[]) {
    if (role === "direction" || !defaut.includes(role)) return; // Direction verrouillée ; hors défaut = interdit
    setSel((prev) => {
      const cur = new Set(prev[cle] ?? []);
      cur.has(role) ? cur.delete(role) : cur.add(role);
      return { ...prev, [cle]: cur };
    });
  }

  const modifie = useMemo(() => {
    return pages.some((p) => {
      const now = sel[p.cle] ?? new Set();
      return p.effectif.length !== now.size || p.effectif.some((r) => !now.has(r));
    });
  }, [pages, sel]);

  async function enregistrer() {
    setBusy(true); setMsg(null);
    try {
      const overrides: Record<string, string[]> = {};
      for (const p of pages) overrides[p.cle] = Array.from(sel[p.cle] ?? new Set());
      const j = await fetch("/api/permissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrides }) }).then((r) => r.json());
      if (j.ok) { setMsg("✅ Accès enregistrés. La navigation se met à jour dans quelques secondes."); await charger(); }
      else setMsg(j.erreur || "Échec.");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce"><ShieldCheck size={22} /></div>
          <div>
            <h1 className="page-title text-2xl">Accès par rôle</h1>
            <p className="page-subtitle">Choisis quels onglets chaque rôle peut voir. On ne peut que <b>retirer</b> un accès (jamais dépasser le rôle prévu). La Direction garde tout. Finance/BPF restent réservés au propriétaire.</p>
          </div>
        </div>
        <button onClick={enregistrer} disabled={!modifie || busy} className="btn-primary disabled:opacity-40">
          <Save size={16} /> {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </header>

      {msg && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{msg}</div>}

      {charge ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="px-3 py-2">Onglet / page</th>
                {roles.map((r) => <th key={r.code} className="px-3 py-2 text-center">{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.cle} className="border-b last:border-0">
                  <td className="px-3 py-2"><span className="font-medium text-gray-800">{p.label}</span><span className="ml-2 text-xs text-gray-300">{p.cle}</span></td>
                  {roles.map((r) => {
                    const auDefaut = p.defaut.includes(r.code);
                    const coche = (sel[p.cle] ?? new Set()).has(r.code);
                    const verrou = r.code === "direction";
                    return (
                      <td key={r.code} className="px-3 py-2 text-center">
                        {auDefaut ? (
                          <input type="checkbox" checked={coche} disabled={verrou}
                            onChange={() => toggle(p.cle, r.code, p.defaut)}
                            title={verrou ? "La Direction garde toujours l'accès" : coche ? "Retirer l'accès" : "Redonner l'accès"}
                            className={verrou ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} />
                        ) : (
                          <span className="text-gray-200" title="Ce rôle n'a pas cet accès par défaut">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-400">« — » = ce rôle n'a jamais eu cet accès (non ajoutable ici). Décoche pour masquer un onglet à un rôle. La Direction est verrouillée pour éviter de se bloquer soi-même.</p>
    </main>
  );
}
