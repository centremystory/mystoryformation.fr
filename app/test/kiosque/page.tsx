"use client";

/**
 * MYSTORY — Kiosque d'accueil : un prospect démarre son test de positionnement sur place.
 * Page publique (sous /test, sans navigation). Crée l'évaluation puis redirige vers la passation.
 */
import { useState } from "react";

export default function Kiosque() {
  const [nom, setNom] = useState(""); const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState(""); const [tel, setTel] = useState("");
  const [envoi, setEnvoi] = useState(false); const [err, setErr] = useState<string | null>(null);

  async function demarrer() {
    if (!nom.trim() || !prenom.trim()) { setErr("Indiquez votre nom et votre prénom."); return; }
    setEnvoi(true); setErr(null);
    try {
      const r = await fetch("/api/tests/kiosque", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, prenom, email, telephone: tel }),
      });
      const j = await r.json();
      if (j.ok && j.url) { window.location.href = `${j.url}?k=1`; }
      else { setErr(j.erreur || "Impossible de démarrer le test."); setEnvoi(false); }
    } catch { setErr("Connexion impossible."); setEnvoi(false); }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-mystory">Test de positionnement</h1>
        <p className="text-sm text-gray-500">Renseignez vos informations pour commencer votre test de français.</p>
      </div>
      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-gray-700">Prénom*
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="input mt-1 w-full" />
          </label>
          <label className="text-sm text-gray-700">Nom*
            <input value={nom} onChange={(e) => setNom(e.target.value)} className="input mt-1 w-full" />
          </label>
        </div>
        <label className="block text-sm text-gray-700">E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1 w-full" />
        </label>
        <label className="block text-sm text-gray-700">Téléphone
          <input value={tel} onChange={(e) => setTel(e.target.value)} className="input mt-1 w-full" />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={demarrer} disabled={envoi} className="btn-primary w-full">{envoi ? "Démarrage…" : "Commencer le test"}</button>
      </div>
      <p className="mt-4 text-center text-xs text-gray-400">MYSTORY Formation — Gagny</p>
    </div>
  );
}
