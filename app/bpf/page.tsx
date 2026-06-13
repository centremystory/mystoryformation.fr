"use client";

/**
 * MYSTORY — Onglet BPF (Cerfa 10443*16). Année N-1 par défaut.
 * Affiche produits, heures-stagiaires, charges (sous-traitance) et les ANOMALIES (jamais masquées).
 */
import { useCallback, useEffect, useState } from "react";

type Synthese = {
  annee: number;
  produits: { par_origine: Array<{ origine: string; libelle: string; montant: number }>; total: number };
  heures_stagiaires: { total: number; estimees: number; emargees: number };
  nb_stagiaires: number; nb_dossiers: number;
  par_certif: Array<{ code: string; intitule: string; dossiers: number; produits: number; heures: number }>;
  charges: { sous_traitance_total: number; lignes: Array<{ prestataire: string; montant: number; facture_ref: string | null; contrat_ref: string | null; attestation: boolean }> };
  depot: null | { total_produits: number; cpf: number; entreprises: number; plan_autres: number; autres_of: number; autres_produits: number; part_ca_pct: number; charges_total: number; salaires_formateurs: number; achats_prestations: number; cerfa: string | null };
  ecarts: Array<{ poste: string; crm: number; depose: number; ecart: number }>;
  anomalies: Array<{ niveau: "bloquant" | "info"; message: string }>;
};

const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const h = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " h";

export default function Bpf() {
  const annNcouranteMoins1 = new Date().getFullYear() - 1;
  const [annee, setAnnee] = useState(annNcouranteMoins1);
  const [s, setS] = useState<Synthese | null>(null);
  const [rappel, setRappel] = useState<{ du: boolean; annee: number; message: string } | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // mini-formulaire sous-traitance
  const [presta, setPresta] = useState(""); const [montant, setMontant] = useState("");
  const [factureRef, setFactureRef] = useState(""); const [contratRef, setContratRef] = useState("");
  const [attest, setAttest] = useState(false); const [ajout, setAjout] = useState(false);

  // formulaire « BPF déposé » (référence officielle)
  const [editDepot, setEditDepot] = useState(false);
  const [dep, setDep] = useState<Record<string, string>>({});
  const [saveDepot, setSaveDepot] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true); setErreur(null);
    try {
      const r = await fetch(`/api/bpf?annee=${annee}`);
      const j = await r.json();
      if (j.ok) { setS(j.synthese); setRappel(j.rappel ?? null); } else setErreur(j.erreur || "Erreur.");
    } catch { setErreur("Erreur de chargement."); }
    finally { setChargement(false); }
  }, [annee]);

  useEffect(() => { charger(); }, [charger]);

  async function ajouterST() {
    if (!presta.trim() || !(Number(montant) >= 0)) return;
    setAjout(true);
    try {
      const r = await fetch("/api/bpf/sous-traitance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sens: "confiee", prestataire: presta, annee, montant: Number(montant), facture_ref: factureRef, contrat_ref: contratRef, attestation: attest }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Ajout impossible."); return; }
      setPresta(""); setMontant(""); setFactureRef(""); setContratRef(""); setAttest(false);
      await charger();
    } catch { setErreur("Ajout impossible."); }
    finally { setAjout(false); }
  }

  const bloquants = s?.anomalies.filter((a) => a.niveau === "bloquant") ?? [];
  const infos = s?.anomalies.filter((a) => a.niveau === "info") ?? [];

  function ouvrirDepot() {
    const d = s?.depot;
    setDep({
      cerfa: d?.cerfa ?? "",
      total_produits: d ? String(d.total_produits) : "",
      cpf: d ? String(d.cpf) : "",
      entreprises: d ? String(d.entreprises) : "",
      plan_autres: d ? String(d.plan_autres) : "",
      autres_of: d ? String(d.autres_of) : "",
      autres_produits: d ? String(d.autres_produits) : "",
      charges_total: d ? String(d.charges_total) : "",
      salaires_formateurs: d ? String(d.salaires_formateurs) : "",
      achats_prestations: d ? String(d.achats_prestations) : "",
      part_ca_pct: d ? String(d.part_ca_pct) : "",
    });
    setErreur(null);
    setEditDepot(true);
  }

  async function enregistrerDepot() {
    if (!(Number(dep.total_produits) >= 0)) { setErreur("Total des produits déposés requis."); return; }
    setSaveDepot(true);
    try {
      const r = await fetch("/api/bpf/depot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee, ...dep }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Enregistrement impossible."); return; }
      setEditDepot(false);
      await charger();
    } catch { setErreur("Enregistrement impossible."); }
    finally { setSaveDepot(false); }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">📊 Bilan Pédagogique et Financier</h1>
      <p className="mt-1 text-sm text-gray-500">
        Cerfa 10443*16 — dépôt avant le 30 avril. Réconcilie CRM ↔ EDOF ↔ compta. Les écarts sont affichés, jamais lissés.
      </p>

      {rappel?.du && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-300 p-3 text-sm text-amber-800">
          ⏰ <span className="font-semibold">Rappel :</span> {rappel.message}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <label className="text-sm text-gray-600">Année</label>
        <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          {[0, 1, 2, 3].map((k) => { const y = annNcouranteMoins1 - k; return <option key={y} value={y}>{y}{k === 0 ? " (N-1)" : ""}</option>; })}
        </select>
        {chargement && <span className="text-sm text-gray-400">Calcul…</span>}
        <div className="ml-auto flex gap-2">
          <a href={`/api/bpf/export?annee=${annee}&format=csv`}
             className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Export CSV</a>
          <a href={`/api/bpf/export?annee=${annee}&format=pdf`}
             className="rounded-lg bg-mystory px-3 py-2 text-sm font-semibold text-white">Export PDF (Cerfa)</a>
        </div>
      </div>

      {erreur && <p className="mt-4 text-sm text-red-600">{erreur}</p>}

      {s && (
        <>
          {/* Anomalies bloquantes */}
          {bloquants.length > 0 && (
            <div className="mt-5 rounded-xl bg-red-50 border border-red-200 p-4">
              <h2 className="text-sm font-bold text-red-800">🔴 À corriger avant dépôt</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                {bloquants.map((a, i) => <li key={i}>{a.message}</li>)}
              </ul>
            </div>
          )}

          {/* Tuiles */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Produits", eur(s.produits.total)],
              ["Heures-stagiaires", h(s.heures_stagiaires.total)],
              ["Stagiaires", String(s.nb_stagiaires)],
              ["Dossiers réalisés", String(s.nb_dossiers)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500">{l}</div>
                <div className="mt-1 text-xl font-bold text-gray-900">{v}</div>
              </div>
            ))}
          </div>

          {/* Cadre B/C — Produits par origine de fonds */}
          <h2 className="mt-6 text-sm font-semibold text-gray-800">Cadres B/C — Produits par origine de fonds</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {s.produits.par_origine.map((p) => (
                <tr key={p.origine} className="border-b">
                  <td className="py-2">{p.libelle}</td>
                  <td className="py-2 text-right font-medium">{eur(p.montant)}</td>
                </tr>
              ))}
              <tr className="font-bold"><td className="py-2">Total produits</td><td className="py-2 text-right text-mystory">{eur(s.produits.total)}</td></tr>
            </tbody>
          </table>

          {/* Cadres D/E — Pédagogique */}
          <h2 className="mt-6 text-sm font-semibold text-gray-800">Cadres D/E — Activité pédagogique</h2>
          <p className="mt-1 text-xs text-gray-500">
            Heures émargées (vivant) : {h(s.heures_stagiaires.emargees)} · estimées (historique, tarif × taux) : {h(s.heures_stagiaires.estimees)}.
          </p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th className="border-b py-2">Certification</th><th className="border-b py-2 text-right">Dossiers</th>
              <th className="border-b py-2 text-right">Produits</th><th className="border-b py-2 text-right">Heures</th>
            </tr></thead>
            <tbody>
              {s.par_certif.map((c) => (
                <tr key={c.code} className="border-b">
                  <td className="py-2">{c.code}{c.intitule ? ` — ${c.intitule}` : ""}</td>
                  <td className="py-2 text-right">{c.dossiers}</td>
                  <td className="py-2 text-right">{eur(c.produits)}</td>
                  <td className="py-2 text-right">{h(c.heures)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Cadre CHARGES — Sous-traitance */}
          <h2 className="mt-6 text-sm font-semibold text-gray-800">Cadre CHARGES — Achats de prestations (sous-traitance confiée)</h2>
          {s.charges.lignes.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Aucune ligne saisie.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {s.charges.lignes.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2">{l.prestataire}{!l.contrat_ref ? " ⚠️" : ""}{!l.attestation ? " ⚠️" : ""}</td>
                    <td className="py-2 text-right font-medium">{eur(l.montant)}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td className="py-2">Total achats de prestations</td><td className="py-2 text-right text-mystory">{eur(s.charges.sous_traitance_total)}</td></tr>
              </tbody>
            </table>
          )}

          {/* Saisie sous-traitance */}
          <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-800">Ajouter une sous-traitance {annee}</h3>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={presta} onChange={(e) => setPresta(e.target.value)} placeholder="Prestataire (Sahgo, Queeness, IFIE…)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Montant € HT" inputMode="decimal" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={factureRef} onChange={(e) => setFactureRef(e.target.value)} placeholder="Réf. facture" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={contratRef} onChange={(e) => setContratRef(e.target.value)} placeholder="Réf. contrat" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
              Attestation anti-démarchage fournie
            </label>
            <button onClick={ajouterST} disabled={ajout || !presta.trim() || !(Number(montant) >= 0)}
              className="mt-2 rounded-xl bg-mystory px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {ajout ? "Ajout…" : "Ajouter"}
            </button>
          </div>

          {/* Saisie du BPF déposé (référence officielle de réconciliation) */}
          <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">BPF déposé {annee} — chiffres officiels</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  À saisir après la télédéclaration : sert de référence pour la réconciliation ci-dessous.
                  {s.depot ? " Déjà renseigné — modifiable." : " Pas encore renseigné."}
                </p>
              </div>
              {!editDepot && (
                <button onClick={ouvrirDepot} className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {s.depot ? "Corriger" : "Saisir"}
                </button>
              )}
            </div>

            {editDepot && (
              <div className="mt-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    ["total_produits", "Total produits €"],
                    ["cpf", "dont CPF/CDC €"],
                    ["entreprises", "dont Entreprises €"],
                    ["plan_autres", "dont Plan/autres €"],
                    ["autres_of", "dont Autres OF €"],
                    ["autres_produits", "dont Autres produits €"],
                    ["charges_total", "Charges totales €"],
                    ["salaires_formateurs", "Salaires formateurs €"],
                    ["achats_prestations", "Achats prestations €"],
                    ["part_ca_pct", "Part CA formation %"],
                  ] as const).map(([k, lab]) => (
                    <label key={k} className="text-xs text-gray-600">
                      <span className="block mb-1">{lab}</span>
                      <input value={dep[k] ?? ""} onChange={(e) => setDep({ ...dep, [k]: e.target.value })}
                        inputMode="decimal" placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    </label>
                  ))}
                  <label className="text-xs text-gray-600">
                    <span className="block mb-1">N° Cerfa / réf.</span>
                    <input value={dep.cerfa ?? ""} onChange={(e) => setDep({ ...dep, cerfa: e.target.value })}
                      placeholder="10443*16" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={enregistrerDepot} disabled={saveDepot}
                    className="rounded-xl bg-mystory px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {saveDepot ? "Enregistrement…" : "Enregistrer le déposé"}
                  </button>
                  <button onClick={() => setEditDepot(false)} disabled={saveDepot}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600">Annuler</button>
                </div>
              </div>
            )}
          </div>

          {/* Comparatif CRM vs déposé */}
          {s.depot && (
            <>
              <h2 className="mt-6 text-sm font-semibold text-gray-800">Réconciliation CRM ↔ BPF déposé{s.depot.cerfa ? ` (Cerfa ${s.depot.cerfa})` : ""}</h2>
              <table className="mt-2 w-full text-sm">
                <thead><tr className="text-left text-gray-500">
                  <th className="border-b py-2">Poste</th><th className="border-b py-2 text-right">CRM</th>
                  <th className="border-b py-2 text-right">Déposé</th><th className="border-b py-2 text-right">Écart</th>
                </tr></thead>
                <tbody>
                  {s.ecarts.map((e) => (
                    <tr key={e.poste} className="border-b">
                      <td className="py-2">{e.poste}</td>
                      <td className="py-2 text-right">{eur(e.crm)}</td>
                      <td className="py-2 text-right">{eur(e.depose)}</td>
                      <td className={`py-2 text-right font-medium ${Math.abs(e.ecart) < 1 ? "text-green-600" : "text-red-600"}`}>
                        {Math.abs(e.ecart) < 1 ? "✓ 0" : (e.ecart > 0 ? "+" : "") + eur(e.ecart)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-gray-500">Déposé = valeurs du BPF officiel télétransmis. Un écart n'est pas forcément une erreur, mais doit être expliqué avant dépôt.</p>
            </>
          )}

          {/* Anomalies info */}
          {infos.length > 0 && (
            <div className="mt-5 rounded-xl bg-gray-50 border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700">À rapprocher / points d'attention</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-600">
                {infos.map((a, i) => <li key={i}>{a.message}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}

