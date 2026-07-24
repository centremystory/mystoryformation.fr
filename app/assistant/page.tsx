"use client";
// app/assistant/page.tsx — Assistant CRM (cockpit données live).
import { useEffect, useRef, useState } from "react";

const BLEU = "#2F72DE";

type Msg = { role: "user" | "assistant"; content: string; outils?: string[] };

const EXEMPLES = [
  "Où en est le dossier de …",
  "Combien de ventes d'examens cette semaine ?",
  "Qui a un reste à payer ?",
  "Quelles sessions d'examen dans les 7 prochains jours ?",
  "Quel est le prix d'une formation TEF IRN 30h ?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, charge]);

  async function envoyer(texte?: string) {
    const q = (texte ?? input).trim();
    if (!q || charge) return;
    setErreur(null);
    const suite: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(suite);
    setInput("");
    setCharge(true);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: suite.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur inconnue.");
      setMessages((prev) => [...prev, { role: "assistant", content: j.reponse || "(réponse vide)", outils: j.outils }]);
    } catch (e: any) {
      setErreur(e?.message || "Erreur.");
    } finally {
      setCharge(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 24 }}>✨</span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Assistant CRM</h1>
      </div>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>
        Pose une question sur tes données réelles (dossiers, examens, ventes, impayés, sessions, tarifs). Lecture seule.
      </p>

      {messages.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
          {EXEMPLES.map((ex) => (
            <button key={ex} onClick={() => envoyer(ex)}
              style={{ border: "1px solid #E4E7EC", background: "#fff", borderRadius: 999, padding: "7px 13px", fontSize: 13, cursor: "pointer", color: "#344054" }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "16px 0" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div style={{
              background: m.role === "user" ? BLEU : "#F2F4F7",
              color: m.role === "user" ? "#fff" : "#1D2939",
              padding: "10px 14px", borderRadius: 14, whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 14.5,
            }}>
              {m.content}
            </div>
            {m.outils && m.outils.length > 0 && (
              <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 4 }}>
                🔧 {m.outils.join(" · ")}
              </div>
            )}
          </div>
        ))}
        {charge && (
          <div style={{ alignSelf: "flex-start", color: "#98A2B3", fontSize: 14, padding: "6px 4px" }}>
            L'assistant consulte le CRM…
          </div>
        )}
        <div ref={finRef} />
      </div>

      {erreur && (
        <div style={{ background: "#FEF3F2", border: "1px solid #FDA29B", color: "#B42318", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 10 }}>
          {erreur}
        </div>
      )}

      <div style={{ position: "sticky", bottom: 0, background: "#fff", paddingTop: 8, display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
          placeholder="Pose ta question…"
          disabled={charge}
          style={{ flex: 1, border: "1px solid #D0D5DD", borderRadius: 10, padding: "11px 14px", fontSize: 14.5, outline: "none" }}
        />
        <button onClick={() => envoyer()} disabled={charge || !input.trim()}
          style={{ background: BLEU, color: "#fff", border: "none", borderRadius: 10, padding: "0 20px", fontSize: 14.5, fontWeight: 600, cursor: charge ? "default" : "pointer", opacity: charge || !input.trim() ? 0.6 : 1 }}>
          Envoyer
        </button>
      </div>
    </div>
  );
}
