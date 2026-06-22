"use client";

/**
 * MYSTORY — /examens/vente-groupe : inscription CROISÉE (Sens A2).
 * Un candidat → plusieurs examens en une seule action (TEF, civique, plateforme),
 * chacun avec sa session/mention/montant. Paiement (mode + statut) commun au panier.
 * Envoi au pré-contrôle global /api/examens/ventes-groupe (carences + places + règle
 * « 2 mentions civiques différentes le même jour ») : si une règle bloque, RIEN n'est créé.
 * Le mono /examens/vente reste disponible.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, CheckCircle2, Mail, Receipt, FileText, AlertTriangle, Layers } from "lucide-react";

const SOUS_TYPES_CIVIQUE = ["Carte de séjour pluriannuelle", "Carte de résident", "Naturalisation"];
const MOTIVATIONS_TEF = ["04. Intégration française", "05. Carte de séjour pluriannuelle", "06. Carte de résident en France", "10. Naturalisation française"];
const PLATEFORMES = ["Passetontef", "Prepcivique", "Prepmyfuture"];
const TARIF_DEFAUT: Record<string, string> = { TEF_IRN: "265", Examen_civique: "", Vente_plateforme: "" };
const TYPE_LABEL: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Examen civique", Vente_plateforme: "Vente plateforme" };

interface Session { id: string; type: string; date_examen: string; horaire: string; capacite: number; inscrits: number; restantes: number; note: string | null; }
type Examen = {
  uid: number; categorie: "examen" | "plateforme"; type: string; sessionId: string; sousType: string; montant: string;
  dontCb: string; reste: string; tefExterne: boolean; tefExterneDate: string;
};

function dateFR(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long" }).format(new Date(a, m - 1, j));
}
const itemVide = (categorie: "examen" | "plateforme"): Examen => ({ uid: Date.now() + Math.random(), categorie, type: categorie === "plateforme" ? "Vente_plateforme" : "", sessionId: "", sousType: "", montant: "", dontCb: "", reste: "", tefExterne: false, tefExterneDate: "" });

export default function PageVenteGroupe() {
  const [candidat, setCandidat] = useState({
    civilite: "", nom: "", prenom: "", date_naissance: "", email: "", telephone: "",
    adresse: "", cp: "", ville: "", num_piece_identite: "",
  });
  const [panier, setPanier] = useState<Examen[]>([itemVide("examen")]);
  const [paiement, setPaiement] = useState({ mode_paiement: "CB", statut_paiement: "Payé" });
  const [vendeur, setVendeur] = useState({ vendu_par: "", agence: "Gagny", commentaire: "" });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [forcer, setForcer] = useState(false);
  const [motifForcage, setMotifForcage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<any>(null);

  useEffect(() => {
    try { setVendeur((v) => ({ ...v, vendu_par: localStorage.getItem("mystory_auteur") ?? "" })); } catch {}
    fetch("/api/examens/sessions", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSessions(j.sessions); })
      .catch(() => {});
  }, []);

  const sessionsDe = (type: string) => sessions.filter((s) => s.type === type);
  const aPack = useMemo(() =>
    panier.some((e) => e.type === "TEF_IRN") && panier.some((e) => e.type === "Examen_civique"), [panier]);

  function majExamen(uid: number, patch: Partial<Examen>) {
    setPanier((p) => p.map((e) => {
      if (e.uid !== uid) return e;
      const next = { ...e, ...patch };
      // changement de type → réinitialise session/mention + tarif par défaut
      if (patch.type !== undefined && patch.type !== e.type) {
        next.sessionId = ""; next.sousType = ""; next.montant = TARIF_DEFAUT[patch.type] ?? "";
        next.tefExterne = false; next.tefExterneDate = "";
      }
      return next;
    }));
  }
  const ajouterExamen = () => setPanier((p) => [...p, itemVide("examen")]);
  const ajouterPlateforme = () => setPanier((p) => [...p, itemVide("plateforme")]);
  const retirer = (uid: number) => setPanier((p) => p.filter((e) => e.uid !== uid));
  const examens = panier.filter((e) => e.categorie === "examen");
  const plateformes = panier.filter((e) => e.categorie === "plateforme");

  const carenceVisible = erreurs.some((e) => /carence|mention civique/i.test(e));

  async function valider() {
    const manque: string[] = [];
    if (panier.length === 0) manque.push("Ajoute au moins un examen ou une vente de plateforme.");
    if (!candidat.nom.trim()) manque.push("Nom du candidat obligatoire.");
    if (!candidat.prenom.trim()) manque.push("Prénom du candidat obligatoire.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidat.email.trim())) manque.push("Email valide obligatoire (envoi des documents).");
    if (!vendeur.vendu_par.trim()) manque.push("« Vendu par » obligatoire.");
    let nEx = 0;
    panier.forEach((e) => {
      const lbl = e.categorie === "plateforme" ? "Vente plateforme" : `Examen ${++nEx}`;
      if (e.categorie === "examen" && !e.type) manque.push(`${lbl} : choisis le type.`);
      if (e.categorie === "examen" && e.type && !e.sessionId) manque.push(`${lbl} : choisis la session.`);
      if (e.type === "Examen_civique" && !e.sousType) manque.push(`${lbl} : la mention est obligatoire.`);
      if (e.categorie === "plateforme" && !e.sousType) manque.push(`${lbl} : choisis l'application.`);
      if (e.montant === "" || Number(e.montant) < 0) manque.push(`${lbl} : montant invalide.`);
      if (e.type === "TEF_IRN" && e.tefExterne && !e.tefExterneDate) manque.push(`${lbl} : date du TEF déjà passé requise.`);
    });
    if (manque.length) { setErreurs(manque); return; }

    setEnvoi(true); setErreurs([]);
    try {
      const r = await fetch("/api/examens/ventes-groupe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidat: { ...candidat, agence: vendeur.agence },
          examens: panier.map((e) => ({
            type_examen: e.type,
            session_id: e.type === "Vente_plateforme" ? null : e.sessionId,
            sous_type: e.sousType || null,
            montant: Number(e.montant),
            mode_paiement: paiement.mode_paiement,
            dont_cb: paiement.mode_paiement === "Mixte" ? Number(e.dontCb || 0) : null,
            statut_paiement: paiement.statut_paiement,
            reste_a_payer: paiement.statut_paiement === "Acompte" ? Number(e.reste || 0) : 0,
            commentaire: vendeur.commentaire,
            tef_passage_externe: e.type === "TEF_IRN" ? e.tefExterne : false,
            tef_passage_externe_date: e.type === "TEF_IRN" && e.tefExterne ? e.tefExterneDate : null,
          })),
          vendu_par: vendeur.vendu_par.trim(),
          agence: vendeur.agence,
          carence_forcer: forcer,
          carence_motif: forcer ? motifForcage.trim() : "",
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErreurs(j.recap ?? [j.erreur || "Échec de l'inscription."]); return; }
      try { if (vendeur.vendu_par.trim()) localStorage.setItem("mystory_auteur", vendeur.vendu_par.trim()); } catch {}
      setResultat(j);
    } catch (e: any) {
      setErreurs([e?.message ?? "Échec de l'inscription."]);
    } finally { setEnvoi(false); }
  }

  function carte(e: Examen, numero: number) {
    const plat = e.categorie === "plateforme";
    const champsValeur = plat || !!e.type;
    return (
      <section key={e.uid} className="card">
        <div className="mb-3 flex items-center justify-between">
          <span className={`badge ${plat ? "badge-info" : "badge-neutral"}`}>
            {plat ? "Accès plateforme" : `Examen ${numero}`}
          </span>
          <button onClick={() => retirer(e.uid)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-danger-50 hover:text-danger-600" aria-label="Retirer">
            <Trash2 size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!plat && (
            <label className="col-span-2 text-sm">Type *
              <select value={e.type} onChange={(ev) => majExamen(e.uid, { type: ev.target.value })} className="input mt-1">
                <option value="">—</option>
                <option value="TEF_IRN">TEF IRN</option>
                <option value="Examen_civique">Examen civique</option>
              </select>
            </label>
          )}

          {!plat && e.type && (
            <label className="col-span-2 text-sm">Session * <span className="text-gray-400">(places en direct)</span>
              <select value={e.sessionId} onChange={(ev) => majExamen(e.uid, { sessionId: ev.target.value })} className="input mt-1">
                <option value="">—</option>
                {sessionsDe(e.type).map((s) => (
                  <option key={s.id} value={s.id} disabled={s.restantes <= 0}>
                    {dateFR(s.date_examen)} · {s.horaire} · {s.restantes <= 0 ? "COMPLET" : `${s.restantes} place(s)`}
                  </option>
                ))}
              </select>
            </label>
          )}

          {champsValeur && (
            <label className="col-span-2 text-sm">
              {plat ? "Application *" : e.type === "Examen_civique" ? "Mention * (conditionne l'épreuve)" : "Motivation (facultatif)"}
              <select value={e.sousType} onChange={(ev) => majExamen(e.uid, { sousType: ev.target.value })} className="input mt-1">
                <option value="">—</option>
                {(plat ? PLATEFORMES : e.type === "Examen_civique" ? SOUS_TYPES_CIVIQUE : MOTIVATIONS_TEF).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          )}

          {!plat && e.type === "TEF_IRN" && (
            <div className="col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={e.tefExterne} onChange={(ev) => majExamen(e.uid, { tefExterne: ev.target.checked })} className="mt-0.5" />
                <span>Déjà passé un <strong>TEF IRN dans un autre centre</strong> récemment (carence 20 jours).</span>
              </label>
              {e.tefExterne && (
                <label className="mt-2 block text-sm">Date de ce passage *
                  <input type="date" value={e.tefExterneDate} onChange={(ev) => majExamen(e.uid, { tefExterneDate: ev.target.value })} className="input mt-1" />
                </label>
              )}
            </div>
          )}

          {champsValeur && (
            <label className="text-sm">Montant (€) *
              <input type="number" min={0} step="0.01" value={e.montant} onChange={(ev) => majExamen(e.uid, { montant: ev.target.value })} className="input mt-1" />
            </label>
          )}
          {champsValeur && paiement.mode_paiement === "Mixte" && (
            <label className="text-sm">Dont CB (€)
              <input type="number" min={0} step="0.01" value={e.dontCb} onChange={(ev) => majExamen(e.uid, { dontCb: ev.target.value })} className="input mt-1" />
            </label>
          )}
          {champsValeur && paiement.statut_paiement === "Acompte" && (
            <label className="text-sm">Reste à payer (€) *
              <input type="number" min={0} step="0.01" value={e.reste} onChange={(ev) => majExamen(e.uid, { reste: ev.target.value })} className="input mt-1" />
            </label>
          )}
        </div>
      </section>
    );
  }

  // ----- Écran de résultat -----
  if (resultat) {
    const ins: any[] = resultat.inscriptions ?? [];
    const ok = ins.filter((i) => i.ok);
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 md:px-6">
        <div className="card text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 text-success-600">
            <CheckCircle2 size={28} strokeWidth={1.75} />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{ok.length} inscription{ok.length > 1 ? "s" : ""} enregistrée{ok.length > 1 ? "s" : ""}</h1>
          <p className="mt-1 text-sm text-gray-500">{candidat.prenom} {candidat.nom} · {candidat.email}</p>
        </div>

        <div className="mt-4 space-y-2">
          {ins.map((i, idx) => (
            <div key={idx} className={`card !p-4 ${i.ok ? "" : "border-danger-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-info">{TYPE_LABEL[i.type] ?? i.type}</span>
                {i.sousType && <span className="text-sm text-gray-600">{i.sousType}</span>}
                <span className="flex-1" />
                {i.ok ? <span className="font-semibold text-gray-900">{i.numeroAttestation}</span>
                      : <span className="badge badge-danger">Échec</span>}
              </div>
              {i.ok ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1"><Mail size={13} /> {i.email?.envoye ? `envoyé à ${i.email.a}` : `email non envoyé`}</span>
                  {i.factureDifferee && <span className="inline-flex items-center gap-1 text-warning-600"><Receipt size={13} /> facture différée (espèces)</span>}
                  {i.facture?.numero && <span className="inline-flex items-center gap-1"><Receipt size={13} /> {i.facture.groupee ? "facture groupée" : "facture"} {i.facture.numero}</span>}
                  {i.groupee && <span className="inline-flex items-center gap-1 text-mystory"><Layers size={13} /> convocation groupée</span>}
                </div>
              ) : <p className="mt-1 text-xs text-danger-600">{i.erreur}</p>}
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => window.location.reload()} className="btn-primary"><Plus size={16} /> Nouvelle inscription</button>
          <Link href="/examens/candidats" className="btn-ghost">Voir les candidats</Link>
          <Link href="/examen" className="btn-ghost">Espace Examen</Link>
        </div>
      </main>
    );
  }

  // ----- Formulaire -----
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Inscrire un candidat</h1>
          <p className="page-subtitle">Un ou plusieurs examens (TEF, civique, plateforme) en une seule action — ajoute un examen au panier seulement si besoin. Documents et emails générés à la validation.</p>
        </div>
      </header>

      {erreurs.length > 0 && (
        <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {erreurs.map((e, i) => <p key={i}>• {e}</p>)}
        </div>
      )}

      {/* Forçage carence (Direction) */}
      {carenceVisible && (
        <div className="mb-4 space-y-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={forcer} onChange={(e) => setForcer(e.target.checked)} className="mt-0.5" />
            <span className="inline-flex items-center gap-1"><AlertTriangle size={14} /> <strong>Forcer malgré la carence</strong> — réservé à la Direction, journalisé.</span>
          </label>
          {forcer && (
            <input value={motifForcage} onChange={(e) => setMotifForcage(e.target.value)} placeholder="Motif obligatoire (dérogation, cas particulier…)" className="input" />
          )}
          {forcer && (
            <button onClick={valider} disabled={envoi || !motifForcage.trim()} className="btn-danger !bg-warning-600 hover:!bg-warning-700">
              {envoi ? "Envoi…" : "Forcer et valider"}
            </button>
          )}
        </div>
      )}

      {/* 1. Candidat */}
      <section className="card mb-4">
        <p className="mb-3 font-medium text-gray-800">Candidat</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Civilité
            <select value={candidat.civilite} onChange={(e) => setCandidat({ ...candidat, civilite: e.target.value })} className="input mt-1">
              <option value="">—</option><option>Madame</option><option>Monsieur</option><option>Autre</option>
            </select>
          </label>
          <label className="text-sm">Date de naissance
            <input type="date" value={candidat.date_naissance} onChange={(e) => setCandidat({ ...candidat, date_naissance: e.target.value })} className="input mt-1" />
          </label>
          <label className="text-sm">Nom *
            <input value={candidat.nom} onChange={(e) => setCandidat({ ...candidat, nom: e.target.value })} className="input mt-1" />
          </label>
          <label className="text-sm">Prénom *
            <input value={candidat.prenom} onChange={(e) => setCandidat({ ...candidat, prenom: e.target.value })} className="input mt-1" />
          </label>
          <label className="text-sm">Email * <span className="text-gray-400">(documents)</span>
            <input type="email" value={candidat.email} onChange={(e) => setCandidat({ ...candidat, email: e.target.value })} className="input mt-1" />
          </label>
          <label className="text-sm">Téléphone
            <input value={candidat.telephone} onChange={(e) => setCandidat({ ...candidat, telephone: e.target.value })} className="input mt-1" />
          </label>
          <label className="col-span-2 text-sm">N° étranger / pièce d'identité
            <input value={candidat.num_piece_identite} onChange={(e) => setCandidat({ ...candidat, num_piece_identite: e.target.value })} className="input mt-1" />
          </label>
          <label className="col-span-2 text-sm">Adresse
            <input value={candidat.adresse} onChange={(e) => setCandidat({ ...candidat, adresse: e.target.value })} className="input mt-1" />
          </label>
          <label className="text-sm">Code postal
            <input value={candidat.cp} onChange={(e) => setCandidat({ ...candidat, cp: e.target.value })} className="input mt-1" />
          </label>
          <label className="text-sm">Ville
            <input value={candidat.ville} onChange={(e) => setCandidat({ ...candidat, ville: e.target.value })} className="input mt-1" />
          </label>
        </div>
      </section>

      {/* 2a. Examens (TEF IRN / civique) */}
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-gray-800">Examens ({examens.length})</p>
        <button onClick={ajouterExamen} className="btn-ghost !py-1.5"><Plus size={16} /> Ajouter un examen</button>
      </div>

      {aPack && (
        <div className="mb-3 rounded-xl border border-mystory/20 bg-mystory-clair/50 px-4 py-2.5 text-sm text-mystory-fonce">
          Pack <strong>TEF IRN + civique = 265 €</strong> — répartis le montant entre les deux examens. Ils seront regroupés sur <strong>une seule facture</strong> dont le total doit faire 265 €.
        </div>
      )}

      <div className="space-y-3">
        {examens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">Aucun examen. Ajoute-en un, ou passe directement à la vente de plateforme ci-dessous.</p>
        ) : examens.map((e, idx) => carte(e, idx + 1))}
      </div>

      {/* 2b. Vente de plateforme (hors examen) */}
      <div className="mb-2 mt-6 flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-800">Vente de plateforme ({plateformes.length})</p>
          <p className="text-xs text-gray-400">Accès à une application, hors examen — sans session ni convocation.</p>
        </div>
        <button onClick={ajouterPlateforme} className="btn-ghost !py-1.5"><Plus size={16} /> Ajouter une plateforme</button>
      </div>

      <div className="space-y-3">
        {plateformes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">Aucune vente de plateforme.</p>
        ) : plateformes.map((e) => carte(e, 0))}
      </div>

      {/* 3. Paiement & vendeur (commun) */}
      <section className="card mt-4">
        <p className="mb-3 font-medium text-gray-800">Paiement & vendeur</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Mode de paiement
            <select value={paiement.mode_paiement} onChange={(ev) => setPaiement({ ...paiement, mode_paiement: ev.target.value })} className="input mt-1">
              <option>CB</option><option>Espèces</option><option>Mixte</option>
            </select>
          </label>
          <label className="text-sm">Statut du paiement
            <select value={paiement.statut_paiement} onChange={(ev) => setPaiement({ ...paiement, statut_paiement: ev.target.value })} className="input mt-1">
              <option>Payé</option><option>Inclus CPF</option><option>Acompte</option>
            </select>
          </label>
          <label className="text-sm">Vendu par *
            <input value={vendeur.vendu_par} onChange={(ev) => setVendeur({ ...vendeur, vendu_par: ev.target.value })} placeholder="Ton prénom" className="input mt-1" />
          </label>
          <label className="text-sm">Agence de vente *
            <select value={vendeur.agence} onChange={(ev) => setVendeur({ ...vendeur, agence: ev.target.value })} className="input mt-1">
              <option>Gagny</option><option>Sarcelles</option><option>Rosny</option>
            </select>
          </label>
          <label className="col-span-2 text-sm">Commentaire
            <input value={vendeur.commentaire} onChange={(ev) => setVendeur({ ...vendeur, commentaire: ev.target.value })} className="input mt-1" />
          </label>
        </div>
      </section>

      <div className="mt-5 flex items-center gap-2">
        <button onClick={valider} disabled={envoi} className="btn-primary">
          {envoi ? "Inscription en cours…" : <><CheckCircle2 size={16} /> Valider l'inscription</>}
        </button>
        <span className="text-xs text-gray-400"><FileText size={12} className="mr-1 inline" />Attestation + convocation par examen, envoyées par email.</span>
      </div>
    </main>
  );
}
