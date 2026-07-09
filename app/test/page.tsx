"use client";
// app/test/page.tsx — Accueil PUBLIC du test de positionnement (LE lien unique à diffuser).
// Deux parcours : « à distance » (auto-enregistrement) et « sur place » (avec le nom de
// l'accompagnant conseiller/formatrice, tracé sur l'évaluation pour le suivi).
// CE/CO corrigés automatiquement (niveau provisoire affiché en fin de test) ;
// EE/EO corrigés par une formatrice ; récap complet + conseils envoyés par email.
import { useState } from "react";
import { useRouter } from "next/navigation";

const NIVEAUX = ["A1", "A2", "B1", "B2"] as const;

export default function AccueilTestPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"distance" | "sur_place" | null>(null);
  const [f, setF] = useState({ civilite: "", prenom: "", nom: "", email: "", telephone: "", niveau_vise: "", accompagnant: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set(k: string, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function demarrer() {
    setErr(null);
    if (!f.prenom.trim() || !f.nom.trim()) { setErr("Indiquez votre prénom et votre nom."); return; }
    if (mode === "distance" && !f.email.trim() && !f.telephone.trim()) { setErr("Indiquez un email ou un téléphone pour recevoir vos résultats."); return; }
    if (mode === "sur_place" && !f.accompagnant.trim()) { setErr("Indiquez le prénom du conseiller ou de la formatrice qui vous accompagne."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/tests/kiosque", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, source: mode }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur ?? "Impossible de démarrer le test.");
      router.push(`/test/${j.token}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur."); setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#293A4A] to-[#1c2b3a] px-4 py-10">
      <div className="mx-auto max-w-xl">
        <header className="text-center text-white">
          <div className="text-2xl font-extrabold tracking-widest text-[#7FA6E8]">MYSTORY</div>
          <h1 className="mt-2 text-3xl font-extrabold">Test de positionnement</h1>
          <p className="mt-2 text-sm text-blue-100/80">
            Gratuit · ~1 h · 4 épreuves (compréhension et expression, écrites et orales).<br />
            Résultat de compréhension immédiat, niveau complet et conseils par email sous 48 h.
          </p>
        </header>

        {/* Choix du parcours */}
        {!mode && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button onClick={() => setMode("distance")}
              className="rounded-2xl bg-white p-6 text-left shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="text-3xl">🏠</div>
              <div className="mt-2 text-lg font-bold text-gray-900">Je passe le test à distance</div>
              <p className="mt-1 text-sm text-gray-500">Depuis chez vous, sur téléphone ou ordinateur. Prévoyez un endroit calme et un micro.</p>
            </button>
            <button onClick={() => setMode("sur_place")}
              className="rounded-2xl bg-white p-6 text-left shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="text-3xl">🏢</div>
              <div className="mt-2 text-lg font-bold text-gray-900">Je suis sur place</div>
              <p className="mt-1 text-sm text-gray-500">Dans notre centre, accompagné·e par un conseiller ou une formatrice.</p>
            </button>
          </div>
        )}

        {/* Formulaire d'identité */}
        {mode && (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{mode === "distance" ? "🏠 Test à distance" : "🏢 Test sur place"}</h2>
              <button onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-gray-600">← changer</button>
            </div>
            <p className="mt-1 text-xs text-gray-500">Vos informations créent votre dossier de résultats — utilisez votre identité exacte.</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <select value={f.civilite} onChange={(e) => set("civilite", e.target.value)} className="col-span-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm">
                <option value="">Civilité (optionnel)</option><option>Madame</option><option>Monsieur</option><option>Autre</option>
              </select>
              <input value={f.prenom} onChange={(e) => set("prenom", e.target.value)} placeholder="Prénom *" className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              <input value={f.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Nom *" className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder={mode === "distance" ? "Email *" : "Email"} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              <input type="tel" value={f.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder={mode === "distance" ? "Téléphone *" : "Téléphone"} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />
              <select value={f.niveau_vise} onChange={(e) => set("niveau_vise", e.target.value)} className="col-span-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm">
                <option value="">Votre objectif (niveau visé — optionnel)</option>
                <option value="A2">A2 — carte de séjour pluriannuelle</option>
                <option value="B1">B1 — carte de résident</option>
                <option value="B2">B2 — naturalisation</option>
                <option value="A1">A1 — premiers pas en français</option>
              </select>
              {mode === "sur_place" && (
                <input value={f.accompagnant} onChange={(e) => set("accompagnant", e.target.value)}
                  placeholder="Prénom du conseiller / de la formatrice *"
                  className="col-span-2 rounded-lg border-2 border-blue-200 bg-blue-50/50 px-3 py-2.5 text-sm" />
              )}
            </div>

            {err && <p className="mt-3 text-sm font-medium text-red-600">{err}</p>}

            <button onClick={demarrer} disabled={busy}
              className="mt-4 w-full rounded-xl bg-[#2F72DE] py-3 text-sm font-bold text-white shadow hover:bg-[#1F56B0] disabled:opacity-50">
              {busy ? "Préparation du test…" : "Commencer le test →"}
            </button>

            <p className="mt-3 text-center text-[11px] leading-snug text-gray-400">
              🔒 Vos réponses et coordonnées servent uniquement à votre positionnement et au suivi de votre parcours
              (RGPD, conservation 5 ans). Droits : contact@mystoryformation.fr ·{" "}
              <a href="/politique-confidentialite" target="_blank" className="underline">politique de confidentialité</a>
            </p>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-blue-100/60">
          MYSTORY — Centre de formation FLE · Centre d'examen TEF IRN · Gagny (93) · 06 81 43 16 54
        </footer>
      </div>
    </main>
  );
}
