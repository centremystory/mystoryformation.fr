"use client";
// app/formateurs/page.tsx — Registre des formateurs (onboarding). 6a : registre ; 6b/6c ajoutent les actions.
import { useCallback, useEffect, useState } from "react";

type Doc = { id: string; type: string; statut: string; sign_url: string | null; signe_le: string | null; fichier_signe_path: string | null };
type Formateur = {
  id: string; civilite: string | null; prenom: string | null; nom: string; email: string | null; telephone: string | null;
  type: string; raison_sociale: string | null; siret: string | null; adresse: string | null; token: string; cree_le: string;
  formateur_documents: Doc[]; formateur_questionnaire: { id: string; horodatage: string }[];
};

const STATUT_DOC: Record<string, string> = { envoye_a_signer: "envoyée à signer", signee: "signée", erreur: "erreur" };

function nomComplet(f: Formateur): string {
  return [f.civilite, f.prenom, f.nom].filter(Boolean).join(" ");
}

export default function PageFormateurs() {
  const [formateurs, setFormateurs] = useState<Formateur[]>([]);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // formulaire
  const [civilite, setCivilite] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [type, setType] = useState("sous_traitant");
  const [raisonSociale, setRaisonSociale] = useState("");
  const [siret, setSiret] = useState("");
  const [adresse, setAdresse] = useState("");

  const charger = useCallback(async () => {
    setCharge(true); setErr(null);
    try {
      const r = await fetch("/api/formateurs", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Erreur de chargement."); return; }
      setFormateurs(j.formateurs);
    } catch (e: any) { setErr(e?.message || "Erreur de chargement."); }
    finally { setCharge(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function ajouter() {
    if (!nom.trim()) { setErr("Nom requis."); return; }
    setBusy("__add__"); setErr(null);
    try {
      const r = await fetch("/api/formateurs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ civilite, prenom, nom, email, telephone, type, raisonSociale, siret, adresse }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Ajout impossible."); return; }
      setCivilite(""); setPrenom(""); setNom(""); setEmail(""); setTelephone(""); setRaisonSociale(""); setSiret(""); setAdresse("");
      await charger();
    } catch (e: any) { setErr(e?.message || "Ajout impossible."); }
    finally { setBusy(null); }
  }

  async function archiver(id: string) {
    setBusy(`arch-${id}`);
    try {
      await fetch("/api/formateurs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "archiver" }) });
      await charger();
    } finally { setBusy(null); }
  }

  function statutDoc(f: Formateur, t: "charte" | "contrat"): string {
    const d = f.formateur_documents?.filter((x) => x.type === t).sort((a, b) => (b.signe_le ?? "").localeCompare(a.signe_le ?? ""))[0];
    if (!d) return "—";
    return STATUT_DOC[d.statut] ?? d.statut;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="" className="h-10 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formateurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registre et onboarding : charte, contrat de sous-traitance, questionnaire.</p>
        </div>
      </header>

      {/* Ajout */}
      <section className="border border-gray-200 rounded-xl bg-white p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Ajouter un formateur</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={civilite} onChange={(e) => setCivilite(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Civilité</option><option>Mme</option><option>M.</option>
          </select>
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom *" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="sous_traitant">Sous-traitant</option><option value="interne">Interne</option>
          </select>
          <input value={raisonSociale} onChange={(e) => setRaisonSociale(e.target.value)} placeholder="Raison sociale (si société)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="SIRET" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Adresse" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={ajouter} disabled={busy === "__add__"} className="mt-3 px-4 py-2 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
          {busy === "__add__" ? "Ajout…" : "Ajouter"}
        </button>
      </section>

      {err && <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : formateurs.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun formateur. Ajoute le premier ci-dessus.</p>
      ) : (
        <div className="space-y-2">
          {formateurs.map((f) => (
            <div key={f.id} className="border border-gray-200 rounded-xl bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{f.type === "interne" ? "Interne" : "Sous-traitant"}</span>
                <span className="font-medium text-gray-900">{nomComplet(f)}</span>
                {f.raison_sociale && <span className="text-sm text-gray-500">· {f.raison_sociale}</span>}
                <span className="flex-1" />
                <button onClick={() => archiver(f.id)} disabled={busy === `arch-${f.id}`} className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">Archiver</button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {f.email || "—"}{f.telephone ? ` · ${f.telephone}` : ""}{f.siret ? ` · SIRET ${f.siret}` : ""}
              </p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                <span>Charte : <span className="text-gray-700">{statutDoc(f, "charte")}</span></span>
                <span>Contrat : <span className="text-gray-700">{statutDoc(f, "contrat")}</span></span>
                <span>Questionnaire : <span className="text-gray-700">{f.formateur_questionnaire?.length ? "répondu" : "—"}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
