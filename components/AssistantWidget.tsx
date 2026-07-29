"use client";
/**
 * MYSTORY — Assistant CRM en chatbot FLOTTANT (bulle en bas à gauche, présent sur tout le CRM).
 * Réutilise l'API /api/assistant (lecture seule + propositions catalogue à valider).
 * Visible seulement pour la direction / le management (mêmes droits que l'API).
 */
import { useEffect, useRef, useState } from "react";

const BLEU = "#2F72DE";
type Msg = { role: "user" | "assistant"; content: string; outils?: string[]; proposition?: any };

const EXEMPLES = [
  "Où en est le dossier de …",
  "Ventes d'examens cette semaine ?",
  "Qui a un reste à payer ?",
  "Prix d'une formation TEF IRN 30h ?",
];

export default function AssistantWidget() {
  const [autorise, setAutorise] = useState<boolean | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [applique, setApplique] = useState<Record<number, string>>({});
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Gating : seulement direction / manager / staff (filet) — mêmes droits que l'API.
  useEffect(() => {
    let vivant = true;
    fetch("/api/me").then((r) => r.json()).then((j) => {
      if (!vivant) return;
      const rs: string[] = j?.ok ? (j.user?.roles ?? (j.user?.role ? [j.user.role] : [])) : [];
      setAutorise(rs.length === 0 || rs.includes("direction") || rs.includes("manager") || rs.includes("staff"));
    }).catch(() => setAutorise(false));
    return () => { vivant = false; };
  }, []);

  useEffect(() => { if (ouvert) { finRef.current?.scrollIntoView({ behavior: "smooth" }); inputRef.current?.focus(); } }, [messages, charge, ouvert]);

  async function appliquer(i: number, patch: any) {
    setApplique((p) => ({ ...p, [i]: "..." }));
    try {
      const r = await fetch("/api/catalogue/offres", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec.");
      setApplique((p) => ({ ...p, [i]: "ok" }));
    } catch (e: any) { setApplique((p) => ({ ...p, [i]: "err:" + (e?.message || "erreur") })); }
  }

  async function envoyer(texte?: string) {
    const q = (texte ?? input).trim();
    if (!q || charge) return;
    setErreur(null);
    const suite: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(suite); setInput(""); setCharge(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: suite.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur inconnue.");
      setMessages((prev) => [...prev, { role: "assistant", content: j.reponse || "(réponse vide)", outils: j.outils, proposition: j.proposition }]);
    } catch (e: any) { setErreur(e?.message || "Erreur."); }
    finally { setCharge(false); }
  }

  if (!autorise) return null;

  return (
    <>
      {/* Bulle */}
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-label="Assistant IA"
        style={{
          position: "fixed", left: 20, bottom: 20, zIndex: 60,
          width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
          background: "linear-gradient(135deg,#2F72DE,#1F56B0)", color: "#fff", fontSize: 24,
          boxShadow: "0 8px 24px rgba(47,114,222,.45)", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform .15s", transform: ouvert ? "scale(0.92)" : "scale(1)",
        }}
      >
        {ouvert ? "✕" : "✨"}
      </button>

      {/* Panneau */}
      {ouvert && (
        <div style={{
          position: "fixed", left: 20, bottom: 88, zIndex: 60,
          width: "min(380px, calc(100vw - 40px))", height: "min(560px, calc(100vh - 130px))",
          background: "#fff", borderRadius: 16, border: "1px solid #E4E7EC",
          boxShadow: "0 20px 60px rgba(16,24,40,.24)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg,#2F72DE,#1F56B0)", color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>Assistant CRM</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Données réelles · lecture seule</div>
            </div>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setApplique({}); setErreur(null); }} title="Nouvelle conversation"
                style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}>↺</button>
            )}
            <button onClick={() => setOuvert(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#FCFCFD" }}>
            {messages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 13, color: "#667085", margin: "0 0 4px" }}>Pose une question sur tes dossiers, examens, ventes, impayés, sessions ou tarifs.</p>
                {EXEMPLES.map((ex) => (
                  <button key={ex} onClick={() => envoyer(ex)}
                    style={{ textAlign: "left", border: "1px solid #E4E7EC", background: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 13, cursor: "pointer", color: "#344054" }}>
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
                <div style={{ background: m.role === "user" ? BLEU : "#F2F4F7", color: m.role === "user" ? "#fff" : "#1D2939", padding: "9px 12px", borderRadius: 12, whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: 13.5 }}>
                  {m.content}
                </div>
                {m.outils && m.outils.length > 0 && <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>🔧 {m.outils.join(" · ")}</div>}
                {m.proposition && (
                  <div style={{ marginTop: 7, border: "1px solid #FEDF89", background: "#FFFAEB", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#B54708" }}>Proposition — {String(m.proposition.cible)}</div>
                    <div style={{ fontSize: 12.5, margin: "5px 0", color: "#344054" }}>
                      <b>{String(m.proposition.champ)}</b> : <span style={{ textDecoration: "line-through", color: "#98A2B3" }}>{String(m.proposition.ancienne_valeur)}</span> → <b>{String(m.proposition.nouvelle_valeur)}</b>
                    </div>
                    {applique[i] === "ok" ? (
                      <div style={{ color: "#12B76A", fontSize: 12.5, fontWeight: 600 }}>✓ Appliqué — annulable dans Catalogue → Historique.</div>
                    ) : applique[i]?.startsWith("err:") ? (
                      <div style={{ color: "#B42318", fontSize: 12.5 }}>{applique[i].slice(4)}</div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => appliquer(i, m.proposition.patch)} disabled={applique[i] === "..."}
                          style={{ background: BLEU, color: "#fff", border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          {applique[i] === "..." ? "…" : "Appliquer"}
                        </button>
                        <button onClick={() => setApplique((p) => ({ ...p, [i]: "err:Proposition ignorée." }))}
                          style={{ background: "#fff", color: "#667085", border: "1px solid #D0D5DD", borderRadius: 7, padding: "5px 12px", fontSize: 12.5, cursor: "pointer" }}>Ignorer</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {charge && <div style={{ alignSelf: "flex-start", color: "#98A2B3", fontSize: 13 }}>L'assistant consulte le CRM…</div>}
            {erreur && <div style={{ background: "#FEF3F2", border: "1px solid #FDA29B", color: "#B42318", padding: "8px 12px", borderRadius: 9, fontSize: 12.5 }}>{erreur}</div>}
            <div ref={finRef} />
          </div>

          {/* Saisie */}
          <div style={{ borderTop: "1px solid #EEF0F3", padding: 10, display: "flex", gap: 8, background: "#fff" }}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
              placeholder="Pose ta question…" disabled={charge}
              style={{ flex: 1, border: "1px solid #D0D5DD", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, outline: "none" }} />
            <button onClick={() => envoyer()} disabled={charge || !input.trim()}
              style={{ background: BLEU, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", opacity: charge || !input.trim() ? 0.6 : 1 }}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
