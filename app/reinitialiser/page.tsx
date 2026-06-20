"use client";

/**
 * MYSTORY — /reinitialiser?token=… (page publique)
 * Saisie d'un nouveau mot de passe après clic sur le lien reçu par email.
 */
import { useEffect, useState } from "react";

export default function PageReinitialiser() {
  const [token, setToken] = useState<string | null>(null);
  const [mdp, setMdp] = useState("");
  const [confirme, setConfirme] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
  }, []);

  async function valider() {
    setErreur(null);
    if (mdp.length < 8) { setErreur("Le mot de passe doit faire au moins 8 caractères."); return; }
    if (mdp !== confirme) { setErreur("Les deux mots de passe ne correspondent pas."); return; }
    setChargement(true);
    try {
      const r = await fetch("/api/auth/reinitialiser", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nouveau_mdp: mdp }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErreur(d?.erreur ?? "Réinitialisation impossible."); return; }
      setOk(true);
    } catch { setErreur("Erreur de connexion au serveur. Réessayez."); }
    finally { setChargement(false); }
  }

  const labelCls = "mb-1.5 block text-sm font-semibold text-gray-700";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFBFC] p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-extrabold tracking-wide text-mystory">MYSTORY</div>
          <p className="mt-1 text-sm text-gray-500">Nouveau mot de passe</p>
        </div>

        {ok ? (
          <div>
            <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              ✅ Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.
            </div>
            <a href="/connexion" className="btn-primary mt-5 w-full justify-center">Aller à la connexion</a>
          </div>
        ) : token === null ? (
          <div className="rounded-lg bg-danger-50 px-3 py-3 text-center text-sm text-danger-700">
            Lien invalide. Refaites une demande depuis « Mot de passe oublié » sur la page de connexion.
          </div>
        ) : (
          <>
            <label htmlFor="mdp" className={labelCls}>Nouveau mot de passe</label>
            <input id="mdp" type="password" value={mdp} autoComplete="new-password"
              onChange={(e) => setMdp(e.target.value)} placeholder="Au moins 8 caractères" className="input" />

            <label htmlFor="conf" className={`${labelCls} mt-3`}>Confirmer le mot de passe</label>
            <input id="conf" type="password" value={confirme} autoComplete="new-password"
              onChange={(e) => setConfirme(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} className="input" />

            {erreur && (
              <div className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{erreur}</div>
            )}

            <button onClick={valider} disabled={chargement || !mdp || !confirme}
              className="btn-primary mt-5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">
              {chargement ? "Validation…" : "Valider le nouveau mot de passe"}
            </button>
            <div className="mt-4 text-center text-xs">
              <a href="/connexion" className="text-mystory hover:underline">Retour à la connexion</a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
