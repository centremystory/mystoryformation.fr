"use client";

/**
 * MYSTORY — /examens/vente : vente d'examen en étapes (§2.1).
 * 1. Type → 2. Candidat → 3. Session (places restantes EN DIRECT, complet = non sélectionnable)
 * → 4. Sous-type/motivation + paiement → 5. Vendeur/agence + validation.
 * À la validation, UNE SEULE ACTION : n° d'attestation séquentiel + attestation et
 * convocation générées, archivées et envoyées par email + compteurs à jour + journal.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const SOUS_TYPES_CIVIQUE = ["Carte de séjour pluriannuelle", "Carte de résident", "Naturalisation"];
const MOTIVATIONS_TEF = ["04. Intégration française", "05. Carte de séjour pluriannuelle", "06. Carte de résident en France", "10. Naturalisation française"];
const PLATEFORMES = ["Passetontef", "Prepcivique", "Prepmyfuture"];
// Tarifs pré-remplis (modifiables à la vente) — 265 € = pack examen TEF IRN + civique.
const TARIF_DEFAUT: Record<string, string> = { TEF_IRN: "265", Examen_civique: "", Vente_plateforme: "" };

interface Session { id: string; type: string; date_examen: string; horaire: string; capacite: number; inscrits: number; restantes: number; note: string | null; }

function dateFR(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long" }).format(new Date(a, m - 1, j));
}

export default function PageVenteExamen() {
  const [etape, setEtape] = useState(1);
  const [type, setType] = useState("");
  const [candidat, setCandidat] = useState({
    civilite: "", nom: "", prenom: "", date_naissance: "", email: "", telephone: "",
    adresse: "", cp: "", ville: "", num_piece_identite: "",
  });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sousType, setSousType] = useState("");
  const [paiement, setPaiement] = useState({ montant: "", mode_paiement: "CB", dont_cb: "", statut_paiement: "Payé", reste_a_payer: "" });
  const [vendeur, setVendeur] = useState({ vendu_par: "", agence: "Gagny", commentaire: "" });
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [tefExterne, setTefExterne] = useState(false);
  const [tefExterneDate, setTefExterneDate] = useState("");
  const [forcer, setForcer] = useState(false);
  const [motifForcage, setMotifForcage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<any>(null);

  useEffect(() => {
    try { setVendeur((v) => ({ ...v, vendu_par: localStorage.getItem("mystory_auteur") ?? "" })); } catch {}
  }, []);
  // Places restantes EN DIRECT : rechargées à l'arrivée sur l'étape session.
  useEffect(() => {
    if (etape !== 3 || type === "Vente_plateforme") return;
    fetch("/api/examens/sessions", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSessions(j.sessions.filter((s: Session) => s.type === type)); })
      .catch(() => {});
  }, [etape, type]);

  const sessionChoisie = useMemo(() => sessions.find((s) => s.id === sessionId) ?? null, [sessions, sessionId]);
  const champ = "border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-full";
  const estPlateforme = type === "Vente_plateforme";

  function choisirType(t: string) {
    setType(t);
    setSousType("");
    setSessionId("");
    setPaiement((p) => ({ ...p, montant: TARIF_DEFAUT[t] ?? "" }));
    setEtape(2);
  }

  function suivantCandidat() {
    const manque: string[] = [];
    if (!candidat.nom.trim()) manque.push("Nom obligatoire.");
    if (!candidat.prenom.trim()) manque.push("Prénom obligatoire.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidat.email.trim())) manque.push("Email valide obligatoire (envoi des documents).");
    setErreurs(manque);
    if (manque.length === 0) setEtape(estPlateforme ? 4 : 3);
  }

  async function valider() {
    setEnvoi(true); setErreurs([]);
    try {
      const r = await fetch("/api/examens/ventes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidat: { ...candidat, agence: vendeur.agence },
          vente: {
            type_examen: type,
            session_id: estPlateforme ? null : sessionId,
            sous_type: sousType || null,
            montant: Number(paiement.montant),
            mode_paiement: paiement.mode_paiement,
            dont_cb: paiement.mode_paiement === "Mixte" ? Number(paiement.dont_cb || 0) : null,
            statut_paiement: paiement.statut_paiement,
            reste_a_payer: paiement.statut_paiement === "Acompte" ? Number(paiement.reste_a_payer || 0) : 0,
            vendu_par: vendeur.vendu_par.trim(),
            agence: vendeur.agence,
            commentaire: vendeur.commentaire,
            tef_passage_externe: type === "TEF_IRN" ? tefExterne : false,
            tef_passage_externe_date: type === "TEF_IRN" && tefExterne ? tefExterneDate : null,
            carence_forcer: forcer,
            carence_motif: forcer ? motifForcage.trim() : "",
          },
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErreurs(j.recap ?? [j.erreur || "Échec de la vente."]); return; }
      try { if (vendeur.vendu_par.trim()) localStorage.setItem("mystory_auteur", vendeur.vendu_par.trim()); } catch {}
      setResultat(j);
    } catch (e: any) {
      setErreurs([e?.message ?? "Échec de la vente."]);
    } finally {
      setEnvoi(false);
    }
  }

  async function voirDoc(piece: string) {
    const r = await fetch(`/api/examens/documents?vente=${resultat.venteId}&piece=${piece}`);
    const j = await r.json();
    if (j.ok) window.open(j.url, "_blank");
  }

  if (resultat) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <h1 className="text-xl font-semibold text-green-900">Vente enregistrée</h1>
          <p className="text-2xl font-bold text-green-900 mt-2">{resultat.numeroAttestation}</p>
          <p className="text-sm mt-3 text-green-900">
            {resultat.email?.envoye
              ? <>📧 Attestation {estPlateforme ? "" : "+ convocation "}envoyées à <strong>{resultat.email.a}</strong></>
              : <>⚠️ Documents générés mais email non envoyé : {resultat.email?.erreur}</>}
          </p>
          {resultat.factureDifferee && (
            <p className="text-sm mt-3 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              💶 Paiement espèces : <strong>attestation seule</strong>. La facture sera à émettre <strong>après validation</strong> depuis <Link href="/factures" className="underline">Factures › À facturer</Link>.
            </p>
          )}
          {resultat.facture?.numero && (
            <p className="text-xs mt-2 text-green-800">🧾 Facture {resultat.facture.numero}{resultat.facture.envoyee ? " envoyée" : " émise"}.</p>
          )}
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            <button onClick={() => voirDoc("attestation")} className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">Voir l'attestation</button>
            {!estPlateforme && <button onClick={() => voirDoc("convocation")} className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">Voir la convocation</button>}
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg text-sm text-white bg-mystory">+ Nouvelle vente</button>
            <Link href="/examens" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">Planning des sessions</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Vendre un examen</h1>
      <p className="text-sm text-gray-500 mb-6">Étape {etape} / 5 — attestation + convocation envoyées automatiquement à la validation.</p>

      {erreurs.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm mb-4">
          {erreurs.map((e, i) => <p key={i}>• {e}</p>)}
        </div>
      )}

      {erreurs.some((e) => /carence|mention civique par jour/i.test(e)) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm mb-4 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={forcer} onChange={(e) => setForcer(e.target.checked)} className="mt-0.5" />
            <span><strong>Forcer l'inscription malgré la carence</strong> — réservé à la Direction. L'action est journalisée.</span>
          </label>
          {forcer && (
            <label className="text-sm block">Motif (obligatoire)
              <input value={motifForcage} onChange={(e) => setMotifForcage(e.target.value)} placeholder="Ex. dérogation, cas particulier…" className={`${champ} mt-1`} />
            </label>
          )}
          {forcer && (
            <button onClick={valider} disabled={envoi || !motifForcage.trim()} className="px-4 py-2 rounded-lg text-sm text-white bg-amber-600 font-medium disabled:opacity-50">
              {envoi ? "Envoi…" : "Forcer et valider la vente"}
            </button>
          )}
        </div>
      )}

      {etape === 1 && (
        <div className="grid gap-3">
          {[["TEF_IRN", "TEF IRN", "Test d'évaluation de français — centre d'examen Gagny"],
            ["Examen_civique", "Examen civique", "Mention carte de séjour / résident / naturalisation"],
            ["Vente_plateforme", "Vente plateforme", "Application d'entraînement — attestation seule, sans convocation"]].map(([v, l, d]) => (
            <button key={v} onClick={() => choisirType(v)}
                    className="text-left border border-gray-300 rounded-xl p-4 bg-white hover:border-mystory">
              <p className="font-semibold text-gray-900">{l}</p>
              <p className="text-sm text-gray-500">{d}</p>
            </button>
          ))}
        </div>
      )}

      {etape === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Civilité
              <select value={candidat.civilite} onChange={(e) => setCandidat({ ...candidat, civilite: e.target.value })} className={`${champ} mt-1`}>
                <option value="">—</option><option>Madame</option><option>Monsieur</option><option>Autre</option>
              </select>
            </label>
            <label className="text-sm">Date de naissance
              <input type="date" value={candidat.date_naissance} onChange={(e) => setCandidat({ ...candidat, date_naissance: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Nom *
              <input value={candidat.nom} onChange={(e) => setCandidat({ ...candidat, nom: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Prénom *
              <input value={candidat.prenom} onChange={(e) => setCandidat({ ...candidat, prenom: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Email * <span className="text-gray-400">(envoi des documents)</span>
              <input type="email" value={candidat.email} onChange={(e) => setCandidat({ ...candidat, email: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Téléphone
              <input value={candidat.telephone} onChange={(e) => setCandidat({ ...candidat, telephone: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm col-span-2">N° étranger / pièce d'identité
              <input value={candidat.num_piece_identite} onChange={(e) => setCandidat({ ...candidat, num_piece_identite: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm col-span-2">Adresse
              <input value={candidat.adresse} onChange={(e) => setCandidat({ ...candidat, adresse: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Code postal
              <input value={candidat.cp} onChange={(e) => setCandidat({ ...candidat, cp: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Ville
              <input value={candidat.ville} onChange={(e) => setCandidat({ ...candidat, ville: e.target.value })} className={`${champ} mt-1`} />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEtape(1)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">← Retour</button>
            <button onClick={suivantCandidat} className="px-4 py-2 rounded-lg text-sm text-white bg-mystory">Continuer →</button>
          </div>
        </div>
      )}

      {etape === 3 && !estPlateforme && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Choisis la session ({type === "TEF_IRN" ? "TEF IRN" : "Examen civique"}) — places en direct :</p>
          {sessions.length === 0 && <p className="text-sm text-gray-500">Aucune session à venir — crée les créneaux depuis la page <Link className="underline" href="/examens">Sessions</Link>.</p>}
          <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {sessions.map((s) => {
              const complet = s.restantes <= 0;
              const choisi = sessionId === s.id;
              return (
                <button key={s.id} disabled={complet} onClick={() => setSessionId(s.id)}
                        className={`text-left border rounded-lg p-3 text-sm ${complet ? "bg-red-50 border-red-200 text-red-400 cursor-not-allowed" : choisi ? "border-mystory bg-mystory-clair/60" : "bg-white border-gray-300"}`}>
                  <span className="font-medium capitalize">{dateFR(s.date_examen)}</span> · {s.horaire}<br />
                  {complet ? <strong>COMPLET</strong> : <span className="text-gray-600">{s.restantes} place{s.restantes > 1 ? "s" : ""} restante{s.restantes > 1 ? "s" : ""}</span>}
                  {s.note && <span className="block text-xs italic">📌 {s.note}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEtape(2)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">← Retour</button>
            <button onClick={() => { if (!sessionId) { setErreurs(["Choisis une session."]); } else { setErreurs([]); setEtape(4); } }}
                    className="px-4 py-2 rounded-lg text-sm text-white bg-mystory">Continuer →</button>
          </div>
        </div>
      )}

      {etape === 4 && (
        <div className="space-y-3">
          <label className="text-sm block">
            {type === "Examen_civique" ? "Mention visée * (conditionne l'épreuve)" : type === "TEF_IRN" ? "Motivation (facultatif — libellés CCI)" : "Application *"}
            <select value={sousType} onChange={(e) => setSousType(e.target.value)} className={`${champ} mt-1`}>
              <option value="">—</option>
              {(type === "Examen_civique" ? SOUS_TYPES_CIVIQUE : type === "TEF_IRN" ? MOTIVATIONS_TEF : PLATEFORMES).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          {type === "TEF_IRN" && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={tefExterne} onChange={(e) => setTefExterne(e.target.checked)} className="mt-0.5" />
                <span>Le candidat a déjà passé un <strong>TEF IRN dans un autre centre</strong> récemment (carence de 20 jours entre deux TEF).</span>
              </label>
              {tefExterne && (
                <label className="text-sm block">Date de ce dernier passage *
                  <input type="date" value={tefExterneDate} onChange={(e) => setTefExterneDate(e.target.value)} className={`${champ} mt-1`} />
                </label>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Montant (€) * <span className="text-gray-400">(modifiable)</span>
              <input type="number" min={0} step="0.01" value={paiement.montant}
                     onChange={(e) => setPaiement({ ...paiement, montant: e.target.value })} className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Mode de paiement
              <select value={paiement.mode_paiement} onChange={(e) => setPaiement({ ...paiement, mode_paiement: e.target.value })} className={`${champ} mt-1`}>
                <option>CB</option><option>Espèces</option><option>Mixte</option>
              </select>
            </label>
            {paiement.mode_paiement === "Mixte" && (
              <label className="text-sm">Dont CB (€)
                <input type="number" min={0} step="0.01" value={paiement.dont_cb}
                       onChange={(e) => setPaiement({ ...paiement, dont_cb: e.target.value })} className={`${champ} mt-1`} />
              </label>
            )}
            <label className="text-sm">Statut du paiement
              <select value={paiement.statut_paiement} onChange={(e) => setPaiement({ ...paiement, statut_paiement: e.target.value })} className={`${champ} mt-1`}>
                <option>Payé</option><option>Inclus CPF</option><option>Acompte</option>
              </select>
            </label>
            {paiement.statut_paiement === "Acompte" && (
              <label className="text-sm">Reste à payer (€) *
                <input type="number" min={0} step="0.01" value={paiement.reste_a_payer}
                       onChange={(e) => setPaiement({ ...paiement, reste_a_payer: e.target.value })} className={`${champ} mt-1`} />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEtape(estPlateforme ? 2 : 3)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">← Retour</button>
            <button onClick={() => setEtape(5)} className="px-4 py-2 rounded-lg text-sm text-white bg-mystory">Continuer →</button>
          </div>
        </div>
      )}

      {etape === 5 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Vendu par *
              <input value={vendeur.vendu_par} onChange={(e) => setVendeur({ ...vendeur, vendu_par: e.target.value })} placeholder="Ton prénom" className={`${champ} mt-1`} />
            </label>
            <label className="text-sm">Agence de vente *
              <select value={vendeur.agence} onChange={(e) => setVendeur({ ...vendeur, agence: e.target.value })} className={`${champ} mt-1`}>
                <option>Gagny</option><option>Sarcelles</option><option>Rosny</option>
              </select>
            </label>
            <label className="text-sm col-span-2">Commentaire
              <input value={vendeur.commentaire} onChange={(e) => setVendeur({ ...vendeur, commentaire: e.target.value })} className={`${champ} mt-1`} />
            </label>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-gray-800">Récapitulatif</p>
            <p>👤 {candidat.civilite} {candidat.prenom} {candidat.nom} · {candidat.email}</p>
            <p>📝 {type === "TEF_IRN" ? "TEF IRN" : type === "Examen_civique" ? "Examen civique" : "Vente plateforme"}{sousType ? ` — ${sousType}` : ""}</p>
            {sessionChoisie && <p className="capitalize">📅 {dateFR(sessionChoisie.date_examen)} · {sessionChoisie.horaire} · Gagny</p>}
            <p>💶 {paiement.montant} € · {paiement.mode_paiement} · {paiement.statut_paiement}{paiement.statut_paiement === "Acompte" ? ` (reste ${paiement.reste_a_payer || 0} €)` : ""}</p>
            <p className="text-xs text-gray-500">À la validation : n° d'attestation attribué, documents générés et envoyés par email, place décomptée, journalisation.</p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setEtape(4)} className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">← Retour</button>
            <button onClick={valider} disabled={envoi} className="px-5 py-2 rounded-lg text-sm text-white bg-mystory font-medium disabled:opacity-50">
              {envoi ? "Vente en cours…" : "✅ Valider la vente"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
