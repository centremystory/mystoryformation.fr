"use client";
// app/tests/relances/page.tsx — Relancer les tests (initiaux ET finaux) envoyés à distance, non passés.
// « Relancer » renvoie le lien ; le commentaire de suivi se garde jusqu'à la conversion.
import { useEffect, useState } from "react";

const BLEU = "#2F72DE";
type Test = {
  id: string; civilite: string | null; nom: string | null; prenom: string | null; email: string | null;
  phase: string | null; niveau_vise: string | null; cree_le: string | null; jours: number | null;
  commentaire_suivi: string | null;
};

export default function RelancesTestsPage() {
  const [tests, setTests] = useState<Test[] | null>(null);
  const [etat, setEtat] = useState<Record<string, string>>({});
  const [comm, setComm] = useState<Record<string, string>>({});
  const [commEtat, setCommEtat] = useState<Record<string, string>>({});

  async function charger() {
    const r = await fetch("/api/tests/relances-distance", { cache: "no-store" });
    const j = await r.json();
    const list: Test[] = j.ok ? j.tests : [];
    setTests(list);
    setComm(Object.fromEntries(list.map((t) => [t.id, t.commentaire_suivi ?? ""])));
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

  async function enregistrerCommentaire(id: string) {
    setCommEtat((e) => ({ ...e, [id]: "..." }));
    try {
      const r = await fetch("/api/tests/relances-distance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, commentaire: comm[id] ?? "" }) });
      const j = await r.json();
      setCommEtat((e) => ({ ...e, [id]: j.ok ? "ok" : "err" }));
      if (j.ok) {
        setTests((ts) => (ts ?? []).map((t) => (t.id === id ? { ...t, commentaire_suivi: comm[id] ?? "" } : t)));
        setTimeout(() => setCommEtat((e) => ({ ...e, [id]: "" })), 1800);
      }
    } catch { setCommEtat((e) => ({ ...e, [id]: "err" })); }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>Tests à distance — à relancer</h1>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>Tests <strong>initiaux et finaux</strong> dont le lien a été envoyé par e-mail mais pas encore passés. « Relancer » renvoie le lien ; le commentaire garde le suivi jusqu'à la conversion.</p>

      {tests === null ? <p style={{ color: "#98A2B3" }}>Chargement…</p> :
        tests.length === 0 ? <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", borderRadius: 10, padding: "12px 16px", fontSize: 14, marginTop: 12 }}>✓ Aucun test en attente — tout le monde a passé son test.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {tests.map((t) => {
            const e = etat[t.id];
            const nom = `${t.prenom ?? ""} ${t.nom ?? ""}`.trim() || "(sans nom)";
            const retard = (t.jours ?? 0) >= 3;
            const estFinal = t.phase === "final";
            const ce = commEtat[t.id];
            const modifie = (comm[t.id] ?? "") !== (t.commentaire_suivi ?? "");
            return (
              <div key={t.id} style={{ border: "1px solid #E4E7EC", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1D2939", fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: estFinal ? "#FEF3C7" : "#EAF1FC", color: estFinal ? "#B45309" : BLEU }}>
                        {estFinal ? "Test final" : "Test initial"}
                      </span>
                      {nom} {t.niveau_vise && <span style={{ color: "#98A2B3", fontWeight: 400 }}>· objectif {t.niveau_vise}</span>}
                    </div>
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
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 10 }}>
                  <textarea
                    value={comm[t.id] ?? ""}
                    onChange={(ev) => setComm((c) => ({ ...c, [t.id]: ev.target.value }))}
                    placeholder="Commentaire de suivi (appel, relance WhatsApp, objection…) — jusqu'à la conversion"
                    rows={1}
                    style={{ flex: 1, resize: "vertical", border: "1px solid #E4E7EC", borderRadius: 8, padding: "6px 10px", fontSize: 13, minHeight: 34, fontFamily: "inherit" }}
                  />
                  <button onClick={() => enregistrerCommentaire(t.id)} disabled={!modifie || ce === "..."}
                    style={{ background: modifie ? "#111827" : "#E4E7EC", color: modifie ? "#fff" : "#98A2B3", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: modifie ? "pointer" : "default", whiteSpace: "nowrap" }}>
                    {ce === "..." ? "…" : ce === "ok" ? "✓ Enregistré" : ce === "err" ? "Erreur" : "Enregistrer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
