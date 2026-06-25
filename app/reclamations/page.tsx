"use client";
// app/reclamations/page.tsx — Réclamations candidats (examen) & stagiaires (formation).
// Liste filtrable + création + cycle de statut (ouverte → en cours → résolue) + archivage.
// Aucune suppression : archivage seulement. Horodatages posés serveur.
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquareWarning, Plus, Phone, Mail, Check, RotateCcw, Archive, X, Download } from "lucide-react";

type Reclamation = {
  id: string;
  type: "examen" | "formation";
  candidat_nom: string | null;
  candidat_prenom: string | null;
  candidat_email: string | null;
  candidat_telephone: string | null;
  objet: string;
  detail: string | null;
  statut: "ouverte" | "en_cours" | "resolue";
  priorite: "basse" | "normale" | "haute";
  agence: string | null;
  cree_par: string | null;
  cree_le: string;
  resolu_le: string | null;
  resolu_par: string | null;
};

const AGENCES = ["Gagny", "Sarcelles", "Rosny"] as const;
const ORDRE_STATUT: Record<Reclamation["statut"], number> = { ouverte: 0, en_cours: 1, resolue: 2 };

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function nomComplet(r: Reclamation): string {
  return `${r.candidat_prenom ?? ""} ${r.candidat_nom ?? ""}`.trim() || "Candidat non précisé";
}
const badgeStatut: Record<Reclamation["statut"], string> = {
  ouverte: "badge-warning",
  en_cours: "badge-info",
  resolue: "badge-success",
};
const libStatut: Record<Reclamation["statut"], string> = { ouverte: "Ouverte", en_cours: "En cours", resolue: "Résolue" };

export default function PageReclamations() {
  const [items, setItems] = useState<Reclamation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [fType, setFType] = useState<string>("tous");
  const [fStatut, setFStatut] = useState<string>("actives");

  const [ouvertForm, setOuvertForm] = useState(false);
  const [form, setForm] = useState({
    type: "examen", candidat_prenom: "", candidat_nom: "", candidat_telephone: "", candidat_email: "",
    objet: "", detail: "", priorite: "normale", agence: "",
  });

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const p = new URLSearchParams();
      if (fType !== "tous") p.set("type", fType);
      if (fStatut !== "actives" && fStatut !== "toutes") p.set("statut", fStatut);
      const r = await fetch(`/api/reclamations?${p.toString()}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Lecture impossible.");
      let liste: Reclamation[] = j.reclamations;
      if (fStatut === "actives") liste = liste.filter((x) => x.statut !== "resolue");
      liste.sort((a, b) => ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut] || b.cree_le.localeCompare(a.cree_le));
      setItems(liste);
      setErreur(null);
    } catch (e: any) { setErreur(e.message); }
    finally { setChargement(false); }
  }, [fType, fStatut]);

  useEffect(() => { charger(); }, [charger]);

  async function creer() {
    if (!form.objet.trim()) { setErreur("L'objet de la réclamation est obligatoire."); return; }
    setBusy("create");
    try {
      const r = await fetch("/api/reclamations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setForm({ type: "examen", candidat_prenom: "", candidat_nom: "", candidat_telephone: "", candidat_email: "", objet: "", detail: "", priorite: "normale", agence: "" });
      setOuvertForm(false);
      await charger();
    } catch (e: any) { setErreur(e.message); }
    finally { setBusy(null); }
  }

  async function action(id: string, action: "statut" | "archive", statut?: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/reclamations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, statut }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      await charger();
    } catch (e: any) { setErreur(e.message); }
    finally { setBusy(null); }
  }

  const nbOuvertes = useMemo(() => items.filter((x) => x.statut !== "resolue").length, [items]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystory-clair text-mystory-fonce">
            <MessageSquareWarning size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="page-title text-2xl">Réclamations</h1>
            <p className="page-subtitle">Candidats à l&apos;examen et stagiaires en formation.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/reclamations/export?format=csv" className="btn-ghost text-xs"><Download size={14} /> Registre (CSV)</a>
          <a href="/api/reclamations/export?format=pdf" className="btn-ghost text-xs"><Download size={14} /> Registre (PDF)</a>
          <button onClick={() => setOuvertForm((v) => !v)} className="btn-primary">
            {ouvertForm ? <X size={16} /> : <Plus size={16} />} {ouvertForm ? "Fermer" : "Nouvelle réclamation"}
          </button>
        </div>
      </header>

      {erreur && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{erreur}</div>}

      {/* Formulaire de création */}
      {ouvertForm && (
        <div className="card mb-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="examen">Examen</option>
                <option value="formation">Formation</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Priorité</label>
              <select className="input" value={form.priorite} onChange={(e) => setForm({ ...form, priorite: e.target.value })}>
                <option value="basse">Basse</option>
                <option value="normale">Normale</option>
                <option value="haute">Haute</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Prénom</label>
              <input className="input" value={form.candidat_prenom} onChange={(e) => setForm({ ...form, candidat_prenom: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Nom</label>
              <input className="input" value={form.candidat_nom} onChange={(e) => setForm({ ...form, candidat_nom: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Téléphone</label>
              <input className="input" value={form.candidat_telephone} onChange={(e) => setForm({ ...form, candidat_telephone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">E-mail</label>
              <input className="input" value={form.candidat_email} onChange={(e) => setForm({ ...form, candidat_email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Agence</label>
              <select className="input" value={form.agence} onChange={(e) => setForm({ ...form, agence: e.target.value })}>
                <option value="">—</option>
                {AGENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Objet *</label>
              <input className="input" placeholder="Ex. : convocation non reçue, erreur sur l'attestation…" value={form.objet} onChange={(e) => setForm({ ...form, objet: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Détail</label>
              <textarea className="input min-h-[80px]" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={creer} disabled={busy === "create"} className="btn-primary disabled:opacity-50">
              {busy === "create" ? "Enregistrement…" : "Enregistrer la réclamation"}
            </button>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input max-w-[160px]" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="tous">Tous les types</option>
          <option value="examen">Examen</option>
          <option value="formation">Formation</option>
        </select>
        <select className="input max-w-[170px]" value={fStatut} onChange={(e) => setFStatut(e.target.value)}>
          <option value="actives">À traiter (ouvertes + en cours)</option>
          <option value="ouverte">Ouvertes</option>
          <option value="en_cours">En cours</option>
          <option value="resolue">Résolues</option>
          <option value="toutes">Toutes</option>
        </select>
        <span className="ml-auto text-sm text-gray-500">{nbOuvertes} à traiter</span>
      </div>

      {/* Liste */}
      {chargement ? (
        <div className="card"><p className="text-sm text-gray-400">Chargement…</p></div>
      ) : items.length === 0 ? (
        <div className="card"><div className="empty-state"><Check size={28} className="text-success-600" /><p className="text-sm font-medium text-gray-700">Aucune réclamation</p><p className="text-xs text-gray-400">Rien à traiter sur ce filtre.</p></div></div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-neutral">{r.type === "examen" ? "Examen" : "Formation"}</span>
                <span className={`badge ${badgeStatut[r.statut]}`}>{libStatut[r.statut]}</span>
                {r.priorite === "haute" && <span className="badge badge-warning">Priorité haute</span>}
                {r.agence && <span className="badge badge-neutral">{r.agence}</span>}
                <span className="ml-auto text-xs text-gray-400">{dateFr(r.cree_le)}</span>
              </div>
              <p className="mt-2 font-semibold text-gray-900">{r.objet}</p>
              <p className="text-sm text-gray-500">{nomComplet(r)}</p>
              {r.detail && <p className="mt-1 text-sm text-gray-700">{r.detail}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.candidat_telephone && (
                  <a href={`tel:${r.candidat_telephone}`} className="btn-ghost !px-2.5 !py-1 text-xs"><Phone size={14} /> {r.candidat_telephone}</a>
                )}
                {r.candidat_email && (
                  <a href={`mailto:${r.candidat_email}`} className="btn-ghost !px-2.5 !py-1 text-xs"><Mail size={14} /> Écrire</a>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {r.statut === "ouverte" && (
                    <button onClick={() => action(r.id, "statut", "en_cours")} disabled={busy === r.id} className="btn-ghost !px-2.5 !py-1 text-xs disabled:opacity-50">Prendre en charge</button>
                  )}
                  {r.statut !== "resolue" && (
                    <button onClick={() => action(r.id, "statut", "resolue")} disabled={busy === r.id} className="btn-primary !px-2.5 !py-1 text-xs disabled:opacity-50"><Check size={14} /> Résolue</button>
                  )}
                  {r.statut === "resolue" && (
                    <button onClick={() => action(r.id, "statut", "ouverte")} disabled={busy === r.id} className="btn-ghost !px-2.5 !py-1 text-xs disabled:opacity-50"><RotateCcw size={14} /> Rouvrir</button>
                  )}
                  <button onClick={() => action(r.id, "archive")} disabled={busy === r.id} className="btn-ghost !px-2.5 !py-1 text-xs text-gray-400 disabled:opacity-50" title="Archiver"><Archive size={14} /></button>
                </div>
              </div>
              {r.statut === "resolue" && r.resolu_le && (
                <p className="mt-2 text-xs text-gray-400">Résolue le {dateFr(r.resolu_le)}{r.resolu_par ? ` par ${r.resolu_par}` : ""}.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
