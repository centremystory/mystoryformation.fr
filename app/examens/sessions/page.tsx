"use client";

/**
 * MYSTORY — /examens : planning des sessions d'examen (Gagny).
 * Codes couleur (places restantes) : 🔴 0 = complet (inscription bloquée aussi côté SQL)
 * · 🟠 1-3 · 🔵 4-7 · 🟢 ≥ 8. Capacité et note modifiables par session (journalisé).
 * « Générer les sessions » crée les créneaux types sur une plage (idempotent) :
 * TEF lundis/vendredis 9h30-12h30 & 14h-17h · civique lun→ven 17h30-18h30.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Session {
  id: string; type: string; date_examen: string; horaire: string;
  capacite: number; inscrits: number; restantes: number; note: string | null;
}

const LIBELLE_TYPE: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Examen civique" };

function couleur(s: Session): string {
  if (s.restantes <= 0) return "bg-red-100 border-red-300 text-red-800";
  if (s.restantes <= 3) return "bg-orange-100 border-orange-300 text-orange-800";
  if (s.restantes >= 8) return "bg-green-100 border-green-300 text-green-800";
  return "bg-blue-50 border-blue-200 text-blue-800";
}

function dateFR(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(a, m - 1, j));
}

export default function PageExamens() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>("tous");
  const [genOuvert, setGenOuvert] = useState(false);
  const [gen, setGen] = useState({ type: "TEF_IRN", du: "", au: "", capacite: 12, centre: "GAGNY" });
  const [centres, setCentres] = useState<{ code: string; nom: string; accueille_examen: boolean; actif: boolean }[]>([]);
  useEffect(() => {
    fetch("/api/centres").then((r) => r.json())
      .then((d) => setCentres((d.centres ?? []).filter((c: any) => c.accueille_examen && c.actif))).catch(() => {});
  }, []);
  const [genBusy, setGenBusy] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const [alertes, setAlertes] = useState<{ cci: any[]; acomptes: any[]; convocations_manquantes: any[]; completude_j3: any[]; relances: any } | null>(null);
  const [editVal, setEditVal] = useState({ capacite: 12, note: "" });
  const [rembMois, setRembMois] = useState(0);

  const recharger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/examens/sessions", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setSessions(j.sessions);
    } catch (e: any) {
      setErreur(e?.message ?? "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { recharger(); }, [recharger]);
  useEffect(() => {
    fetch("/api/examens/alertes", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j.ok) setAlertes(j); }).catch(() => {});
    fetch("/api/examens/remboursements", { cache: "no-store" }).then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        const m = new Date().toISOString().slice(0, 7);
        setRembMois((j.remboursements ?? []).filter((x: any) => String(x.cree_le).slice(0, 7) === m).length);
      }).catch(() => {});
  }, []);

  const visibles = useMemo(
    () => sessions.filter((s) => filtre === "tous" || s.type === filtre),
    [sessions, filtre],
  );
  const parDate = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of visibles) {
      if (!m.has(s.date_examen)) m.set(s.date_examen, []);
      m.get(s.date_examen)!.push(s);
    }
    return [...m.entries()];
  }, [visibles]);

  async function genererPlage() {
    if (!gen.du || !gen.au) { setErreur("Indique la plage (du / au)."); return; }
    setGenBusy(true); setErreur(null);
    try {
      const r = await fetch("/api/examens/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plage: true, ...gen }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setGenOuvert(false);
      await recharger();
    } catch (e: any) {
      setErreur(e?.message ?? "Échec de la génération.");
    } finally {
      setGenBusy(false);
    }
  }

  async function enregistrerEdition(id: string) {
    try {
      const r = await fetch("/api/examens/sessions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, capacite: editVal.capacite, note: editVal.note }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setEdition(null);
      await recharger();
    } catch (e: any) {
      setErreur(e?.message ?? "Échec de la modification.");
    }
  }

  const champ = "input";

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">Sessions d'examen</h1>
          <p className="text-sm text-gray-500">Centre d'examen : Gagny — 3 bis av. de Gagny, 93220</p>
        </div>
        <div className="flex gap-2">
          <Link href="/examens/vente-groupe" className="px-4 py-2 rounded-lg text-sm text-white bg-mystory font-medium">
            + Vendre un examen
          </Link>
          <Link href="/examens/jour" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">
            Jour J / Résultats
          </Link>
          <Link href="/examens/corrections" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">
            Corrections
          </Link>
          <Link href="/examens/taux" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">
            📊 Taux de réussite
          </Link>
          <Link href="/examens/remboursements" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">
            💶 Remboursements{rembMois > 0 ? ` (${rembMois})` : ""}
          </Link>
          <Link href="/examens/liste-attente" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">
            ⏳ Liste d'attente
          </Link>
          <button onClick={() => setGenOuvert(!genOuvert)}
                  className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">
            Générer les sessions
          </button>
        </div>
      </div>

      {genOuvert && (
        <div className="border border-mystory/30 bg-mystory-clair/40 rounded-xl p-4 mb-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">Type
            <select value={gen.type} onChange={(e) => setGen({ ...gen, type: e.target.value })} className={`${champ} block mt-1`}>
              <option value="TEF_IRN">TEF IRN (lun & ven · 9h30-12h30 et 14h-17h)</option>
              <option value="Examen_civique">Examen civique (lun→ven · 17h30-18h30)</option>
            </select>
          </label>
          <label className="text-sm">Centre
            <select value={gen.centre} onChange={(e) => setGen({ ...gen, centre: e.target.value })} className={`${champ} block mt-1`}>
              {centres.length === 0 && <option value="GAGNY">Gagny</option>}
              {centres.map((c) => <option key={c.code} value={c.code}>{c.nom}</option>)}
            </select>
          </label>
          <label className="text-sm">Du
            <input type="date" value={gen.du} onChange={(e) => setGen({ ...gen, du: e.target.value })} className={`${champ} block mt-1`} />
          </label>
          <label className="text-sm">Au
            <input type="date" value={gen.au} onChange={(e) => setGen({ ...gen, au: e.target.value })} className={`${champ} block mt-1`} />
          </label>
          <label className="text-sm">Capacité
            <input type="number" min={0} value={gen.capacite}
                   onChange={(e) => setGen({ ...gen, capacite: Number(e.target.value) })} className={`${champ} block mt-1 w-24`} />
          </label>
          <button onClick={genererPlage} disabled={genBusy}
                  className="px-4 py-2 rounded-lg text-sm text-white bg-mystory disabled:opacity-50">
            {genBusy ? "Création…" : "Créer les créneaux"}
          </button>
          <span className="text-xs text-gray-500">Les créneaux déjà existants sont conservés tels quels.</span>
        </div>
      )}

      {alertes && (alertes.cci.length > 0 || alertes.acomptes.length > 0 || (alertes.convocations_manquantes?.length ?? 0) > 0 || (alertes.completude_j3?.length ?? 0) > 0 || (alertes.relances?.sans_resultat_saisi?.length ?? 0) > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5 text-sm space-y-2">
          <p className="font-semibold text-orange-900">🔔 Alertes du jour</p>
          {alertes.cci.length > 0 && (
            <div>
              <p className="font-medium text-orange-900">⚠️ {alertes.cci.length} candidat(s) à examen sous 5 jours ouvrés NON inscrits CCI :</p>
              {alertes.cci.map((a: any) => (
                <p key={a.id} className="text-orange-800">
                  · <strong>{a.stagiaires?.nom}</strong> {a.stagiaires?.prenom} — {a.sessions_examen?.date_examen} {a.sessions_examen?.horaire} ({a.jours_ouvres} j ouvré{a.jours_ouvres > 1 ? "s" : ""}) · {a.numero_attestation}
                </p>
              ))}
            </div>
          )}
          {alertes.acomptes.length > 0 && (
            <p className="text-orange-800">💶 {alertes.acomptes.length} acompte(s) à solder — {alertes.acomptes.map((a: any) => `${a.stagiaires?.nom} (reste ${a.reste_a_payer} €)`).join(" · ")}</p>
          )}
          {(alertes.convocations_manquantes?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium text-orange-900">✉️ {alertes.convocations_manquantes.length} convocation(s) manquante(s) (payé, examen à venir) :</p>
              {alertes.convocations_manquantes.map((a: any) => (
                <p key={a.id} className="text-orange-800">
                  · <strong>{a.stagiaires?.nom}</strong> {a.stagiaires?.prenom} — {a.sessions_examen?.date_examen} {a.sessions_examen?.horaire} · {a.numero_attestation}
                </p>
              ))}
            </div>
          )}
          {(alertes.completude_j3?.length ?? 0) > 0 && (
            <div>
              <p className="font-medium text-orange-900">⏳ {alertes.completude_j3.length} examen(s) à J-3 avec solde non réglé :</p>
              {alertes.completude_j3.map((a: any) => (
                <p key={a.id} className="text-orange-800">
                  · <strong>{a.stagiaires?.nom}</strong> {a.stagiaires?.prenom} — {a.sessions_examen?.date_examen} {a.sessions_examen?.horaire} · reste {a.reste_a_payer} €
                </p>
              ))}
            </div>
          )}
          {(alertes.relances?.sans_resultat_saisi?.length ?? 0) > 0 && (
            <p className="text-orange-800">📝 {alertes.relances.sans_resultat_saisi.length} examen(s) passé(s) sans résultat saisi → <Link className="underline" href="/examens/jour">saisir</Link></p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        {[["tous", "Tous"], ["TEF_IRN", "TEF IRN"], ["Examen_civique", "Civique"]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${filtre === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-700 border-gray-300"}`}>
            {l}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">🟢 ≥ 8 places · 🔵 4-7 · 🟠 ≤ 3 · 🔴 complet</span>
      </div>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2 text-sm mb-4">{erreur}</div>}
      {chargement && <p className="text-gray-500 text-sm">Chargement…</p>}
      {!chargement && parDate.length === 0 && (
        <p className="text-gray-500 text-sm">Aucune session à venir — utilise « Générer les sessions » pour créer les créneaux types.</p>
      )}

      <div className="space-y-5">
        {parDate.map(([date, liste]) => (
          <div key={date}>
            <p className="text-sm font-semibold text-gray-700 capitalize mb-2">{dateFR(date)}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liste.map((s) => (
                <div key={s.id} className={`border rounded-xl p-3 ${couleur(s)}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{LIBELLE_TYPE[s.type] ?? s.type}</span>
                    <span className="text-xs">{s.horaire}</span>
                  </div>
                  <p className="text-sm mt-1">
                    {s.restantes <= 0
                      ? <strong>COMPLET — ne plus inscrire</strong>
                      : <>{s.inscrits} / {s.capacite} inscrits · <strong>{s.restantes} restantes</strong></>}
                  </p>
                  {s.note && <p className="text-xs mt-1 italic">📌 {s.note}</p>}
                  {edition === s.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="number" min={0} value={editVal.capacite}
                             onChange={(e) => setEditVal({ ...editVal, capacite: Number(e.target.value) })}
                             className="border border-gray-300 rounded px-2 py-1 text-xs w-16 bg-white text-gray-900" />
                      <input value={editVal.note} placeholder="Note (ex. congés)"
                             onChange={(e) => setEditVal({ ...editVal, note: e.target.value })}
                             className="border border-gray-300 rounded px-2 py-1 text-xs flex-1 min-w-[110px] bg-white text-gray-900" />
                      <button onClick={() => enregistrerEdition(s.id)} className="text-xs underline font-medium">OK</button>
                      <button onClick={() => setEdition(null)} className="text-xs underline">Annuler</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEdition(s.id); setEditVal({ capacite: s.capacite, note: s.note ?? "" }); }}
                            className="text-xs underline mt-2">
                      Modifier capacité / note
                    </button>
                  )}
                  <div className="mt-2">
                    <Link href={`/examens/sessions/${s.id}`} className="text-xs underline text-mystory">Voir les inscrits →</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

