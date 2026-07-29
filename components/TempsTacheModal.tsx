"use client";
/**
 * MYSTORY — Modale « temps passé sur une tâche » (remplace le window.prompt natif).
 * Contrôlée : `ouvert` affiche la modale ; `onValider(minutes)` renvoie les minutes
 * (0 accepté = non suivi), `onAnnuler` ferme sans rien faire. Boutons rapides + saisie libre.
 */
import { useEffect, useState } from "react";

const RAPIDES = [15, 30, 45, 60, 90, 120];

export default function TempsTacheModal({
  ouvert, titre, onValider, onAnnuler,
}: {
  ouvert: boolean;
  titre?: string;
  onValider: (minutes: number) => void;
  onAnnuler: () => void;
}) {
  const [val, setVal] = useState("");
  useEffect(() => { if (ouvert) setVal(""); }, [ouvert]);
  if (!ouvert) return null;

  const minutes = Math.max(0, Math.round(Number(val) || 0));
  const dureeFr = minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;

  return (
    <div
      onClick={onAnnuler}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(420px,100%)", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(16,24,40,.3)", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #EEF0F3" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1D2939" }}>⏱️ {titre ?? "Temps passé sur cette tâche"}</div>
          <div style={{ fontSize: 12.5, color: "#667085", marginTop: 2 }}>En minutes (laisse 0 si non suivi). Ça alimente ton rapport.</div>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {RAPIDES.map((m) => (
              <button key={m} onClick={() => setVal(String(m))}
                style={{ border: `1px solid ${minutes === m ? "#2F72DE" : "#D0D5DD"}`, background: minutes === m ? "#EAF1FD" : "#fff", color: minutes === m ? "#2F72DE" : "#344054", borderRadius: 999, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {m >= 60 ? `${m / 60}h` : `${m} min`}
              </button>
            ))}
          </div>
          <input
            autoFocus type="number" min={0} value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onValider(minutes); if (e.key === "Escape") onAnnuler(); }}
            placeholder="Autre durée (minutes)"
            style={{ width: "100%", border: "1px solid #D0D5DD", borderRadius: 10, padding: "10px 12px", fontSize: 15, outline: "none" }}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: "#98A2B3" }}>= {dureeFr}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid #EEF0F3" }}>
          <button onClick={onAnnuler} style={{ border: "1px solid #D0D5DD", background: "#fff", color: "#475467", borderRadius: 10, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
          <button onClick={() => onValider(minutes)} style={{ border: "none", background: "#2F72DE", color: "#fff", borderRadius: 10, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Valider</button>
        </div>
      </div>
    </div>
  );
}
