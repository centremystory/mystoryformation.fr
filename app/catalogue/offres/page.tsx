"use client";
// app/catalogue/offres/page.tsx — Édition du catalogue v4 (offres + formules). Brouillon jusqu'à validation certificateur.
import { useEffect, useState } from "react";

const BLEU = "#2F72DE";

type Formule = {
  id: string; offre_id: string; offre_intitule: string; entree_niveau: string | null; vise_niveau: string | null;
  finalite: string | null; formule_id: string; formule_nom: string; heures: number; seances: number | null;
  prix_eur: number; statut: string; actif: boolean; ordre: number;
};

export default function CatalogueOffresPage() {
  const [formules, setFormules] = useState<Formule[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enreg, setEnreg] = useState<string | null>(null);

  async function charger() {
    setCharge(true); setErreur(null);
    try {
      const r = await fetch("/api/catalogue/offres", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setFormules(j.formules);
    } catch (e: any) { setErreur(e?.message || "Erreur."); } finally { setCharge(false); }
  }
  useEffect(() => { charger(); }, []);

  function maj(id: string, champ: keyof Formule, val: any) {
    setFormules((prev) => prev.map((f) => (f.id === id ? { ...f, [champ]: val } : f)));
  }

  async function enregistrer(f: Formule) {
    setEnreg(f.id); setErreur(null);
    try {
      const r = await fetch("/api/catalogue/offres", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, formule_nom: f.formule_nom, heures: f.heures, seances: f.seances, prix_eur: f.prix_eur, statut: f.statut, actif: f.actif, offre_intitule: f.offre_intitule }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec.");
      setEnreg("ok:" + f.id);
      setTimeout(() => setEnreg((v) => (v === "ok:" + f.id ? null : v)), 1500);
    } catch (e: any) { setErreur(e?.message || "Erreur."); setEnreg(null); }
  }

  const offres = Array.from(new Set(formules.map((f) => f.offre_id)));
  const inputStyle = { border: "1px solid #D0D5DD", borderRadius: 8, padding: "6px 8px", fontSize: 14, width: "100%" } as const;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>Catalogue — Offres & formules (v4)</h1>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>
        Édite les 12 formules TEF IRN. <strong>Barème :</strong> 6-15h=50€/h · 18-27h=45€/h · 30-39h=40€/h · 42-45h=35€/h (Express 6h = forfait 400€). Plafond 1 575€.
      </p>
      <div style={{ background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B54708", margin: "12px 0" }}>
        ⚠️ <strong>Brouillon</strong> — offres en attente de validation du certificateur (Le français des affaires). Ne pas publier sur EDOF avant son retour. Cette page n'affecte pas encore le tunnel de vente.
      </div>

      {erreur && <div style={{ background: "#FEF3F2", border: "1px solid #FDA29B", color: "#B42318", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 10 }}>{erreur}</div>}
      {charge && <p style={{ color: "#98A2B3" }}>Chargement…</p>}

      {offres.map((oid) => {
        const grp = formules.filter((f) => f.offre_id === oid);
        const o = grp[0];
        return (
          <div key={oid} style={{ border: "1px solid #E4E7EC", borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#98A2B3", fontFamily: "monospace" }}>{oid} · {o.entree_niveau} → {o.vise_niveau} · {o.finalite}</div>
            <div style={{ fontWeight: 600, fontSize: 15, margin: "2px 0 12px" }}>{o.offre_intitule}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.9fr 0.7fr auto", gap: 8, alignItems: "center", fontSize: 12, color: "#667085", marginBottom: 4 }}>
              <span>Formule</span><span>Heures</span><span>Séances</span><span>Prix (€)</span><span>Actif</span><span></span>
            </div>
            {grp.map((f) => (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.9fr 0.7fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input style={inputStyle} value={f.formule_nom} onChange={(e) => maj(f.id, "formule_nom", e.target.value)} />
                <input style={inputStyle} type="number" value={f.heures} onChange={(e) => maj(f.id, "heures", Number(e.target.value))} />
                <input style={inputStyle} type="number" value={f.seances ?? ""} onChange={(e) => maj(f.id, "seances", e.target.value === "" ? null : Number(e.target.value))} />
                <input style={inputStyle} type="number" value={f.prix_eur} onChange={(e) => maj(f.id, "prix_eur", Number(e.target.value))} />
                <input type="checkbox" checked={f.actif} onChange={(e) => maj(f.id, "actif", e.target.checked)} style={{ width: 18, height: 18 }} />
                <button onClick={() => enregistrer(f)} disabled={enreg === f.id}
                  style={{ background: enreg === "ok:" + f.id ? "#12B76A" : BLEU, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {enreg === f.id ? "…" : enreg === "ok:" + f.id ? "✓" : "Enregistrer"}
                </button>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 4 }}>IDs EDOF : {grp.map((f) => f.formule_id).join(" · ")}</div>
          </div>
        );
      })}
    </div>
  );
}
