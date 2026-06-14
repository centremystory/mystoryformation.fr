"use client";
// app/contact/page.tsx — Formulaire public « Écrivez-nous » (prospects). Sans navbar.
import { useState } from "react";

export default function PageContact() {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [envoye, setEnvoye] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function envoyer() {
    if (message.trim().length < 2) { setErr("Écrivez votre message."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, email, message, website }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Envoi impossible."); return; }
      setEnvoye(true);
    } catch (e: any) { setErr(e?.message || "Envoi impossible."); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-12">
      <div className="flex items-center gap-2 mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="MYSTORY" className="h-9 w-auto" />
        <span className="font-semibold text-mystory">MYSTORY</span>
      </div>

      {envoye ? (
        <div className="border border-green-200 bg-green-50 rounded-xl p-6">
          <h1 className="text-lg font-bold text-green-900">Merci !</h1>
          <p className="text-sm text-green-800 mt-2">Votre message a bien été envoyé. Nous vous répondrons rapidement.</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-gray-900">Écrivez-nous</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">Une question sur nos formations ou certifications ? Laissez-nous un message.</p>
          <div className="space-y-3">
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Votre nom" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Votre email" type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Votre message *" rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            {/* honeypot : champ caché, non visible pour un humain */}
            <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
          </div>
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
          <button onClick={envoyer} disabled={busy} className="mt-5 px-5 py-2.5 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </>
      )}
    </main>
  );
}
