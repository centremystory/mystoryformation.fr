"use client";
// app/mon-rapport/page.tsx — « Mon rapport et mes tâches » (page unique, fusion Mon rapport + Rapport hebdo).
// Le rapport se remplit avec des TÂCHES + le TEMPS réalisé (pas du texte libre), horodatées à la saisie.
// Contient : pointage · grille de la semaine (matin/après-midi) · mes tâches à faire · tâches par agence.
import { useCallback, useEffect, useState } from "react";
import TempsTacheModal from "@/components/TempsTacheModal";

const BLEU = "#2F72DE";
const AGENCES = ["Gagny", "Sarcelles", "Rosny"];
const dureeFr = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`; };
const heureFr = (iso: string) => { try { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }); } catch { return ""; } };
const dateFr = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const inputS = { border: "1px solid #D0D5DD", borderRadius: 8, padding: "6px 9px", fontSize: 13 } as const;

type Entree = { id: string; jour: string; creneau: "matin" | "aprem"; activite: string; duree_minutes: number; cree_le: string };
type TacheFaite = { id: string; titre: string; agence: string; temps_minutes: number | null; fait_le: string };
type MaTache = { id: string; titre: string; agence: string; echeance: string | null; cree_le: string };
type Etat = {
  ok: boolean; identifie: boolean; semaine: string;
  jours: { nom: string; date: string }[];
  entrees: Entree[]; tachesFaites: TacheFaite[]; mesTaches: MaTache[]; totalMinutes: number;
  horaires: { matin: string; aprem: string };
};

export default function MonRapportPage() {
  const [d, setD] = useState<Etat | null>(null);
  const [ptg, setPtg] = useState<{ sessionOuverte: any; pointages: any[] } | null>(null);
  const [site, setSite] = useState("Gagny");
  // Formulaire d'ajout d'une tâche+temps ouvert pour un créneau donné : "date|creneau".
  const [ajout, setAjout] = useState<string | null>(null);
  const [aTitre, setATitre] = useState(""); const [aMin, setAMin] = useState("");
  const [busy, setBusy] = useState(false);
  // Tâches par agence
  const [agence, setAgence] = useState("Gagny");
  const [tachesAgence, setTachesAgence] = useState<any[]>([]);

  const charger = useCallback(async () => {
    const [r, p] = await Promise.all([
      fetch("/api/mon-rapport", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
      fetch("/api/pointage", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
    ]);
    if (r?.ok) setD(r);
    if (p?.ok) setPtg({ sessionOuverte: p.sessionOuverte, pointages: p.pointages ?? [] });
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const chargerAgence = useCallback(async (ag: string) => {
    const j = await fetch(`/api/taches?agence=${encodeURIComponent(ag)}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (j?.ok) setTachesAgence((j.taches ?? []).filter((t: any) => !t.fait));
  }, []);
  useEffect(() => { chargerAgence(agence); }, [agence, chargerAgence]);

  async function pointer(action: "entree" | "sortie") {
    setBusy(true);
    try {
      await fetch("/api/pointage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, site }) });
      await charger();
    } finally { setBusy(false); }
  }

  async function ajouterEntree(jour: string, creneau: "matin" | "aprem") {
    const minutes = Math.round(Number(aMin));
    if (!aTitre.trim() || !Number.isFinite(minutes) || minutes <= 0) return;
    setBusy(true);
    try {
      const r = await fetch("/api/mon-rapport", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ajouter", jour, creneau, activite: aTitre.trim(), duree_minutes: minutes }),
      });
      const j = await r.json();
      if (j.ok) { setAjout(null); setATitre(""); setAMin(""); await charger(); }
    } finally { setBusy(false); }
  }

  async function supprimerEntree(id: string) {
    setBusy(true);
    try { await fetch("/api/mon-rapport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "supprimer", id }) }); await charger(); }
    finally { setBusy(false); }
  }

  // Marquer une tâche faite → ouvre la modale « temps passé » (fini le window.prompt natif).
  const [tacheAValider, setTacheAValider] = useState<{ id: string; reloadAgence: boolean } | null>(null);
  function marquerFaite(id: string, reloadAgence = false) { setTacheAValider({ id, reloadAgence }); }
  async function validerTemps(minutes: number) {
    const t = tacheAValider; setTacheAValider(null);
    if (!t) return;
    setBusy(true);
    try {
      await fetch("/api/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, action: "fait", temps_minutes: minutes }) });
      await charger(); if (t.reloadAgence) await chargerAgence(agence);
    } finally { setBusy(false); }
  }

  const lundiFr = d ? new Date(d.semaine + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) : "";
  const so = ptg?.sessionOuverte;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 4px 60px" }}>
      <TempsTacheModal ouvert={!!tacheAValider} onValider={validerTemps} onAnnuler={() => setTacheAValider(null)} />
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>Mon rapport et mes tâches</h1>
      <p style={{ color: "#667085", fontSize: 14, marginTop: 0 }}>Semaine du {lundiFr}. Ajoute tes tâches <b>avec le temps passé</b> : elles s'horodatent à la saisie et remplissent ton rapport.</p>

      {!d ? <p style={{ color: "#98A2B3" }}>Chargement…</p> : (
        <>
          {!d.identifie && <div style={{ background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#B54708", margin: "10px 0" }}>Connecte-toi avec ton compte individuel pour pointer et suivre tes tâches.</div>}

          {/* Pointage */}
          <div style={{ border: "1px solid #E4E7EC", borderRadius: 12, padding: 14, margin: "14px 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>⏱️</span>
            {so ? (
              <>
                <span style={{ fontSize: 14, color: "#344054" }}>Entrée pointée à <b>{heureFr(so.entree_le)}</b>{so.site ? ` · ${so.site}` : ""}</span>
                <button onClick={() => pointer("sortie")} disabled={busy} style={{ background: "#B42318", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginLeft: "auto" }}>Pointer la sortie</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: "#344054" }}>Pas d'entrée en cours.</span>
                <select value={site} onChange={(e) => setSite(e.target.value)} style={{ ...inputS, marginLeft: "auto" }}>
                  {["Gagny", "Sarcelles", "Rosny", "Télétravail", "Autre"].map((s) => <option key={s}>{s}</option>)}
                </select>
                <button onClick={() => pointer("entree")} disabled={busy} style={{ background: "#12B76A", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Je pointe mon entrée</button>
              </>
            )}
          </div>

          {/* Pointages du jour (détail des entrées/sorties + total travaillé) */}
          {(() => {
            const auj = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
            const jour = (ptg?.pointages ?? []).filter((p) => p.jour === auj)
              .sort((a, b) => String(a.entree_le).localeCompare(String(b.entree_le)));
            if (jour.length === 0) return null;
            const totalMin = jour.reduce((s, p) => {
              const fin = p.sortie_le ? new Date(p.sortie_le).getTime() : Date.now();
              return s + Math.max(0, Math.round((fin - new Date(p.entree_le).getTime()) / 60000));
            }, 0);
            return (
              <div style={{ margin: "0 0 14px", padding: "10px 14px", background: "#FCFCFD", border: "1px solid #EEF0F3", borderRadius: 10, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: "#344054", marginBottom: 5 }}>🕒 Mes pointages du jour · <span style={{ color: BLEU }}>{dureeFr(totalMin)}</span> travaillé</div>
                {jour.map((p, i) => (
                  <div key={i} style={{ color: "#475467", display: "flex", gap: 8, padding: "1px 0" }}>
                    <span>🟢 {heureFr(p.entree_le)}</span><span style={{ color: "#98A2B3" }}>→</span>
                    <span>{p.sortie_le ? `🔴 ${heureFr(p.sortie_le)}` : "⏳ en cours"}</span>
                    {p.site && <span style={{ color: "#98A2B3" }}>· {p.site}</span>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Grille de la semaine */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.jours.map((jr) => {
              const tjFaites = d.tachesFaites.filter((t) => String(t.fait_le ?? "").slice(0, 10) === jr.date);
              const minTaches = tjFaites.reduce((s, t) => s + (Number(t.temps_minutes) || 0), 0);
              const minEntrees = d.entrees.filter((e) => e.jour === jr.date).reduce((s, e) => s + (Number(e.duree_minutes) || 0), 0);
              const totalJour = minTaches + minEntrees;
              return (
                <div key={jr.date} style={{ border: "1px solid #E4E7EC", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1D2939" }}>{cap(jr.nom)} <span style={{ color: "#98A2B3", fontWeight: 400 }}>{dateFr(jr.date)}</span></span>
                    {totalJour > 0 && <span style={{ fontSize: 12, color: BLEU, fontWeight: 600 }}>{dureeFr(totalJour)}</span>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(["matin", "aprem"] as const).map((cr) => {
                      const cle = `${jr.date}|${cr}`;
                      const items = d.entrees.filter((e) => e.jour === jr.date && e.creneau === cr);
                      return (
                        <div key={cr} style={{ background: "#FCFCFD", border: "1px solid #EEF0F3", borderRadius: 8, padding: 8 }}>
                          <div style={{ fontSize: 11, color: BLEU, fontWeight: 600, marginBottom: 5 }}>{cr === "matin" ? "Matin" : "Après-midi"} · {cr === "matin" ? d.horaires.matin : d.horaires.aprem}</div>
                          {items.map((e) => (
                            <div key={e.id} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, color: "#344054", marginBottom: 3 }}>
                              <b style={{ color: BLEU }}>{dureeFr(e.duree_minutes)}</b>
                              <span style={{ flex: 1 }}>{e.activite}</span>
                              <span style={{ color: "#98A2B3", fontSize: 10 }} title="Heure de saisie">🕒{heureFr(e.cree_le)}</span>
                              <button onClick={() => supprimerEntree(e.id)} title="Supprimer" style={{ border: "none", background: "none", color: "#D0D5DD", cursor: "pointer", fontSize: 13 }}>✕</button>
                            </div>
                          ))}
                          {ajout === cle ? (
                            <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 5 }}>
                              <input autoFocus value={aTitre} onChange={(e) => setATitre(e.target.value)} placeholder="Tâche réalisée…" style={{ ...inputS, width: "100%" }} />
                              <div style={{ display: "flex", gap: 5 }}>
                                <input type="number" min={1} value={aMin} onChange={(e) => setAMin(e.target.value)} placeholder="min" style={{ ...inputS, width: 64 }} />
                                <button onClick={() => ajouterEntree(jr.date, cr)} disabled={busy} style={{ background: BLEU, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Ajouter</button>
                                <button onClick={() => { setAjout(null); setATitre(""); setAMin(""); }} style={{ border: "none", background: "none", color: "#98A2B3", cursor: "pointer", fontSize: 12 }}>Annuler</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setAjout(cle); setATitre(""); setAMin(""); }} style={{ border: "1px dashed #D0D5DD", background: "none", color: "#667085", borderRadius: 8, padding: "4px 8px", fontSize: 12, cursor: "pointer", width: "100%", marginTop: 2 }}>➕ Ajouter une tâche + temps</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {tjFaites.length > 0 && (
                    <div style={{ marginTop: 8, background: "#F5F8FE", border: "1px solid #E1EBFB", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#475467" }}>
                      ✅ {tjFaites.length} tâche{tjFaites.length > 1 ? "s" : ""} assignée{tjFaites.length > 1 ? "s" : ""} clôturée{tjFaites.length > 1 ? "s" : ""}{minTaches > 0 ? ` · ${dureeFr(minTaches)}` : ""} — {tjFaites.map((t) => t.titre).filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ margin: "14px 0 4px", fontSize: 14, color: "#344054", fontWeight: 600 }}>
            Total de la semaine : <span style={{ color: BLEU }}>{dureeFr(d.totalMinutes)}</span>
          </div>

          {/* Mes tâches à faire */}
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1D2939", margin: "22px 0 8px" }}>📋 Mes tâches à faire</h2>
          {d.mesTaches.length === 0 ? <p style={{ color: "#98A2B3", fontSize: 13 }}>Aucune tâche à faire assignée. 🎉</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.mesTaches.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #E4E7EC", borderRadius: 10, padding: "8px 12px" }}>
                  <span style={{ flex: 1, fontSize: 13, color: "#344054" }}>{t.titre} <span style={{ color: "#98A2B3", fontSize: 11 }}>· {t.agence}{t.echeance ? ` · échéance ${dateFr(t.echeance)}` : ""}</span></span>
                  <button onClick={() => marquerFaite(t.id)} disabled={busy} style={{ background: "#12B76A", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✓ Fait (avec temps)</button>
                </div>
              ))}
            </div>
          )}

          {/* Tâches par agence */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 8px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1D2939", margin: 0 }}>🏢 Tâches de l'agence</h2>
            <select value={agence} onChange={(e) => setAgence(e.target.value)} style={{ ...inputS }}>{AGENCES.map((a) => <option key={a}>{a}</option>)}</select>
          </div>
          {tachesAgence.length === 0 ? <p style={{ color: "#98A2B3", fontSize: 13 }}>Aucune tâche à faire pour {agence}.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tachesAgence.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #E4E7EC", borderRadius: 10, padding: "8px 12px" }}>
                  <span style={{ flex: 1, fontSize: 13, color: "#344054" }}>{t.titre} <span style={{ color: "#98A2B3", fontSize: 11 }}>{t.assignee_nom ? `· ${t.assignee_nom}` : "· non assignée"}{t.echeance ? ` · échéance ${dateFr(t.echeance)}` : ""}</span></span>
                  <button onClick={() => marquerFaite(t.id, true)} disabled={busy} style={{ background: "#12B76A", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✓ Fait (avec temps)</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
