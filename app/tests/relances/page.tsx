"use client";
// app/tests/relances/page.tsx — Relancer les tests initiaux envoyés à distance, non passés.
import { useEffect, useState } from "react";

const BLEU = "#2F72DE";
type Test = { id: string; civilite: string | null; nom: string | null; prenom: string | null; email: string | null; phase: string | null; niveau_vise: string | null; cree_le: string | null; jours: number | null };

export default function RelancesTestsPage() {
  const [tests, setTests] = useState<Test[] | null>(null);
  const [etat, setEtat] = useState<Record<string, string>>({});

  async function charger() {
    const r = await fetch("/api/tests/relances-distance", { cache: "no-store" });
    const j = await r.json();
    setTests(j.ok ? j.tests : []);
  }
  useEffect(() => { charger(); }, []);

  async function relancer(id: string) {
    setEtat((e) => ({ ...e, [id]: "..." }));
    try {
      const r = await fetch("/api/tests/envoyer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await r.json();
      setEtat((e) => ({ ...e, [id]: j.ok ? "ok" : "err:" + (j.erreur || "échec") }));
    } catch { setEtat((e) => ({ ...e, [id]: "err:réseau" })); }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>Tests à distance — à relancer</h1>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>Tests initiaux dont le lien a été envoyé par e-mail mais pas encore passés. « Relancer » renvoie le lien au candidat.</p>

      {tests === null ? <p style={{ color: "#98A2B3" }}>Chargement…</p> :
        tests.length === 0 ? <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 10, padding: "12px 16px", fontSize: 14, marginTop: 12 }}>✓ Aucun test en attente — tout le monde a passé son test.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {tests.map((t) => {
            const e = etat[t.id];
            const nom = `${t.prenom ?? ""} ${t.nom ?? ""}`.trim() || "(sans nom)";
            const retard = (t.jours ?? 0) >= 3;
            return (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid #E4E7EC", borderRadius: 12, padding: "12px 14px" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#1D2939", fontSize: 14 }}>{nom} {t.niveau_vise && <span style={{ color: "#98A2B3", fontWeight: 400 }}>· objectif {t.niveau_vise}</span>}</div>
                  <div style={{ fontSize: 12, color: retard ? "#B54708" : "#98A2B3" }}>{t.email} · envoyé il y a {t.jours ?? "?"} j{retard ? " ⚠️" : ""}</div>
                </div>
                {e === "ok" ? <span style={{ color: "#12B76A", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>✓ Relancé</span> :
                 e?.startsWith("err:") ? <span style={{ color: "#B42318", fontSize: 12, whiteSpace: "nowrap" }}>{e.slice(4)}</span> : (
                  <button onClick={() => relancer(t.id)} disabled={e === "..."}
                    style={{ background: BLEU, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {e === "..." ? "…" : "Relancer"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
