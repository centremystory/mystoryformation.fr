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

  const champ: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 15, border: "1px solid #C9D6EC", borderRadius: 8, outline: "none" };
  const lab: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#33415C", margin: "0 0 6px" };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F7FC", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#FFFFFF", borderRadius: 14, boxShadow: "0 8px 30px rgba(47,114,222,0.12)", padding: "36px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#2F72DE", letterSpacing: 1 }}>MYSTORY</div>
          <div style={{ color: "#5A6B85", marginTop: 6, fontSize: 14 }}>Nouveau mot de passe</div>
        </div>

        {ok ? (
          <div>
            <div style={{ padding: "12px 14px", background: "#E7F6EC", color: "#1E7E45", borderRadius: 8, fontSize: 14 }}>
              ✅ Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.
            </div>
            <a href="/connexion" style={{ display: "block", textAlign: "center", marginTop: 18, padding: "12px", background: "#2F72DE", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>Aller à la connexion</a>
          </div>
        ) : token === null ? (
          <div style={{ padding: "12px 14px", background: "#FDECEC", color: "#B3261E", borderRadius: 8, fontSize: 13, textAlign: "center" }}>
            Lien invalide. Refaites une demande depuis « Mot de passe oublié » sur la page de connexion.
          </div>
        ) : (
          <>
            <label htmlFor="mdp" style={lab}>Nouveau mot de passe</label>
            <input id="mdp" type="password" value={mdp} autoComplete="new-password"
              onChange={(e) => setMdp(e.target.value)} placeholder="Au moins 8 caractères" style={{ ...champ, marginBottom: 14 }} />

            <label htmlFor="conf" style={lab}>Confirmer le mot de passe</label>
            <input id="conf" type="password" value={confirme} autoComplete="new-password"
              onChange={(e) => setConfirme(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} style={champ} />

            {erreur && (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "#FDECEC", color: "#B3261E", borderRadius: 8, fontSize: 13 }}>{erreur}</div>
            )}

            <button onClick={valider} disabled={chargement || !mdp || !confirme}
              style={{ width: "100%", marginTop: 18, padding: "12px", color: "#fff", fontSize: 15, fontWeight: 700,
                background: chargement || !mdp || !confirme ? "#9DBCEB" : "#2F72DE", border: "none", borderRadius: 8,
                cursor: chargement || !mdp || !confirme ? "not-allowed" : "pointer" }}>
              {chargement ? "Validation…" : "Valider le nouveau mot de passe"}
            </button>
            <div style={{ marginTop: 14, textAlign: "center", fontSize: 12 }}>
              <a href="/connexion" style={{ color: "#2F72DE", textDecoration: "none" }}>Retour à la connexion</a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
