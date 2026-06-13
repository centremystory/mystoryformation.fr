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

  const champ: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 15,
    border: "1px solid #C9D6EC", borderRadius: 8, outline: "none",
  };
  const lab: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 600, color: "#33415C", margin: "0 0 6px",
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F4F7FC", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#FFFFFF", borderRadius: 14,
        boxShadow: "0 8px 30px rgba(47,114,222,0.12)", padding: "36px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#2F72DE", letterSpacing: 1 }}>MYSTORY</div>
          <div style={{ color: "#5A6B85", marginTop: 6, fontSize: 14 }}>Espace équipe — accès réservé</div>
        </div>

        <label htmlFor="email" style={lab}>Email</label>
        <input id="email" type="email" value={email} autoComplete="username"
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && seConnecter()}
          placeholder="prenom@mystoryformation.fr" style={{ ...champ, marginBottom: 14 }} />

        <label htmlFor="mdp" style={lab}>Mot de passe</label>
        <input id="mdp" type="password" value={motDePasse} autoComplete="current-password"
          onChange={(e) => setMotDePasse(e.target.value)} onKeyDown={(e) => e.key === "Enter" && seConnecter()} style={champ} />

        {erreur && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: "#FDECEC", color: "#B3261E", borderRadius: 8, fontSize: 13 }}>
            {erreur}
          </div>
        )}

        <button onClick={seConnecter} disabled={chargement || !motDePasse}
          style={{ width: "100%", marginTop: 18, padding: "12px 14px", fontSize: 15, fontWeight: 700, color: "#FFFFFF",
            background: chargement || !motDePasse ? "#9DBCEB" : "#2F72DE", border: "none", borderRadius: 8,
            cursor: chargement || !motDePasse ? "not-allowed" : "pointer" }}>
          {chargement ? "Connexion…" : "Se connecter"}
        </button>

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: "#8A99B5" }}>
          Astuce : laisse l'email vide pour l'accès équipe temporaire.
        </div>
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "#8A99B5" }}>
          contact@mystoryformation.fr · 06 81 43 16 54
        </div>
      </div>
    </main>
  );
}
