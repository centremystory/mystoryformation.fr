"use client";
// app/planning-employes/page.tsx — Planning de travail des employés (RH), vue CALENDRIER + liste.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";
import { LIEUX_TRAVAIL } from "@/lib/sites";

type Creneau = {
  id: string; utilisateur_id: string; date_jour: string; heure_debut: string | null; heure_fin: string | null;
  site: string; note: string | null; auteur: string | null;
  utilisateurs?: { nom: string | null; prenom: string | null } | null;
};
type Employe = { id: string; nom: string | null; prenom: string | null };
type Conge = { id: string; utilisateur_id: string; type: string; date_debut: string; date_fin: string; statut: string };

const SITES = LIEUX_TRAVAIL;
const JOURS_LBL = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const CONGE_LBL: Record<string, string> = { conges_payes: "Congés", sans_solde: "Sans solde", maladie: "Maladie", rtt: "RTT", autre: "Absence" };

function lundiDe(ref: Date): Date { const d = new Date(ref); const j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); d.setHours(12, 0, 0, 0); return d; }
function addJours(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function jourMois(d: Date): string { return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); }
function dateLongue(s: string): string { try { return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); } catch { return s; } }
function hhmm(t: string | null): string { return t ? t.slice(0, 5) : ""; }
function nomDe(e: Employe): string { return [e.prenom, e.nom].filter(Boolean).join(" ") || "—"; }

export default function PagePlanningEmployes() {
  const toast = useToast();
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [conges, setConges] = useState<Conge[]>([]);
  const [peutGerer, setPeutGerer] = useState(false);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vue, setVue] = useState<"calendrier" | "liste">("calendrier");
  const [lundi, setLundi] = useState<Date>(() => lundiDe(new Date()));

  const [fEmploye, setFEmploye] = useState("");
  const [fSite, setFSite] = useState("");

  const [utilisateurId, setUtilisateurId] = useState("");
  const [dateJour, setDateJour] = useState("");
  const [heureDebut, setHeureDebut] = useState("");
  const [heureFin, setHeureFin] = useState("");
  const [site, setSite] = useState("Gagny");
  const [note, setNote] = useState("");
  const [editId, setEditId] = useState<string | null>(null); // créneau en cours de modification
  const formRef = useRef<HTMLDivElement>(null);

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => addJours(lundi, i)), [lundi]);
  const jourStrings = useMemo(() => jours.map(iso), [jours]);

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const p = new URLSearchParams();
      if (fEmploye) p.set("employe", fEmploye);
      if (fSite) p.set("site", fSite);
      p.set("depuis", iso(jours[0])); p.set("jusqu", iso(jours[6]));
      const [rp, rc] = await Promise.all([
        fetch(`/api/planning-employes?${p.toString()}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/conges`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false })),
      ]);
      if (!rp.ok) { setErr(rp.erreur || "Erreur de chargement."); return; }
      setCreneaux(rp.creneaux); setPeutGerer(rp.peutGerer); setEmployes(rp.employes ?? []);
      setConges(rc.ok ? (rc.demandes ?? []).filter((c: Conge) => !["refuse", "annule", "refusee", "annulee"].includes(c.statut)) : []);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, [fEmploye, fSite, jours]);
  useEffect(() => { charger(); }, [charger]);

  async function affecter() {
    if (!utilisateurId) { setErr("Choisis un employé."); return; }
    if (!dateJour) { setErr("Choisis une date."); return; }
    setBusy(true); setErr(null);
    try {
      // Édition d'un créneau existant → PATCH (champs) ; sinon création → POST.
      const j = editId
        ? await fetch("/api/planning-employes", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editId, site, note, heureDebut, heureFin }),
          }).then((r) => r.json())
        : await fetch("/api/planning-employes", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ utilisateurId, dateJour, heureDebut, heureFin, site, note }),
          }).then((r) => r.json());
      if (!j.ok) { setErr(j.erreur || "Enregistrement impossible."); return; }
      annulerEdition();
      await charger();
    } catch (e: any) { setErr(e?.message || "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  function modifier(c: Creneau) {
    if (!peutGerer) return;
    setEditId(c.id); setUtilisateurId(c.utilisateur_id); setDateJour(c.date_jour);
    setHeureDebut(hhmm(c.heure_debut)); setHeureFin(hhmm(c.heure_fin));
    setSite(c.site || "Gagny"); setNote(c.note ?? "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function annulerEdition() {
    setEditId(null); setNote(""); setHeureDebut(""); setHeureFin("");
  }

  async function supprimer(id: string) {
    try {
      await apiFetch("/api/planning-employes", { method: "PATCH", body: JSON.stringify({ id, action: "supprimer" }) });
      toast.success("Créneau retiré."); await charger();
    } catch (e: any) { toast.error(e?.message ?? "Suppression impossible — réessayez."); }
  }

  // Cliquer une case (employé × jour) → préremplit le formulaire d'affectation.
  function preremplir(empId: string, jourIso: string) {
    if (!peutGerer) return;
    setUtilisateurId(empId); setDateJour(jourIso);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const creneauxDe = (empId: string, jourIso: string) => creneaux.filter((c) => c.utilisateur_id === empId && c.date_jour === jourIso);
  const congeDe = (empId: string, jourIso: string) => conges.find((c) => c.utilisateur_id === empId && c.date_debut <= jourIso && jourIso <= c.date_fin) ?? null;

  // Lignes du calendrier : les employés (encadrement) ou une ligne « moi ».
  const lignes: Employe[] = peutGerer
    ? (fEmploye ? employes.filter((e) => e.id === fEmploye) : employes)
    : [{ id: creneaux[0]?.utilisateur_id ?? "moi", nom: "Mes créneaux", prenom: null }];

  const parJour = useMemo(() => {
    const m = new Map<string, Creneau[]>();
    for (const c of creneaux) { if (!m.has(c.date_jour)) m.set(c.date_jour, []); m.get(c.date_jour)!.push(c); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [creneaux]);

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Planning équipe</h1>
          <p className="page-subtitle">{peutGerer ? "Présences par employé et par site · congés superposés. Clique une case pour affecter un créneau." : "Tes créneaux de travail et tes congés."}</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
          {(["calendrier", "liste"] as const).map((v) => (
            <button key={v} onClick={() => setVue(v)} className={`px-3 py-1.5 text-sm ${vue === v ? "bg-mystory text-white" : "bg-white text-gray-700"}`}>
              {v === "calendrier" ? "📅 Calendrier" : "Liste"}
            </button>
          ))}
        </div>
      </header>

      {/* Navigation semaine */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button onClick={() => setLundi(addJours(lundi, -7))} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm hover:border-mystory">◀ Semaine</button>
        <span className="text-sm font-medium text-gray-700">{jourMois(jours[0])} → {jourMois(jours[6])} {jours[6].getFullYear()}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setLundi(lundiDe(new Date()))} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm hover:border-mystory">Aujourd'hui</button>
          <button onClick={() => setLundi(addJours(lundi, 7))} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm hover:border-mystory">Semaine ▶</button>
        </div>
      </div>

      {peutGerer && (
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={fEmploye} onChange={(e) => setFEmploye(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Tous les employés</option>
            {employes.map((e) => <option key={e.id} value={e.id}>{nomDe(e)}</option>)}
          </select>
          <select value={fSite} onChange={(e) => setFSite(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Tous les sites</option>
            {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <a href="/conges" className="ml-auto self-center text-sm text-mystory underline">Gérer les congés →</a>
        </div>
      )}

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : vue === "calendrier" ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-xs text-gray-500 min-w-[130px]">Employé</th>
                {jours.map((d, i) => {
                  const est = iso(d) === iso(new Date());
                  return <th key={i} className={`border-b border-gray-200 px-2 py-2 text-center text-xs ${est ? "bg-mystory-clair text-mystory font-bold" : "text-gray-500"}`}>{JOURS_LBL[i]}<br /><span className="font-normal">{d.getDate()}</span></th>;
                })}
              </tr>
            </thead>
            <tbody>
              {lignes.map((emp) => (
                <tr key={emp.id} className="align-top">
                  <td className="sticky left-0 z-10 bg-white border-b border-r border-gray-200 px-3 py-2 font-medium text-gray-800">{nomDe(emp)}</td>
                  {jourStrings.map((js) => {
                    const cs = creneauxDe(emp.id, js);
                    const cg = congeDe(emp.id, js);
                    return (
                      <td key={js} onClick={() => preremplir(emp.id, js)}
                        className={`border-b border-gray-100 px-1.5 py-1.5 align-top ${peutGerer ? "cursor-pointer hover:bg-blue-50/50" : ""}`} style={{ minWidth: 90 }}>
                        {cg && (
                          <div className={`mb-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-center ${cg.statut === "approuve" || cg.statut === "approuvee" ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-700 border border-dashed border-amber-300"}`}>
                            {CONGE_LBL[cg.type] ?? "Absence"}{cg.statut !== "approuve" && cg.statut !== "approuvee" ? " ?" : ""}
                          </div>
                        )}
                        {cs.map((c) => (
                          <div key={c.id} className="mb-1 rounded bg-mystory-clair/70 px-1.5 py-1 text-[11px] text-mystory-fonce">
                            <div className="font-semibold">{c.site}</div>
                            {(c.heure_debut || c.heure_fin) && <div>{hhmm(c.heure_debut)}{c.heure_fin ? `–${hhmm(c.heure_fin)}` : ""}</div>}
                            {c.note && <div className="text-gray-500 truncate" title={c.note}>{c.note}</div>}
                            {peutGerer && <button onClick={(e) => { e.stopPropagation(); modifier(c); }} className="text-[10px] text-gray-400 hover:text-mystory">modifier</button>}
                            {peutGerer && <button onClick={(e) => { e.stopPropagation(); supprimer(c.id); }} className="text-[10px] text-gray-400 hover:text-red-600">retirer</button>}
                          </div>
                        ))}
                        {peutGerer && cs.length === 0 && !cg && <div className="text-center text-gray-300 text-lg leading-none">+</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : parJour.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun créneau cette semaine.</p>
      ) : (
        <div className="space-y-5">
          {parJour.map(([jour, items]) => (
            <div key={jour}>
              <h3 className="text-sm font-semibold text-gray-700 capitalize mb-2">{dateLongue(jour)}</h3>
              <div className="space-y-2">
                {items.map((c) => (
                  <div key={c.id} className="border border-gray-200 rounded-xl bg-white p-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{c.site}</span>
                    {peutGerer && <span className="font-medium text-gray-900 text-sm">{[c.utilisateurs?.prenom, c.utilisateurs?.nom].filter(Boolean).join(" ") || "—"}</span>}
                    {(c.heure_debut || c.heure_fin) && <span className="text-sm text-gray-600">{hhmm(c.heure_debut)}{c.heure_fin ? `–${hhmm(c.heure_fin)}` : ""}</span>}
                    {c.note && <span className="text-sm text-gray-500">· {c.note}</span>}
                    <span className="flex-1" />
                    {peutGerer && <button onClick={() => modifier(c)} className="text-xs text-gray-400 hover:text-mystory">Modifier</button>}
                    {peutGerer && <button onClick={() => supprimer(c.id)} className="text-xs text-gray-400 hover:text-red-600">Retirer</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {peutGerer && (
        <section ref={formRef} className="card mt-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">{editId ? "Modifier le créneau" : "Affecter un créneau"} {dateJour && <span className="text-mystory">· {dateLongue(dateJour)}</span>}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={utilisateurId} onChange={(e) => setUtilisateurId(e.target.value)} className="input">
              <option value="">— Employé —</option>
              {employes.map((e) => <option key={e.id} value={e.id}>{nomDe(e)}</option>)}
            </select>
            <select value={site} onChange={(e) => setSite(e.target.value)} className="input">
              {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="text-sm text-gray-600 flex items-center gap-2">Jour <input type="date" value={dateJour} onChange={(e) => setDateJour(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1" /></label>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              De <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              à <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (poste, tâche…)" className="w-full input mt-2" />
          {editId && <p className="mt-2 text-xs text-gray-400">Modification d'un créneau existant (employé et jour figés — retire-le et recrée pour les changer).</p>}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={affecter} disabled={busy} className="btn-primary">{busy ? "Enregistrement…" : editId ? "Enregistrer les modifications" : "Affecter"}</button>
            {editId && <button onClick={annulerEdition} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-sm">Annuler</button>}
          </div>
        </section>
      )}
    </main>
  );
}
