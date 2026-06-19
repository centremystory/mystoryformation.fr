"use client";

/**
 * MYSTORY — /examens/preinscriptions : pré-inscription par téléphone.
 * Saisie → mail auto avec lien de paiement Qonto → suivi (en attente / convertie / expirée).
 * « Marquer payé » crée la vraie inscription (attestation + convocation + facture).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Phone, Send, CheckCircle2, RotateCcw, XCircle, AlertTriangle, Link2 } from "lucide-react";

const SOUS_TYPES_CIVIQUE = ["Carte de séjour pluriannuelle", "Carte de résident", "Naturalisation"];
const MOTIVATIONS_TEF = ["04. Intégration française", "05. Carte de séjour pluriannuelle", "06. Carte de résident en France", "10. Naturalisation française"];
const PLATEFORMES = ["Passetontef", "Prepcivique", "Prepmyfuture"];
const TYPE_LABEL: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Examen civique", Vente_plateforme: "Vente plateforme" };
const STATUT_BADGE: Record<string, string> = { en_attente: "badge-warning", convertie: "badge-success", expiree: "badge-neutral", annulee: "badge-danger" };
const STATUT_LABEL: Record<string, string> = { en_attente: "En attente de paiement", convertie: "Inscription créée", expiree: "Expirée", annulee: "Annulée" };

function dateFR(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long" }).format(new Date(a, m - 1, j));
}

export default function PagePreinscriptions() {
  const [liste, setListe] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [charge, setCharge] = useState(true);
  const [filtre, setFiltre] = useState("en_attente");
  const [err, setErr] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(true);

  // formulaire
  const [f, setF] = useState({
    candidat_nom: "", candidat_prenom: "", candidat_email: "", candidat_telephone: "",
    type_examen: "", sous_type: "", session_id: "", montant: "", lien_paiement: "", agence: "Gagny",
  });

  // forçage carence (Direction)
  const [forcageId, setForcageId] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [recapForcage, setRecapForcage] = useState<string[]>([]);

  const charger = useCallback(async () => {
    setCharge(true);
    try {
      const r = await fetch(`/api/examens/preinscriptions${filtre !== "toutes" ? `?statut=${filtre}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) { setListe(j.preinscriptions); setSessions(j.sessions); }
    } finally { setCharge(false); }
  }, [filtre]);
  useEffect(() => { charger(); }, [charger]);

  const sessionsDe = (type: string) => sessions.filter((s) => s.type === type);

  function maj(patch: Partial<typeof f>) {
    setF((prev) => {
      const next = { ...prev, ...patch };
      if (patch.type_examen !== undefined && patch.type_examen !== prev.type_examen) { next.sous_type = ""; next.session_id = ""; }
      return next;
    });
  }

  async function creer() {
    setBusy("__add__"); setErr(null);
    try {
      const r = await fetch("/api/examens/preinscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, montant: Number(f.montant) }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.recap ?? [j.erreur ?? "Création impossible."]); return; }
      setF({ candidat_nom: "", candidat_prenom: "", candidat_email: "", candidat_telephone: "", type_examen: "", sous_type: "", session_id: "", montant: "", lien_paiement: "", agence: "Gagny" });
      setFiltre("en_attente");
      await charger();
    } catch (e: any) { setErr([e?.message ?? "Création impossible."]); }
    finally { setBusy(null); }
  }

  async function convertir(id: string, forcer = false) {
    setBusy(`conv-${id}`); setErr(null);
    try {
      const r = await fetch("/api/examens/preinscriptions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "convertir", carence_forcer: forcer, carence_motif: forcer ? motif : undefined }),
      });
      const j = await r.json();
      if (!j.ok) {
        if (Array.isArray(j.recap) && j.recap.some((x: string) => /carence|mention civique/i.test(x))) {
          setForcageId(id); setRecapForcage(j.recap);
        } else { setErr(j.recap ?? [j.erreur ?? "Conversion impossible."]); }
        return;
      }
      setForcageId(null); setMotif(""); setRecapForcage([]);
      await charger();
    } finally { setBusy(null); }
  }

  async function actionSimple(id: string, action: "annuler" | "renvoyer") {
    setBusy(`${action}-${id}`);
    try {
      await fetch("/api/examens/preinscriptions", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }),
      });
      await charger();
    } finally { setBusy(null); }
  }

  const FILTRES = [
    { v: "en_attente", label: "En attente" }, { v: "convertie", label: "Converties" },
    { v: "expiree", label: "Expirées" }, { v: "annulee", label: "Annulées" }, { v: "toutes", label: "Toutes" },
  ];

  const peutCreer = useMemo(() =>
    f.candidat_nom && f.candidat_prenom && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.candidat_email) &&
    f.type_examen && f.montant !== "" && /^https?:\/\//.test(f.lien_paiement) &&
    (f.type_examen === "Vente_plateforme" ? !!f.sous_type : !!f.session_id) &&
    (f.type_examen === "Examen_civique" ? !!f.sous_type : true), [f]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Pré-inscriptions</h1>
          <p className="page-subtitle">Pré-inscription par téléphone : le candidat reçoit un mail avec le lien de paiement. Au paiement, l'inscription est créée automatiquement.</p>
        </div>
        <button onClick={() => setOuvert((o) => !o)} className="btn-ghost">{ouvert ? "Fermer" : "+ Nouvelle"}</button>
      </header>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err.map((e, i) => <p key={i}>• {e}</p>)}</div>}

      {/* Formulaire */}
      {ouvert && (
        <section className="card mb-6">
          <p className="mb-3 flex items-center gap-2 font-medium text-gray-800"><Phone size={16} /> Nouvelle pré-inscription</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Nom *<input value={f.candidat_nom} onChange={(e) => maj({ candidat_nom: e.target.value })} className="input mt-1" /></label>
            <label className="text-sm">Prénom *<input value={f.candidat_prenom} onChange={(e) => maj({ candidat_prenom: e.target.value })} className="input mt-1" /></label>
            <label className="text-sm">Email *<input type="email" value={f.candidat_email} onChange={(e) => maj({ candidat_email: e.target.value })} className="input mt-1" /></label>
            <label className="text-sm">Téléphone<input value={f.candidat_telephone} onChange={(e) => maj({ candidat_telephone: e.target.value })} className="input mt-1" /></label>

            <label className="col-span-2 text-sm">Type d'examen *
              <select value={f.type_examen} onChange={(e) => maj({ type_examen: e.target.value })} className="input mt-1">
                <option value="">—</option>
                <option value="TEF_IRN">TEF IRN</option>
                <option value="Examen_civique">Examen civique</option>
                <option value="Vente_plateforme">Vente plateforme</option>
              </select>
            </label>

            {f.type_examen && f.type_examen !== "Vente_plateforme" && (
              <label className="col-span-2 text-sm">Créneau souhaité * <span className="text-gray-400">(places en direct)</span>
                <select value={f.session_id} onChange={(e) => maj({ session_id: e.target.value })} className="input mt-1">
                  <option value="">—</option>
                  {sessionsDe(f.type_examen).map((s) => (
                    <option key={s.id} value={s.id} disabled={s.restantes <= 0}>{dateFR(s.date_examen)} · {s.horaire} · {s.restantes <= 0 ? "COMPLET" : `${s.restantes} place(s)`}</option>
                  ))}
                </select>
              </label>
            )}

            {f.type_examen && (
              <label className="col-span-2 text-sm">
                {f.type_examen === "Examen_civique" ? "Mention *" : f.type_examen === "TEF_IRN" ? "Motivation (facultatif)" : "Application *"}
                <select value={f.sous_type} onChange={(e) => maj({ sous_type: e.target.value })} className="input mt-1">
                  <option value="">—</option>
                  {(f.type_examen === "Examen_civique" ? SOUS_TYPES_CIVIQUE : f.type_examen === "TEF_IRN" ? MOTIVATIONS_TEF : PLATEFORMES).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            )}

            <label className="text-sm">Montant (€) *<input type="number" min={0} step="0.01" value={f.montant} onChange={(e) => maj({ montant: e.target.value })} className="input mt-1" /></label>
            <label className="text-sm">Agence
              <select value={f.agence} onChange={(e) => maj({ agence: e.target.value })} className="input mt-1"><option>Gagny</option><option>Sarcelles</option><option>Rosny</option></select>
            </label>
            <label className="col-span-2 text-sm flex flex-col">Lien de paiement Qonto *
              <input value={f.lien_paiement} onChange={(e) => maj({ lien_paiement: e.target.value })} placeholder="https://pay.qonto.com/payment-links/…" className="input mt-1" />
            </label>
          </div>
          <button onClick={creer} disabled={!peutCreer || busy === "__add__"} className="btn-primary mt-3">
            {busy === "__add__" ? "Envoi…" : <><Send size={16} /> Créer et envoyer le mail</>}
          </button>
        </section>
      )}

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTRES.map((c) => (
          <button key={c.v} onClick={() => setFiltre(c.v)} className={`rounded-lg border px-3 py-1.5 text-sm ${filtre === c.v ? "border-mystory bg-mystory text-white" : "border-gray-300 bg-white text-gray-700 hover:border-mystory"}`}>{c.label}</button>
        ))}
      </div>

      {charge ? <p className="text-sm text-gray-500">Chargement…</p> : liste.length === 0 ? (
        <div className="empty-state">Aucune pré-inscription pour ce filtre.</div>
      ) : (
        <div className="space-y-2">
          {liste.map((p) => {
            const s = p.sessions_examen;
            return (
              <div key={p.id} className="card">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`badge ${STATUT_BADGE[p.statut] ?? "badge-neutral"}`}>{STATUT_LABEL[p.statut] ?? p.statut}</span>
                  <span className="badge badge-info">{TYPE_LABEL[p.type_examen] ?? p.type_examen}</span>
                  {p.sous_type && <span className="text-sm text-gray-600">{p.sous_type}</span>}
                  <span className="flex-1" />
                  <span className="font-semibold text-gray-900">{p.montant} €</span>
                </div>
                <p className="font-medium text-gray-900">{p.candidat_prenom} {p.candidat_nom}</p>
                <p className="text-xs text-gray-500">{p.candidat_email}{p.candidat_telephone ? ` · ${p.candidat_telephone}` : ""}{s ? ` · ${dateFR(s.date_examen)} ${s.horaire}` : ""}</p>

                {p.statut === "en_attente" && (
                  <>
                    {forcageId === p.id ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700">
                        {recapForcage.map((x, i) => <p key={i} className="flex items-center gap-1"><AlertTriangle size={14} /> {x}</p>)}
                        <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif du forçage (Direction)" className="input" />
                        <div className="flex gap-2">
                          <button onClick={() => convertir(p.id, true)} disabled={!motif.trim() || busy === `conv-${p.id}`} className="btn-danger !bg-warning-600 hover:!bg-warning-700 !py-1.5">Forcer et créer</button>
                          <button onClick={() => { setForcageId(null); setRecapForcage([]); setMotif(""); }} className="btn-ghost !py-1.5">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => convertir(p.id)} disabled={busy === `conv-${p.id}`} className="btn-primary !py-1.5">
                          {busy === `conv-${p.id}` ? "Création…" : <><CheckCircle2 size={15} /> Marquer payé → créer l'inscription</>}
                        </button>
                        <button onClick={() => actionSimple(p.id, "renvoyer")} disabled={busy === `renvoyer-${p.id}`} className="btn-ghost !py-1.5"><RotateCcw size={15} /> Renvoyer le mail</button>
                        <button onClick={() => actionSimple(p.id, "annuler")} disabled={busy === `annuler-${p.id}`} className="btn-ghost !py-1.5 !text-danger-600"><XCircle size={15} /> Annuler</button>
                      </div>
                    )}
                  </>
                )}

                {p.statut === "convertie" && p.vente_id && (
                  <p className="mt-2 text-xs text-success-600"><CheckCircle2 size={13} className="mr-1 inline" />Inscription créée — <Link href="/examens/candidats" className="underline">voir les candidats</Link></p>
                )}
                {p.lien_paiement && p.statut === "en_attente" && (
                  <a href={p.lien_paiement} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-mystory hover:underline"><Link2 size={12} /> lien de paiement</a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
