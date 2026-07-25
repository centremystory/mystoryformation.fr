"use client";
// app/assistant/page.tsx — Assistant CRM (cockpit données live).
import { useEffect, useRef, useState } from "react";

const BLEU = "#2F72DE";

type Msg = { role: "user" | "assistant"; content: string; outils?: string[]; proposition?: any };

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
  const [applique, setApplique] = useState<Record<number, string>>({});

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, charge]);

  async function appliquer(i: number, patch: any) {
    setApplique((p) => ({ ...p, [i]: "..." }));
    try {
      const r = await fetch("/api/catalogue/offres", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec.");
      setApplique((p) => ({ ...p, [i]: "ok" }));
    } catch (e: any) {
      setApplique((p) => ({ ...p, [i]: "err:" + (e?.message || "erreur") }));
    }
  }

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
      setMessages((prev) => [...prev, { role: "assistant", content: j.reponse || "(réponse vide)", outils: j.outils, proposition: j.proposition }]);
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
            {m.proposition && (
              <div style={{ marginTop: 8, border: "1px solid #FEDF89", background: "#FFFAEB", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#B54708" }}>Proposition — {String(m.proposition.cible)}</div>
                <div style={{ fontSize: 13, margin: "6px 0", color: "#344054" }}>
                  <b>{String(m.proposition.champ)}</b> : <span style={{ textDecoration: "line-through", color: "#98A2B3" }}>{String(m.proposition.ancienne_valeur)}</span> → <b>{String(m.proposition.nouvelle_valeur)}</b>
                </div>
                {applique[i] === "ok" ? (
                  <div style={{ color: "#12B76A", fontSize: 13, fontWeight: 600 }}>✓ Appliqué — annulable dans Catalogue → Historique.</div>
                ) : applique[i]?.startsWith("err:") ? (
                  <div style={{ color: "#B42318", fontSize: 13 }}>{applique[i].slice(4)}</div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => appliquer(i, m.proposition.patch)} disabled={applique[i] === "..."}
                      style={{ background: BLEU, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      {applique[i] === "..." ? "…" : "Appliquer"}
                    </button>
                    <button onClick={() => setApplique((p) => ({ ...p, [i]: "err:Proposition ignorée." }))}
                      style={{ background: "#fff", color: "#667085", border: "1px solid #D0D5DD", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
                      Ignorer
                    </button>
                  </div>
                )}
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
