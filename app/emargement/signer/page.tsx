"use client";

/**
 * MYSTORY — Page publique de signature d'émargement (accès par jeton / QR).
 * Le stagiaire scanne le QR sur son téléphone, signe ici. La formatrice contresigne ensuite.
 */
import { useEffect, useState } from "react";
import SignaturePad from "@/components/SignaturePad";

type Ctx = {
  prenom: string; nom: string; date: string; demi: string; lieu: string;
  deja_signe_stagiaire: boolean; complet: boolean;
};

export default function SignerEmargement() {
  const [token, setToken] = useState<string | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) { setErreur("Lien invalide."); return; }
    fetch(`/api/emargement/signer?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setCtx(j); else setErreur(j.erreur || "Lien invalide."); })
      .catch(() => setErreur("Lien invalide."));
  }, []);

  async function valider() {
    if (!sig || !token) return;
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch("/api/emargement/signer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "stagiaire", token, signature: sig }),
      });
      const j = await r.json();
      if (j.ok) setFait(true);
      else setErreur(j.erreur || "Échec de l'enregistrement.");
    } catch { setErreur("Échec de l'enregistrement."); }
    finally { setEnvoi(false); }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="text-mystory font-extrabold text-2xl tracking-tight mb-6">MYSTORY</div>

        {erreur && !ctx && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">{erreur}</div>
        )}

        {ctx && (fait || ctx.complet) && (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center shadow-sm">
            <div className="text-4xl mb-3">✅</div>
            <h1 className="text-lg font-bold text-gray-900">Signature enregistrée</h1>
            <p className="mt-2 text-sm text-gray-600">
              Merci {ctx.prenom}. Votre présence du {ctx.date} ({ctx.demi}) est signée.
              La formatrice va contresigner sur place.
            </p>
          </div>
        )}

        {ctx && !fait && !ctx.complet && (
          <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
            <h1 className="text-lg font-bold text-gray-900">Feuille d'émargement</h1>
            <p className="mt-1 text-sm text-gray-600">
              Bonjour <b>{ctx.prenom} {ctx.nom}</b>. Merci de signer votre présence.
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Date</dt><dd className="font-medium text-gray-900">{ctx.date}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Créneau</dt><dd className="font-medium text-gray-900">{ctx.demi}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Lieu</dt><dd className="font-medium text-gray-900 text-right">{ctx.lieu}</dd></div>
            </dl>

            {ctx.deja_signe_stagiaire && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                Une signature a déjà été déposée pour ce créneau. La signer à nouveau remplacera la précédente.
              </div>
            )}

            <div className="mt-5">
              <SignaturePad onChange={setSig} height={200} disabled={envoi} />
            </div>

            {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

            <button
              onClick={valider}
              disabled={!sig || envoi}
              className="mt-4 w-full rounded-xl bg-mystory py-3 text-white font-semibold disabled:opacity-50"
            >
              {envoi ? "Enregistrement…" : "Valider ma signature"}
            </button>
            <p className="mt-3 text-[11px] leading-snug text-gray-400">
              Signature horodatée au moment du dépôt. MYSTORY — SASU · NDA 11756521775 (ne vaut pas agrément de l'État).
            </p>
          </div>
        )}

        {!ctx && !erreur && <div className="text-sm text-gray-400">Chargement…</div>}
      </div>
    </main>
  );
}
