"use client";

/**
 * MYSTORY — Passation d'un test (initial ou final), accès public par jeton.
 * Le candidat répond ; la correction se fait côté serveur (les corrigés ne sont jamais envoyés ici).
 */
import { useEffect, useMemo, useRef, useState } from "react";

type Option = { cle: string; texte: string; image?: string };
type Question = {
  id: string; section: "CE" | "CO"; ordre: number; bloc: string | null; type: string;
  contexte: string | null; audio_path: string | null; enonce: string; options: Option[]; points: number;
};
type Data = {
  mode?: "sur_place" | "distance";
  test: { titre: string; phase: string; consigne_ecrit: string | null; consigne_oral: string | null; oral_questions: string[] | null; sujets_ecrit?: Array<{ niveau: string; sujet: string; mots_min: number }> | null };
  candidat: { nom: string | null; prenom: string | null };
  questions: Question[];
};

const LABEL: Record<string, string> = { CE: "Compréhension écrite", CO: "Compréhension orale" };
const jouable = (p: string | null) => !!p && /^(https?:|\/)/.test(p);

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center text-gray-700">
      {children}
    </div>
  );
}

export default function Passation({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null);
  const [rep, setRep] = useState<Record<string, string>>({});
  const [ecrit, setEcrit] = useState("");
  const [sujetEcrit, setSujetEcrit] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);
  // 08/09/2026 — on ne stocke plus un simple niveau : la fin du test est le moment
  // ou un prospect decide. Il lui faut son niveau, le volume d'heures qui l'en
  // separe, et un moyen de nous joindre.
  const [bilan, setBilan] = useState<any>(null);
  const [coord, setCoord] = useState({ nom: "", prenom: "", email: "", telephone: "",
                                       demarche: "", niveauVise: "", echeance: "", objectif: "" });
  const [coordEnvoi, setCoordEnvoi] = useState<"idle" | "envoi" | "ok">("idle");
  const [civique, setCivique] = useState<"idle" | "envoi">("idle");
  // 09/09/2026 — le candidat peut demander a voir sa correction. Repliee par defaut :
  // le resultat et le nombre d'heures doivent rester la premiere chose qu'il lit.
  const [voirCorrection, setVoirCorrection] = useState(false);
  // 09/09/2026 — sequencement des documents sonores. Ils s'enchainent l'un apres
  // l'autre, jamais en meme temps, et les reponses d'un bloc ne s'ouvrent que
  // pendant ses 15 secondes de reponse : c'est la contrainte du jour J.
  const [audioIdx, setAudioIdx] = useState(0);
  const [phaseAudio, setPhaseAudio] = useState<Record<string, string>>({});
  const [deja, setDeja] = useState(false);
  const [kiosque, setKiosque] = useState(false);
  const [oralBlobs, setOralBlobs] = useState<Record<number, Blob>>({});
  // Épreuve chronométrée (décision Direction 10/07) : CE 20 min → CO 20 min (écoute unique)
  // → EE 15 min → EO 10 min. Pas de retour en arrière ; fin du temps = étape suivante.
  const [phase, setPhase] = useState<"intro" | "CE" | "CO" | "EE" | "EO">("intro");
  const [finPhase, setFinPhase] = useState<number | null>(null);
  const [resteSec, setResteSec] = useState<number>(0);
  const envoyeRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("k=1")) setKiosque(true);
    fetch(`/api/tests/passation?token=${encodeURIComponent(params.token)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); else { setErreur(j.erreur || "Introuvable."); if (j.dejaFait) setDeja(true); } })
      .catch(() => setErreur("Chargement impossible."));
  }, [params.token]);

  const sections = useMemo<("CE" | "CO")[]>(() => ["CE", "CO"], []);
  // 08/09/2026 : format ramene a 45 min au total (37 min sur place, l'oral se faisant
  // en direct avec le conseiller). Moins de questions faciles, plus de discriminantes.
  // 09/09/2026 : la CO passe de 12 a 15 min — 8 documents sonores et 18 questions
  // n'y tenaient pas. Total inchange a 45 min a distance, 38 sur place.
  const DUREES_MIN: Record<"CE" | "CO" | "EE" | "EO", number> = { CE: 15, CO: 15, EE: 8, EO: 7 };
  // Sur place : l'expression orale se fait EN DIRECT avec l'examinateur (qui la note ensuite) —
  // pas d'enregistrement en ligne. À distance : enregistrement micro (étape EO 10 min).
  const ORDRE_PHASES: ("CE" | "CO" | "EE" | "EO")[] = data?.mode === "sur_place" ? ["CE", "CO", "EE"] : ["CE", "CO", "EE", "EO"];

  function demarrerPhase(ph: "CE" | "CO" | "EE" | "EO") {
    setPhase(ph);
    setFinPhase(Date.now() + DUREES_MIN[ph] * 60_000);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function phaseSuivante() {
    const i = ORDRE_PHASES.indexOf(phase as any);
    const proch = ORDRE_PHASES[i + 1];
    if (proch) demarrerPhase(proch);
    else if (!envoyeRef.current) { envoyeRef.current = true; envoyer(); }
  }

  // Tic du chrono : à 0, on passe automatiquement à l'étape suivante.
  useEffect(() => {
    if (!finPhase || fini) return;
    const t = setInterval(() => {
      const reste = Math.max(0, Math.ceil((finPhase - Date.now()) / 1000));
      setResteSec(reste);
      if (reste <= 0) { clearInterval(t); phaseSuivante(); }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finPhase, fini]);

  const mmss = `${String(Math.floor(resteSec / 60)).padStart(2, "0")}:${String(resteSec % 60).padStart(2, "0")}`;

  async function envoyer() {
    setEnvoi(true); setErreur(null);
    try {
      const oq = data?.test.oral_questions ?? [];
      if (oq.length) {
        const audios: Array<{ q: number; question: string; audioBase64: string }> = [];
        for (let i = 0; i < oq.length; i++) { const bl = oralBlobs[i]; if (bl) audios.push({ q: i, question: oq[i], audioBase64: await blobToB64(bl) }); }
        if (audios.length) {
          await fetch("/api/tests/oral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: params.token, audios }) });
        }
      }
      const r = await fetch("/api/tests/passation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: params.token, reponses: rep, ecrit, sujet_ecrit: sujetEcrit }),
      });
      const j = await r.json();
      if (j.ok) { setBilan(j); setFini(true); } else setErreur(j.erreur || "Envoi impossible.");
    } catch { setErreur("Envoi impossible. Vérifiez votre connexion."); }
    finally { setEnvoi(false); }
  }

  if (fini) {
    const nbMotsFin = ecrit.trim() ? ecrit.trim().split(/\s+/).length : 0;
    const surPlace = data?.mode === "sur_place";
    return (
      <Centre>
        <div className="w-full max-w-3xl text-left">
        <h1 className="mb-1 text-2xl font-bold text-mystory">
          Merci{data?.candidat.prenom ? ` ${data.candidat.prenom}` : ""}, c&apos;est terminé.
        </h1>
        <p className="mb-5 text-sm text-gray-500">Voici ce que votre test nous apprend déjà.</p>

        {/* ── LE RÉSULTAT. On n'affiche JAMAIS « A0 » : ce n'est pas un niveau du
            CECRL, c'est démoralisant, et c'est faux tant que l'oral et l'écrit
            n'ont pas été corrigés par un humain. */}
        {bilan && (
          <div className="mb-4 rounded-2xl border-2 border-mystory bg-blue-50 p-6">
            {bilan.niveau_calibre ? (
              <>
                <div className="text-xs uppercase tracking-wide text-gray-600">
                  Niveau tenu sur les épreuves de compréhension
                </div>
                <div className="text-5xl font-extrabold leading-none text-mystory">
                  {bilan.niveau_calibre}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs uppercase tracking-wide text-gray-600">
                  Compréhension écrite et orale
                </div>
                <div className="mt-1 text-xl font-bold text-mystory">
                  Les bases sont à consolider avant de viser {bilan.niveau_vise}
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  C&apos;est fréquent, et c&apos;est exactement ce que la formation sert à corriger.
                </p>
              </>
            )}
            {bilan.niveau_vise && (
              <p className="mt-3 text-sm text-gray-700">
                Vous visez le niveau <b>{bilan.niveau_vise}</b>.
              </p>
            )}
          </div>
        )}

        {/* ── LE CHIFFRE QUI COMPTE : combien d'heures pour y arriver. */}
        {bilan?.heures && (
          <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Ce que nous vous recommandons
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-gray-900">{bilan.heures}</span>
              <span className="text-lg font-semibold text-gray-700">heures de formation</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{bilan.motif}</p>
            {bilan.epreuve_faible && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                À travailler en priorité : <b>{bilan.epreuve_faible.epreuve}</b>. Au TEF IRN, il
                faut tenir le score dans les quatre épreuves à la fois — une seule épreuve faible
                fait tomber le niveau entier.
              </p>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Volume indicatif, confirmé avec vous après la correction de votre écrit et de
              votre oral. Le passage de l&apos;examen est compris dans nos parcours.
            </p>
          </div>
        )}

        {/* ── Ce qui a decroche, et pourquoi. C'est cette section qui convainc :
            le candidat voit ses propres erreurs au lieu de recevoir un verdict. */}
        {bilan?.detail?.length > 0 && (
          <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">
              Où vous en êtes, question par question
            </div>
            <p className="mb-3 text-sm text-gray-600">
              Les questions étaient réparties par difficulté. Voici jusqu&apos;où vous êtes allé.
            </p>
            <div className="space-y-2">
              {bilan.detail.map((d: any, i: number) => {
                const part = d.total ? d.reussies / d.total : 0;
                const tenu = part >= 0.6;
                return (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-gray-800">
                        {d.section} <span className="text-gray-400">·</span> niveau {d.niveau}
                      </span>
                      <span className={`text-sm font-bold ${tenu ? "text-green-700" : "text-amber-700"}`}>
                        {d.reussies} / {d.total}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-gray-200">
                      <div className={tenu ? "h-full bg-green-600" : "h-full bg-amber-500"}
                           style={{ width: `${Math.round(part * 100)}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-gray-600">
                      Il fallait {d.exige}.
                      {!tenu && d.total - d.reussies > 0 && (
                        <span className="font-medium text-amber-800">
                          {" "}C&apos;est là que {d.total - d.reussies} question
                          {d.total - d.reussies > 1 ? "s vous ont" : " vous a"} échappé.
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              La correction commentée de votre rédaction et de votre oral vous est envoyée par
              e-mail après relecture par une formatrice.
            </p>

            {/* ── La correction, a la demande. On ne montre QUE les questions manquees :
                le candidat comprend ses erreurs, et le corrige complet ne circule pas. */}
            {Array.isArray(bilan.correction) && bilan.correction.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setVoirCorrection((v) => !v)}
                  className="text-sm font-semibold text-mystory underline underline-offset-2">
                  {voirCorrection
                    ? "Masquer ma correction"
                    : `Voir ma correction — ${bilan.correction.length} question${bilan.correction.length > 1 ? "s" : ""} manquée${bilan.correction.length > 1 ? "s" : ""} →`}
                </button>

                {voirCorrection && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-gray-500">
                      Seules les questions manquées figurent ici. Celles que vous avez réussies
                      n&apos;appellent pas d&apos;explication.
                    </p>
                    {bilan.correction.map((c: any, i: number) => (
                      <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                          {c.section} · niveau {c.niveau}
                        </div>
                        {c.enonce && (
                          <p className="text-sm font-medium text-gray-900">{c.enonce}</p>
                        )}
                        <div className="mt-2 space-y-1 text-sm">
                          <div>
                            <span className="text-gray-500">Votre réponse : </span>
                            <span className="font-medium text-red-700">
                              {c.votre_reponse ?? "aucune réponse"}
                            </span>
                          </div>
                          {c.bonne_reponse && (
                            <div>
                              <span className="text-gray-500">Réponse attendue : </span>
                              <span className="font-semibold text-green-800">{c.bonne_reponse}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-gray-600">
                      Ces erreurs ne sont pas des fautes d&apos;inattention : elles portent sur des
                      points de langue précis, que la formation reprend un par un.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Le formulaire. C'est l'etape qui transforme un test en client : elle
            passe donc AVANT le detail des epreuves, pendant que le resultat est
            encore sous les yeux. Listes deroulantes plutot que texte libre : le
            candidat repond plus vite, et la donnee devient exploitable. */}
        {coordEnvoi !== "ok" && (
          <form
            className="mb-5 rounded-2xl border-2 border-mystory bg-blue-50/60 p-6 shadow-sm"
            onSubmit={async (e) => {
              e.preventDefault();
              setCoordEnvoi("envoi");
              try {
                await fetch(`/api/tests/contact`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token: params.token, ...coord }),
                });
                setCoordEnvoi("ok");
              } catch { setCoordEnvoi("idle"); }
            }}
          >
            <p className="text-lg font-bold text-gray-900">Recevez votre bilan complet</p>
            <p className="mb-4 text-sm text-gray-600">
              Le détail des quatre épreuves, la correction commentée de votre rédaction, et le
              parcours adapté à votre situation. Un conseiller vous rappelle pour en parler.
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <input required placeholder="Prénom" className="input" value={coord.prenom}
                     onChange={(e) => setCoord({ ...coord, prenom: e.target.value })} />
              <input required placeholder="Nom" className="input" value={coord.nom}
                     onChange={(e) => setCoord({ ...coord, nom: e.target.value })} />
              <input required type="email" placeholder="Adresse e-mail" className="input" value={coord.email}
                     onChange={(e) => setCoord({ ...coord, email: e.target.value })} />
              <input required type="tel" placeholder="Téléphone" className="input" value={coord.telephone}
                     onChange={(e) => setCoord({ ...coord, telephone: e.target.value })} />
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Pourquoi passez-vous le TEF ?
                </span>
                <select required className="input w-full" value={coord.demarche}
                        onChange={(e) => {
                          // La demarche determine le niveau exige par la loi : on le
                          // pre-remplit pour que le candidat n'ait pas a le deviner.
                          const d = e.target.value;
                          const niv = d === "sejour" ? "A2" : d === "resident" ? "B1"
                                    : d === "naturalisation" ? "B2" : coord.niveauVise;
                          setCoord({ ...coord, demarche: d, niveauVise: niv });
                        }}>
                  <option value="">Choisissez…</option>
                  <option value="sejour">Carte de séjour pluriannuelle</option>
                  <option value="resident">Carte de résident de 10 ans</option>
                  <option value="naturalisation">Naturalisation française</option>
                  <option value="emploi">Travail ou recherche d&apos;emploi</option>
                  <option value="etudes">Études ou formation</option>
                  <option value="autre">Autre raison</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Niveau à atteindre
                </span>
                <select required className="input w-full" value={coord.niveauVise}
                        onChange={(e) => setCoord({ ...coord, niveauVise: e.target.value })}>
                  <option value="">Choisissez…</option>
                  <option value="A2">A2 — carte de séjour pluriannuelle</option>
                  <option value="B1">B1 — carte de résident</option>
                  <option value="B2">B2 — naturalisation</option>
                  <option value="inconnu">Je ne sais pas encore</option>
                </select>
              </label>
            </div>

            <label className="mt-2 block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Pour quand en avez-vous besoin ?
              </span>
              <select className="input w-full" value={coord.echeance}
                      onChange={(e) => setCoord({ ...coord, echeance: e.target.value })}>
                <option value="">Choisissez…</option>
                <option value="urgent">J&apos;ai déjà un rendez-vous en préfecture</option>
                <option value="1mois">Dans le mois</option>
                <option value="3mois">Dans les trois mois</option>
                <option value="6mois">Dans les six mois</option>
                <option value="pas_presse">Je ne suis pas pressé</option>
              </select>
            </label>

            <textarea
              className="input mt-2 w-full" rows={2} value={coord.objectif}
              placeholder="Une précision à nous donner ? (facultatif)"
              onChange={(e) => setCoord({ ...coord, objectif: e.target.value })} />

            <button type="submit" disabled={coordEnvoi === "envoi"} className="btn-primary mt-3 w-full !py-3 !text-base">
              {coordEnvoi === "envoi" ? "Envoi…" : "Recevoir mon bilan et être rappelé"}
            </button>
            <p className="mt-2 text-xs text-gray-500">
              Vos données servent uniquement à vous transmettre votre bilan et à vous rappeler.
              Vous pouvez demander leur suppression à tout moment.
            </p>
          </form>
        )}
        {coordEnvoi === "ok" && (
          <div className="mb-5 rounded-2xl border-2 border-green-300 bg-green-50 p-6 text-green-900">
            <p className="text-lg font-bold">C&apos;est noté.</p>
            <p className="mt-1 text-sm">
              Vous recevrez votre bilan complet par e-mail, et un conseiller vous rappelle très
              vite pour en parler.
            </p>
          </div>
        )}

        {/* ── Où en est chaque épreuve. */}
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Vos quatre épreuves</div>
          <div className="space-y-1.5 text-gray-700">
            <div className="flex justify-between"><span>Compréhension écrite</span>
              <span className="font-medium text-green-700">corrigée{bilan?.ce_sur10 != null ? ` · ${bilan.ce_sur10}/10` : ""}</span></div>
            <div className="flex justify-between"><span>Compréhension orale</span>
              <span className="font-medium text-green-700">corrigée{bilan?.co_sur10 != null ? ` · ${bilan.co_sur10}/10` : ""}</span></div>
            <div className="flex justify-between"><span>Expression écrite{sujetEcrit ? ` (sujet ${sujetEcrit})` : ""}</span>
              <span className="font-medium text-amber-600">{nbMotsFin > 0 ? `${nbMotsFin} mots · en correction` : "non rédigée"}</span></div>
            <div className="flex justify-between"><span>Expression orale</span>
              <span className="font-medium text-amber-600">{surPlace ? "avec votre examinateur" : Object.keys(oralBlobs).length > 0 ? `${Object.keys(oralBlobs).length} enregistrement(s) · en correction` : "non enregistrée"}</span></div>
          </div>
        </div>

        {/* ── L'entrainement, et le second examen. Depuis 2026 une carte de sejour,
            une carte de resident et une naturalisation exigent AUSSI l'examen
            civique : le candidat l'ignore souvent, et c'est ici qu'il y pense. */}
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">En attendant, entraînez-vous</p>
          <div className="grid gap-3 sm:grid-cols-2">

            <a href="https://passetontef.fr" target="_blank" rel="noopener noreferrer"
               className="block rounded-2xl border-2 border-gray-200 bg-white p-4 transition hover:border-mystory hover:shadow-sm">
              <div className="mb-1 flex items-baseline gap-1">
                <span className="text-lg font-extrabold tracking-tight text-mystory">passetontef</span>
                <span className="text-lg font-light text-gray-400">.fr</span>
              </div>
              <p className="text-sm text-gray-600">
                Les quatre épreuves du TEF IRN au format réel, autant de fois que vous voulez.
              </p>
              <span className="mt-2 inline-block text-sm font-semibold text-mystory">S&apos;entraîner →</span>
            </a>

            <a href="https://prepcivique.fr" target="_blank" rel="noopener noreferrer"
               className="block rounded-2xl border-2 border-gray-200 bg-white p-4 transition hover:border-mystory hover:shadow-sm">
              <div className="mb-1 flex items-baseline gap-1">
                <span className="text-lg font-extrabold tracking-tight text-mystory">prepcivique</span>
                <span className="text-lg font-light text-gray-400">.fr</span>
              </div>
              <p className="text-sm text-gray-600">
                L&apos;examen civique : valeurs, institutions, histoire et vie quotidienne.
              </p>
              <span className="mt-2 inline-block text-sm font-semibold text-mystory">S&apos;entraîner →</span>
            </a>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold text-amber-950">Vous devez aussi passer l&apos;examen civique</p>
          <p className="mt-1 text-sm text-amber-900">
            Depuis le 1<sup>er</sup> janvier 2026, la carte de séjour pluriannuelle, la carte de
            résident et la naturalisation exigent, en plus du niveau de français,
            la réussite d&apos;un examen civique : 40 questions en 45 minutes, à partir de 32
            bonnes réponses. Testez votre niveau maintenant, cela prend cinq minutes.
          </p>
          <button
            type="button" disabled={civique === "envoi"}
            className="btn-primary mt-3"
            onClick={async () => {
              setCivique("envoi");
              try {
                const r = await fetch("/api/tests/civique", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token: params.token }),
                });
                const j = await r.json();
                if (j?.ok && j.url) { window.location.href = j.url; return; }
              } catch { /* on retombe sur l'etat initial : le candidat peut reessayer */ }
              setCivique("idle");
            }}>
            {civique === "envoi" ? "Préparation…" : "Tester mon niveau à l'examen civique →"}
          </button>
        </div>

        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
          <p className="mb-1 font-semibold text-gray-900">La suite</p>
          <p>{surPlace
            ? "Votre examinateur évalue votre expression orale avec vous, puis une formatrice corrige votre rédaction."
            : "Une formatrice corrige votre rédaction et vos réponses orales sous 24 à 48 heures."}
            {" "}Vous recevrez ensuite votre niveau complet et le détail des quatre épreuves.
            Une question tout de suite ? <b>06 81 43 16 54</b>.</p>
        </div>
        </div>
        {kiosque && <a href="/test/kiosque" className="btn-primary mt-5">Candidat suivant →</a>}
      </Centre>
    );
  }
  if (deja) return <Centre><h1 className="mb-2 text-2xl font-bold text-mystory">Test déjà envoyé</h1><p>Ce test a déjà été complété. Merci !</p></Centre>;
  if (erreur && !data) return <Centre><p className="text-red-700">{erreur}</p></Centre>;
  if (!data) return <Centre><p>Chargement…</p></Centre>;

  let numero = 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-mystory">{data.test.titre}</h1>
        <p className="text-sm text-gray-500">
          {data.candidat.prenom || data.candidat.nom ? `${data.candidat.prenom ?? ""} ${data.candidat.nom ?? ""}`.trim() : ""}
        </p>
      </header>

      {phase === "intro" && (
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">Avant de commencer</h2>
          <p className="mb-3 text-sm text-gray-600">Le test dure <b>{data.mode === "sur_place" ? "38" : "45"} minutes</b>, en {ORDRE_PHASES.length} étapes chronométrées. Quand le temps d&apos;une étape est écoulé (ou que vous la validez), vous passez à la suivante — <b>impossible de revenir en arrière</b>.</p>
          <ul className="mb-4 space-y-1.5 text-sm text-gray-700">
            <li>📖 <b>Compréhension écrite</b> — 15 min</li>
            <li>🎧 <b>Compréhension orale</b> — 15 min · <b>chaque audio ne peut être écouté qu&apos;UNE seule fois</b></li>
            <li>✍️ <b>Expression écrite</b> — 8 min</li>
            {data.mode === "sur_place"
              ? <li>🎤 <b>Expression orale</b> — en direct avec votre examinateur, après le test écrit</li>
              : <li>🎤 <b>Expression orale</b> — 7 min (micro requis)</li>}
          </ul>
          <p className="mb-4 text-xs text-gray-400">Installez-vous au calme, avec de quoi écouter le son. Le chrono démarre au clic.</p>
          <button onClick={() => demarrerPhase("CE")} className="btn-primary w-full">🚀 Commencer le test (le chrono démarre)</button>
        </section>
      )}

      {phase !== "intro" && !fini && (
        <div className="sticky top-0 z-20 mb-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold text-gray-800">
            Étape {ORDRE_PHASES.indexOf(phase as any) + 1}/{ORDRE_PHASES.length} · {phase === "CE" ? "Compréhension écrite" : phase === "CO" ? "Compréhension orale" : phase === "EE" ? "Expression écrite" : "Expression orale"}
          </div>
          <div className={`rounded-lg px-3 py-1 font-mono text-sm font-bold ${resteSec <= 120 ? "bg-red-100 text-red-700" : "bg-blue-50 text-mystory"}`}>⏱ {mmss}</div>
        </div>
      )}

      {sections.filter((s) => s === phase).map((sec) => {
        // Les documents sonores, dans l'ordre ou le candidat les rencontrera.
        const audios: string[] = [];
        for (const q of data.questions.filter((q) => q.section === sec)) {
          if (q.audio_path && jouable(q.audio_path) && !audios.includes(q.audio_path)) {
            audios.push(q.audio_path);
          }
        }
        const qs = data.questions.filter((q) => q.section === sec);
        if (!qs.length) return null;
        let lastCtx: string | null = null, lastAudio: string | null = null, lastBloc: string | null = null;
        let verrouille = false;
        return (
          <section key={sec} className="mb-8">
            <h2 className="mb-3 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">{LABEL[sec]}</h2>
            {qs.map((q) => {
              numero += 1;
              const newBloc = q.bloc !== lastBloc; lastBloc = q.bloc;
              const showCtx = !!q.contexte && q.contexte !== lastCtx; if (q.contexte) lastCtx = q.contexte;
              const showAudio = !!q.audio_path && q.audio_path !== lastAudio; if (q.audio_path) lastAudio = q.audio_path;
              const aImages = q.options.some((o) => o.image);
              return (
                <div key={q.id}>
                  {newBloc && q.bloc && <p className="mt-4 mb-1 text-sm font-semibold text-mystory">{q.bloc}</p>}
                  {showCtx && (
                    <div className="sticky top-16 z-10 mb-4 max-h-[42vh] overflow-y-auto whitespace-pre-line rounded-xl border border-gray-200 bg-white/95 p-5 text-[15px] leading-relaxed text-gray-800 shadow-sm backdrop-blur">
                      {q.contexte}
                    </div>
                  )}
                  {showAudio && (
                    jouable(q.audio_path) ? (
                      <DocumentSonore
                        src={q.audio_path!}
                        actif={audios.indexOf(q.audio_path!) === audioIdx}
                        onPhase={(ph) => setPhaseAudio((p) =>
                          p[q.audio_path!] === ph ? p : { ...p, [q.audio_path!]: ph })}
                        onFini={() => setAudioIdx((i) =>
                          i === audios.indexOf(q.audio_path!) ? i + 1 : i)}
                      />
                    ) : (
                      <p className="mb-3 text-xs text-amber-700">🎧 Audio fourni par la formatrice le jour du test.</p>
                    )
                  )}
                  {(() => { verrouille = !!q.audio_path && jouable(q.audio_path)
                      && phaseAudio[q.audio_path] !== "repondre"; return null; })()}
                  <div className={`mb-4 rounded-xl border p-3 ${verrouille
                    ? "border-gray-100 bg-gray-50/60 opacity-60" : "border-gray-200"}`}>
                    <p className="mb-3 text-[15px] font-semibold text-gray-900">{numero}. {q.enonce}</p>
                    {q.type === "texte_libre" ? (
                      <input
                        value={rep[q.id] ?? ""} onChange={(e) => setRep((p) => ({ ...p, [q.id]: e.target.value }))}
                        disabled={verrouille}
                        placeholder={verrouille ? "Patientez…" : "Votre réponse…"} className="input w-full"
                      />
                    ) : aImages ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {q.options.map((o) => (
                          <button
                            key={o.cle} type="button" disabled={verrouille}
                            onClick={() => { if (!verrouille) setRep((p) => ({ ...p, [q.id]: o.cle })); }}
                            className={`overflow-hidden rounded-lg border-2 p-1 transition ${rep[q.id] === o.cle ? "border-mystory ring-2 ring-mystory/30" : "border-gray-200"}`}
                          >
                            {o.image && <img src={o.image} alt={o.texte} className="h-24 w-full object-contain" />}
                            <span className="block text-xs text-gray-600">{o.texte}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid gap-1.5 lg:grid-cols-2">
                        {q.options.map((o) => (
                          <label key={o.cle} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${rep[q.id] === o.cle ? "border-mystory bg-mystory-clair" : "border-gray-200 hover:bg-gray-50"}`}>
                            <input type="radio" name={q.id} disabled={verrouille} checked={rep[q.id] === o.cle} onChange={() => setRep((p) => ({ ...p, [q.id]: o.cle }))} className="mt-0.5" />
                            <span><span className="font-medium">{o.cle}.</span> {o.texte}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {phase === "EE" && (data.test.consigne_ecrit || (data.test.sujets_ecrit?.length ?? 0) > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">Expression écrite <span className="text-sm font-normal text-gray-400">· /10</span></h2>
          {data.test.consigne_ecrit && <p className="mb-3 whitespace-pre-line text-sm italic text-gray-600">{data.test.consigne_ecrit}</p>}
          {(data.test.sujets_ecrit?.length ?? 0) > 0 && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {data.test.sujets_ecrit!.map((s) => {
                const actif = sujetEcrit === s.niveau;
                return (
                  <button key={s.niveau} type="button" onClick={() => setSujetEcrit(s.niveau)}
                    className={`rounded-xl border-2 p-3 text-left transition ${actif ? "border-mystory bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${actif ? "bg-mystory text-white" : "bg-gray-100 text-gray-600"}`}>{s.niveau}</span>
                      <span className="text-xs text-gray-400">min. {s.mots_min} mots</span>
                    </div>
                    <p className="text-sm text-gray-700">{s.sujet}</p>
                  </button>
                );
              })}
            </div>
          )}
          {(() => {
            const s = (data.test.sujets_ecrit ?? []).find((x) => x.niveau === sujetEcrit) ?? null;
            const nbMots = ecrit.trim() ? ecrit.trim().split(/\s+/).length : 0;
            const okMots = s ? nbMots >= s.mots_min : true;
            return (
              <div>
                <textarea value={ecrit} onChange={(e) => setEcrit(e.target.value)} rows={10}
                  placeholder={s ? `Sujet ${s.niveau} — rédigez votre texte ici (minimum ${s.mots_min} mots)…` : "Choisissez d'abord votre sujet ci-dessus, puis rédigez ici…"}
                  className="input w-full" />
                {(data.test.sujets_ecrit?.length ?? 0) > 0 && (
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-gray-400">{sujetEcrit ? `Sujet choisi : ${sujetEcrit}` : "Aucun sujet choisi"}</span>
                    <span className={ecrit.trim() ? (okMots ? "font-medium text-green-600" : "text-amber-600") : "text-gray-400"}>
                      {nbMots} mot{nbMots > 1 ? "s" : ""}{s ? ` / ${s.mots_min} minimum` : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {phase === "EO" && data.mode !== "sur_place" && (data.test.consigne_oral || (data.test.oral_questions?.length ?? 0) > 0) && (
        <section className="mb-8">
          <h2 className="mb-2 border-b border-gray-200 pb-1 text-lg font-semibold text-gray-800">Expression orale</h2>
          {data.test.consigne_oral && <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm italic text-gray-700">{data.test.consigne_oral}</div>}
          {(data.test.oral_questions?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Enregistrez votre réponse à chaque question (autorisez l'accès au micro).</p>
              {data.test.oral_questions!.map((q, i) => (
                <EnregistreurOral key={i} index={i} question={q} onBlob={(bl) => setOralBlobs((pp) => ({ ...pp, [i]: bl }))} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Cette partie sera évaluée avec la formatrice.</p>
          )}
        </section>
      )}

      {erreur && <p className="mb-3 text-sm text-red-700">{erreur}</p>}
      {phase !== "intro" && !fini && (
        phase === ORDRE_PHASES[ORDRE_PHASES.length - 1] ? (
          <button onClick={() => { if (!envoyeRef.current) { envoyeRef.current = true; envoyer(); } }} disabled={envoi} className="btn-primary w-full">{envoi ? "Envoi…" : "✅ Terminer et envoyer mes réponses"}</button>
        ) : (
          <button onClick={() => { if (confirm("Passer à l'étape suivante ? Vous ne pourrez pas revenir en arrière.")) phaseSuivante(); }} className="btn-primary w-full">Étape suivante →</button>
        )
      )}
      <p className="mt-3 text-center text-xs text-gray-400">MYSTORY Formation — vos réponses sont corrigées automatiquement, l'oral et l'écrit par une formatrice.</p>
    </div>
  );
}

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
}

function EnregistreurOral({ index, question, onBlob }: { index: number; question: string; onBlob: (b: Blob) => void }) {
  const [etat, setEtat] = useState<"vide" | "enregistre" | "fait">("vide");
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function demarrer() {
    setErr(null);
    if (!navigator.mediaDevices || typeof window === "undefined" || !("MediaRecorder" in window)) {
      setErr("Enregistrement non supporté par ce navigateur (essayez Chrome ou Safari à jour)."); return;
    }
    try { streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setErr("Micro non autorisé."); return; }
    chunksRef.current = [];
    const rec = new MediaRecorder(streamRef.current);
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      onBlob(blob); setUrl(URL.createObjectURL(blob)); setEtat("fait");
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    rec.start(); setEtat("enregistre");
  }
  function arreter() { recRef.current?.stop(); }

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="mb-2 text-sm font-medium text-gray-800">{index + 1}. {question}</p>
      <div className="flex items-center gap-2">
        {etat !== "enregistre" ? (
          <button type="button" onClick={demarrer} className="btn-ghost !py-1 !text-xs">{etat === "fait" ? "Réenregistrer" : "● Enregistrer"}</button>
        ) : (
          <button type="button" onClick={arreter} className="btn-primary !py-1 !text-xs">■ Arrêter</button>
        )}
        {etat === "enregistre" && <span className="text-xs text-red-600">Enregistrement en cours…</span>}
        {etat === "fait" && <span className="text-xs text-green-600">✓ Enregistré</span>}
      </div>
      {url && <audio controls src={url} className="mt-2 w-full" />}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/** Compréhension orale : chaque audio ne peut être écouté qu'UNE seule fois (règle Direction 10/07). */
/**
 * Un document sonore, joué comme au TEF IRN.
 *
 * 09/09/2026 — le kit formateur est explicite : « on laisse 10 secondes avant
 * l'audio pour lire la question et 15 secondes après pour répondre. Tout
 * entraînement doit reproduire cette contrainte. » Et le jour J, l'audio se lance
 * SEUL : il n'y a pas de bouton « écouter ».
 *
 * On reproduit donc les trois temps :
 *   1. LIRE   — 10 s, les réponses sont verrouillées : on prend connaissance des questions
 *   2. ÉCOUTE — l'audio part tout seul, une seule fois, réponses toujours verrouillées
 *   3. RÉPONDRE — 15 s, et seulement là on peut cocher
 * Passé ce délai le bloc est clos, comme à l'examen.
 *
 * Le cycle ne démarre que lorsque le bloc devient ACTIF : les documents s'enchaînent
 * l'un après l'autre, jamais en même temps.
 */
function DocumentSonore({
  src, actif, onFini, onPhase,
}: {
  src: string; actif: boolean;
  onFini: () => void; onPhase: (p: "attente" | "lire" | "ecoute" | "repondre" | "clos") => void;
}) {
  const [phase, setPhase] = useState<"attente" | "lire" | "ecoute" | "repondre" | "clos">("attente");
  const [reste, setReste] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lance = useRef(false);

  useEffect(() => { onPhase(phase); }, [phase, onPhase]);

  useEffect(() => {
    if (!actif || lance.current) return;
    lance.current = true;
    setPhase("lire"); setReste(10);
    const tic = setInterval(() => setReste((r) => (r > 0 ? r - 1 : 0)), 1000);
    const versEcoute = setTimeout(() => {
      clearInterval(tic);
      setPhase("ecoute");
      const a = new Audio(src);
      audioRef.current = a;
      const apres = () => {
        setPhase("repondre"); setReste(15);
        const t2 = setInterval(() => setReste((r) => (r > 0 ? r - 1 : 0)), 1000);
        setTimeout(() => { clearInterval(t2); setPhase("clos"); onFini(); }, 15_000);
      };
      a.onended = apres;
      // Un fichier introuvable ou un navigateur qui refuse la lecture automatique ne
      // doit pas bloquer le candidat : on passe au temps de réponse.
      a.onerror = apres;
      a.play().catch(apres);
    }, 10_000);
    return () => { clearInterval(tic); clearTimeout(versEcoute); };
  }, [actif, src, onFini]);

  const cadre = "mb-3 rounded-xl border-2 px-4 py-3 text-sm font-medium";
  if (phase === "attente")
    return <div className={`${cadre} border-gray-200 bg-gray-50 text-gray-500`}>
      Document sonore suivant — il démarrera seul.
    </div>;
  if (phase === "lire")
    return <div className={`${cadre} border-amber-300 bg-amber-50 text-amber-900`}>
      Lisez les questions ci-dessous. L&apos;audio démarre dans <b>{reste} s</b> — il ne
      passera qu&apos;une seule fois.
    </div>;
  if (phase === "ecoute")
    return <div className={`${cadre} border-mystory bg-blue-50 text-mystory`}>
      🔊 Écoute en cours. Vous répondrez juste après.
    </div>;
  if (phase === "repondre")
    return <div className={`${cadre} border-green-400 bg-green-50 text-green-800`}>
      À vous — <b>{reste} s</b> pour répondre.
    </div>;
  return <div className={`${cadre} border-gray-200 bg-gray-50 text-gray-400`}>
    Document terminé.
  </div>;
}

