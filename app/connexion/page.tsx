"use client";

import { useState } from "react";

/**
 * MYSTORY — Page de connexion.
 * Connexion individuelle : email + mot de passe.
 * Filet : email laissé vide → mot de passe d'équipe (le temps de la bascule).
 */
export default function PageConnexion() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [oubli, setOubli] = useState(false);
  const [emailOubli, setEmailOubli] = useState("");
  const [msgOubli, setMsgOubli] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function seConnecter() {
    if (!motDePasse || chargement) return;
    setChargement(true);
    setErreur(null);
    try {
      const rep = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), motDePasse }),
      });
      if (rep.ok) {
        window.location.href = "/";
      } else {
        const data = await rep.json().catch(() => null);
        setErreur(data?.erreur ?? "Identifiants incorrects");
        setChargement(false);
      }
    } catch {
      setErreur("Erreur de connexion au serveur. Réessayez.");
      setChargement(false);
    }
  }

  async function demanderReset() {
    setMsgOubli(null);
    try {
      await fetch("/api/auth/mot-de-passe-oublie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailOubli.trim() }),
      });
    } catch {}
    setMsgOubli("Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.");
  }

  const labelCls = "mb-1.5 block text-sm font-semibold text-gray-700";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFBFC] p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-extrabold tracking-wide text-mystory">MYSTORY</div>
          <p className="mt-1 text-sm text-gray-500">Espace équipe — accès réservé</p>
        </div>

        <label htmlFor="email" className={labelCls}>Email</label>
        <input id="email" type="email" value={email} autoComplete="username"
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && seConnecter()}
          placeholder="prenom@mystoryformation.fr" className="input" />

        <label htmlFor="mdp" className={`${labelCls} mt-3`}>Mot de passe</label>
        <input id="mdp" type="password" value={motDePasse} autoComplete="current-password"
          onChange={(e) => setMotDePasse(e.target.value)} onKeyDown={(e) => e.key === "Enter" && seConnecter()} className="input" />

        {erreur && (
          <div className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{erreur}</div>
        )}

        <button onClick={seConnecter} disabled={chargement || !motDePasse}
          className="btn-primary mt-5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">
          {chargement ? "Connexion…" : "Se connecter"}
        </button>

        <div className="mt-4 text-center">
          <button type="button" onClick={() => setOubli((o) => !o)} className="text-xs text-mystory underline">
            Mot de passe oublié ?
          </button>
        </div>

        {oubli && (
          <div className="mt-3 rounded-xl bg-gray-50 p-3">
            <label className={labelCls}>Votre email</label>
            <input type="email" value={emailOubli} autoComplete="username"
              onChange={(e) => setEmailOubli(e.target.value)} onKeyDown={(e) => e.key === "Enter" && demanderReset()}
              placeholder="prenom@mystoryformation.fr" className="input" />
            <button type="button" onClick={demanderReset} disabled={!emailOubli.trim()}
              className="btn-primary mt-2.5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">
              Recevoir un lien de réinitialisation
            </button>
            {msgOubli && <p className="mt-2.5 text-xs text-emerald-600">{msgOubli}</p>}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">Astuce : laisse l'email vide pour l'accès équipe temporaire.</p>
        <p className="mt-2 text-center text-xs text-gray-400">contact@mystoryformation.fr · 06 81 43 16 54</p>
      </div>
    </main>
  );
}
