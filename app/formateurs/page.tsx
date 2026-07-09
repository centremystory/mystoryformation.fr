"use client";
// app/formateurs/page.tsx — Registre des formateurs (onboarding). 6a : registre ; 6b/6c ajoutent les actions.
import { useCallback, useEffect, useState } from "react";

type Doc = { id: string; type: string; statut: string; sign_url: string | null; signe_le: string | null; fichier_signe_path: string | null };
type Formatrice = { id: string; nom: string; prenom: string | null; justificatif_fle: boolean };
type Formateur = {
  id: string; civilite: string | null; prenom: string | null; nom: string; email: string | null; telephone: string | null;
  type: string; raison_sociale: string | null; siret: string | null; adresse: string | null; token: string; cree_le: string;
  formateur_documents: Doc[]; formateur_questionnaire: { id: string; horodatage: string; reponses?: Record<string, string> }[];
  formatrice_id: string | null; formatrice: Formatrice | null;
};


function nomComplet(f: Formateur): string {
  return [f.civilite, f.prenom, f.nom].filter(Boolean).join(" ");
}
const Q_LABELS: Record<string, string> = { qualification: "Qualification FLE", experience: "Exp\u00e9rience", niveaux: "Niveaux", public_cible: "Public", statut: "Statut", disponibilites: "Disponibilit\u00e9s", methodes: "M\u00e9thodes", certifs: "TEF / LEVELTEL", commentaire: "Commentaire" };

export default function PageFormateurs() {
  const [formateurs, setFormateurs] = useState<Formateur[]>([]);
  const [charge, setCharge] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [vues, setVues] = useState<Record<string, boolean>>({});
  const [formatrices, setFormatrices] = useState<Formatrice[]>([]);
  const [conformite, setConformite] = useState<{ fleManquant: any[]; docsManquant: any[] }>({ fleManquant: [], docsManquant: [] });

  function copierLien(token: string) {
    const url = `${window.location.origin}/formateur-questionnaire?token=${token}`;
    navigator.clipboard?.writeText(url);
    setCopie(token); setTimeout(() => setCopie(null), 2000);
  }

  async function lierFormatrice(id: string, formatriceId: string) {
    setBusy(`lien-${id}`);
    try {
      await fetch("/api/formateurs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, formatriceId: formatriceId || null }) });
      await charger();
    } finally { setBusy(null); }
  }

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
      setFormatrices(j.formatrices ?? []);
      try {
        const rc = await fetch("/api/formateurs/conformite", { cache: "no-store" });
        const jc = await rc.json();
        if (jc.ok) setConformite({ fleManquant: jc.fleManquant ?? [], docsManquant: jc.docsManquant ?? [] });
      } catch {}
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

  function docDe(f: Formateur, t: "charte" | "contrat"): Doc | undefined {
    return f.formateur_documents?.filter((x) => x.type === t)
      .sort((a, b) => (b.signe_le ?? "").localeCompare(a.signe_le ?? ""))[0];
  }
  async function envoyer(formateurId: string, type: "charte" | "contrat") {
    setBusy(`env-${formateurId}-${type}`); setErr(null);
    try {
      const r = await fetch("/api/formateurs/envoyer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formateurId, type }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Envoi impossible."); return; }
      await charger();
    } catch (e: any) { setErr(e?.message || "Envoi impossible."); }
    finally { setBusy(null); }
  }

  function LigneDoc({ f, type, label }: { f: Formateur; type: "charte" | "contrat"; label: string }) {
    const d = docDe(f, type);
    const enCours = busy === `env-${f.id}-${type}`;
    if (!d || d.statut === "erreur") {
      return (
        <button onClick={() => envoyer(f.id, type)} disabled={enCours || !f.email}
          title={!f.email ? "Ajoute un email d'abord" : ""}
          className="text-xs px-2.5 py-1 rounded-lg bg-mystory text-white font-medium disabled:opacity-50">
          {enCours ? "Envoi…" : `Envoyer ${label}`}{d?.statut === "erreur" ? " (réessayer)" : ""}
        </button>
      );
    }
    if (d.statut === "signee") return <span className="text-xs text-green-700">{label} : signée ✓</span>;
    return (
      <span className="text-xs text-amber-700">
        {label} : envoyée à signer{d.sign_url ? <> · <a href={d.sign_url} target="_blank" rel="noreferrer" className="underline">lien</a></> : null}
      </span>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Formateurs</h1>
          <p className="page-subtitle">Registre et onboarding : charte, contrat de sous-traitance, questionnaire.</p>
        </div>
      </header>

      {(conformite.fleManquant.length > 0 || conformite.docsManquant.length > 0) && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900 mb-1">⚠️ Conformité avant séance</p>
          {conformite.fleManquant.length > 0 && (
            <p className="text-amber-800">Justificatif FLE manquant : {conformite.fleManquant.map((x: any) => `${x.prenom ?? ""} ${x.nom}`.trim()).join(", ")} — à régulariser dans <a href="/equipe" className="underline">Équipe</a>.</p>
          )}
          {conformite.docsManquant.length > 0 && (
            <p className="text-amber-800 mt-1">Charte/contrat non signés : {conformite.docsManquant.map((x: any) => `${x.prenom ?? ""} ${x.nom}`.trim()).join(", ")}.</p>
          )}
        </div>
      )}

      {/* Ajout */}
      <section className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Ajouter un formateur</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={civilite} onChange={(e) => setCivilite(e.target.value)} className="input">
            <option value="">Civilité</option><option>Mme</option><option>M.</option>
          </select>
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="input" />
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom *" className="input" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input" />
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" className="input" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="input">
            <option value="sous_traitant">Sous-traitant</option><option value="interne">Interne</option>
          </select>
          <input value={raisonSociale} onChange={(e) => setRaisonSociale(e.target.value)} placeholder="Raison sociale (si société)" className="input" />
          <input value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="SIRET" className="input" />
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Adresse" className="input" />
        </div>
        <button onClick={ajouter} disabled={busy === "__add__"} className="btn-primary mt-3">
          {busy === "__add__" ? "Ajout…" : "Ajouter"}
        </button>
      </section>

      {err && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{err}</div>}

      {charge ? <p className="text-gray-500 text-sm">Chargement…</p> : formateurs.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucun formateur. Ajoute le premier ci-dessus.</p>
      ) : (
        <div className="space-y-2">
          {formateurs.map((f) => (
            <div key={f.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{f.type === "interne" ? "Interne" : "Sous-traitant"}</span>
                <a href={`/formateurs/${f.id}`} className="font-medium text-gray-900 hover:text-blue-700 hover:underline">{nomComplet(f)}</a>
                {f.raison_sociale && <span className="text-sm text-gray-500">· {f.raison_sociale}</span>}
                <span className="flex-1" />
                <button onClick={() => archiver(f.id)} disabled={busy === `arch-${f.id}`} className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50">Archiver</button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {f.email || "—"}{f.telephone ? ` · ${f.telephone}` : ""}{f.siret ? ` · SIRET ${f.siret}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                <span className="text-gray-500">Formatrice :</span>
                <select value={f.formatrice_id ?? ""} disabled={busy === `lien-${f.id}`}
                  onChange={(e) => lierFormatrice(f.id, e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white">
                  <option value="">— non reliée —</option>
                  {formatrices.map((fm) => <option key={fm.id} value={fm.id}>{[fm.prenom, fm.nom].filter(Boolean).join(" ")}</option>)}
                </select>
                {f.formatrice && (f.formatrice.justificatif_fle
                  ? <span className="text-green-700">FLE ✓</span>
                  : <span className="text-red-600">FLE manquant</span>)}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <LigneDoc f={f} type="charte" label="Charte" />
                <LigneDoc f={f} type="contrat" label="Contrat" />
                <button onClick={() => copierLien(f.token)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:border-mystory">
                  {copie === f.token ? "Lien copié ✓" : "Lien questionnaire"}
                </button>
                {f.formateur_questionnaire?.length
                  ? <button onClick={() => setVues((v) => ({ ...v, [f.id]: !v[f.id] }))} className="text-xs text-green-700 underline">Réponses ✓</button>
                  : <span className="text-xs text-gray-400">Questionnaire : —</span>}
              </div>
              {vues[f.id] && f.formateur_questionnaire?.[0]?.reponses && (
                <div className="mt-2 border-t border-gray-100 pt-2 text-sm space-y-1">
                  {Object.entries(f.formateur_questionnaire[0].reponses!).filter(([, v]) => String(v).trim()).map(([k, v]) => (
                    <p key={k}><span className="text-gray-400">{Q_LABELS[k] ?? k} :</span> {String(v)}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
