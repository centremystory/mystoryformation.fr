"use client";
// app/prescripteur/connexion/page.tsx — Connexion des organismes partenaires.
//
// Volontairement sobre et sans lien vers le CRM : c'est la porte d'un tiers, pas
// celle de l'equipe. Aucun message ne revele si une adresse est connue ou non.
import { useState } from "react";
import { useRouter } from "next/navigation";

const BLEU = "#2F72DE";

export default function ConnexionPrescripteur() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [oubli, setOubli] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function connecter() {
    if (!email.trim() || !mdp) { setErr("Renseignez votre adresse et votre mot de passe."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/prescripteur/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connexion", email, motDePasse: mdp }),
      });
      const j = await r.json();
      if (!j?.ok) { setErr(j?.erreur ?? "Connexion impossible."); return; }
      router.push("/prescripteur");
    } catch {
      setErr("Connexion interrompue : réessayez.");
    } finally { setBusy(false); }
  }

  async function demanderLien() {
    if (!email.trim()) { setErr("Indiquez l'adresse de votre organisme."); return; }
    setBusy(true); setErr(null);
    try {
      await fetch("/api/prescripteur/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "oubli", email }),
      });
      // La reponse est toujours positive, meme si l'adresse est inconnue : le
      // message ne doit pas reveler qui est partenaire.
      setEnvoye(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BLEU }}>
        Espace partenaire
      </p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">MYSTORY Formation</h1>
      <p className="mt-1 text-sm text-gray-600">
        Centre d&apos;examen agréé TEF IRN. Réservé aux organismes partenaires.
      </p>

      {envoye ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Si cette adresse correspond à un compte partenaire,</p>
          <p className="mt-1">
            un message vient d&apos;y être envoyé avec un lien pour définir votre mot de
            passe. Ce lien est valable une heure.
          </p>
          <button onClick={() => { setEnvoye(false); setOubli(false); }}
                  className="mt-3 text-sm font-semibold underline underline-offset-2">
            Revenir à la connexion
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              Adresse e-mail de votre organisme
            </span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                   autoComplete="username"
                   className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
          </label>

          {!oubli && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Mot de passe</span>
              <input value={mdp} onChange={(e) => setMdp(e.target.value)} type="password"
                     autoComplete="current-password"
                     onKeyDown={(e) => { if (e.key === "Enter") connecter(); }}
                     className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
            </label>
          )}

          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}

          <button onClick={oubli ? demanderLien : connecter} disabled={busy}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white shadow disabled:opacity-50"
                  style={{ background: BLEU }}>
            {busy ? "…" : oubli ? "Recevoir un lien" : "Se connecter"}
          </button>

          <button onClick={() => { setOubli(!oubli); setErr(null); }}
                  className="w-full text-center text-sm text-gray-600 underline underline-offset-2">
            {oubli ? "J'ai mon mot de passe" : "Mot de passe oublié ou premier accès"}
          </button>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-gray-400">
        Une difficulté&nbsp;? contact@mystoryformation.fr
      </p>
    </div>
  );
}
