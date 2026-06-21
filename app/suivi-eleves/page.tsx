"use client";
// app/suivi-eleves/page.tsx — Suivi des élèves en formation : progression (heures faites/à venir),
// absences, prochaine séance. Filtre par agence + recherche. Lecture seule (actions sur /planning).
import { useCallback, useEffect, useMemo, useState } from "react";

const CERTIF: Record<string, string> = { TEF_IRN: "TEF IRN", LEVELTEL: "LEVELTEL" };

type Eleve = {
  dossier_id: string;
  certif: string | null;
  statut: string | null;
  heures_prevues: number;
  stagiaire: string;
  agence: string | null;
  heures_faites: number;
  heures_a_venir: number;
  nb_absences: number;
  nb_seances: number;
  prochaine_date: string | null;
};

function dateCourteFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }); }
  catch { return iso; }
}

type Jour = {
  date: string; demi: string; heures: number; heures_realisees: number | null;
  statut: string; motif: string | null; walk_in: boolean; contenu: string | null;
};
type Cours = {
  id: string; numero_cours: number | null; date_cours: string | null;
  contenu_fait: string | null; points_forts: string | null; points_faibles: string | null;
  satisfaction: number | null; auteur: string | null; cree_le: string;
};
type FormCours = { numero: string; date: string; contenu: string; forts: string; faibles: string; satis: string };
const F0: FormCours = { numero: "", date: "", contenu: "", forts: "", faibles: "", satis: "" };
const DEMI_LBL: Record<string, string> = { matin: "Matin", apres_midi: "Après-midi" };
const STATUT_JOUR: Record<string, { t: string; c: string }> = {
  present: { t: "✅ Présent", c: "bg-green-100 text-green-800" },
  absent: { t: "❌ Absent", c: "bg-red-100 text-red-700" },
  a_venir: { t: "À venir", c: "bg-gray-100 text-gray-500" },
  non_emarge: { t: "⬜ Non émargé", c: "bg-amber-100 text-amber-800" },
};

type EvalDetail = { phase: string; ce_sur10: number | null; co_sur10: number | null; ee_sur10: number | null; eo_sur10: number | null; total_sur20: number | null; niveau_global: string | null; complete_le: string | null };
type Progression = { niveaux: { niveau_initial: string | null; niveau_vise: string | null; niveau_atteint: string | null } | null; initial: EvalDetail | null; final: EvalDetail | null };

export default function PageSuiviEleves() {
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [fAgence, setFAgence] = useState<string>("toutes");
  const [detail, setDetail] = useState<Record<string, Jour[]>>({});
  const [ouvert, setOuvert] = useState<Set<string>>(new Set());
  const [chargeJours, setChargeJours] = useState<Set<string>>(new Set());
  const [cours, setCours] = useState<Record<string, Cours[]>>({});
  const [chargeCours, setChargeCours] = useState<Set<string>>(new Set());
  const [prog, setProg] = useState<Record<string, Progression>>({});
  const [form, setForm] = useState<Record<string, FormCours>>({});
  const [envoi, setEnvoi] = useState<Set<string>>(new Set());
  const [erreurForm, setErreurForm] = useState<Record<string, string | null>>({});
  const getForm = (id: string) => form[id] ?? F0;
  const setF = (id: string, patch: Partial<FormCours>) => setForm((f) => ({ ...f, [id]: { ...(f[id] ?? F0), ...patch } }));

  async function basculerJours(dossierId: string) {
    setOuvert((prev) => {
      const n = new Set(prev);
      n.has(dossierId) ? n.delete(dossierId) : n.add(dossierId);
      return n;
    });
    if (!detail[dossierId]) {
      setChargeJours((p) => new Set(p).add(dossierId));
      try {
        const r = await fetch(`/api/suivi-eleves?dossier=${encodeURIComponent(dossierId)}`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) setDetail((d) => ({ ...d, [dossierId]: j.jours }));
      } catch { /* silencieux : le bouton reste utilisable */ }
      finally { setChargeJours((p) => { const n = new Set(p); n.delete(dossierId); return n; }); }
    }
    if (!cours[dossierId]) {
      setChargeCours((p) => new Set(p).add(dossierId));
      try {
        const r = await fetch(`/api/suivi-cours?dossier=${encodeURIComponent(dossierId)}`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) setCours((c) => ({ ...c, [dossierId]: j.cours }));
      } catch { /* silencieux */ }
      finally { setChargeCours((p) => { const n = new Set(p); n.delete(dossierId); return n; }); }
    }
    if (!prog[dossierId]) {
      try {
        const r = await fetch(`/api/tests/progression?dossier=${encodeURIComponent(dossierId)}`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) setProg((pr) => ({ ...pr, [dossierId]: { niveaux: j.niveaux, initial: j.initial, final: j.final } }));
      } catch { /* silencieux */ }
    }
  }

  async function ajouterCours(dossierId: string) {
    const f = getForm(dossierId);
    setErreurForm((e) => ({ ...e, [dossierId]: null }));
    setEnvoi((p) => new Set(p).add(dossierId));
    try {
      const r = await fetch("/api/suivi-cours", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier_id: dossierId,
          numero_cours: f.numero || null, date_cours: f.date || null,
          contenu_fait: f.contenu, points_forts: f.forts, points_faibles: f.faibles,
          satisfaction: f.satis || null,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErreurForm((e) => ({ ...e, [dossierId]: j.erreur || "Erreur." })); return; }
      setCours((c) => ({ ...c, [dossierId]: [...(c[dossierId] ?? []), j.entree] }));
      setForm((ff) => ({ ...ff, [dossierId]: F0 }));
    } catch { setErreurForm((e) => ({ ...e, [dossierId]: "Erreur réseau." })); }
    finally { setEnvoi((p) => { const n = new Set(p); n.delete(dossierId); return n; }); }
  }

  async function archiverCours(dossierId: string, id: string) {
    if (!confirm("Archiver cette entrée de suivi ?")) return;
    try {
      const r = await fetch("/api/suivi-cours", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await r.json();
      if (j.ok) setCours((c) => ({ ...c, [dossierId]: (c[dossierId] ?? []).filter((x) => x.id !== id) }));
    } catch { /* silencieux */ }
  }

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/suivi-eleves", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setEleves(j.eleves);
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const q = recherche.trim().toLowerCase();
  const filtres = useMemo(
    () => eleves.filter((e) => {
      if (fAgence !== "toutes" && (e.agence ?? "") !== fAgence) return false;
      if (q && !e.stagiaire.toLowerCase().includes(q)) return false;
      return true;
    }),
    [eleves, fAgence, q]
  );

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Suivi des élèves</h1>
          <p className="page-subtitle">Progression, absences et prochaine séance. Lieu de formation : <strong>Gagny</strong>.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un élève…"
          className="input w-56 bg-white" />
        <div className="flex gap-1.5">
          {([["toutes", "Toutes agences"], ["Gagny", "Gagny"], ["Sarcelles", "Sarcelles"], ["Rosny", "Rosny"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFAgence(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                fAgence === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {erreur && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{erreur}</div>}

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : filtres.length === 0 ? (
        <p className="text-gray-500">Aucun élève {fAgence !== "toutes" ? `pour ${fAgence}` : "en formation"}.</p>
      ) : (
        <div className="space-y-2">
          {filtres.map((e) => {
            const pct = e.heures_prevues > 0 ? Math.min(100, Math.round((e.heures_faites / e.heures_prevues) * 100)) : 0;
            return (
              <div key={e.dossier_id} className="card !px-4 !py-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900">{e.stagiaire}</span>
                    <span className="text-gray-400 text-sm"> · {CERTIF[e.certif ?? ""] ?? e.certif}</span>
                  </span>
                  {e.agence && <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{e.agence}</span>}
                  {e.nb_absences > 0 && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                      {e.nb_absences} absence{e.nb_absences > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-mystory" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 text-xs text-gray-500 tabular-nums">
                    {e.heures_faites}/{e.heures_prevues} h faites
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-gray-400">
                  {e.heures_a_venir} h à venir · prochaine séance : <strong className="text-gray-600">{dateCourteFr(e.prochaine_date)}</strong>
                </div>

                <button onClick={() => basculerJours(e.dossier_id)} className="mt-2 text-xs text-mystory underline">
                  {ouvert.has(e.dossier_id) ? "Masquer le détail jour par jour" : "Voir le détail jour par jour"}
                </button>
                {ouvert.has(e.dossier_id) && (
                  <div className="mt-2 border-t border-gray-100 pt-2 overflow-x-auto">
                    <ProgressionBloc p={prog[e.dossier_id]} />
                    {chargeJours.has(e.dossier_id) && !detail[e.dossier_id] ? (
                      <p className="text-xs text-gray-400">Chargement…</p>
                    ) : (detail[e.dossier_id]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-gray-400">Aucune séance enregistrée.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-gray-400">
                          <th className="py-1 pr-2 font-medium">Date</th>
                          <th className="py-1 pr-2 font-medium">Demi-journée</th>
                          <th className="py-1 pr-2 font-medium">Heures</th>
                          <th className="py-1 pr-2 font-medium">Présence</th>
                          <th className="py-1 font-medium">Contenu</th>
                        </tr></thead>
                        <tbody>
                          {detail[e.dossier_id].map((j, i) => {
                            const b = STATUT_JOUR[j.statut] ?? STATUT_JOUR.non_emarge;
                            return (
                              <tr key={i} className="border-t border-gray-50 align-top">
                                <td className="py-1 pr-2 whitespace-nowrap text-gray-700">{dateCourteFr(j.date)}</td>
                                <td className="py-1 pr-2 text-gray-600">{DEMI_LBL[j.demi] ?? j.demi}{j.walk_in && <span className="ml-1 text-[10px] px-1 rounded bg-amber-100 text-amber-800">walk-in</span>}</td>
                                <td className="py-1 pr-2 text-gray-600 tabular-nums">{j.heures_realisees != null ? j.heures_realisees : j.heures} h</td>
                                <td className="py-1 pr-2"><span className={`px-1.5 py-0.5 rounded ${b.c}`}>{b.t}</span>{j.statut === "absent" && j.motif ? <span className="text-gray-400"> · {j.motif}</span> : ""}</td>
                                <td className="py-1 text-gray-500">{j.contenu || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {ouvert.has(e.dossier_id) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="mb-2 text-xs font-semibold text-gray-600">Suivi pédagogique — cours par cours</p>
                    {chargeCours.has(e.dossier_id) && !cours[e.dossier_id] ? (
                      <p className="text-xs text-gray-400">Chargement…</p>
                    ) : (cours[e.dossier_id]?.length ?? 0) === 0 ? (
                      <p className="mb-2 text-xs text-gray-400">Aucune entrée de suivi pour le moment.</p>
                    ) : (
                      <ul className="mb-3 space-y-2">
                        {cours[e.dossier_id].map((co) => (
                          <li key={co.id} className="rounded-lg bg-gray-50 p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-700">
                                {co.numero_cours != null ? `Cours ${co.numero_cours}` : "Cours"}{co.date_cours ? ` · ${dateCourteFr(co.date_cours)}` : ""}
                                {co.satisfaction != null && <span className="ml-1 text-amber-600">{"★".repeat(co.satisfaction)}{"☆".repeat(5 - co.satisfaction)}</span>}
                              </span>
                              <button onClick={() => archiverCours(e.dossier_id, co.id)} className="text-gray-400 hover:text-red-600">Archiver</button>
                            </div>
                            {co.contenu_fait && <p className="mt-1 text-gray-600"><span className="text-gray-400">Fait : </span>{co.contenu_fait}</p>}
                            {co.points_forts && <p className="text-emerald-700"><span className="text-gray-400">Points forts : </span>{co.points_forts}</p>}
                            {co.points_faibles && <p className="text-amber-700"><span className="text-gray-400">À renforcer : </span>{co.points_faibles}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="rounded-lg border border-gray-200 p-2">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <input type="number" min={1} value={getForm(e.dossier_id).numero} onChange={(ev) => setF(e.dossier_id, { numero: ev.target.value })} placeholder="N° cours" className="input w-24 bg-white !py-1 text-xs" />
                        <input type="date" value={getForm(e.dossier_id).date} onChange={(ev) => setF(e.dossier_id, { date: ev.target.value })} className="input w-40 bg-white !py-1 text-xs" />
                        <select value={getForm(e.dossier_id).satis} onChange={(ev) => setF(e.dossier_id, { satis: ev.target.value })} className="input w-44 bg-white !py-1 text-xs">
                          <option value="">Satisfaction (fin de cours)…</option>
                          <option value="5">★★★★★ Très satisfait</option>
                          <option value="4">★★★★ Satisfait</option>
                          <option value="3">★★★ Moyen</option>
                          <option value="2">★★ Peu satisfait</option>
                          <option value="1">★ Insatisfait</option>
                        </select>
                      </div>
                      <textarea value={getForm(e.dossier_id).contenu} onChange={(ev) => setF(e.dossier_id, { contenu: ev.target.value })} placeholder="Contenu travaillé pendant le cours…" rows={2} className="input mb-2 w-full bg-white !py-1 text-xs" />
                      <div className="mb-2 flex flex-wrap gap-2">
                        <textarea value={getForm(e.dossier_id).forts} onChange={(ev) => setF(e.dossier_id, { forts: ev.target.value })} placeholder="Points forts" rows={2} className="input min-w-[140px] flex-1 bg-white !py-1 text-xs" />
                        <textarea value={getForm(e.dossier_id).faibles} onChange={(ev) => setF(e.dossier_id, { faibles: ev.target.value })} placeholder="Points à renforcer" rows={2} className="input min-w-[140px] flex-1 bg-white !py-1 text-xs" />
                      </div>
                      {erreurForm[e.dossier_id] && <p className="mb-1 text-xs text-red-600">{erreurForm[e.dossier_id]}</p>}
                      <button onClick={() => ajouterCours(e.dossier_id)} disabled={envoi.has(e.dossier_id)} className="btn-primary !py-1 !text-xs">
                        {envoi.has(e.dossier_id) ? "Ajout…" : "Ajouter l'entrée"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Les présences proviennent de l'émargement signé ; les absences se marquent depuis le <a href="/planning" className="text-mystory underline">planning</a> (séances passées non émargées).
      </p>
    </main>
  );
}

function NiveauBadge({ label, valeur, ton }: { label: string; valeur: string | null; ton: string }) {
  return (
    <div className={`rounded-lg border px-3 py-1.5 text-center ${ton}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-bold">{valeur ?? "—"}</div>
    </div>
  );
}

function DetailEval({ titre, ev }: { titre: string; ev: EvalDetail | null }) {
  if (!ev) return null;
  const n = (x: number | null) => (x == null ? "—" : x);
  return (
    <p className="text-[11px] text-gray-500">
      <span className="font-medium text-gray-600">{titre} :</span> CE {n(ev.ce_sur10)}/10 · CO {n(ev.co_sur10)}/10 · EE {n(ev.ee_sur10)}/10 · EO {n(ev.eo_sur10)}/10 · <strong className="text-gray-700">{ev.total_sur20 ?? "—"}/20</strong>{ev.niveau_global ? ` → ${ev.niveau_global}` : ""}
    </p>
  );
}

function ProgressionBloc({ p }: { p: Progression | undefined }) {
  if (!p) return <p className="mb-2 text-xs text-gray-400">Chargement de la progression…</p>;
  const niv = p.niveaux;
  const initial = niv?.niveau_initial ?? p.initial?.niveau_global ?? null;
  const atteint = niv?.niveau_atteint ?? p.final?.niveau_global ?? null;
  const rien = !initial && !niv?.niveau_vise && !atteint && !p.initial && !p.final;
  if (rien) return null;
  return (
    <div className="mb-3 rounded-xl bg-mystory-clair/40 p-3">
      <p className="mb-2 text-xs font-semibold text-mystory">Progression</p>
      <div className="flex flex-wrap items-center gap-2">
        <NiveauBadge label="Initial" valeur={initial} ton="border-gray-200 bg-white text-gray-700" />
        <span className="text-gray-300">→</span>
        <NiveauBadge label="Visé" valeur={niv?.niveau_vise ?? null} ton="border-mystory/30 bg-white text-mystory" />
        <span className="text-gray-300">→</span>
        <NiveauBadge label="Atteint" valeur={atteint} ton={atteint ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-400"} />
      </div>
      <div className="mt-2 space-y-0.5">
        <DetailEval titre="Test initial" ev={p.initial} />
        <DetailEval titre="Test final" ev={p.final} />
      </div>
    </div>
  );
}
