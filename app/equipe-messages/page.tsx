"use client";
// app/equipe-messages/page.tsx — Fil de messages d'équipe (annonces internes).
// Simple : on poste un message, toute l'équipe le voit. Épingler pour garder en haut.
import { useCallback, useEffect, useState } from "react";
import { Megaphone, Pin, PinOff, Archive, Send } from "lucide-react";

type Msg = {
  id: string; auteur_id: string | null; auteur_email: string | null; auteur_nom: string;
  auteur_role: string | null; contenu: string; epingle: boolean; cree_le: string;
};

function quand(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PageEquipeMessages() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [contenu, setContenu] = useState("");
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [moi, setMoi] = useState<{ email: string | null; roles: string[] }>({ email: null, roles: [] });

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const j = await fetch("/api/equipe-messages", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) setMessages(j.messages ?? []);
    } finally { setChargement(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((j) => {
      if (j?.ok) setMoi({ email: j.user?.email ?? null, roles: j.user?.roles ?? [] });
    }).catch(() => {});
  }, []);

  const estDirection = moi.roles.some((r) => r === "direction" || r === "staff");

  async function publier() {
    const txt = contenu.trim();
    if (!txt) return;
    setBusy("publier");
    try {
      const j = await fetch("/api/equipe-messages", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu: txt }),
      }).then((r) => r.json());
      if (j.ok) { setContenu(""); await charger(); }
    } finally { setBusy(null); }
  }

  async function agir(id: string, action: "epingler" | "desepingler" | "archiver") {
    setBusy(id);
    try {
      const j = await fetch("/api/equipe-messages", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
      }).then((r) => r.json());
      if (j.ok) await charger();
    } finally { setBusy(null); }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 md:px-6 py-8">
      <header className="flex items-center gap-3 mb-1">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
          <Megaphone size={22} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="page-title text-2xl">Fil d&apos;équipe</h1>
          <p className="page-subtitle">Un message à toute l&apos;équipe — visible par tous. (Questions internes → onglet « Questions internes ».)</p>
        </div>
      </header>

      {/* Composer */}
      <div className="card mt-5">
        <textarea value={contenu} onChange={(e) => setContenu(e.target.value)}
          placeholder="Écrire un message à l'équipe (info du jour, consigne, bravo…)"
          rows={3} className="input w-full resize-y" />
        <div className="flex justify-end mt-2">
          <button onClick={publier} disabled={busy === "publier" || !contenu.trim()} className="btn-primary">
            <Send size={16} /> {busy === "publier" ? "Envoi…" : "Publier"}
          </button>
        </div>
      </div>

      {/* Fil */}
      <div className="mt-6 space-y-2">
        {chargement ? <p className="text-gray-500 text-sm">Chargement…</p> :
          messages.length === 0 ? <p className="text-gray-500 text-sm">Aucun message pour le moment — lance le fil 👋</p> :
          messages.map((m) => {
            const mien = !!moi.email && m.auteur_email === moi.email;
            const peutGerer = mien || estDirection;
            return (
              <div key={m.id} className={`rounded-lg border p-3 ${m.epingle ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-gray-900">{m.auteur_nom}</span>
                  {m.auteur_role && m.auteur_role !== "staff" && <span className="text-xs text-gray-400">· {m.auteur_role}</span>}
                  {m.epingle && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">📌 épinglé</span>}
                  <span className="flex-1" />
                  <span className="text-xs text-gray-400">{quand(m.cree_le)}</span>
                </div>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{m.contenu}</p>
                {peutGerer && (
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    {m.epingle
                      ? <button onClick={() => agir(m.id, "desepingler")} disabled={busy === m.id} className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"><PinOff size={13} /> Désépingler</button>
                      : <button onClick={() => agir(m.id, "epingler")} disabled={busy === m.id} className="text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"><Pin size={13} /> Épingler</button>}
                    <button onClick={() => agir(m.id, "archiver")} disabled={busy === m.id} className="text-gray-400 hover:text-red-600 inline-flex items-center gap-1"><Archive size={13} /> Archiver</button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </main>
  );
}
