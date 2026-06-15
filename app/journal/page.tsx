"use client";
// app/journal/page.tsx — Journal d'audit : qui fait quoi sur le CRM (Direction).
import { useCallback, useEffect, useState } from "react";

type Entree = {
  id: string; horodatage: string; auteur: string | null; entite: string; entite_id: string | null;
  evenement: string; ancienne_valeur: any; nouvelle_valeur: any;
};

const LABEL: Record<string, string> = {
  inscription_creee: "Inscription créée", compte_cree: "Compte créé", mot_de_passe_reinitialise: "Mot de passe réinitialisé",
  examen_vendu: "Examen vendu", convocation_generee: "Convocation générée", attestation_emise: "Attestation émise",
  facture_emise: "Facture émise", email_envoye: "Email envoyé", documents_envoyes_stagiaire: "Documents envoyés au stagiaire",
  emargement_saisi: "Émargement saisi", import_applique: "Import EDOF appliqué", classement_mis_a_jour: "Classement mis à jour",
  formateur_cree: "Formateur ajouté", formateur_archive: "Formateur archivé", formateur_modifie: "Formateur modifié",
  formateur_doc_envoye: "Document formateur envoyé", formateur_doc_signe: "Document formateur signé",
  message_prospect_statut: "Message prospect (statut)", cpf_identite_rappel_envoye: "Rappel identité CPF envoyé",
};
const ev = (e: string) => LABEL[e] ?? e.replace(/_/g, " ");

function detail(e: Entree): string {
  const v = e.nouvelle_valeur ?? e.ancienne_valeur;
  if (!v || typeof v !== "object") return "";
  const garde = ["certif", "financement", "type", "statut", "objet", "a", "role", "montant", "numero", "titre"];
  const bouts = Object.entries(v).filter(([k]) => garde.includes(k)).map(([k, val]) => `${k}: ${val}`);
  return bouts.slice(0, 4).join(" · ");
}

const PERIODES = [{ v: 0, l: "Tout" }, { v: 7, l: "7 j" }, { v: 30, l: "30 j" }, { v: 90, l: "90 j" }];

export default function PageJournal() {
  const [recherche, setRecherche] = useState("");
  const [entite, setEntite] = useState("");
  const [auteur, setAuteur] = useState("");
  const [jours, setJours] = useState(30);
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [entites, setEntites] = useState<string[]>([]);
  const [auteurs, setAuteurs] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [suite, setSuite] = useState(false);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const charger = useCallback(async (reset: boolean) => {
    setCharge(true); setErr(null);
    const off = reset ? 0 : offset;
    const p = new URLSearchParams();
    if (recherche.trim()) p.set("recherche", recherche.trim());
    if (entite) p.set("entite", entite);
    if (auteur) p.set("auteur", auteur);
    if (jours) p.set("jours", String(jours));
    p.set("offset", String(off));
    try {
      const r = await fetch(`/api/journal?${p.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur."); return; }
      setEntrees((prev) => (reset ? j.entrees : [...prev, ...j.entrees]));
      setEntites(j.entites); setAuteurs(j.auteurs);
      setSuite(j.page.suite); setOffset(off + j.page.limite);
    } catch (e: any) { setErr(e?.message || "Erreur."); }
    finally { setCharge(false); }
  }, [recherche, entite, auteur, jours, offset]);

  useEffect(() => {
    const t = setTimeout(() => charger(true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche, entite, auteur, jours]);

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal d'activité</h1>
          <p className="text-sm text-gray-500 mt-0.5">Qui fait quoi sur le CRM — traçabilité des actions.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
        <select value={entite} onChange={(e) => setEntite(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Toutes entités</option>
          {entites.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={auteur} onChange={(e) => setAuteur(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Tous les auteurs</option>
          {auteurs.map((x) => <option key={x} value={x}>{x}</option>)}
          <option value="__sans__">— sans auteur (équipe / système) —</option>
        </select>
      </div>
      <div className="flex gap-2 mb-4">
        {PERIODES.map((p) => (
          <button key={p.v} onClick={() => setJours(p.v)} className={`text-xs px-3 py-1.5 rounded-full border ${jours === p.v ? "bg-mystory text-white border-mystory" : "border-gray-300 text-gray-600"}`}>{p.l}</button>
        ))}
      </div>

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {entrees.length === 0 && !charge ? <p className="text-gray-500 text-sm">Aucune activité pour ces filtres.</p> : (
        <div className="space-y-1.5">
          {entrees.map((e) => (
            <div key={e.id} className="border border-gray-200 rounded-xl bg-white px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">{ev(e.evenement)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{e.entite}</span>
                <span className="flex-1" />
                <span className="text-xs text-gray-400">{new Date(e.horodatage).toLocaleString("fr-FR")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                <span className={e.auteur ? "text-mystory font-medium" : "text-gray-400 italic"}>{e.auteur ?? "équipe / système"}</span>
                {detail(e) && <span className="text-gray-400">· {detail(e)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {charge && <p className="text-gray-400 text-sm mt-3">Chargement…</p>}
      {suite && !charge && (
        <button onClick={() => charger(false)} className="mt-4 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700">Charger plus</button>
      )}
    </main>
  );
}
