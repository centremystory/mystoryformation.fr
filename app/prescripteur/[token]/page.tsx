"use client";
// app/prescripteur/[token]/page.tsx — Portail des partenaires prescripteurs.
//
// L'organisme partenaire inscrit SES candidats dans NOS sessions d'examen. Il ne
// voit que les creneaux qu'on lui a ouverts, et que ses propres candidats.
//
// A ne pas confondre avec /partenaire/[token], qui sert aux formateurs
// sous-traitants (depot d'emargements et de factures).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
  delai_jours: number;
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
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [charge, setCharge] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [f, setF] = useState({ nom: "", prenom: "", email: "", telephone: "", naissance: "" });
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [retrait, setRetrait] = useState<Record<string, "confirme" | "...">>({});

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/prescripteur/${token}`, { cache: "no-store" });
      if (r.status === 404) { setIntrouvable(true); return; }
      const j = await r.json();
      if (j?.ok) setData(j);
    } finally { setCharge(false); }
  }, [token]);

  useEffect(() => { charger(); }, [charger]);

  async function inscrire() {
    if (!sessionId || !f.nom.trim() || !f.prenom.trim()) {
      setMsg({ t: "err", m: "Choisissez une session et renseignez au moins le nom et le prénom." });
      return;
    }
    setEnvoi(true); setMsg(null);
    try {
      const r = await fetch(`/api/prescripteur/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, ...f }),
      });
      const j = await r.json();
      if (!j?.ok) { setMsg({ t: "err", m: j?.erreur ?? "Enregistrement impossible." }); return; }
      setMsg({ t: "ok", m: `${f.prenom} ${f.nom.toUpperCase()} est inscrit·e, en attente de validation.` });
      setF({ nom: "", prenom: "", email: "", telephone: "", naissance: "" });
      await charger();
    } catch {
      setMsg({ t: "err", m: "Connexion interrompue : réessayez." });
    } finally { setEnvoi(false); }
  }

  async function retirer(id: string) {
    if (retrait[id] !== "confirme") { setRetrait((r) => ({ ...r, [id]: "confirme" })); return; }
    setRetrait((r) => ({ ...r, [id]: "..." }));
    try {
      const r = await fetch(`/api/prescripteur/${token}`, {
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

      {/* ── Inscrire un candidat ─────────────────────────────────────────── */}
      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-bold text-gray-900">Inscrire un candidat</h2>
        <p className="mb-4 text-xs text-gray-500">
          Les inscriptions ferment {data.delai_jours} jours avant la session. Chaque demande
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

            <div className="grid gap-3 sm:grid-cols-2">
              <input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })}
                     placeholder="Nom *"
                     className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })}
                     placeholder="Prénom *"
                     className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
                     placeholder="Courriel" type="email"
                     className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })}
                     placeholder="Téléphone"
                     className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <label className="sm:col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-gray-600">
                  Date de naissance
                </span>
                <input value={f.naissance} onChange={(e) => setF({ ...f, naissance: e.target.value })}
                       type="date"
                       className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
            </div>

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

      {/* ── Les candidats deja deposes ───────────────────────────────────── */}
      <section>
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

      <p className="mt-8 text-center text-xs text-gray-400">
        MYSTORY Formation · centre d&apos;examen agréé TEF IRN · contact@mystoryformation.fr
      </p>
    </div>
  );
}
