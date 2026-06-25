"use client";

/**
 * MYSTORY — /factures : registre des factures (§6, règle du 05/06/2026).
 * · Registre : 50 dernières factures, statut (émise / relance 1 / relance 2 / payée),
 *   actions « Marquer payée » (tampon PAYÉE + PDF regénéré) et « Renvoyer par email ».
 * · À facturer : dossiers sans facture (CPF bloqué tant que le service fait n'est pas
 *   validé EDOF — verrou art. L.6323-12) et ventes d'examen de rattrapage.
 * · « Lancer les relances dues » : J+7 → relance 1, J+15 → relance 2 (jamais CPF).
 * Le numéro FAC-AAAA-NNNNN est attribué par le serveur — séquence comptable sans trou.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

interface Facture {
  id: string; numero: string; montant: number; designation: string; client: string;
  statut: string; date_emission: string; date_paiement: string | null;
  dossier_id: string | null; vente_id: string | null;
  type?: string; serie?: string | null;
  facture_lignes?: { designation: string; montant: number; quantite: number; prix_unitaire: number; ordre: number }[];
}
interface DossierAFacturer {
  dossierId: string; certif: string; montant: number; remise?: number; client: string;
  estCpf: boolean; facturable: boolean; motifBlocage: string | null;
}
interface VenteAFacturer {
  venteId: string; numeroAttestation: string; type: string; montant: number; client: string;
}

const BADGE: Record<string, string> = {
  "émise": "bg-blue-50 border-blue-200 text-blue-800",
  "relance_1": "bg-orange-100 border-orange-300 text-orange-800",
  "relance_2": "bg-red-100 border-red-300 text-red-800",
  "payée": "bg-green-100 border-green-300 text-green-800",
};
const LIBELLE_STATUT: Record<string, string> = {
  "émise": "Émise", "relance_1": "Relance 1 (J+7)", "relance_2": "Relance 2 (J+15)", "payée": "Payée",
};

function dateFR(iso: string | null): string {
  if (!iso) return "";
  const [a, m, j] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(a, m - 1, j));
}

type AvoirLigne = { id: string; numero: string; facture_id: string; montant: number; motif: string; cree_le: string; pdf_url: string | null };

export default function PageFactures() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [aFacturer, setAFacturer] = useState<DossierAFacturer[]>([]);
  const [ventes, setVentes] = useState<VenteAFacturer[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [vue, setVue] = useState<"tous" | "formation" | "examen">("tous");
  const [avoirs, setAvoirs] = useState<Record<string, AvoirLigne[]>>({});
  const [avoirForm, setAvoirForm] = useState<{ factureId: string; numero: string; net: number; montant: string; motif: string } | null>(null);

  const recharger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/factures", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setFactures(j.factures); setAFacturer(j.aFacturer ?? []); setVentes(j.ventesAFacturer ?? []);
      const ra = await fetch("/api/avoirs", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ ok: false }));
      if (ra.ok) {
        const grp: Record<string, AvoirLigne[]> = {};
        for (const a of (ra.avoirs as AvoirLigne[])) (grp[a.facture_id] ??= []).push(a);
        setAvoirs(grp);
      }
    } catch (e: any) {
      setErreur(e?.message ?? "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => { recharger(); }, [recharger]);

  // Séparation Examen / Formation·CPF : une facture porte soit dossier_id (formation), soit vente_id (examen).
  const facturesVue = useMemo(
    () => factures.filter((f) => (vue === "tous" ? true : vue === "examen" ? !!f.vente_id : !!f.dossier_id)),
    [factures, vue]
  );
  const montrerFormation = vue !== "examen";
  const montrerExamen = vue !== "formation";

  const totaux = useMemo(() => {
    const emis = facturesVue.reduce((s, f) => s + Number(f.montant || 0), 0);
    const encaisse = facturesVue.filter((f) => f.statut === "payée").reduce((s, f) => s + Number(f.montant || 0), 0);
    return { emis, encaisse, attente: emis - encaisse, enAttenteN: facturesVue.filter((f) => f.statut !== "payée").length };
  }, [facturesVue]);

  async function action(url: string, corps: Record<string, unknown>, cle: string, message: string) {
    setBusy(cle); setErreur(null); setInfo(null);
    try {
      const r = await fetch(url, { method: corps.action ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setInfo(message + (j.numero ? ` (${j.numero})` : "") + (j.email && !j.email.envoye ? ` — ⚠️ email non envoyé : ${j.email.erreur}` : ""));
      await recharger();
    } catch (e: any) {
      setErreur(e?.message ?? "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  function netDe(f: Facture): number {
    const liste = avoirs[f.id] ?? [];
    return Number(f.montant || 0) - liste.reduce((s, a) => s + Number(a.montant || 0), 0);
  }

  function ouvrirAvoir(f: Facture) {
    const net = netDe(f);
    setAvoirForm({ factureId: f.id, numero: f.numero, net, montant: net.toFixed(2), motif: "" });
    setErreur(null); setInfo(null);
  }

  async function creerAvoir() {
    if (!avoirForm) return;
    const montant = Number(avoirForm.montant);
    if (!(montant > 0)) { setErreur("Montant de l'avoir requis (> 0)."); return; }
    if (!avoirForm.motif.trim()) { setErreur("Motif de l'avoir obligatoire."); return; }
    setBusy("avoir"); setErreur(null); setInfo(null);
    try {
      const r = await fetch("/api/avoirs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facture_id: avoirForm.factureId, montant, motif: avoirForm.motif.trim() }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setInfo(`Avoir ${j.numero} émis (− ${montant.toFixed(2)} €)${j.pdf_ok ? "" : " — PDF à régénérer"}.`);
      setAvoirForm(null);
      await recharger();
    } catch (e: any) { setErreur(e?.message ?? "Erreur."); }
    finally { setBusy(null); }
  }

  async function lancerRelances() {
    setBusy("relances"); setErreur(null); setInfo(null);
    try {
      const r = await fetch("/api/factures/relances", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setInfo(j.total === 0 ? "Aucune relance due aujourd'hui." : `${j.envoyees}/${j.total} relance(s) envoyée(s).`);
      await recharger();
    } catch (e: any) {
      setErreur(e?.message ?? "Erreur.");
    } finally {
      setBusy(null);
    }
  }

  function toggleSel(key: string) {
    setSelection((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  async function facturerEnsemble() {
    const items = [...selection].map((k) => { const [refType, refId] = k.split(":"); return { refType, refId }; });
    await action("/api/factures", { items }, "groupe", "Facture groupée émise et envoyée");
    setSelection(new Set());
  }

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">Factures</h1>
        <button
          onClick={lancerRelances}
          disabled={busy !== null}
          className="btn-primary"
        >
          {busy === "relances" ? "Relances en cours…" : "Lancer les relances dues (J+7 / J+15)"}
        </button>
      </div>

      {/* Onglets : Tous / Formation·CPF / Examen */}
      <div className="flex gap-1.5 mt-4">
        {([
          ["tous", "Tous"],
          ["formation", "🎓 Formation · CPF"],
          ["examen", "📝 Examen"],
        ] as const).map(([v, l]) => (
          <button key={v} onClick={() => setVue(v)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              vue === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
            }`}>{l}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">Émis (50 dernières)</div><div className="text-lg font-semibold">{totaux.emis.toLocaleString("fr-FR")} €</div></div>
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">Encaissé</div><div className="text-lg font-semibold text-green-700">{totaux.encaisse.toLocaleString("fr-FR")} €</div></div>
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">En attente</div><div className="text-lg font-semibold text-orange-700">{totaux.attente.toLocaleString("fr-FR")} €</div></div>
        <div className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-500">Factures non payées</div><div className="text-lg font-semibold">{totaux.enAttenteN}</div></div>
      </div>

      {erreur && <div className="mt-4 rounded-md border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-sm">{erreur}</div>}
      {info && <div className="mt-4 rounded-md border border-green-300 bg-green-50 text-green-800 px-3 py-2 text-sm">{info}</div>}

      {((montrerFormation && aFacturer.length > 0) || (montrerExamen && ventes.length > 0)) && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">À facturer</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Payeur direct : facture à l&apos;inscription · CPF : facture après service fait validé EDOF (verrou).
            Les ventes d&apos;examen sont facturées automatiquement à la vente — cette liste sert de rattrapage.
            <br/>Coche plusieurs produits d&apos;une <strong>même personne</strong> (même payeur) pour les regrouper sur une seule facture.
          </p>
          {selection.size >= 2 && (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-mystory/40 bg-blue-50 px-3 py-2">
              <span className="text-sm text-gray-700">{selection.size} produits sélectionnés</span>
              <button onClick={facturerEnsemble} disabled={busy !== null}
                className="btn-primary">
                {busy === "groupe" ? "Émission…" : "Facturer ensemble"}
              </button>
              <button onClick={() => setSelection(new Set())} className="text-sm text-gray-500 underline">Annuler la sélection</button>
            </div>
          )}
          <div className="mt-2 space-y-2">
            {montrerFormation && aFacturer.map((d) => (
              <div key={d.dossierId} className="rounded-lg border bg-white p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {!d.estCpf && d.facturable && (
                    <input type="checkbox" checked={selection.has(`dossier:${d.dossierId}`)} onChange={() => toggleSel(`dossier:${d.dossierId}`)} title="Regrouper" />
                  )}
                  <div>
                  <span className="font-medium">{d.client || "(sans nom)"}</span>
                  <span className="text-sm text-gray-500"> · {d.certif} · {Number(d.montant).toLocaleString("fr-FR")} € {d.remise ? "net" : ""}</span>
                  {!!d.remise && <span className="ml-2 text-xs px-2 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-800">remise {Number(d.remise).toLocaleString("fr-FR")} €</span>}
                  {d.estCpf && <span className="ml-2 text-xs px-2 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-800">CPF</span>}
                  {d.motifBlocage && <div className="text-xs text-orange-700 mt-0.5">⏳ {d.motifBlocage}</div>}
                  </div>
                </div>
                <button
                  onClick={() => action("/api/factures", { dossier_id: d.dossierId }, d.dossierId, "Facture émise et envoyée")}
                  disabled={!d.facturable || busy !== null}
                  className="btn-primary"
                >
                  {busy === d.dossierId ? "Émission…" : "Facturer"}
                </button>
              </div>
            ))}
            {montrerExamen && ventes.map((v) => (
              <div key={v.venteId} className="rounded-lg border bg-white p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selection.has(`vente:${v.venteId}`)} onChange={() => toggleSel(`vente:${v.venteId}`)} title="Regrouper" />
                  <div>
                  <span className="font-medium">{v.client || "(sans nom)"}</span>
                  <span className="text-sm text-gray-500"> · Examen {v.type} · {v.numeroAttestation} · {Number(v.montant).toLocaleString("fr-FR")} €</span>
                  </div>
                </div>
                <button
                  onClick={() => action("/api/factures", { vente_id: v.venteId }, v.venteId, "Facture émise et envoyée")}
                  disabled={busy !== null}
                  className="btn-primary"
                >
                  {busy === v.venteId ? "Émission…" : "Facturer"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Registre</h2>

        {avoirForm && (
          <div className="card mt-3 border border-rose-200 bg-rose-50/40">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Établir un avoir — facture {avoirForm.numero}</h3>
              <button onClick={() => setAvoirForm(null)} className="text-sm text-gray-400 hover:text-gray-600">Fermer</button>
            </div>
            <p className="mt-1 text-xs text-gray-500">Net restant : <strong>{avoirForm.net.toFixed(2)} €</strong>. L&apos;avoir ne modifie pas la facture (immuable) ; il vient en déduction (note de crédit numérotée AV-).</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input type="number" step="0.01" min="0" max={avoirForm.net} value={avoirForm.montant} onChange={(e) => setAvoirForm({ ...avoirForm, montant: e.target.value })} className="input" placeholder="Montant (€)" />
              <input value={avoirForm.motif} onChange={(e) => setAvoirForm({ ...avoirForm, motif: e.target.value })} className="input sm:col-span-2" placeholder="Motif (ex. : annulation partielle, erreur de saisie…)" />
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={creerAvoir} disabled={busy === "avoir"} className="btn-primary disabled:opacity-50">{busy === "avoir" ? "Émission…" : "Émettre l'avoir"}</button>
            </div>
          </div>
        )}
        {chargement ? (
          <p className="text-sm text-gray-500 mt-2">Chargement…</p>
        ) : facturesVue.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">Aucune facture émise pour le moment.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm table-cards">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Désignation</th>
                  <th className="px-3 py-2">Montant</th>
                  <th className="px-3 py-2">Émise le</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {facturesVue.map((f) => (
                  <tr key={f.id} className="border-t align-top">
                    <td data-label="N°" className="px-3 py-2 font-mono whitespace-nowrap">
                      {f.numero}
                      <div className="flex gap-1 mt-0.5">
                        {f.serie && <span className="font-sans text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{f.serie === "TEF_PRODUIT" ? "Examen" : f.serie}</span>}
                        {f.type === "attestation_paiement" && <span className="font-sans text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Attestation de paiement</span>}
                      </div>
                    </td>
                    <td data-label="Client" className="px-3 py-2">{f.client}</td>
                    <td data-label="Désignation" className="px-3 py-2 text-gray-600 max-w-[280px]">
                      {(f.facture_lignes && f.facture_lignes.length > 1) ? (
                        <ul className="space-y-0.5">
                          {[...f.facture_lignes].sort((a, b) => a.ordre - b.ordre).map((l, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="truncate">{l.quantite > 1 ? `${l.quantite}× ` : ""}{l.designation}</span>
                              <span className="whitespace-nowrap text-gray-500">{Number(l.montant).toLocaleString("fr-FR")} €</span>
                            </li>
                          ))}
                        </ul>
                      ) : f.designation}
                    </td>
                    <td data-label="Montant" className="px-3 py-2 whitespace-nowrap font-medium">
                      {(avoirs[f.id]?.length ?? 0) > 0 ? (
                        <>
                          <span className="text-gray-400 line-through">{Number(f.montant).toLocaleString("fr-FR")} €</span>
                          <div className="text-gray-900">net {netDe(f).toLocaleString("fr-FR")} €</div>
                          {avoirs[f.id].map((a) => (
                            <div key={a.id} className="text-[10px] font-normal text-rose-600">
                              − {Number(a.montant).toLocaleString("fr-FR")} € · {a.pdf_url ? <a href={a.pdf_url} target="_blank" rel="noopener noreferrer" className="underline">{a.numero}</a> : a.numero}
                            </div>
                          ))}
                        </>
                      ) : (
                        <>{Number(f.montant).toLocaleString("fr-FR")} €</>
                      )}
                    </td>
                    <td data-label="Émise le" className="px-3 py-2 whitespace-nowrap">{dateFR(f.date_emission)}</td>
                    <td data-label="Statut" className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded border ${BADGE[f.statut] ?? "bg-gray-50 border-gray-200 text-gray-700"}`}>
                        {LIBELLE_STATUT[f.statut] ?? f.statut}
                      </span>
                      {f.statut === "payée" && f.date_paiement && <div className="text-xs text-gray-400 mt-0.5">le {dateFR(f.date_paiement)}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {f.statut !== "payée" && (
                        <button
                          onClick={() => action("/api/factures", { id: f.id, action: "payee" }, `p-${f.id}`, `Facture ${f.numero} marquée payée`)}
                          disabled={busy !== null}
                          className="px-2 py-1 rounded-md text-xs border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-40 mr-1"
                        >
                          {busy === `p-${f.id}` ? "…" : "Marquer payée"}
                        </button>
                      )}
                      {netDe(f) > 0 && (
                        <button
                          onClick={() => ouvrirAvoir(f)}
                          disabled={busy !== null}
                          className="px-2 py-1 rounded-md text-xs border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40 mr-1"
                        >
                          Avoir
                        </button>
                      )}
                      <button
                        onClick={() => action("/api/factures", { id: f.id, action: "renvoyer" }, `r-${f.id}`, `Facture ${f.numero} renvoyée`)}
                        disabled={busy !== null}
                        className="px-2 py-1 rounded-md text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {busy === `r-${f.id}` ? "…" : "Renvoyer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Numérotation FAC-AAAA-NNNNN séquentielle sans trou, attribuée par le serveur — document comptable : aucune suppression possible.
        </p>
      </section>
    </main>
  );
}
