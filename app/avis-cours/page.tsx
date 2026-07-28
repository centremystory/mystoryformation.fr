"use client";
// app/avis-cours/page.tsx — Satisfaction à chaud du cours (stagiaire, public par jeton de séance).
// Top-level (hors hub à onglets) : page publique sans nav, comme /emargement/signer.
import { useEffect, useState } from "react";

const BLEU = "#2F72DE";

export default function AvisCours() {
  const [token, setToken] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ prenom: string | null; quand: string; dejaRepondu: boolean } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok">("idle");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) { setErreur("Lien invalide."); return; }
    fetch(`/api/satisfaction-cours/repondre?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setCtx(j); if (j.dejaRepondu) setEtat("ok"); } else setErreur(j.erreur || "Cours introuvable."); })
      .catch(() => setErreur("Chargement impossible."));
  }, []);

  async function envoyer() {
    if (!token || note < 1) return;
    setEtat("envoi");
    try {
      const j = await fetch("/api/satisfaction-cours/repondre", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, note, commentaire }),
      }).then((r) => r.json());
      if (j.ok) setEtat("ok"); else { setErreur(j.erreur || "Envoi impossible."); setEtat("idle"); }
    } catch { setErreur("Envoi impossible."); setEtat("idle"); }
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: BLEU }}>MYSTORY</div>
        <div style={{ fontSize: 13, color: "#98A2B3" }}>Votre histoire, notre fierté</div>
      </div>

      {erreur && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "12px 14px", fontSize: 14 }}>{erreur}</div>}

      {!erreur && etat === "ok" && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 48 }}>🙏</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "12px 0 4px" }}>Merci pour votre retour !</h1>
          <p style={{ color: "#667085", fontSize: 14 }}>Votre avis nous aide à améliorer nos cours.</p>
        </div>
      )}

      {!erreur && etat !== "ok" && ctx && (
        <div style={{ background: "#fff", border: "1px solid #E4E7EC", borderRadius: 14, padding: 20, marginTop: 16 }}>
          <h1 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 4px" }}>
            {ctx.prenom ? `Bonjour ${ctx.prenom} 👋` : "Bonjour 👋"}
          </h1>
          <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>Comment s'est passé votre cours {ctx.quand} ?</p>

          <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "18px 0" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setNote(n)} aria-label={`${n} étoiles`}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 40, lineHeight: 1, filter: n <= note ? "none" : "grayscale(1)", opacity: n <= note ? 1 : 0.35 }}>
                ⭐
              </button>
            ))}
          </div>
          <p style={{ textAlign: "center", fontSize: 13, color: "#98A2B3", marginTop: -8 }}>
            {["", "Très insatisfait", "Insatisfait", "Correct", "Satisfait", "Très satisfait"][note]}
          </p>

          <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Un commentaire ? (facultatif)" rows={3}
            style={{ width: "100%", marginTop: 12, border: "1px solid #E4E7EC", borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />

          <button onClick={envoyer} disabled={note < 1 || etat === "envoi"}
            style={{ width: "100%", marginTop: 14, background: note < 1 ? "#CBD5E1" : BLEU, color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 15, fontWeight: 700, cursor: note < 1 ? "default" : "pointer" }}>
            {etat === "envoi" ? "Envoi…" : "Envoyer mon avis"}
          </button>
        </div>
      )}

      {!erreur && !ctx && etat !== "ok" && <p style={{ color: "#98A2B3", textAlign: "center", marginTop: 24 }}>Chargement…</p>}
    </main>
  );
}
