"use client";
// app/mon-rapport/page.tsx — Rapport hebdo : grille par jour (matin/aprem), horaires perso, tâches + compte-rendu.
import { useEffect, useState } from "react";

const BLEU = "#2F72DE";
const dureeFr = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`; };

type Jour = { nom: string; date: string; matin: string; aprem: string };
type Etat = {
  ok: boolean; semaine: string; identifie: boolean;
  faites: any[]; nbFaites: number; totalMinutes: number;
  horaires: { matin: string; aprem: string }; jours: Jour[]; contenu: string;
};

const inputS = { border: "1px solid #D0D5DD", borderRadius: 8, padding: "5px 8px", fontSize: 13, width: "100%" } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function MonRapportPage() {
  const [d, setD] = useState<Etat | null>(null);
  const [horaires, setHoraires] = useState({ matin: "", aprem: "" });
  const [jours, setJours] = useState<Jour[]>([]);
  const [contenu, setContenu] = useState("");
  const [enreg, setEnreg] = useState<"" | "..." | "ok" | "err">("");

  useEffect(() => {
    fetch("/api/mon-rapport", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.ok) { setD(j); setHoraires(j.horaires); setJours(j.jours); setContenu(j.contenu || ""); }
    }).catch(() => {});
  }, []);

  const majCase = (i: number, creneau: "matin" | "aprem", val: string) =>
    setJours((prev) => prev.map((jr, k) => (k === i ? { ...jr, [creneau]: val } : jr)));

  async function enregistrer() {
    setEnreg("...");
    try {
      const corps = {
        horaire_matin: horaires.matin, horaire_aprem: horaires.aprem, contenu,
        jours: jours.flatMap((jr) => [
          { jour: jr.date, creneau: "matin", activite: jr.matin },
          { jour: jr.date, creneau: "aprem", activite: jr.aprem },
        ]),
      };
      const r = await fetch("/api/mon-rapport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const j = await r.json();
      setEnreg(j.ok ? "ok" : "err"); if (j.ok) setTimeout(() => setEnreg(""), 1600);
    } catch { setEnreg("err"); }
  }

  const lundiFr = d ? new Date(d.semaine).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) : "";
  const dateFr = (s: string) => new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>Mon rapport de la semaine</h1>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>Semaine du {lundiFr}. Remplis, pour chaque jour, ce que tu as fait le matin et l'après-midi.</p>

      {!d ? <p style={{ color: "#98A2B3" }}>Chargement…</p> : (
        <>
          {!d.identifie && <div style={{ background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B54708", margin: "10px 0" }}>Connecte-toi avec ton compte individuel pour tes tâches personnelles.</div>}

          {/* Mes horaires */}
          <div style={{ border: "1px solid #E4E7EC", borderRadius: 12, padding: 14, margin: "14px 0" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#344054", marginBottom: 8 }}>⏰ Mes horaires (adapte-les à ton planning)</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#667085" }}>Matin
                <input style={{ ...inputS, width: 160 }} value={horaires.matin} onChange={(e) => setHoraires((h) => ({ ...h, matin: e.target.value }))} placeholder="9h30-12h30" />
              </label>
              <label style={{ fontSize: 12, color: "#667085" }}>Après-midi
                <input style={{ ...inputS, width: 160 }} value={horaires.aprem} onChange={(e) => setHoraires((h) => ({ ...h, aprem: e.target.value }))} placeholder="14h-17h" />
              </label>
            </div>
          </div>

          {/* Grille jour × créneau */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jours.map((jr, i) => {
              // Tâches réellement faites ce jour-là (auto, depuis le suivi des tâches) + temps saisi.
              const tj = (d.faites || []).filter((t: any) => String(t.fait_le ?? "").slice(0, 10) === jr.date);
              const minJour = tj.reduce((s: number, t: any) => s + (Number(t.temps_minutes) || 0), 0);
              return (
              <div key={jr.date} style={{ border: "1px solid #E4E7EC", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1D2939", marginBottom: 8 }}>{cap(jr.nom)} <span style={{ color: "#98A2B3", fontWeight: 400 }}>{dateFr(jr.date)}</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#2F72DE", fontWeight: 600, marginBottom: 3 }}>Matin · {horaires.matin || "—"}</div>
                    <textarea style={{ ...inputS, minHeight: 44, resize: "vertical" }} value={jr.matin} onChange={(e) => majCase(i, "matin", e.target.value)} placeholder="Ce que j'ai fait…" />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#2F72DE", fontWeight: 600, marginBottom: 3 }}>Après-midi · {horaires.aprem || "—"}</div>
                    <textarea style={{ ...inputS, minHeight: 44, resize: "vertical" }} value={jr.aprem} onChange={(e) => majCase(i, "aprem", e.target.value)} placeholder="Ce que j'ai fait…" />
                  </div>
                </div>
                {tj.length > 0 && (
                  <div style={{ marginTop: 8, background: "#F5F8FE", border: "1px solid #E1EBFB", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#475467" }}>
                    ✅ <b style={{ color: BLEU }}>{tj.length}</b> tâche{tj.length > 1 ? "s" : ""} faite{tj.length > 1 ? "s" : ""}
                    {minJour > 0 && <> · <b style={{ color: BLEU }}>{dureeFr(minJour)}</b></>}
                    <span style={{ color: "#667085" }}> — {tj.map((t: any) => t.titre).filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </div>
            );})}
          </div>

          {/* Récap tâches (auto) */}
          <div style={{ display: "flex", gap: 16, margin: "16px 0 8px", fontSize: 13, color: "#667085" }}>
            <span><b style={{ color: BLEU }}>{d.nbFaites}</b> tâche(s) faite(s)</span>
            <span><b style={{ color: BLEU }}>{dureeFr(d.totalMinutes)}</b> saisi sur les tâches</span>
          </div>

          {/* Compte-rendu libre */}
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#344054", margin: "14px 0 6px" }}>Note de la semaine (optionnel)</h2>
          <textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={3}
            placeholder="Difficultés, points à signaler, ce qui est prévu la semaine prochaine…"
            style={{ ...inputS, fontSize: 14, minHeight: 60 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button onClick={enregistrer} disabled={enreg === "..."}
              style={{ background: enreg === "ok" ? "#12B76A" : BLEU, color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {enreg === "..." ? "Enregistrement…" : enreg === "ok" ? "✓ Enregistré" : "Enregistrer mon rapport"}
            </button>
            {enreg === "err" && <span style={{ color: "#B42318", fontSize: 13 }}>Échec — réessaie.</span>}
          </div>
        </>
      )}
    </div>
  );
}
