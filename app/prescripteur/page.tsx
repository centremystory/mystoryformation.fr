"use client";
// app/prescripteur/[token]/page.tsx — Portail des partenaires prescripteurs.
//
// L'organisme partenaire inscrit SES candidats dans NOS sessions d'examen. Il ne
// voit que les creneaux qu'on lui a ouverts, et que ses propres candidats.
//
// A ne pas confondre avec /partenaire/[token], qui sert aux formateurs
// sous-traitants (depot d'emargements et de factures).
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CalendrierPartenaire from "@/components/CalendrierPartenaire";

const BLEU = "#2F72DE";

type Session = {
  id: string; type: string; date_examen: string; jour: string; horaire: string;
  centre: string | null; mes_inscrits: number; places_restantes: number;
};
type Demande = {
  id: string; nom: string; prenom: string; email: string | null; telephone: string | null;
  naissance: string | null; statut: string; motif_refus: string | null; demande_le: string;
  session: { type: string; date: string; horaire: string; centre: string | null } | null;
};
type Data = {
  partenaire: {
    raison_sociale: string; contact_nom: string | null; centre: string | null;
    plafond_places: number | null; tarif_tef_irn: number | null; tarif_civique: number | null;
    jours_autorises: string[];
  };
  delai_ouvres: number;
  sessions: Session[];
  demandes: Demande[];
};

const LIB_TYPE: Record<string, string> = {
  TEF_IRN: "TEF IRN", Examen_civique: "Examen civique",
};
const STATUT: Record<string, { l: string; c: string }> = {
  en_attente: { l: "En attente de validation", c: "bg-amber-50 text-amber-800 border-amber-200" },
  confirmee: { l: "Confirmée", c: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  refusee: { l: "Refusée", c: "bg-red-50 text-red-800 border-red-200" },
  annulee: { l: "Annulée", c: "bg-gray-100 text-gray-500 border-gray-200" },
};

const dateFr = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
};
const euros = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 0 }) + " €";

export default function PortailPrescripteur() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [charge, setCharge] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);
  const [piece, setPiece] = useState<File | null>(null);

  const [sessionId, setSessionId] = useState("");
  // 10/09/2026 — le formulaire reprend les champs de l'onglet « Examens » du suivi
  // de ventes : c'est ce que la CCI demande a l'inscription. Sans eux, il fallait
  // rappeler le candidat, donc refaire le travail que le partenaire avait deja fait.
  const [f, setF] = useState({
    civilite: "", nom: "", prenom: "", genre: "",
    naissance: "", lieu_naissance: "", nationalite: "", langue_maternelle: "",
    email: "", telephone: "",
    adresse: "", code_postal: "", ville: "", pays: "France",
    num_piece: "", sous_type: "",
  });
  const VIDE_F = {
    civilite: "", nom: "", prenom: "", genre: "",
    naissance: "", lieu_naissance: "", nationalite: "", langue_maternelle: "",
    email: "", telephone: "",
    adresse: "", code_postal: "", ville: "", pays: "France",
    num_piece: "", sous_type: "",
  };
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [retrait, setRetrait] = useState<Record<string, "confirme" | "...">>({});
  // 10/09/2026 — trois vues : inscrire, le calendrier de ses sessions, ses documents.
  const [vue, setVue] = useState<"inscrire" | "calendrier" | "documents">("inscrire");
  const [recherche, setRecherche] = useState("");
  const [docs, setDocs] = useState<any[] | null>(null);
  const [justif, setJustif] = useState<{ demande: string; fichier: File | null; note: string }>(
    { demande: "", fichier: null, note: "" });

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/prescripteur/portail", { cache: "no-store" });
      if (r.status === 401) { router.push("/prescripteur/connexion"); return; }
      if (r.status === 404) { setIntrouvable(true); return; }
      const j = await r.json();
      if (j?.ok) setData(j);
    } finally { setCharge(false); }
  }, [router]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (vue !== "documents" || docs !== null) return;
    fetch("/api/prescripteur/documents", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDocs(j?.ok ? j.documents : []))
      .catch(() => setDocs([]));
  }, [vue, docs]);

  async function deposerJustificatif() {
    if (!justif.fichier) { setMsg({ t: "err", m: "Choisissez un fichier." }); return; }
    setEnvoi(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("type", "justificatif_absence");
      fd.append("demande_id", justif.demande);
      fd.append("commentaire", justif.note);
      fd.append("fichier", justif.fichier);
      const r = await fetch("/api/prescripteur/documents", { method: "POST", body: fd });
      const j = await r.json();
      if (!j?.ok) { setMsg({ t: "err", m: j?.erreur ?? "Dépôt impossible." }); return; }
      setMsg({ t: "ok", m: "Justificatif transmis au centre." });
      setJustif({ demande: "", fichier: null, note: "" });
      setDocs(null);   // on rechargera la liste
    } finally { setEnvoi(false); }
  }

  async function inscrire() {
    const requis: Record<string, string> = {
      nom: "le nom", prenom: "le prénom", naissance: "la date de naissance",
      lieu_naissance: "le lieu de naissance", nationalite: "la nationalité",
      num_piece: "le numéro de pièce d'identité", sous_type: "la mention visée",
      email: "le courriel", telephone: "le téléphone",
    };
    const manque = Object.entries(requis)
      .filter(([k]) => !String((f as any)[k] ?? "").trim()).map(([, l]) => l);
    if (!sessionId) manque.unshift("la session");
    if (manque.length) {
      setMsg({ t: "err", m: `Il manque ${manque.join(", ")} — la CCI les exige à l'inscription.` });
      return;
    }
    if (!piece) {
      setMsg({ t: "err", m: "Joignez la pièce d'identité du candidat : c'est elle qui permet le contrôle le jour de l'épreuve." });
      return;
    }
    setEnvoi(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("session_id", sessionId);
      Object.entries(f).forEach(([k, v]) => fd.append(k, String(v ?? "")));
      fd.append("piece", piece);
      const r = await fetch("/api/prescripteur/portail", { method: "POST", body: fd });
      const j = await r.json();
      if (!j?.ok) { setMsg({ t: "err", m: j?.erreur ?? "Enregistrement impossible." }); return; }
      setMsg({ t: "ok", m: `${f.prenom} ${f.nom.toUpperCase()} est inscrit·e, en attente de validation.` });
      setF({ ...VIDE_F });
      setPiece(null);
      await charger();
    } catch {
      setMsg({ t: "err", m: "Connexion interrompue : réessayez." });
    } finally { setEnvoi(false); }
  }

  async function retirer(id: string) {
    if (retrait[id] !== "confirme") { setRetrait((r) => ({ ...r, [id]: "confirme" })); return; }
    setRetrait((r) => ({ ...r, [id]: "..." }));
    try {
      const r = await fetch("/api/prescripteur/portail", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!j?.ok) setMsg({ t: "err", m: j?.erreur ?? "Retrait impossible." });
      await charger();
    } finally {
      setRetrait((r) => { const n = { ...r }; delete n[id]; return n; });
    }
  }

  if (charge) return <div className="p-8 text-sm text-gray-400">Chargement…</div>;
  if (introuvable)
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg font-semibold text-gray-900">Lien invalide ou expiré</p>
        <p className="mt-2 text-sm text-gray-600">
          Contactez MYSTORY Formation pour obtenir un nouvel accès.
        </p>
      </div>
    );
  if (!data) return <div className="p-8 text-sm text-gray-400">Indisponible.</div>;

  const enAttente = data.demandes.filter((d) => d.statut === "en_attente").length;
  const confirmes = data.demandes.filter((d) => d.statut === "confirmee").length;
  // Les places qui restent AU PARTENAIRE, toutes sessions ouvertes confondues.
  const placesRestantes = data.sessions.reduce((n, s) => n + s.places_restantes, 0);
  const prochaine = data.sessions.find((s) => s.places_restantes > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BLEU }}>
          Espace partenaire · MYSTORY Formation
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{data.partenaire.raison_sociale}</h1>
        <p className="mt-1 text-sm text-gray-600">
          Inscrivez vos candidats aux sessions d&apos;examen
          {data.partenaire.centre ? ` du centre de ${data.partenaire.centre}` : ""}.
          {data.partenaire.jours_autorises.length > 0 && (
            <> Créneaux qui vous sont ouverts : <b>{data.partenaire.jours_autorises.join(" et ")}</b>.</>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-700">
          <span>Passation TEF IRN <b>{euros(data.partenaire.tarif_tef_irn)}</b></span>
          <span>Examen civique <b>{euros(data.partenaire.tarif_civique)}</b></span>
          {data.partenaire.plafond_places != null && (
            <span className="text-gray-500">
              Jusqu&apos;à {data.partenaire.plafond_places} candidats par session
            </span>
          )}
        </div>
      </header>

      {/* ── Ce qu'il faut voir en arrivant : ou j'en suis, et ce qu'il me reste.
          Un partenaire qui doit compter lui-meme finit par appeler. ────────── */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { n: data.demandes.length, l: "candidats inscrits", c: "text-gray-900" },
          { n: enAttente, l: "en attente de validation", c: enAttente ? "text-amber-700" : "text-gray-400" },
          { n: confirmes, l: "places confirmées", c: confirmes ? "text-emerald-700" : "text-gray-400" },
          { n: placesRestantes, l: "places encore disponibles", c: placesRestantes ? "text-mystory" : "text-red-700" },
        ].map((x, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className={`text-2xl font-extrabold ${x.c}`}>{x.n}</div>
            <div className="mt-0.5 text-xs text-gray-600">{x.l}</div>
          </div>
        ))}
      </div>

      {prochaine && (
        <p className="mb-6 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Prochaine session ouverte : <b>{prochaine.jour} {dateFr(prochaine.date_examen)}</b> à{" "}
          {prochaine.horaire} — {prochaine.places_restantes} place
          {prochaine.places_restantes > 1 ? "s" : ""} pour vous.
        </p>
      )}

      {/* ── Trois vues ───────────────────────────────────────────────────── */}
      <div className="mb-4 flex gap-2">
        {([["inscrire", "Inscrire un candidat"],
           ["calendrier", "Mon calendrier"],
           ["documents", "Documents"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setVue(v)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    vue === v ? "text-white" : "bg-gray-100 text-gray-600"}`}
                  style={vue === v ? { background: BLEU } : undefined}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Inscrire un candidat ─────────────────────────────────────────── */}
      <section className={`mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${vue === "inscrire" ? "" : "hidden"}`}>
        <h2 className="mb-1 text-base font-bold text-gray-900">Inscrire un candidat</h2>
        <p className="mb-4 text-xs text-gray-500">
          Les inscriptions ferment {data.delai_ouvres} jours ouvrés avant la session, en même
          temps que l&apos;envoi des convocations. Chaque demande
          est validée par le centre, qui vérifie l&apos;identité du candidat le jour de
          l&apos;épreuve.
        </p>

        {data.sessions.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Aucune session ouverte pour le moment. Contactez le centre.
          </p>
        ) : (
          <>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Session</span>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Choisissez une session…</option>
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.places_restantes <= 0}>
                    {s.jour} {dateFr(s.date_examen)} · {s.horaire} · {LIB_TYPE[s.type] ?? s.type}
                    {s.places_restantes > 0
                      ? ` — ${s.places_restantes} place${s.places_restantes > 1 ? "s" : ""}`
                      : " — complet"}
                    {s.mes_inscrits > 0 ? ` (${s.mes_inscrits} des vôtres)` : ""}
                  </option>
                ))}
              </select>
            </label>

            {/* ── Identité — reprend les champs de l'onglet « Examens » du suivi de
                ventes, pour que l'inscription CCI se fasse sans ressaisie. ──── */}
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Identité du candidat
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600">Civilité</span>
                <select value={f.civilite} onChange={(e) => setF({ ...f, civilite: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">—</option>
                  <option value="Madame">Madame</option>
                  <option value="Monsieur">Monsieur</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Nom *</span>
                <input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600">Genre</span>
                <select value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">—</option>
                  <option value="F">Féminin</option>
                  <option value="M">Masculin</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Prénom *</span>
                <input value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600">Date de naissance *</span>
                <input value={f.naissance} onChange={(e) => setF({ ...f, naissance: e.target.value })}
                       type="date"
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600">Lieu de naissance *</span>
                <input value={f.lieu_naissance} onChange={(e) => setF({ ...f, lieu_naissance: e.target.value })}
                       placeholder="Ville, pays"
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Nationalité *</span>
                <input value={f.nationalite} onChange={(e) => setF({ ...f, nationalite: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Langue maternelle</span>
                <input value={f.langue_maternelle} onChange={(e) => setF({ ...f, langue_maternelle: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">
                  N° de pièce d&apos;identité *
                </span>
                <input value={f.num_piece} onChange={(e) => setF({ ...f, num_piece: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Mention visée *</span>
                <select value={f.sous_type} onChange={(e) => setF({ ...f, sous_type: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Choisissez…</option>
                  <option value="Carte de séjour pluriannuelle">Carte de séjour pluriannuelle</option>
                  <option value="Carte de résident">Carte de résident (10 ans)</option>
                  <option value="Naturalisation">Naturalisation française</option>
                </select>
              </label>
            </div>

            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Coordonnées
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Courriel *</span>
                <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email"
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Téléphone *</span>
                <input value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-4">
                <span className="mb-1 block text-xs text-gray-600">Adresse</span>
                <input value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600">Code postal</span>
                <input value={f.code_postal} onChange={(e) => setF({ ...f, code_postal: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-gray-600">Ville</span>
                <input value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-600">Pays</span>
                <input value={f.pays} onChange={(e) => setF({ ...f, pays: e.target.value })}
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <label className="mt-3 block rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-3">
              <span className="mb-1 block text-xs font-semibold text-gray-700">
                Pièce d&apos;identité du candidat *
              </span>
              <span className="mb-2 block text-xs text-gray-500">
                Photo ou PDF, 8 Mo maximum. Elle sert au contrôle d&apos;identité le jour
                de l&apos;épreuve, que le centre effectue lui-même, et n&apos;est utilisée
                à aucune autre fin.
              </span>
              <input type="file" accept="image/*,application/pdf"
                     onChange={(e) => setPiece(e.target.files?.[0] ?? null)}
                     className="block w-full text-xs" />
              {piece && (
                <span className="mt-1 block text-xs text-emerald-700">
                  ✓ {piece.name} ({Math.round(piece.size / 1024)} Ko)
                </span>
              )}
            </label>

            {msg && (
              <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                msg.t === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                {msg.m}
              </p>
            )}

            <button onClick={inscrire} disabled={envoi}
                    className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow disabled:opacity-50"
                    style={{ background: BLEU }}>
              {envoi ? "Enregistrement…" : "Inscrire ce candidat"}
            </button>
          </>
        )}
      </section>

      {/* ── Mon calendrier ───────────────────────────────────────────────────
          10/09/2026 — l'onglet existait dans l'etat `vue` mais n'affichait rien :
          le partenaire cliquait « Mon calendrier » et retombait sur la liste.
          Les donnees necessaires etaient deja renvoyees par mesDemandes() — la vue
          ne coute aucun appel reseau supplementaire. ─────────────────────────── */}
      {vue === "calendrier" && (
        <div className="mb-8">
          <CalendrierPartenaire demandes={data.demandes as any} />
        </div>
      )}

      {/* ── Documents ────────────────────────────────────────────────────────
          10/09/2026 — l'onglet existait, les deux routes d'API aussi, mais aucune
          interface ne les appelait. Deux sens de circulation, volontairement
          separes a l'ecran : ce que le centre REMET (resultats, attestations) et
          ce que le partenaire TRANSMET (justificatifs de report ou d'absence).
          Un partenaire qui ne sait pas ou deposer son justificatif telephone. ── */}
      {vue === "documents" && (
        <div className="mb-8 space-y-6">
          {/* Deposer un justificatif */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-base font-bold text-gray-900">
              Transmettre un justificatif
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              Absence ou demande de report. Le report s&apos;exerce dans un délai de
              quatorze jours minimum avant la date prévue, et sous réserve que la CCI
              accepte le justificatif.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  Candidat concerné
                </span>
                <select
                  value={justif.demande}
                  onChange={(e) => setJustif((j) => ({ ...j, demande: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">— Sans rattachement —</option>
                  {data.demandes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.prenom} {d.nom}
                      {d.session ? ` — ${dateFr(d.session.date)}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  Fichier <span className="text-gray-400">(photo ou PDF, 8 Mo max.)</span>
                </span>
                <input type="file" accept="image/*,application/pdf"
                       onChange={(e) => setJustif((j) => ({ ...j, fichier: e.target.files?.[0] ?? null }))}
                       className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  Précision <span className="text-gray-400">(facultatif)</span>
                </span>
                <input value={justif.note}
                       onChange={(e) => setJustif((j) => ({ ...j, note: e.target.value }))}
                       placeholder="Motif, date souhaitée pour le report…"
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <button onClick={deposerJustificatif} disabled={envoi || !justif.fichier}
                    className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: BLEU }}>
              {envoi ? "Envoi…" : "Transmettre au centre"}
            </button>
          </section>

          {/* Ce que le centre a remis + ce que le partenaire a transmis */}
          {docs === null ? (
            <p className="text-sm text-gray-400">Chargement des documents…</p>
          ) : (
            (["centre", "partenaire"] as const).map((sens) => {
              const liste = docs.filter((d: any) =>
                sens === "centre" ? d.par_le_centre : !d.par_le_centre);
              return (
                <section key={sens}>
                  <h2 className="mb-1 text-base font-bold text-gray-900">
                    {sens === "centre" ? "Résultats et documents remis par le centre"
                                       : "Justificatifs que vous avez transmis"}
                  </h2>
                  {liste.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">
                      {sens === "centre"
                        ? "Aucun document pour l'instant. Les résultats de vos candidats apparaîtront ici."
                        : "Vous n'avez transmis aucun justificatif."}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {liste.map((d: any) => (
                        <div key={d.id}
                             className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900">{d.nom}</div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {d.candidat ? <>{d.candidat} · </> : null}
                              {dateFr(d.depose_le)}
                              {d.commentaire ? <> · {d.commentaire}</> : null}
                            </div>
                          </div>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noopener noreferrer"
                               className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                               style={{ borderColor: BLEU, color: BLEU }}>
                              Télécharger
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      )}

      {/* ── Les candidats deja deposes ───────────────────────────────────── */}
      <section className={vue === "inscrire" ? "" : "hidden"}>
        <h2 className="mb-1 text-base font-bold text-gray-900">
          Vos candidats
          {enAttente > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {enAttente} en attente
            </span>
          )}
        </h2>
        {data.demandes.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Aucun candidat inscrit pour l&apos;instant.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.demandes.map((d) => {
              const st = STATUT[d.statut] ?? { l: d.statut, c: "bg-gray-100 text-gray-600 border-gray-200" };
              return (
                <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-gray-900">
                        {d.prenom} {d.nom}
                      </span>
                      {d.session && (
                        <span className="ml-2 text-xs text-gray-500">
                          {LIB_TYPE[d.session.type] ?? d.session.type} ·{" "}
                          {dateFr(d.session.date)} · {d.session.horaire}
                        </span>
                      )}
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${st.c}`}>
                      {st.l}
                    </span>
                  </div>
                  {(d as any).sous_type && (
                    <p className="mt-1 text-xs text-gray-600">
                      Mention : {(d as any).sous_type}
                    </p>
                  )}
                  {(d as any).piece && (
                    <p className="mt-1 text-xs text-gray-500">
                      Pièce d&apos;identité jointe : {(d as any).piece}
                    </p>
                  )}
                  {d.motif_refus && (
                    <p className="mt-1 text-xs text-red-700">Motif : {d.motif_refus}</p>
                  )}
                  {d.statut === "en_attente" && (
                    <button onClick={() => retirer(d.id)} disabled={retrait[d.id] === "..."}
                            className="mt-2 text-xs font-semibold text-red-700 underline underline-offset-2">
                      {retrait[d.id] === "..." ? "…"
                        : retrait[d.id] === "confirme" ? "Confirmer le retrait"
                        : "Retirer ce candidat"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-8 text-center">
        <button
          onClick={async () => {
            await fetch("/api/prescripteur/auth", { method: "DELETE" });
            router.push("/prescripteur/connexion");
          }}
          className="text-xs text-gray-500 underline underline-offset-2">
          Se déconnecter
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        MYSTORY Formation · centre d&apos;examen agréé TEF IRN · contact@mystoryformation.fr
      </p>
    </div>
  );
}
