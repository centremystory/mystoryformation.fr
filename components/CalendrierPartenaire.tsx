"use client";
// components/CalendrierPartenaire.tsx — Les candidats d'un organisme partenaire, sur un calendrier.
//
// 10/09/2026 — l'onglet « Mon calendrier » du portail existait mais n'affichait que la
// liste. Un partenaire qui dépose 140 candidats par mois ne lit pas une liste : il veut
// voir sa semaine. Deux vues, sur les mêmes données (aucun appel réseau de plus) :
//
//   SEMAINE — grille jours × heures, chaque candidat posé sur son créneau réel.
//             C'est la vue de travail : « qui ai-je mardi après-midi ».
//   MOIS    — vue d'ensemble, pour préparer le mois et repérer les creux.
//
// Les horaires viennent du texte de la session (« 14h-17h », « 17h30-18h30 ») : on les
// analyse plutôt que de les coder en dur, parce que les créneaux changent par centre.

import { useMemo, useState } from "react";

const BLEU = "#2F72DE";

type Session = { type: string; date: string; horaire: string; centre: string | null };
export type DemandeCal = {
  id: string; nom: string; prenom: string; statut: string;
  sous_type?: string | null; session: Session | null;
};

/** Couleur par statut — la même sémantique que les pastilles de la liste. */
const TON: Record<string, { bg: string; bord: string; texte: string }> = {
  confirmee:  { bg: "#ECFDF5", bord: "#059669", texte: "#065F46" },
  en_attente: { bg: "#FFFBEB", bord: "#D97706", texte: "#92400E" },
  refusee:    { bg: "#FEF2F2", bord: "#DC2626", texte: "#991B1B" },
  annulee:    { bg: "#F3F4F6", bord: "#9CA3AF", texte: "#4B5563" },
};
const ton = (s: string) => TON[s] ?? TON.annulee;

const JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
              "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 14h-17h » → {debut: 14, fin: 17} · « 17h30-18h30 » → {debut: 17.5, fin: 18.5} */
function plage(horaire: string | null | undefined) {
  if (!horaire) return null;
  const m = horaire.match(/(\d{1,2})\s*h\s*(\d{2})?\s*[-–—à]+\s*(\d{1,2})\s*h\s*(\d{2})?/i);
  if (!m) return null;
  const debut = Number(m[1]) + Number(m[2] ?? 0) / 60;
  const fin = Number(m[3]) + Number(m[4] ?? 0) / 60;
  return fin > debut ? { debut, fin } : null;
}

/** Date locale sans dérive de fuseau : on ne passe jamais par new Date("2026-09-14"). */
function duJour(iso: string) {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, j);
}
const cle = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Le lundi de la semaine contenant d. */
function lundi(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
const ajoute = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export default function CalendrierPartenaire({ demandes }: { demandes: DemandeCal[] }) {
  const [mode, setMode] = useState<"semaine" | "mois">("semaine");
  const [ancre, setAncre] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

  // Les candidats rangés par jour, une seule fois : les deux vues y puisent.
  const parJour = useMemo(() => {
    const m: Record<string, DemandeCal[]> = {};
    for (const d of demandes) {
      if (!d.session?.date) continue;
      const k = d.session.date.slice(0, 10);
      (m[k] ||= []).push(d);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (plage(a.session?.horaire)?.debut ?? 0) - (plage(b.session?.horaire)?.debut ?? 0));
    }
    return m;
  }, [demandes]);

  // Amplitude horaire réelle : inutile d'afficher 3 h du matin si rien n'y tombe.
  const [hDeb, hFin] = useMemo(() => {
    let min = 9, max = 19;
    for (const d of demandes) {
      const p = plage(d.session?.horaire);
      if (!p) continue;
      min = Math.min(min, Math.floor(p.debut));
      max = Math.max(max, Math.ceil(p.fin));
    }
    return [min, max];
  }, [demandes]);

  const aujourdhui = cle(new Date());
  const HAUTEUR = 52;                               // pixels par heure

  // ── Vue SEMAINE ────────────────────────────────────────────────────────────
  const debutSemaine = lundi(ancre);
  const jours = Array.from({ length: 7 }, (_, i) => ajoute(debutSemaine, i));
  const finSemaine = jours[6];

  const titre = mode === "semaine"
    ? (debutSemaine.getMonth() === finSemaine.getMonth()
        ? `${MOIS[debutSemaine.getMonth()]} ${debutSemaine.getFullYear()}`
        : `${MOIS[debutSemaine.getMonth()]} – ${MOIS[finSemaine.getMonth()]} ${finSemaine.getFullYear()}`)
    : `${MOIS[ancre.getMonth()]} ${ancre.getFullYear()}`;

  function deplacer(sens: number) {
    setAncre((d) => {
      const x = new Date(d);
      if (mode === "semaine") x.setDate(x.getDate() + 7 * sens);
      else x.setMonth(x.getMonth() + sens);
      return x;
    });
  }

  // ── Vue MOIS ───────────────────────────────────────────────────────────────
  const grilleMois = useMemo(() => {
    const premier = new Date(ancre.getFullYear(), ancre.getMonth(), 1);
    const debut = lundi(premier);
    return Array.from({ length: 42 }, (_, i) => ajoute(debut, i));
  }, [ancre]);

  const total = demandes.filter((d) => d.session?.date).length;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* ── Barre de navigation ──────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold capitalize text-gray-900">{titre}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {total === 0 ? "Aucun candidat placé sur une session."
              : `${total} candidat${total > 1 ? "s" : ""} sur vos sessions`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            {(["semaine", "mois"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                      className={`px-3 py-1.5 text-sm font-medium capitalize ${
                        mode === m ? "text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                      style={mode === m ? { background: BLEU } : undefined}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => deplacer(-1)} aria-label="Précédent"
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">‹</button>
            <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAncre(d); }}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Aujourd&apos;hui
            </button>
            <button onClick={() => deplacer(1)} aria-label="Suivant"
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50">›</button>
          </div>
        </div>
      </div>

      {/* ── SEMAINE ──────────────────────────────────────────────────────── */}
      {mode === "semaine" && (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {/* en-tête des jours */}
            <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              <div />
              {jours.map((j) => {
                const cejour = cle(j) === aujourdhui;
                return (
                  <div key={cle(j)} className="px-1 pb-2 text-center">
                    <div className="text-xs text-gray-500">{JOURS[(j.getDay() + 6) % 7]}</div>
                    <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                      cejour ? "text-white" : "text-gray-900"}`}
                      style={cejour ? { background: BLEU } : undefined}>
                      {j.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* grille horaire */}
            <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              {/* colonne des heures */}
              <div>
                {Array.from({ length: hFin - hDeb }, (_, i) => (
                  <div key={i} style={{ height: HAUTEUR }} className="relative">
                    <span className="absolute -top-2 right-2 text-[11px] tabular-nums text-gray-400">
                      {String(hDeb + i).padStart(2, "0")}:00
                    </span>
                  </div>
                ))}
              </div>

              {jours.map((j) => {
                const k = cle(j);
                const duJourLa = parJour[k] ?? [];
                const weekend = j.getDay() === 0 || j.getDay() === 6;
                return (
                  <div key={k} className={`relative border-l border-gray-100 ${weekend ? "bg-gray-50/60" : ""}`}>
                    {Array.from({ length: hFin - hDeb }, (_, i) => (
                      <div key={i} style={{ height: HAUTEUR }} className="border-b border-gray-100" />
                    ))}

                    {/* les candidats, regroupés par créneau pour ne pas empiler 10 blocs */}
                    {Object.entries(
                      duJourLa.reduce((acc: Record<string, DemandeCal[]>, d) => {
                        const h = d.session?.horaire ?? "—";
                        (acc[h] ||= []).push(d); return acc;
                      }, {})
                    ).map(([horaire, liste]) => {
                      const p = plage(horaire);
                      if (!p) return null;
                      const haut = (p.debut - hDeb) * HAUTEUR;
                      const h = Math.max((p.fin - p.debut) * HAUTEUR, 34);
                      const t = ton(liste[0].statut);
                      return (
                        <div key={horaire}
                             className="absolute left-1 right-1 overflow-hidden rounded-md px-2 py-1"
                             style={{ top: haut, height: h, background: t.bg, borderLeft: `3px solid ${t.bord}` }}
                             title={liste.map((d) => `${d.prenom} ${d.nom}`).join("\n")}>
                          <div className="truncate text-[11px] font-bold" style={{ color: t.texte }}>
                            {liste.length === 1
                              ? `${liste[0].prenom} ${liste[0].nom}`
                              : `${liste.length} candidats`}
                          </div>
                          <div className="truncate text-[10px]" style={{ color: t.texte, opacity: 0.85 }}>
                            {horaire}
                          </div>
                          {liste.length > 1 && (
                            <div className="mt-0.5 space-y-0.5">
                              {liste.slice(0, 3).map((d) => (
                                <div key={d.id} className="truncate text-[10px]" style={{ color: t.texte, opacity: 0.9 }}>
                                  {d.prenom} {d.nom}
                                </div>
                              ))}
                              {liste.length > 3 && (
                                <div className="text-[10px]" style={{ color: t.texte, opacity: 0.7 }}>
                                  + {liste.length - 3} autre{liste.length - 3 > 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MOIS ─────────────────────────────────────────────────────────── */}
      {mode === "mois" && (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 border-b border-gray-200 pb-2">
              {JOURS.map((j) => (
                <div key={j} className="text-center text-xs font-medium text-gray-500">{j}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grilleMois.map((j) => {
                const k = cle(j);
                const liste = parJour[k] ?? [];
                const horsMois = j.getMonth() !== ancre.getMonth();
                const cejour = k === aujourdhui;
                return (
                  <div key={k}
                       className={`min-h-[92px] border-b border-r border-gray-100 p-1.5 ${
                         horsMois ? "bg-gray-50/50" : ""}`}>
                    <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      cejour ? "text-white" : horsMois ? "text-gray-300" : "text-gray-700"}`}
                      style={cejour ? { background: BLEU } : undefined}>
                      {j.getDate()}
                    </div>
                    <div className="space-y-1">
                      {liste.slice(0, 3).map((d) => {
                        const t = ton(d.statut);
                        return (
                          <div key={d.id}
                               className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
                               style={{ background: t.bg, color: t.texte, borderLeft: `2px solid ${t.bord}` }}
                               title={`${d.prenom} ${d.nom} — ${d.session?.horaire ?? ""}`}>
                            {d.prenom} {d.nom}
                          </div>
                        );
                      })}
                      {liste.length > 3 && (
                        <div className="px-1 text-[10px] text-gray-500">+ {liste.length - 3} autre{liste.length - 3 > 1 ? "s" : ""}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Légende ──────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-3">
        {([["confirmee", "Place confirmée"], ["en_attente", "En attente de validation"],
           ["refusee", "Refusée"], ["annulee", "Retirée"]] as const).map(([s, l]) => {
          const t = ton(s);
          return (
            <span key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-3 w-3 rounded-sm" style={{ background: t.bg, borderLeft: `3px solid ${t.bord}` }} />
              {l}
            </span>
          );
        })}
      </div>
    </section>
  );
}
