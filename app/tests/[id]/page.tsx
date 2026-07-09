"use client";
/**
 * MYSTORY — Récap complet d'un test (initial / final), accessible même 6 mois plus tard.
 * Lecture seule : identité, 4 épreuves, niveau, rédaction, audios, remarques formatrice,
 * conseils générés (règle métier) et encart « comment traiter ce dossier » + lien fiche client.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const BLEU = "#2F72DE";

type Oral = { q: number; question: string; url: string | null; duree: number | null };
type Data = {
  evaluation: any; test: any; oral: Oral[];
  dossier: any; stagiaire: any;
  conseil: { formule: string; heures: number; message: string; ecart: number | null } | null;
};

const STATUT: Record<string, { label: string; cls: string }> = {
  en_cours: { label: "Passation en cours", cls: "bg-amber-100 text-amber-700" },
  en_attente_formateur: { label: "À noter (EE/EO)", cls: "bg-blue-100 text-blue-700" },
  complet: { label: "Complet", cls: "bg-green-100 text-green-700" },
};

function Note({ lbl, n }: { lbl: string; n: number | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
      <div className="text-xs text-gray-500">{lbl}</div>
      <div className="text-xl font-bold text-gray-900">{n == null ? "—" : `${n}/10`}</div>
    </div>
  );
}

export default function RecapTestPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((j) => (j.ok ? setD(j) : setErr(j.erreur || "Chargement impossible.")))
      .catch(() => setErr("Chargement impossible."));
  }, [id]);

  if (err) return <main className="mx-auto max-w-3xl p-6"><div className="card p-6 text-red-600">{err}</div></main>;
  if (!d) return <main className="mx-auto max-w-3xl p-6 text-gray-400">Chargement…</main>;

  const ev = d.evaluation;
  const st = STATUT[ev.statut] ?? { label: ev.statut ?? "—", cls: "bg-gray-100 text-gray-600" };
  const dt = (x: string | null) => (x ? new Date(x).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—");

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Test {ev.phase === "final" ? "final" : "de positionnement"} — {ev.prenom} {ev.nom}</h1>
          <p className="page-subtitle">Passé le {dt(ev.cree_le)}{ev.complete_le ? ` · noté le ${dt(ev.complete_le)}` : ""}{ev.auteur ? ` · accompagnant : ${ev.auteur}` : ""}</p>
        </div>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>

      {/* Identité + accès fiche */}
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="space-y-0.5">
            <div className="font-semibold text-gray-900">{ev.civilite ? `${ev.civilite} ` : ""}{ev.prenom} {ev.nom}</div>
            <div className="text-gray-500">{[ev.email, ev.telephone].filter(Boolean).join(" · ") || "Pas de coordonnées"}</div>
            {(ev.adresse || ev.ville) && <div className="text-gray-500">{[ev.adresse, [ev.cp, ev.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>}
          </div>
          {d.stagiaire && (
            <Link href={`/fiche/${d.stagiaire.id}`} className="btn-primary text-sm">Ouvrir la fiche client →</Link>
          )}
        </div>
      </section>

      {/* Résultat */}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Résultat</h2>
          {ev.niveau_global && (
            <div className="rounded-xl px-4 py-1.5 text-lg font-extrabold text-white" style={{ background: BLEU }}>
              {ev.niveau_global} <span className="text-sm font-normal opacity-80">· {ev.total_sur20}/20</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Note lbl="Compréhension écrite" n={ev.ce_sur10} />
          <Note lbl="Compréhension orale" n={ev.co_sur10} />
          <Note lbl="Expression écrite" n={ev.ee_sur10} />
          <Note lbl="Expression orale" n={ev.eo_sur10} />
        </div>
        {ev.niveau_vise && <div className="mt-3 text-sm text-gray-600">Objectif exprimé par le candidat : <strong>{ev.niveau_vise}</strong></div>}
        {ev.remarques && <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700"><span className="font-semibold">Remarques de la formatrice{ev.notateur ? ` (${ev.notateur})` : ""} :</span> {ev.remarques}</div>}
      </section>

      {/* Comment traiter ce dossier */}
      <section className="card border-2 p-4" style={{ borderColor: BLEU }}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: BLEU }}>Comment traiter ce dossier</h2>
        {ev.statut === "en_attente_formateur" && (
          <p className="text-sm text-gray-700">L'expression écrite et orale reste à noter — <Link href="/tests/a-noter" className="underline" style={{ color: BLEU }}>ouvrir la notation</Link>. Le récap complet et les envois automatiques partiront à la notation.</p>
        )}
        {ev.statut === "complet" && ev.phase !== "final" && (
          <div className="space-y-2 text-sm text-gray-700">
            {d.conseil && <p>{d.conseil.message}</p>}
            <p>
              👉 Proposer la formule <strong>{d.conseil ? `${d.conseil.formule} (${d.conseil.heures} h)` : "adaptée"}</strong>
              . L'email de résultats + conseils a été envoyé automatiquement au candidat{ev.email ? ` (${ev.email})` : ""}.
            </p>
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="font-semibold" style={{ color: BLEU }}>Prochaines étapes (enchaînement)</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Évaluation initiale : <strong>générée automatiquement</strong> depuis le test ✓</li>
                <li><strong>Fiche d'analyse de besoin</strong> à remplir avec le candidat{d.dossier ? <> — <Link href={`/dossiers?q=${encodeURIComponent(`${d.stagiaire?.prenom ?? ev.prenom ?? ""} ${d.stagiaire?.nom ?? ev.nom ?? ""}`.trim())}`} className="underline" style={{ color: BLEU }}>ouvrir son dossier ↗</Link></> : " (dès la création du dossier)"}</li>
                <li>Puis convention + convocation selon le financement choisi.</li>
              </ol>
            </div>
          </div>
        )}
        {ev.statut === "complet" && ev.phase === "final" && (
          <div className="space-y-2 text-sm text-gray-700">
            <p>Niveau atteint : <strong>{ev.niveau_global}</strong> ({ev.total_sur20}/20) — reporté sur le dossier.</p>
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="font-semibold" style={{ color: BLEU }}>Fin de parcours (enchaînement)</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Évaluation finale : <strong>générée automatiquement</strong> depuis le test ✓</li>
                <li>Questionnaire de <strong>satisfaction à chaud</strong> : <strong>envoyé automatiquement</strong> au stagiaire ✓ (relance à froid automatique à J+90)</li>
                <li><strong>Attestation de fin</strong> puis <strong>certificat de réalisation</strong>{d.dossier ? <> — <Link href={`/dossiers?q=${encodeURIComponent(`${d.stagiaire?.prenom ?? ev.prenom ?? ""} ${d.stagiaire?.nom ?? ev.nom ?? ""}`.trim())}`} className="underline" style={{ color: BLEU }}>ouvrir le dossier ↗</Link></> : ""} (le certificat déclenche le paiement CDC).</li>
              </ol>
            </div>
          </div>
        )}
        {ev.statut === "complet" && ev.phase !== "final" && !d.conseil && <p className="text-sm text-gray-700">Test complet — niveau {ev.niveau_global ?? "—"}.</p>}
        {ev.statut === "en_cours" && <p className="text-sm text-gray-700">Le candidat n'a pas terminé sa passation.</p>}
      </section>

      {/* Rédaction */}
      {ev.ecrit != null && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Expression écrite{ev.sujet_ecrit ? ` — sujet ${ev.sujet_ecrit}` : ""}</h2>
          {d.test?.consigne_ecrit && <p className="mb-1 whitespace-pre-line text-xs italic text-gray-500">{d.test.consigne_ecrit}</p>}
          <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
            {ev.ecrit || <span className="text-gray-400">— pas de rédaction —</span>}
          </div>
        </section>
      )}

      {/* Audios */}
      {d.oral.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Expression orale</h2>
          {d.test?.consigne_oral && <p className="mb-2 text-xs italic text-gray-500">{d.test.consigne_oral}</p>}
          <div className="space-y-2">
            {d.oral.map((a) => (
              <div key={a.q} className="rounded-lg border border-gray-200 p-3">
                <div className="mb-1 text-sm text-gray-700">Q{a.q} — {a.question}</div>
                {a.url ? <audio controls src={a.url} className="w-full" /> : <span className="text-xs text-gray-400">Audio indisponible</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
