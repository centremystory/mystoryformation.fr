"use client";
// app/partenaire/[token]/page.tsx — Portail partenaire (formateur indépendant / sous-traitant).
// Accès par jeton non devinable. Lecture des séances/stagiaires + dépôts (émargement, facture, justificatif).
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const BLEU = "#2F72DE";
type Seance = { id: string; date_seance: string; demi_journee: string; heures: number | null; heures_realisees: number | null; emarge: boolean; stagiaire: string; certif: string };
type Depot = { id: string; type: string; nom: string | null; montant: number | null; periode: string | null; statut: string; depose_le: string; url: string | null };
type Data = {
  partenaire: { nom: string; prenom: string | null; raison_sociale: string | null; type: string };
  seances: Seance[]; depots: Depot[];
  conformite: { justificatif_fle: boolean; statut: string };
};
const DEMI: Record<string, string> = { matin: "Matin (9h30–12h30)", apres_midi: "Après-midi (14h–17h)" };
const TYPE_DEPOT: Record<string, string> = { emargement: "Feuille d'émargement signée", facture: "Facture de sous-traitance", justificatif: "Justificatif FLE" };
const STATUT_BADGE: Record<string, string> = { soumis: "bg-amber-50 text-amber-700", valide: "bg-emerald-50 text-emerald-700", refuse: "bg-red-50 text-red-700" };
const dateFr = (iso: string | null) => { if (!iso) return ""; const [a, m, j] = iso.split("-"); return `${j}/${m}/${a}`; };

export default function PortailPartenaire() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [charge, setCharge] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [montant, setMontant] = useState("");
  const [periode, setPeriode] = useState("");
  const refs = { emargement: useRef<HTMLInputElement>(null), facture: useRef<HTMLInputElement>(null), justificatif: useRef<HTMLInputElement>(null) };

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/partenaire/${token}`, { cache: "no-store" });
      if (r.status === 404) { setIntrouvable(true); return; }
      const j = await r.json();
      if (j.ok) setData(j);
    } catch { setIntrouvable(true); }
    finally { setCharge(false); }
  }, [token]);
  useEffect(() => { charger(); }, [charger]);

  async function deposer(type: "emargement" | "facture" | "justificatif", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (type === "facture" && (!montant || Number(montant) <= 0)) { setMsg("Renseigne le montant de la facture avant de déposer."); return; }
    setBusy(type); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("type", type); fd.append("fichier", file);
      if (type === "facture") { fd.append("montant", montant); if (periode) fd.append("periode", periode); }
      const r = await fetch(`/api/partenaire/${token}/depot`, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec du dépôt.");
      setMsg("✅ Document déposé."); setMontant(""); setPeriode("");
      await charger();
    } catch (e: any) { setMsg(e?.message || "Échec du dépôt."); }
    finally { setBusy(null); }
  }

  if (charge) return <main className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500">Chargement…</main>;
  if (introuvable || !data) return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-gray-900">Lien invalide</h1>
      <p className="text-gray-500 mt-2">Ce lien partenaire n'est plus valide. Contactez MYSTORY à contact@mystoryformation.fr.</p>
    </main>
  );

  const nomAffiche = data.partenaire.raison_sociale || `${data.partenaire.prenom ? data.partenaire.prenom + " " : ""}${data.partenaire.nom}`;
  const Depots = ({ type }: { type: "emargement" | "facture" | "justificatif" }) => (
    <button onClick={() => refs[type].current?.click()} disabled={busy === type}
      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: BLEU }}>
      {busy === type ? "Envoi…" : `Déposer`}
    </button>
  );

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-6 border-b-2 pb-4" style={{ borderColor: BLEU }}>
        <div className="text-2xl font-bold" style={{ color: BLEU }}>MYSTORY — Espace partenaire</div>
        <p className="text-gray-700 mt-1">Bonjour <b>{nomAffiche}</b>.</p>
      </header>

      {msg && <div className="mb-4 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">{msg}</div>}

      {/* Conformité */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Conformité — Justificatif FLE</h2>
        <div className="mt-2 flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${data.conformite.justificatif_fle ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {data.conformite.statut}
          </span>
          <span className="flex-1" />
          <input ref={refs.justificatif} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => deposer("justificatif", e)} />
          <Depots type="justificatif" />
        </div>
        <p className="mt-2 text-xs text-gray-500">Un diplôme/justificatif FLE est requis pour intervenir sur les dossiers stagiaires.</p>
      </section>

      {/* Séances & stagiaires */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Mes séances & stagiaires</h2>
        {data.seances.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune séance rattachée pour le moment.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase">
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Demi-journée</th><th className="px-3 py-2">Stagiaire</th><th className="px-3 py-2">Formation</th><th className="px-3 py-2">Émargé</th>
              </tr></thead>
              <tbody>
                {data.seances.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">{dateFr(s.date_seance)}</td>
                    <td className="px-3 py-2 text-gray-600">{DEMI[s.demi_journee] ?? s.demi_journee}</td>
                    <td className="px-3 py-2">{s.stagiaire}</td>
                    <td className="px-3 py-2 text-gray-600">{s.certif}</td>
                    <td className="px-3 py-2">{s.emarge ? "✅" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dépôts émargement + facture */}
      <section className="mb-6 grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-800">Feuille d'émargement signée</h2>
          <p className="mt-1 text-xs text-gray-500 mb-3">Déposez le scan de votre feuille signée (PDF/photo).</p>
          <input ref={refs.emargement} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => deposer("emargement", e)} />
          <Depots type="emargement" />
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-800">Facture de sous-traitance</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" placeholder="Montant € HT" className="border rounded px-2 py-1.5 text-sm w-28" />
            <input value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="Période (ex. Juin 2026)" className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[120px]" />
          </div>
          <div className="mt-3">
            <input ref={refs.facture} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => deposer("facture", e)} />
            <Depots type="facture" />
          </div>
        </div>
      </section>

      {/* Historique des dépôts */}
      <section>
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Mes dépôts</h2>
        {data.depots.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun dépôt pour le moment.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
            {data.depots.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium text-gray-800">{TYPE_DEPOT[d.type] ?? d.type}</span>
                {d.montant != null && <span className="text-gray-600">· {d.montant.toLocaleString("fr-FR")} €</span>}
                {d.periode && <span className="text-gray-500">· {d.periode}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUT_BADGE[d.statut] ?? "bg-gray-100 text-gray-600"}`}>{d.statut}</span>
                <span className="flex-1" />
                <span className="text-xs text-gray-400">{new Date(d.depose_le).toLocaleDateString("fr-FR")}</span>
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: BLEU }}>Voir</a>}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400 mt-8">MYSTORY — NDA 11756521775. Lieu de formation : Gagny. Contact : contact@mystoryformation.fr.</p>
    </main>
  );
}
