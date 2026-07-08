"use client";
// app/formateur-questionnaire/page.tsx — Questionnaire formateur en ligne (accès public par jeton).
import { useEffect, useState } from "react";

const QUESTIONS: { key: string; label: string; aire?: boolean }[] = [
  { key: "qualification", label: "Vos diplômes / qualification en FLE", aire: true },
  { key: "experience", label: "Années d'expérience en FLE" },
  { key: "niveaux", label: "Niveaux que vous enseignez (A1 à C2)" },
  { key: "public_cible", label: "Public habituel (adultes, demandeurs d'emploi…)" },
  { key: "statut", label: "Votre statut (auto-entrepreneur, société, salarié porté…)" },
  { key: "disponibilites", label: "Vos disponibilités" },
  { key: "methodes", label: "Méthodes et outils pédagogiques", aire: true },
  { key: "certifs", label: "Connaissez-vous le TEF IRN / LEVELTEL ? Précisez", aire: true },
  { key: "commentaire", label: "Commentaire libre", aire: true },
];

export default function PageQuestionnaireFormateur() {
  const [token, setToken] = useState<string | null>(null);
  const [etat, setEtat] = useState<"chargement" | "invalide" | "deja" | "form" | "envoye">("chargement");
  const [nom, setNom] = useState("");
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) { setEtat("invalide"); return; }
    (async () => {
      try {
        const r = await fetch(`/api/formateur-questionnaire?token=${encodeURIComponent(t)}`, { cache: "no-store" });
        const j = await r.json();
        if (!j.ok) { setEtat("invalide"); return; }
        setNom([j.formateur.civilite, j.formateur.prenom, j.formateur.nom].filter(Boolean).join(" "));
        setEtat(j.dejaRepondu ? "deja" : "form");
      } catch { setEtat("invalide"); }
    })();
  }, []);

  async function envoyer() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/formateur-questionnaire", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reponses }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.erreur || "Envoi impossible."); return; }
      setEtat("envoye");
    } catch (e: any) { setErr(e?.message || "Envoi impossible."); }
    finally { setBusy(false); }
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2 mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="MYSTORY" className="h-9 w-auto" />
        <span className="font-semibold text-mystory">MYSTORY</span>
      </div>

      {etat === "chargement" && <p className="text-gray-500 text-sm">Chargement…</p>}

      {etat === "invalide" && (
        <div className="border border-gray-200 rounded-xl bg-white p-6">
          <h1 className="text-lg font-bold text-gray-900">Lien invalide</h1>
          <p className="text-sm text-gray-600 mt-2">Ce lien n'est plus valide. Contactez MYSTORY à contact@mystoryformation.fr.</p>
        </div>
      )}

      {etat === "deja" && (
        <div className="border border-gray-200 rounded-xl bg-white p-6">
          <h1 className="text-lg font-bold text-gray-900">Merci {nom} 👍</h1>
          <p className="text-sm text-gray-600 mt-2">Votre questionnaire a déjà été enregistré.</p>
        </div>
      )}

      {etat === "envoye" && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-6">
          <h1 className="text-lg font-bold text-green-900">Merci {nom} !</h1>
          <p className="text-sm text-green-800 mt-2">Vos réponses ont bien été enregistrées.</p>
        </div>
      )}

      {etat === "form" && (
        <>
          <h1 className="text-xl font-bold text-gray-900">Questionnaire formateur</h1>
          <p className="text-sm text-gray-500 mt-1 mb-5">Bonjour {nom}, merci de remplir ces quelques informations pour votre dossier formateur.</p>
          <div className="space-y-4">
            {QUESTIONS.map((q) => (
              <div key={q.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{q.label}</label>
                {q.aire ? (
                  <textarea rows={3} value={reponses[q.key] ?? ""} onChange={(e) => setReponses((s) => ({ ...s, [q.key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                ) : (
                  <input value={reponses[q.key] ?? ""} onChange={(e) => setReponses((s) => ({ ...s, [q.key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}
              </div>
            ))}
          </div>
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
          <button onClick={envoyer} disabled={busy} className="mt-5 px-5 py-2.5 rounded-lg bg-mystory text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Envoi…" : "Envoyer mes réponses"}
          </button>
          <p className="mt-3 text-[11px] leading-snug text-gray-400">
            🔒 Ces informations sont traitées par MYSTORY pour la gestion administrative et la conformité
            de votre dossier formateur (RGPD, conservation 5 ans après la fin de la collaboration).
            Droits : contact@mystoryformation.fr ·{" "}
            <a href="/politique-confidentialite" target="_blank" className="underline">politique de confidentialité</a>
          </p>
        </>
      )}
    </main>
  );
}
