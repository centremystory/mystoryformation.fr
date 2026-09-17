"use client";

/**
 * MYSTORY — Écran de notation de la formatrice, ouvert depuis le lien signé reçu
 * par e-mail. Pensé pour le téléphone : aucune connexion, une seule page, deux notes.
 *
 * Il n'affiche AUCUN corrigé de la banque de questions — seulement ce qu'il faut
 * pour évaluer les deux expressions : la consigne, la rédaction du candidat et,
 * s'il y en a, ses enregistrements.
 */
import { useEffect, useState } from "react";

type Audio = { q: number; question: string; url: string | null; duree: number | null };
type Evaluation = {
  id: string;
  phase: string;
  statut: string;
  deja_notee: boolean;
  candidat: string;
  niveau_vise: string | null;
  sur_place: boolean;
  ce_sur10: number | null;
  co_sur10: number | null;
  ee_sur10: number | null;
  eo_sur10: number | null;
  niveau_calibre: string | null;
  heures_preconisees: number | null;
  ecrit: string | null;
  sujet_ecrit: string | null;
  mots_ecrit: number;
  notateur: string | null;
  test: { titre: string; consigne_ecrit: string | null; consigne_oral: string | null } | null;
  oral: Audio[];
};

const CLE_NOM = "mystory_notateur";

export default function Corriger({ params }: { params: { id: string } }) {
  const [sig, setSig] = useState<string | null>(null);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ee, setEe] = useState(""); const [eo, setEo] = useState("");
  const [rem, setRem] = useState(""); const [nom, setNom] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState<null | { niveau: string; total: number; mailCandidat: boolean }>(null);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    setSig(c);
    // Le nom de la formatrice ne change pas d'une copie à l'autre : on le retient
    // sur son téléphone pour qu'elle ne le retape pas dix fois par semaine.
    try { setNom(window.localStorage.getItem(CLE_NOM) ?? ""); } catch { /* navigation privée */ }
    if (!c) { setErreur("Lien incomplet : ouvrez-le depuis l'e-mail, sans le modifier."); return; }
    fetch(`/api/tests/corriger/${params.id}?c=${encodeURIComponent(c)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setEv(j.evaluation); else setErreur(j.erreur || "Copie introuvable."); })
      .catch(() => setErreur("Chargement impossible. Vérifiez votre connexion."));
  }, [params.id]);

  async function noter() {
    const e = Number(ee), o = Number(eo);
    if (!(e >= 0 && e <= 10) || !(o >= 0 && o <= 10)) { setErreur("Les deux notes doivent être comprises entre 0 et 10."); return; }
    if (nom.trim().length < 2) { setErreur("Indiquez votre nom : il figure sur la pièce d'évaluation du dossier."); return; }
    setEnvoi(true); setErreur(null);
    try { window.localStorage.setItem(CLE_NOM, nom.trim()); } catch { /* sans importance */ }
    try {
      const r = await fetch(`/api/tests/corriger/${params.id}?c=${encodeURIComponent(sig ?? "")}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ee_sur10: e, eo_sur10: o, remarques: rem, notateur: nom.trim(),
          oral_evaluation_mode: ev?.sur_place ? "onsite_examiner" : (ev?.oral?.length ? "remote_recording" : undefined),
        }),
      });
      const j = await r.json();
      if (j.ok) setFini({ niveau: j.niveau, total: j.total_sur20, mailCandidat: !!j.email_recap_envoye });
      else setErreur(j.erreur || "Enregistrement refusé.");
    } catch { setErreur("Envoi impossible. Réessayez."); }
    finally { setEnvoi(false); }
  }

  const champ = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const carte = "rounded-2xl border border-gray-200 bg-white p-4 sm:p-5";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Corriger l&apos;écrit et l&apos;oral</h1>
      <p className="mt-1 text-sm text-gray-500">
        Deux notes sur 10 suffisent à finaliser le niveau. Le candidat reçoit ses résultats aussitôt.
      </p>

      {erreur && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}

      {ev && !fini && (
        <>
          <div className={`mt-4 ${carte}`}>
            <div className="text-lg font-bold text-gray-900">{ev.candidat || "Candidat sans nom"}</div>
            <div className="mt-1 text-sm text-gray-500">
              {ev.phase === "final" ? "Test final" : "Test de positionnement"}
              {ev.niveau_vise ? ` · vise le ${ev.niveau_vise}` : ""}
              {ev.sur_place ? " · sur place" : " · à distance"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Compréhension écrite</div>
                <div className="font-bold">{ev.ce_sur10 ?? "—"} / 10</div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Compréhension orale</div>
                <div className="font-bold">{ev.co_sur10 ?? "—"} / 10</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Palier tenu en compréhension : <b>{ev.niveau_calibre ?? "A2 non tenu"}</b>.
              {" "}Une note d'expression <b>sous 6/10</b> fait descendre le niveau d'un cran — c'est la règle du TEF IRN,
              où il faut tenir le score dans les quatre épreuves à la fois.
            </p>
          </div>

          {ev.deja_notee && (
            <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Cette copie a déjà été corrigée{ev.notateur ? ` par ${ev.notateur}` : ""}
              {ev.ee_sur10 != null ? ` (EE ${ev.ee_sur10}/10, EO ${ev.eo_sur10}/10)` : ""}.
              Pour la reprendre, passez par le back-office.
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
          <div className={carte}>
            <div className="text-sm font-semibold text-gray-800">✍️ Expression écrite</div>
            {ev.test?.consigne_ecrit && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{ev.test.consigne_ecrit}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              {ev.sujet_ecrit ? `Sujet ${ev.sujet_ecrit} · ` : ""}{ev.mots_ecrit} mot{ev.mots_ecrit > 1 ? "s" : ""} rédigé{ev.mots_ecrit > 1 ? "s" : ""}
            </p>
            {ev.ecrit
              ? <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{ev.ecrit}</p>
              : <p className="mt-2 text-sm text-amber-700">Aucune rédaction n'a été rendue.</p>}
          </div>

          <div className={carte}>
            <div className="text-sm font-semibold text-gray-800">🎙️ Expression orale</div>
            {ev.oral.length > 0 ? (
              <div className="mt-2 space-y-3">
                {[...ev.oral].sort((a, b) => a.q - b.q).map((a) => (
                  <div key={a.q}>
                    <div className="mb-1 text-xs text-gray-600">{a.q + 1}. {a.question}</div>
                    {a.url
                      ? <audio controls src={a.url} className="w-full" />
                      : <span className="text-xs text-red-500">Enregistrement indisponible.</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-600">
                {ev.sur_place
                  ? "Passation sur place : l'examinateur a évalué en direct, il n'y a pas d'enregistrement."
                  : "Aucun enregistrement n'a été déposé."}
              </p>
            )}
          </div>

          </div>

          <div className={`${carte} lg:sticky lg:top-6`}>
            <div className="text-sm font-semibold text-gray-800">Vos notes</div>
            <p className="mt-0.5 text-xs text-gray-500">
              Sous 6/10, le niveau descend d&apos;un cran.
            </p>
            <div className="mt-3 space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Expression écrite / 10</label>
              <input type="number" min="0" max="10" step="0.5" value={ee} inputMode="decimal"
                onChange={(e) => setEe(e.target.value)} className={champ} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Expression orale / 10</label>
              <input type="number" min="0" max="10" step="0.5" value={eo} inputMode="decimal"
                onChange={(e) => setEo(e.target.value)} className={champ} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Observations (facultatif)</label>
              <textarea value={rem} onChange={(e) => setRem(e.target.value)} rows={3} className={champ} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Votre nom</label>
              <input value={nom} onChange={(e) => setNom(e.target.value)} className={champ}
                placeholder="Nom de la formatrice" autoComplete="name" />
              <p className="mt-1 text-xs text-gray-500">Il figure sur la pièce d'évaluation du dossier.</p>
            </div>
            </div>
            <button onClick={noter} disabled={envoi || ee === "" || eo === "" || ev.deja_notee}
              className="mt-4 w-full rounded-xl bg-mystory px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {envoi ? "Enregistrement…" : "Valider et finaliser le niveau"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">
              La validation envoie ses résultats au candidat et la correction détaillée à l&apos;équipe.
            </p>
          </div>
          </div>
        </>
      )}

      {fini && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-center">
          <div className="text-sm text-gray-500">Niveau retenu</div>
          <div className="mt-1 text-4xl font-extrabold text-mystory">{fini.niveau}</div>
          <div className="mt-1 text-sm text-gray-600">{fini.total} / 20</div>
          <p className="mt-3 text-sm text-green-700">
            ✓ Copie corrigée. La correction détaillée part à l'équipe.
            {fini.mailCandidat ? " Le candidat a reçu ses résultats." : " (Pas d'e-mail candidat : adresse absente.)"}
          </p>
        </div>
      )}

      {!ev && !erreur && <p className="mt-6 text-sm text-gray-500">Chargement…</p>}
    </main>
  );
}
