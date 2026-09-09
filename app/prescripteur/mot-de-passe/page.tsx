"use client";
// app/prescripteur/mot-de-passe/page.tsx — Poser ou renouveler le mot de passe.
// Atteint depuis le lien du courriel (?token=…). Le jeton est a usage unique et
// vaut une heure ; la session s'ouvre dans la foulee.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BLEU = "#2F72DE";
const MINIMUM = 10;

function Formulaire() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [mdp, setMdp] = useState("");
  const [confirme, setConfirme] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const assezLong = mdp.length >= MINIMUM;
  const identiques = mdp.length > 0 && mdp === confirme;

  async function poser() {
    if (!assezLong) { setErr(`Le mot de passe doit faire au moins ${MINIMUM} caractères.`); return; }
    if (!identiques) { setErr("Les deux mots de passe ne correspondent pas."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/prescripteur/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reinitialiser", token, nouveau: mdp }),
      });
      const j = await r.json();
      if (!j?.ok) { setErr(j?.erreur ?? "Enregistrement impossible."); return; }
      router.push("/prescripteur");
    } catch {
      setErr("Connexion interrompue : réessayez.");
    } finally { setBusy(false); }
  }

  if (!token) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Lien incomplet</p>
        <p className="mt-1">
          Ouvrez le lien tel qu&apos;il figure dans le courriel, sans le tronquer.
        </p>
        <a href="/prescripteur/connexion" className="mt-3 inline-block font-semibold underline">
          Demander un nouveau lien
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">Nouveau mot de passe</span>
        <input value={mdp} onChange={(e) => setMdp(e.target.value)} type="password"
               autoComplete="new-password"
               className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
        <span className={`mt-1 block text-xs ${assezLong ? "text-emerald-700" : "text-gray-500"}`}>
          {assezLong ? "✓ longueur suffisante" : `${MINIMUM} caractères minimum`}
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">Confirmez</span>
        <input value={confirme} onChange={(e) => setConfirme(e.target.value)} type="password"
               autoComplete="new-password"
               onKeyDown={(e) => { if (e.key === "Enter") poser(); }}
               className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
        {confirme.length > 0 && !identiques && (
          <span className="mt-1 block text-xs text-red-700">
            Les deux saisies diffèrent.
          </span>
        )}
      </label>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}

      <button onClick={poser} disabled={busy || !assezLong || !identiques}
              className="w-full rounded-xl py-3 text-sm font-bold text-white shadow disabled:opacity-40"
              style={{ background: BLEU }}>
        {busy ? "…" : "Enregistrer et accéder à mon espace"}
      </button>
    </div>
  );
}

export default function PageMotDePasse() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BLEU }}>
        Espace partenaire
      </p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">Votre mot de passe</h1>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        Choisissez un mot de passe pour accéder à votre espace.
      </p>
      <Suspense fallback={<p className="text-sm text-gray-400">Chargement…</p>}>
        <Formulaire />
      </Suspense>
    </div>
  );
}
