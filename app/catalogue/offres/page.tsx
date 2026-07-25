"use client";
// app/catalogue/offres/page.tsx — Catalogue v4 100% éditable (offres + formules) + historique/retour arrière.
import { useEffect, useState } from "react";

const BLEU = "#2F72DE";

type Formule = {
  id: string; offre_id: string; offre_intitule: string; entree_niveau: string | null; vise_niveau: string | null;
  finalite: string | null; formule_id: string; formule_nom: string; heures: number; seances: number | null;
  prix_eur: number; statut: string; actif: boolean; ordre: number;
};
type Version = { id: string; cree_le: string; auteur: string | null; motif: string | null };

const inputStyle = { border: "1px solid #D0D5DD", borderRadius: 8, padding: "6px 8px", fontSize: 14, width: "100%" } as const;

export default function CatalogueOffresPage() {
  const [formules, setFormules] = useState<Formule[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enreg, setEnreg] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [histoOuvert, setHistoOuvert] = useState(false);

  async function charger() {
    setCharge(true); setErreur(null);
    try {
      const r = await fetch("/api/catalogue/offres", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setFormules(j.formules);
    } catch (e: any) { setErreur(e?.message || "Erreur."); } finally { setCharge(false); }
  }
  async function chargerVersions() {
    try {
      const r = await fetch("/api/catalogue/offres/historique", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setVersions(j.versions);
    } catch { /* silencieux */ }
  }
  useEffect(() => { charger(); chargerVersions(); }, []);

  function maj(id: string, champ: keyof Formule, val: any) {
    setFormules((prev) => prev.map((f) => (f.id === id ? { ...f, [champ]: val } : f)));
  }
  // Champs d'offre = partagés → on met à jour toutes les formules de l'offre en local.
  function majOffre(offreId: string, champ: keyof Formule, val: any) {
    setFormules((prev) => prev.map((f) => (f.offre_id === offreId ? { ...f, [champ]: val } : f)));
  }

  async function patch(corps: any, cle: string) {
    setEnreg(cle); setErreur(null);
    try {
      const r = await fetch("/api/catalogue/offres", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec.");
      setEnreg("ok:" + cle);
      chargerVersions();
      setTimeout(() => setEnreg((v) => (v === "ok:" + cle ? null : v)), 1500);
    } catch (e: any) { setErreur(e?.message || "Erreur."); setEnreg(null); }
  }

  const enregistrerFormule = (f: Formule) =>
    patch({ id: f.id, formule_nom: f.formule_nom, heures: f.heures, seances: f.seances, prix_eur: f.prix_eur, statut: f.statut, actif: f.actif }, f.id);
  const enregistrerOffre = (o: Formule) =>
    patch({ offre_id: o.offre_id, offre_intitule: o.offre_intitule, finalite: o.finalite, entree_niveau: o.entree_niveau, vise_niveau: o.vise_niveau }, "offre:" + o.offre_id);

  async function restaurer(vid: string) {
    if (!confirm("Restaurer cette version du catalogue ? L'état actuel sera sauvegardé (annulable).")) return;
    setEnreg("restore:" + vid); setErreur(null);
    try {
      const r = await fetch("/api/catalogue/offres/historique", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version_id: vid }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec de la restauration.");
      await charger(); await chargerVersions();
    } catch (e: any) { setErreur(e?.message || "Erreur."); }
    finally { setEnreg(null); }
  }

  const offres = Array.from(new Set(formules.map((f) => f.offre_id)));
  const dateFr = (s: string) => new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>Catalogue — Offres & formules (v4)</h1>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>
        Édite <strong>titres, finalités, niveaux</strong> (au niveau offre) et <strong>formules</strong> (nom, heures, prix). <strong>Barème v6 :</strong> 150€ (examen) + heures × taux — 6-15h=45€/h · 18-27h=40€/h · 30-39h=35€/h · 42-45h=30€/h. Plafond 1 500€ (max 1 515€).
      </p>
      <div style={{ background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B54708", margin: "12px 0" }}>
        ⚠️ <strong>Brouillon</strong> — offres en attente de validation du certificateur (Le français des affaires). Ne pas publier sur EDOF avant son retour.
      </div>

      {/* Historique / retour arrière */}
      <div style={{ border: "1px solid #E4E7EC", borderRadius: 12, marginBottom: 16 }}>
        <button onClick={() => setHistoOuvert((v) => !v)}
          style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
          <span>↩︎ Historique & retour arrière {versions.length ? `(${versions.length})` : ""}</span>
          <span style={{ color: "#98A2B3" }}>{histoOuvert ? "▲" : "▼"}</span>
        </button>
        {histoOuvert && (
          <div style={{ padding: "0 16px 14px" }}>
            {versions.length === 0 ? <p style={{ color: "#98A2B3", fontSize: 13 }}>Aucune version enregistrée pour l'instant — chaque modification en crée une.</p> : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {versions.map((v) => (
                  <li key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, borderTop: "1px solid #F2F4F7", paddingTop: 6 }}>
                    <span style={{ color: "#475467" }}>{dateFr(v.cree_le)} — {v.motif || "Modification"}{v.auteur ? ` · ${v.auteur}` : ""}</span>
                    <button onClick={() => restaurer(v.id)} disabled={enreg === "restore:" + v.id}
                      style={{ background: "#fff", color: BLEU, border: `1px solid ${BLEU}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {enreg === "restore:" + v.id ? "…" : "Restaurer"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {erreur && <div style={{ background: "#FEF3F2", border: "1px solid #FDA29B", color: "#B42318", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 10 }}>{erreur}</div>}
      {charge && <p style={{ color: "#98A2B3" }}>Chargement…</p>}

      {offres.map((oid) => {
        const grp = formules.filter((f) => f.offre_id === oid);
        const o = grp[0];
        const cleOffre = "offre:" + oid;
        return (
          <div key={oid} style={{ border: "1px solid #E4E7EC", borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#98A2B3", fontFamily: "monospace", marginBottom: 8 }}>{oid}</div>
            {/* Édition OFFRE : titre + finalité + niveaux */}
            <div style={{ display: "grid", gap: 8, marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: "#667085" }}>Intitulé de l'offre
                <input style={{ ...inputStyle, fontWeight: 600 }} value={o.offre_intitule ?? ""} onChange={(e) => majOffre(oid, "offre_intitule", e.target.value)} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.7fr 0.7fr auto", gap: 8, alignItems: "end" }}>
                <label style={{ fontSize: 12, color: "#667085" }}>Finalité
                  <input style={inputStyle} value={o.finalite ?? ""} onChange={(e) => majOffre(oid, "finalite", e.target.value)} />
                </label>
                <label style={{ fontSize: 12, color: "#667085" }}>Niveau entrée
                  <input style={inputStyle} value={o.entree_niveau ?? ""} onChange={(e) => majOffre(oid, "entree_niveau", e.target.value)} />
                </label>
                <label style={{ fontSize: 12, color: "#667085" }}>Niveau visé
                  <input style={inputStyle} value={o.vise_niveau ?? ""} onChange={(e) => majOffre(oid, "vise_niveau", e.target.value)} />
                </label>
                <button onClick={() => enregistrerOffre(o)} disabled={enreg === cleOffre}
                  style={{ background: enreg === "ok:" + cleOffre ? "#12B76A" : BLEU, color: "#fff", border: "none", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {enreg === cleOffre ? "…" : enreg === "ok:" + cleOffre ? "✓ Offre" : "Enregistrer l'offre"}
                </button>
              </div>
            </div>

            {/* Formules */}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.9fr 0.7fr auto", gap: 8, alignItems: "center", fontSize: 12, color: "#667085", margin: "10px 0 4px" }}>
              <span>Formule</span><span>Heures</span><span>Séances</span><span>Prix (€)</span><span>Actif</span><span></span>
            </div>
            {grp.map((f) => (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.9fr 0.7fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input style={inputStyle} value={f.formule_nom} onChange={(e) => maj(f.id, "formule_nom", e.target.value)} />
                <input style={inputStyle} type="number" value={f.heures} onChange={(e) => maj(f.id, "heures", Number(e.target.value))} />
                <input style={inputStyle} type="number" value={f.seances ?? ""} onChange={(e) => maj(f.id, "seances", e.target.value === "" ? null : Number(e.target.value))} />
                <input style={inputStyle} type="number" value={f.prix_eur} onChange={(e) => maj(f.id, "prix_eur", Number(e.target.value))} />
                <input type="checkbox" checked={f.actif} onChange={(e) => maj(f.id, "actif", e.target.checked)} style={{ width: 18, height: 18 }} />
                <button onClick={() => enregistrerFormule(f)} disabled={enreg === f.id}
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
