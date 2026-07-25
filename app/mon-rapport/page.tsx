"use client";
// app/mon-rapport/page.tsx — Rapport hebdo personnel : tâches faites + temps, à faire, compte-rendu.
import { useEffect, useState } from "react";

const BLEU = "#2F72DE";
const dureeFr = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
};
const dateFr = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }) : "—");

type Etat = {
  ok: boolean; semaine: string; identifie: boolean;
  faites: { id: string; titre: string; agence: string; temps_minutes: number | null; fait_le: string | null }[];
  aFaire: { id: string; titre: string; agence: string; echeance: string | null }[];
  nbFaites: number; totalMinutes: number; contenu: string;
};

export default function MonRapportPage() {
  const [d, setD] = useState<Etat | null>(null);
  const [contenu, setContenu] = useState("");
  const [enreg, setEnreg] = useState<"" | "..." | "ok" | "err">("");

  useEffect(() => {
    fetch("/api/mon-rapport", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.ok) { setD(j); setContenu(j.contenu || ""); }
    }).catch(() => {});
  }, []);

  async function enregistrer() {
    setEnreg("...");
    try {
      const r = await fetch("/api/mon-rapport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu }) });
      const j = await r.json();
      setEnreg(j.ok ? "ok" : "err");
      if (j.ok) setTimeout(() => setEnreg(""), 1500);
    } catch { setEnreg("err"); }
  }

  const lundiFr = d ? new Date(d.semaine).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) : "";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>Mon rapport de la semaine</h1>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>Semaine du {lundiFr}. Tes tâches faites (avec le temps), ce qu'il reste, et ton compte-rendu.</p>

      {!d ? <p style={{ color: "#98A2B3" }}>Chargement…</p> : (
        <>
          {!d.identifie && (
            <div style={{ background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B54708", margin: "12px 0" }}>
              Connecte-toi avec ton compte individuel pour voir tes tâches personnelles.
            </div>
          )}

          <div style={{ display: "flex", gap: 12, margin: "14px 0" }}>
            <div style={{ flex: 1, border: "1px solid #E4E7EC", borderRadius: 12, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: BLEU }}>{d.nbFaites}</div>
              <div style={{ fontSize: 12, color: "#667085" }}>tâches faites</div>
            </div>
            <div style={{ flex: 1, border: "1px solid #E4E7EC", borderRadius: 12, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: BLEU }}>{dureeFr(d.totalMinutes)}</div>
              <div style={{ fontSize: 12, color: "#667085" }}>temps saisi</div>
            </div>
            <div style={{ flex: 1, border: "1px solid #E4E7EC", borderRadius: 12, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: d.aFaire.length ? "#B54708" : "#12B76A" }}>{d.aFaire.length}</div>
              <div style={{ fontSize: 12, color: "#667085" }}>à faire</div>
            </div>
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#344054", margin: "16px 0 8px" }}>Tâches faites cette semaine</h2>
          {d.faites.length === 0 ? <p style={{ color: "#98A2B3", fontSize: 13 }}>Aucune tâche marquée faite cette semaine.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.faites.map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #F2F4F7", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                  <span style={{ color: "#1D2939" }}>✓ {t.titre} <span style={{ color: "#98A2B3" }}>· {t.agence}</span></span>
                  <span style={{ color: "#667085", whiteSpace: "nowrap" }}>{t.temps_minutes ? dureeFr(t.temps_minutes) : "—"} · {dateFr(t.fait_le)}</span>
                </div>
              ))}
            </div>
          )}

          {d.aFaire.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#344054", margin: "16px 0 8px" }}>Encore à faire</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {d.aFaire.map((t) => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #F2F4F7", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                    <span style={{ color: "#1D2939" }}>○ {t.titre} <span style={{ color: "#98A2B3" }}>· {t.agence}</span></span>
                    <span style={{ color: t.echeance ? "#B54708" : "#98A2B3", whiteSpace: "nowrap" }}>{t.echeance ? "éch. " + dateFr(t.echeance) : "sans date"}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#344054", margin: "18px 0 8px" }}>Mon compte-rendu</h2>
          <textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={6}
            placeholder="Ce que j'ai accompli, les difficultés rencontrées, ce qui est prévu la semaine prochaine…"
            style={{ width: "100%", border: "1px solid #D0D5DD", borderRadius: 10, padding: "10px 14px", fontSize: 14, lineHeight: 1.5, outline: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <button onClick={enregistrer} disabled={enreg === "..."}
              style={{ background: enreg === "ok" ? "#12B76A" : BLEU, color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {enreg === "..." ? "Enregistrement…" : enreg === "ok" ? "✓ Enregistré" : "Enregistrer mon rapport"}
            </button>
            {enreg === "err" && <span style={{ color: "#B42318", fontSize: 13 }}>Échec — réessaie.</span>}
          </div>
        </>
      )}
    </div>
  );
}
