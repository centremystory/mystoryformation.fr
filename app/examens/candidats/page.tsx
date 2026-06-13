"use client";
// app/examens/candidats/page.tsx — Candidats d'examen, groupés par session.
// Lit la vue unifiée (historique import + ventes vivantes). Filtres : type, agence, recherche.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BLEU = "#2F72DE";

type Candidat = {
  id: string;
  source: string;
  nom: string;
  prenom: string | null;
  civilite: string | null;
  email: string | null;
  telephone: string | null;
  type_brut: string | null;
  type_norm: string;
  sous_type: string | null;
  date_examen: string | null;
  horaire: string | null;
  agence: string | null;
  statut_paiement: string | null;
  numero_attestation: string | null;
  numero_facture: string | null;
  vendu_par: string | null;
  montant: number | null;
  a_confirmer: boolean;
  date_inscription: string | null;
  attestation_nom: string | null;
  attestation_depose_le: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  TEF_IRN: "TEF IRN",
  CIVIQUE: "Examen civique",
  PLATEFORME: "Vente plateforme",
  AUTRE: "Autre",
};

function dateFr(iso: string | null): string {
  if (!iso) return "Sans date";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

function paye(statut: string | null): boolean {
  return (statut ?? "").toLowerCase().includes("pay");
}

export default function PageCandidatsExamen() {
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [fType, setFType] = useState<string>("tous");
  const [fAgence, setFAgence] = useState<string>("toutes");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [uploadRef, setUploadRef] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cibleRef = useRef<{ examen_ref: string; source: string } | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/examens/candidats", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setCandidats(j.candidats);
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const q = recherche.trim().toLowerCase();

  const filtres = useMemo(
    () =>
      candidats.filter((c) => {
        if (fType !== "tous" && c.type_norm !== fType) return false;
        if (fAgence !== "toutes" && (c.agence ?? "") !== fAgence) return false;
        if (!q) return true;
        return `${c.prenom ?? ""} ${c.nom}`.toLowerCase().includes(q);
      }),
    [candidats, fType, fAgence, q]
  );

  // Regroupement par session = date d'examen + type
  const groupes = useMemo(() => {
    const m = new Map<string, { cle: string; date: string | null; type: string; items: Candidat[] }>();
    for (const c of filtres) {
      const cle = `${c.date_examen ?? "sansdate"}|${c.type_norm}`;
      if (!m.has(cle)) m.set(cle, { cle, date: c.date_examen, type: c.type_norm, items: [] });
      m.get(cle)!.items.push(c);
    }
    return Array.from(m.values()).sort((a, b) => {
      if (a.date && b.date) return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; // récent d'abord
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }, [filtres]);

  const nbAConfirmer = candidats.filter((c) => c.a_confirmer).length;

  function basculer(cle: string) {
    setOuverts((prev) => {
      const n = new Set(prev);
      n.has(cle) ? n.delete(cle) : n.add(cle);
      return n;
    });
  }

  function ouvrirDepot(c: Candidat) {
    cibleRef.current = { examen_ref: c.id, source: c.source };
    fileInputRef.current?.click();
  }

  async function fichierChoisi(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const cible = cibleRef.current;
    e.target.value = "";
    if (!file || !cible) return;
    setUploadRef(cible.examen_ref);
    setErreur(null);
    try {
      const fd = new FormData();
      fd.append("examen_ref", cible.examen_ref);
      fd.append("source", cible.source);
      fd.append("fichier", file);
      const r = await fetch("/api/examens/attestations", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec de l'envoi.");
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Échec de l'envoi.");
    } finally {
      setUploadRef(null);
      cibleRef.current = null;
    }
  }

  async function voirAttestation(c: Candidat) {
    setErreur(null);
    try {
      const r = await fetch(`/api/examens/attestations?examen_ref=${encodeURIComponent(c.id)}&source=${encodeURIComponent(c.source)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Lien indisponible.");
      window.open(j.url, "_blank", "noreferrer");
    } catch (e: any) {
      setErreur(e?.message || "Lien indisponible.");
    }
  }

  const compteType = (t: string) => candidats.filter((c) => c.type_norm === t).length;

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidats d'examen</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Liste par session (TEF IRN &amp; civique) — centre d'examen : Gagny. Filtrable par agence d'inscription.
          </p>
        </div>
      </header>

      {/* Compteurs */}
      <div className="flex flex-wrap gap-3 mb-5 text-sm">
        <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
          {candidats.length} candidats
        </span>
        <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
          🎓 {compteType("TEF_IRN")} TEF IRN
        </span>
        <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
          🏛️ {compteType("CIVIQUE")} civique
        </span>
        {nbAConfirmer > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            ⏳ {nbAConfirmer} à confirmer
          </span>
        )}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un candidat…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-60 bg-white"
        />
        <div className="flex gap-1.5">
          {([
            ["tous", "Tous types"],
            ["TEF_IRN", "TEF IRN"],
            ["CIVIQUE", "Civique"],
            ["PLATEFORME", "Plateforme"],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFType(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                fType === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {([
            ["toutes", "Toutes agences"],
            ["Gagny", "Gagny"],
            ["Sarcelles", "Sarcelles"],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFAgence(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                fAgence === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {erreur && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{erreur}</div>
      )}

      {/* Input fichier caché, partagé par tous les boutons de dépôt d'attestation */}
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
             className="hidden" onChange={fichierChoisi} />

      {chargement ? (
        <p className="text-gray-500">Chargement…</p>
      ) : groupes.length === 0 ? (
        <p className="text-gray-500">Aucun candidat ne correspond à ces filtres.</p>
      ) : (
        <div className="space-y-3">
          {groupes.map((g) => {
            const ouvert = q.length > 0 || ouverts.has(g.cle);
            const aConf = g.items.filter((c) => c.a_confirmer).length;
            return (
              <div key={g.cle} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                <button onClick={() => basculer(g.cle)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50">
                  <span className="font-medium text-gray-900">
                    📅 {dateFr(g.date)} <span className="text-gray-400">·</span> {TYPE_LABEL[g.type] ?? g.type}
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    {aConf > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">⏳ {aConf}</span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{g.items.length}</span>
                    <span className="text-gray-400">{ouvert ? "▴" : "▾"}</span>
                  </span>
                </button>
                {ouvert && (
                  <div className="overflow-x-auto border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                          <th className="px-4 py-2 font-medium">Candidat</th>
                          <th className="px-4 py-2 font-medium">Agence</th>
                          <th className="px-4 py-2 font-medium">Paiement</th>
                          <th className="px-4 py-2 font-medium">N° attest.</th>
                          <th className="px-4 py-2 font-medium">Fichier attest.</th>
                          <th className="px-4 py-2 font-medium">Vendu par</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((c) => (
                          <tr key={c.id} className="border-t border-gray-100">
                            <td className="px-4 py-2 font-medium text-gray-900">
                              {c.civilite ? `${c.civilite} ` : ""}{c.prenom ? `${c.prenom} ` : ""}{c.nom}
                              {c.a_confirmer && <span className="ml-2 text-xs text-amber-700">⏳ à confirmer</span>}
                              {c.source === "vente" && <span className="ml-2 text-xs text-emerald-700">• vente</span>}
                            </td>
                            <td className="px-4 py-2 text-gray-600">{c.agence ?? "—"}</td>
                            <td className="px-4 py-2">
                              <span className={paye(c.statut_paiement) ? "text-emerald-700" : "text-gray-600"}>
                                {c.statut_paiement ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{c.numero_attestation ?? "—"}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              {c.attestation_depose_le ? (
                                <span>
                                  <button onClick={() => voirAttestation(c)} className="underline" style={{ color: BLEU }}>📄 Voir</button>
                                  <button onClick={() => ouvrirDepot(c)} disabled={uploadRef === c.id}
                                          className="ml-2 text-gray-500 hover:text-mystory disabled:opacity-50">
                                    {uploadRef === c.id ? "Envoi…" : "Remplacer"}
                                  </button>
                                </span>
                              ) : c.type_norm === "TEF_IRN" ? (
                                <button onClick={() => ouvrirDepot(c)} disabled={uploadRef === c.id}
                                        className="px-2.5 py-1 rounded border text-xs disabled:opacity-50"
                                        style={{ color: BLEU, borderColor: BLEU }}>
                                  {uploadRef === c.id ? "Envoi…" : "Déposer"}
                                </button>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-600">{c.vendu_par ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Vue consolidée : candidats importés (historique) + ventes enregistrées via « Inscription Examen ».
        Les sessions d'examen ont toutes lieu à Gagny ; l'agence affichée est celle de l'inscription.
      </p>
    </main>
  );
}
