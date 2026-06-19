"use client";

/**
 * MYSTORY — /examens/jour : le jour J (§2.5).
 * Feuille de présence par session (groupée par type, triée par horaire), repère ⚠️ sur les
 * candidats non inscrits CCI, impression propre (colonne signature), saisie des résultats
 * (Réussi / Échoué / Absent + niveau TEF) et « Envoyer tous les résultats » par email.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const NIVEAUX_TEF = ["A1", "A2", "B1", "B2"];

interface Candidat {
  venteId: string; numero_attestation: string; civilite: string; nom: string; prenom: string;
  email: string; telephone: string; sous_type: string | null; type_examen: string;
  inscrit_cci: boolean; statut_paiement: string; mode_paiement: string | null; reste_a_payer: number;
  resultat: string | null; niveau_obtenu: string | null; resultat_envoye: string | null;
  commentaire: string | null;
}
interface SessionJour {
  id: string; type: string; horaire: string; capacite: number; note: string | null; candidats: Candidat[];
}

function aujourdHui(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export default function PageJourJ() {
  const [date, setDate] = useState(aujourdHui());
  const [sessions, setSessions] = useState<SessionJour[]>([]);
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [auteur, setAuteur] = useState("");
  const [refuseFacture, setRefuseFacture] = useState<Set<string>>(new Set());

  useEffect(() => { try { setAuteur(localStorage.getItem("mystory_auteur") ?? ""); } catch {} }, []);

  const recharger = useCallback(async () => {
    setChargement(true); setErreur(null);
    try {
      const r = await fetch(`/api/examens/jour?date=${date}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setSessions(j.sessions);
    } catch (e: any) {
      setErreur(e?.message ?? "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, [date]);
  useEffect(() => { recharger(); }, [recharger]);

  async function basculerCci(c: Candidat) {
    setBusy(c.venteId);
    try {
      const r = await fetch("/api/examens/ventes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.venteId, inscrit_cci: !c.inscrit_cci, auteur }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      await recharger();
    } catch (e: any) { setErreur(e?.message); } finally { setBusy(null); }
  }

  async function saisirResultat(c: Candidat, statut: string, niveau: string | null) {
    if (!statut) return;
    setBusy(c.venteId); setErreur(null); setMessage(null);
    try {
      const r = await fetch("/api/examens/resultats", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venteId: c.venteId, statut, niveau_obtenu: niveau, auteur, nePasFacturer: refuseFacture.has(c.venteId) }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      if (j.facture?.numero) setMessage(`Résultat enregistré · facture espèces ${j.facture.numero} émise.`);
      await recharger();
    } catch (e: any) { setErreur(e?.message); } finally { setBusy(null); }
  }

  async function saisirCommentaire(c: Candidat, valeur: string) {
    const v = valeur.trim();
    if ((c.commentaire ?? "") === v) return; // pas de changement → pas d'appel
    setBusy(c.venteId); setErreur(null);
    try {
      const r = await fetch("/api/examens/resultats", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venteId: c.venteId, commentaire: v, auteur }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      // MAJ locale (évite un recharger complet qui ferait perdre le focus)
      setSessions((prev) => prev.map((s) => ({
        ...s,
        candidats: s.candidats.map((x) => x.venteId === c.venteId ? { ...x, commentaire: v || null } : x),
      })));
    } catch (e: any) { setErreur(e?.message); } finally { setBusy(null); }
  }

  async function envoyerTous() {
    setBusy("envoi"); setMessage(null); setErreur(null);
    try {
      const r = await fetch("/api/examens/resultats", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, auteur }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setMessage(`📧 ${j.envoyes} résultat(s) envoyé(s)` + (j.sansSaisie ? ` · ${j.sansSaisie} sans saisie` : "") + (j.echecs ? ` · ${j.echecs} échec(s)` : ""));
      await recharger();
    } catch (e: any) { setErreur(e?.message); } finally { setBusy(null); }
  }

  const totalCandidats = sessions.reduce((n, s) => n + s.candidats.length, 0);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Jour J — présences & résultats</h1>
          <p className="text-sm text-gray-500">Centre d'examen : Gagny · ⚠️ = non inscrit CCI</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                 className="input" />
          <button onClick={() => window.print()} className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">🖨 Imprimer la feuille</button>
          <button onClick={envoyerTous} disabled={busy === "envoi" || totalCandidats === 0}
                  className="px-4 py-2 rounded-lg text-sm text-white bg-mystory disabled:opacity-50">
            {busy === "envoi" ? "Envoi…" : "📧 Envoyer tous les résultats"}
          </button>
          <Link href="/examens" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">← Sessions</Link>
        </div>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">MYSTORY — Feuille de présence · {date}</h1>
        <p className="text-sm">Centre d'examen : Gagny — 3 bis av. de Gagny, 93220 · Le formateur certifie l'exactitude des présences.</p>
      </div>

      {message && <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2 text-sm mb-4 print:hidden">{message}</div>}
      {erreur && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2 text-sm mb-4 print:hidden">{erreur}</div>}
      {chargement && <p className="text-sm text-gray-500">Chargement…</p>}
      {!chargement && sessions.length === 0 && <p className="text-sm text-gray-500">Aucune session ce jour.</p>}

      <div className="space-y-6">
        {sessions.map((s) => (
          <div key={s.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden print:border-black print:rounded-none">
            <div className="px-4 py-2 bg-mystory text-white text-sm font-semibold flex justify-between print:bg-white print:text-black print:border-b print:border-black">
              <span>{s.type === "TEF_IRN" ? "TEF IRN" : "Examen civique"} · {s.horaire}</span>
              <span>{s.candidats.length} / {s.capacite} inscrit(s){s.note ? ` · 📌 ${s.note}` : ""}</span>
            </div>
            {s.candidats.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">Aucun candidat.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-2">Candidat</th>
                    <th className="px-2 py-2">Mention / motivation</th>
                    <th className="px-2 py-2 print:hidden">CCI</th>
                    <th className="px-2 py-2 print:hidden">Paiement</th>
                    <th className="px-2 py-2 print:hidden">Résultat</th>
                    <th className="px-2 py-2 hidden print:table-cell w-40">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {s.candidats.map((c) => (
                    <tr key={c.venteId} className="border-b border-gray-100 align-top">
                      <td className="px-4 py-2">
                        {!c.inscrit_cci && <span title="Non inscrit CCI">⚠️ </span>}
                        <strong>{c.nom}</strong> {c.prenom}
                        <span className="block text-xs text-gray-400">{c.numero_attestation} · {c.telephone}</span>
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-600">{c.sous_type ?? "—"}</td>
                      <td className="px-2 py-2 print:hidden">
                        <button onClick={() => basculerCci(c)} disabled={busy === c.venteId}
                                className={`px-2 py-1 rounded text-xs border ${c.inscrit_cci ? "bg-green-100 border-green-300 text-green-800" : "bg-orange-100 border-orange-300 text-orange-800"}`}>
                          {c.inscrit_cci ? "✓ Inscrit CCI" : "⚠️ À inscrire"}
                        </button>
                      </td>
                      <td className="px-2 py-2 print:hidden text-xs">
                        {c.statut_paiement === "Acompte"
                          ? <span className="text-orange-700 font-medium">Acompte — reste {c.reste_a_payer} €</span>
                          : c.statut_paiement}
                      </td>
                      <td className="px-2 py-2 print:hidden">
                        <div className="flex items-center gap-1 flex-wrap">
                          {c.mode_paiement === "Espèces" && !c.resultat && (
                            <label className="flex items-center gap-1 text-[11px] text-gray-500 mr-1" title="Par défaut, valider le résultat émet la facture espèces">
                              <input type="checkbox" checked={refuseFacture.has(c.venteId)}
                                onChange={() => setRefuseFacture((p) => { const n = new Set(p); n.has(c.venteId) ? n.delete(c.venteId) : n.add(c.venteId); return n; })} />
                              ne pas facturer
                            </label>
                          )}
                          <select value={c.resultat ?? ""} disabled={busy === c.venteId}
                                  onChange={(e) => saisirResultat(c, e.target.value, c.niveau_obtenu)}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                            <option value="">—</option><option>Réussi</option><option>Échoué</option><option>Absent</option>
                          </select>
                          {c.type_examen === "TEF_IRN" && c.resultat === "Réussi" && (
                            <select value={c.niveau_obtenu ?? ""} disabled={busy === c.venteId}
                                    onChange={(e) => saisirResultat(c, "Réussi", e.target.value)}
                                    className="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                              <option value="">Niveau</option>
                              {NIVEAUX_TEF.map((n) => <option key={n}>{n}</option>)}
                            </select>
                          )}
                          {c.resultat_envoye && <span className="text-xs text-green-700" title="Résultat envoyé">📧✓</span>}
                        </div>
                        {c.resultat && (
                          <input
                            type="text"
                            defaultValue={c.commentaire ?? ""}
                            disabled={busy === c.venteId}
                            onBlur={(e) => saisirCommentaire(c, e.target.value)}
                            placeholder="Commentaire (mention, motif d'absence…)"
                            className="mt-1 w-56 border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 hidden print:table-cell"><div className="border-b border-dotted border-black h-6"></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
