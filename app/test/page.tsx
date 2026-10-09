"use client";
// app/test/page.tsx — Accueil PUBLIC du test de positionnement (LE lien unique à diffuser).
// Deux parcours : « à distance » (auto-enregistrement) et « sur place » (avec le nom de
// l'accompagnant conseiller/formatrice, tracé sur l'évaluation pour le suivi).
// CE/CO corrigés automatiquement (niveau provisoire affiché en fin de test) ;
// EE/EO corrigés par une formatrice ; récap complet + conseils envoyés par email.
//
// 09/10/2026 — HABILLAGE. Cette page est très souvent le TOUT PREMIER contact d'un
// prospect avec MYSTORY : il arrive d'une publicité TikTok ou Facebook, passe le test,
// et c'est de là que naît l'inscription. Elle portait un bleu (#2F72DE, #293A4A, #7FA6E8)
// qui n'existe nulle part sur mystoryformation.fr — autant dire que le prospect, qui n'a
// encore aucune raison de nous faire confiance, atterrissait chez un inconnu.
// Elle emprunte maintenant la MÊME charte que les pages de paiement : lib/pagePublique.ts.
//
// ⚠️ Rien de la logique n'a bougé : mêmes champs, même appel à /api/tests/kiosque,
// même redirection vers /test/<token>. Le diff est du JSX et des classes.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CSS_VARIABLES, POLICES_HREF, TEL_PUBLIC, TEL_LIEN, MENTIONS_LEGALES, COURRIEL_PUBLIC } from "@/lib/pagePublique";

/** Champ de saisie : une seule définition, pour que les douze champs se ressemblent. */
const CHAMP =
  "w-full min-h-[48px] rounded-xl border border-[var(--mys-gris-300)] bg-white px-3.5 py-3 text-[16px] " +
  "text-[var(--mys-gris-900)] placeholder-[var(--mys-gris-500)] outline-none transition " +
  "focus:border-[var(--mys-marine-500)] focus:ring-[3px] focus:ring-[rgba(40,97,160,0.2)]";

export default function AccueilTestPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"distance" | "sur_place" | null>(null);
  const [f, setF] = useState({ civilite: "", prenom: "", nom: "", email: "", telephone: "", niveau_vise: "", accompagnant: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Origine du lead : ?source=site quand le test est lancé depuis le site vitrine (suivi commercial).
  const origine = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("source") === "site" ? "site" : null;

  function set(k: string, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function demarrer() {
    setErr(null);
    if (!f.prenom.trim() || !f.nom.trim()) { setErr("Indiquez votre prénom et votre nom."); return; }
    if (mode === "distance" && !f.email.trim() && !f.telephone.trim()) { setErr("Indiquez un email ou un téléphone pour recevoir vos résultats."); return; }
    // 09/09/2026 — le conseiller n'est plus obligatoire : avec le QR code, le
    // prospect commence seul depuis son telephone. Le champ reste disponible pour
    // le suivi quand quelqu'un l'accompagne vraiment.
    setBusy(true);
    try {
      const r = await fetch("/api/tests/kiosque", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, source: mode, origine }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur ?? "Impossible de démarrer le test.");
      router.push(`/test/${j.token}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur."); setBusy(false); }
  }

  return (
    <>
      {/* Les polices et les jetons de la charte viennent du module commun : si la
          charte change, cette page change avec les quatre autres, sans qu'on y pense. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={POLICES_HREF} />
      <style dangerouslySetInnerHTML={{ __html: CSS_VARIABLES }} />

      <main
        /* Les marges négatives annulent le `pt-6 pb-10` du layout, partagé avec les
           pages d'épreuve : sans elles, un liseré gris clair encadrait le marine en
           haut et en bas de l'écran. Le layout n'est pas touché — il sert aussi aux
           pages de test, volontairement neutres, qui ne sont pas concernées ici. */
        className="-mt-6 -mb-10 min-h-screen px-4 pb-16 pt-10 font-[family-name:var(--mys-texte)]"
        style={{ background: "linear-gradient(135deg,var(--mys-marine-950) 0%,var(--mys-marine-900) 45%,var(--mys-marine-700) 100%)" }}
      >
        <div className="mx-auto max-w-xl">
          <header className="text-center text-white">
            <div className="font-[family-name:var(--mys-titre)] text-[26px] font-extrabold tracking-[0.18em]">MYSTORY</div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Votre histoire, notre fierté</p>
            <h1 className="mt-5 font-[family-name:var(--mys-titre)] text-[30px] font-extrabold leading-[1.15] tracking-[-0.015em] sm:text-[38px]">
              Évaluez votre niveau de français
            </h1>
            {/* Le filet rouge sous le titre est la signature visuelle du site. */}
            <span className="mx-auto mt-4 block h-1 w-12 rounded-full bg-[var(--mys-rouge-500)]" />
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
              En 45 minutes, on situe votre niveau sur les 4 compétences et on vous conseille le bon parcours — sans engagement.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["100 % gratuit", "45 minutes", "4 compétences", "Résultat immédiat"].map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-semibold text-white/90">
                  <span className="font-extrabold text-[var(--mys-rouge-300)]">✓</span>{l}
                </span>
              ))}
            </div>
          </header>

          {/* Choix du parcours */}
          {!mode && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <button onClick={() => setMode("distance")}
                className="group rounded-2xl border border-[var(--mys-gris-200)] bg-white p-6 text-left shadow-[0_18px_40px_-28px_rgba(5,20,40,0.9)] transition hover:-translate-y-0.5 hover:border-[var(--mys-rouge-300)]">
                <div className="text-3xl">🏠</div>
                <div className="mt-2 font-[family-name:var(--mys-titre)] text-lg font-extrabold text-[var(--mys-marine-900)]">Je passe le test à distance</div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--mys-gris-700)]">Depuis chez vous, sur téléphone ou ordinateur. Prévoyez un endroit calme et un micro.</p>
              </button>
              <button onClick={() => setMode("sur_place")}
                className="group rounded-2xl border border-[var(--mys-gris-200)] bg-white p-6 text-left shadow-[0_18px_40px_-28px_rgba(5,20,40,0.9)] transition hover:-translate-y-0.5 hover:border-[var(--mys-rouge-300)]">
                <div className="text-3xl">🏢</div>
                <div className="mt-2 font-[family-name:var(--mys-titre)] text-lg font-extrabold text-[var(--mys-marine-900)]">Je suis sur place</div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--mys-gris-700)]">Dans notre centre, accompagné·e par un conseiller ou une formatrice.</p>
              </button>
            </div>
          )}

          {/* Formulaire d'identité */}
          {mode && (
            <div className="mt-8 rounded-2xl border border-[var(--mys-gris-200)] bg-white p-6 shadow-[0_18px_40px_-28px_rgba(5,20,40,0.9)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-[family-name:var(--mys-titre)] text-lg font-extrabold text-[var(--mys-marine-900)]">{mode === "distance" ? "🏠 Test à distance" : "🏢 Test sur place"}</h2>
                <button onClick={() => setMode(null)} className="min-h-[44px] shrink-0 px-1 text-xs font-semibold text-[var(--mys-gris-600)] hover:text-[var(--mys-marine-700)]">← changer</button>
              </div>
              <p className="mt-1 text-xs text-[var(--mys-gris-600)]">Vos informations créent votre dossier de résultats — utilisez votre identité exacte.</p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <select value={f.civilite} onChange={(e) => set("civilite", e.target.value)} className={`col-span-2 ${CHAMP}`}>
                  <option value="">Civilité (optionnel)</option><option>Madame</option><option>Monsieur</option><option>Autre</option>
                </select>
                <input value={f.prenom} onChange={(e) => set("prenom", e.target.value)} placeholder="Prénom *" autoComplete="given-name" className={`col-span-2 sm:col-span-1 ${CHAMP}`} />
                <input value={f.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Nom *" autoComplete="family-name" className={`col-span-2 sm:col-span-1 ${CHAMP}`} />
                <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder={mode === "distance" ? "Email *" : "Email"} autoComplete="email" className={`col-span-2 sm:col-span-1 ${CHAMP}`} />
                <input type="tel" value={f.telephone} onChange={(e) => set("telephone", e.target.value)} placeholder={mode === "distance" ? "Téléphone *" : "Téléphone"} autoComplete="tel" className={`col-span-2 sm:col-span-1 ${CHAMP}`} />
                <select value={f.niveau_vise} onChange={(e) => set("niveau_vise", e.target.value)} className={`col-span-2 ${CHAMP}`}>
                  <option value="">Votre objectif (niveau visé — optionnel)</option>
                  <option value="A2">A2 — carte de séjour pluriannuelle</option>
                  <option value="B1">B1 — carte de résident</option>
                  <option value="B2">B2 — naturalisation</option>
                  <option value="A1">A1 — premiers pas (hors financement CPF)</option>
                </select>
                {mode === "sur_place" && (
                  <input value={f.accompagnant} onChange={(e) => set("accompagnant", e.target.value)}
                    placeholder="Prénom du conseiller / de la formatrice (facultatif)"
                    className={`col-span-2 ${CHAMP}`}
                    style={{ borderColor: "var(--mys-marine-200)", background: "var(--mys-marine-50)" }} />
                )}
              </div>

              {err && (
                <p className="mt-4 rounded-xl border border-[var(--mys-rouge-200)] bg-[var(--mys-rouge-50)] px-4 py-3 text-sm font-medium text-[var(--mys-rouge-800)]">{err}</p>
              )}

              <button onClick={demarrer} disabled={busy}
                className="mt-5 min-h-[56px] w-full rounded-full bg-[var(--mys-rouge-500)] px-5 py-4 font-[family-name:var(--mys-titre)] text-[16px] font-extrabold text-white shadow-[0_12px_26px_-14px_rgba(225,25,44,0.75)] transition hover:bg-[var(--mys-rouge-600)] disabled:opacity-60">
                {busy ? "Préparation du test…" : "Commencer le test →"}
              </button>

              <p className="mt-4 text-center text-[11.5px] leading-snug text-[var(--mys-gris-600)]">
                🔒 Vos réponses et coordonnées servent uniquement à votre positionnement et au suivi de votre parcours
                (RGPD, conservation 5 ans). Droits : {COURRIEL_PUBLIC} ·{" "}
                <a href="/politique-confidentialite" target="_blank" className="underline">politique de confidentialité</a>
              </p>
            </div>
          )}

          <footer className="mt-10 text-center text-xs leading-relaxed text-white/50">
            <a href="/test/finale" className="font-semibold text-white/75 underline hover:text-white">Vous venez pour votre test final de formation ? C&apos;est ici →</a>
            {/*
              09/10/2026 — cette ligne annonçait « Centre d'examen TEF IRN · Gagny (93) ».
              C'est faux depuis le 28/09/2026 : le centre d'EXAMEN est Rosny-sous-Bois et lui
              seul ; Gagny et Sarcelles sont des centres de FORMATION. Un prospect qui se
              présente à Gagny le jour de son examen ne le passe pas.
            */}
            <div className="mt-3">
              MYSTORY — Centres de formation FLE à Gagny et Sarcelles · Centre d&apos;examen TEF IRN à
              Rosny-sous-Bois (46 bis rue d&apos;Estienne d&apos;Orves, 93110) ·{" "}
              <a href={`tel:${TEL_LIEN}`} className="font-semibold text-white/75">{TEL_PUBLIC}</a>
            </div>
            {/* Art. R. 123-237 du code de commerce : le bloc complet, comme sur les
                pages de paiement — une page qui capte un prospect est commerciale. */}
            <div className="mt-3 text-[11px] text-white/35">{MENTIONS_LEGALES}</div>
          </footer>
        </div>
      </main>
    </>
  );
}
