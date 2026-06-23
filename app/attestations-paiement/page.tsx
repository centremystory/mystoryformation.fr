"use client";
// app/attestations-paiement/page.tsx — Outil commercial : retrouver un candidat (appel entrant)
// par nom / téléphone / n° d'attestation, voir son paiement, et agir :
//  · renvoyer l'attestation DÉJÀ émise (aucun nouveau numéro) ;
//  · reporter / faire un avoir (flux conforme dans la session) ;
//  · ouvrir une réclamation (pré-remplie).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, FileText, CalendarClock, MessageSquareWarning, Phone, Mail, Send, X, Download } from "lucide-react";

type Candidat = {
  id: string;
  source: "import" | "vente";
  nom: string | null;
  prenom: string | null;
  civilite: string | null;
  email: string | null;
  telephone: string | null;
  type_norm: string | null;
  sous_type: string | null;
  date_examen: string | null;
  horaire: string | null;
  agence: string | null;
  statut_paiement: string | null;
  reste_a_payer: number | null;
  numero_attestation: string | null;
  numero_facture: string | null;
  vendu_par: string | null;
  montant: number | null;
  session_id: string | null;
  attestation_nom: string | null;
  attestation_depose_le: string | null;
};

const eur = (n: number | null | undefined) => `${Math.round(Number(n ?? 0))} €`;
function dateFr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function libType(t: string | null): string {
  if (t === "TEF_IRN") return "TEF IRN";
  if (t === "CIVIQUE") return "Civique";
  if (t === "PLATEFORME") return "Plateforme";
  return t ?? "—";
}
const estPaye = (s: string | null) => s === "Payé" || s === "Inclus CPF";

export default function PageAttestationsPaiement() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Candidat[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [renvoi, setRenvoi] = useState<string | null>(null);
  const [recu, setRecu] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [recOuverte, setRecOuverte] = useState<string | null>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setItems([]); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setChargement(true);
      try {
        const r = await fetch(`/api/attestations-paiement?q=${encodeURIComponent(t)}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!j.ok) throw new Error(j.erreur || "Recherche impossible.");
        setItems(j.candidats);
        setErreur(null);
      } catch (e: any) { if (e.name !== "AbortError") setErreur(e.message); }
      finally { setChargement(false); }
    }, 300);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q]);

  async function renvoyer(c: Candidat) {
    setRenvoi(c.id); setOkMsg(null); setErreur(null);
    try {
      const r = await fetch("/api/examens/attestations/renvoyer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examen_ref: c.id, source: c.source }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setOkMsg(`Attestation renvoyée à ${c.prenom ?? ""} ${c.nom ?? ""}.`);
    } catch (e: any) { setErreur(e.message); }
    finally { setRenvoi(null); }
  }

  async function envoyerRecu(c: Candidat) {
    setRecu(c.id); setOkMsg(null); setErreur(null);
    try {
      const r = await fetch("/api/recu-paiement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, source: c.source }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setOkMsg(`Reçu de paiement envoyé à ${c.prenom ?? ""} ${c.nom ?? ""}.`);
    } catch (e: any) { setErreur(e.message); }
    finally { setRecu(null); }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
            <FileText size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="page-title text-2xl">Attestation de paiement</h1>
            <p className="page-subtitle">Retrouver un candidat (appel entrant) — paiement, attestation, report, réclamation.</p>
          </div>
        </div>
      </header>

      {/* Recherche */}
      <div className="relative mb-4">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, téléphone, n° d'attestation ou de facture…"
          className="input !pl-10"
        />
      </div>

      {okMsg && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{okMsg}</div>}
      {erreur && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{erreur}</div>}

      {q.trim().length < 2 ? (
        <div className="card"><div className="empty-state"><Search size={28} strokeWidth={1.75} className="text-gray-300" /><p className="text-sm text-gray-500">Tapez au moins 2 caractères pour rechercher un candidat.</p></div></div>
      ) : chargement ? (
        <div className="card"><p className="text-sm text-gray-400">Recherche…</p></div>
      ) : items.length === 0 ? (
        <div className="card"><div className="empty-state"><p className="text-sm text-gray-500">Aucun candidat ne correspond à « {q} ».</p></div></div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={`${c.source}-${c.id}`} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{[c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") || "Candidat"}</p>
                  <p className="text-sm text-gray-500">
                    {libType(c.type_norm)}{c.sous_type ? ` · ${c.sous_type}` : ""} · {dateFr(c.date_examen)}{c.horaire ? ` · ${c.horaire}` : ""}{c.agence ? ` · ${c.agence}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`badge ${estPaye(c.statut_paiement) ? "badge-success" : "badge-warning"}`}>{c.statut_paiement ?? "—"}</span>
                  {Number(c.reste_a_payer ?? 0) > 0 && <p className="mt-1 text-xs font-medium text-red-600">reste {eur(c.reste_a_payer)}</p>}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 sm:grid-cols-4">
                <span>N° attestation : <span className="text-gray-800">{c.numero_attestation ?? "—"}</span></span>
                <span>N° facture : <span className="text-gray-800">{c.numero_facture ?? "—"}</span></span>
                <span>Montant : <span className="text-gray-800">{c.montant != null ? eur(c.montant) : "—"}</span></span>
                <span>Vendu par : <span className="text-gray-800">{c.vendu_par ?? "—"}</span></span>
              </div>

              {/* Actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                {c.telephone && <a href={`tel:${c.telephone}`} className="btn-ghost !px-2.5 !py-1 text-xs"><Phone size={14} /> {c.telephone}</a>}
                {c.email && <a href={`mailto:${c.email}`} className="btn-ghost !px-2.5 !py-1 text-xs"><Mail size={14} /> Écrire</a>}

                <a href={`/api/recu-paiement?id=${c.id}&source=${c.source}`} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-2.5 !py-1 text-xs" title="Reçu de paiement (PDF, sans numéro comptable)">
                  <Download size={14} /> Reçu (PDF)
                </a>
                {c.email && (
                  <button onClick={() => envoyerRecu(c)} disabled={recu === c.id} className="btn-ghost !px-2.5 !py-1 text-xs disabled:opacity-50" title="Envoyer le reçu par email">
                    <Send size={14} /> {recu === c.id ? "Envoi…" : "Envoyer le reçu"}
                  </button>
                )}

                {c.attestation_depose_le && c.email && (
                  <button onClick={() => renvoyer(c)} disabled={renvoi === c.id} className="btn-ghost !px-2.5 !py-1 text-xs disabled:opacity-50" title="Renvoyer l'attestation déjà émise (aucun nouveau numéro)">
                    <Send size={14} /> {renvoi === c.id ? "Envoi…" : "Renvoyer l'attestation"}
                  </button>
                )}

                {c.source === "vente" && c.session_id && (
                  <Link href={`/examens/sessions/${c.session_id}`} className="btn-ghost !px-2.5 !py-1 text-xs" title="Reporter, rembourser ou faire un avoir (flux conforme)">
                    <CalendarClock size={14} /> Reporter / modifier
                  </Link>
                )}

                <button onClick={() => setRecOuverte(recOuverte === c.id ? null : c.id)} className="btn-ghost !px-2.5 !py-1 text-xs text-amber-700">
                  {recOuverte === c.id ? <X size={14} /> : <MessageSquareWarning size={14} />} Réclamation
                </button>
              </div>

              {recOuverte === c.id && (
                <ReclamationInline candidat={c} onFait={() => { setRecOuverte(null); setOkMsg("Réclamation enregistrée."); }} onErreur={setErreur} />
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/** Mini-formulaire de réclamation pré-rempli depuis le candidat, branché sur /api/reclamations. */
function ReclamationInline({ candidat, onFait, onErreur }: { candidat: Candidat; onFait: () => void; onErreur: (m: string) => void }) {
  const [objet, setObjet] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function envoyer() {
    if (!objet.trim()) { onErreur("L'objet de la réclamation est obligatoire."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/reclamations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "examen",
          objet, detail,
          candidat_nom: candidat.nom, candidat_prenom: candidat.prenom,
          candidat_email: candidat.email, candidat_telephone: candidat.telephone,
          vente_id: candidat.source === "vente" ? candidat.id : null,
          agence: candidat.agence,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      onFait();
    } catch (e: any) { onErreur(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <input className="input mb-2" placeholder="Objet (ex. : convocation non reçue, erreur attestation…)" value={objet} onChange={(e) => setObjet(e.target.value)} />
      <textarea className="input mb-2 min-h-[60px]" placeholder="Détail (facultatif)" value={detail} onChange={(e) => setDetail(e.target.value)} />
      <div className="flex justify-end">
        <button onClick={envoyer} disabled={busy} className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">{busy ? "Enregistrement…" : "Créer la réclamation"}</button>
      </div>
    </div>
  );
}
