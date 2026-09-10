"use client";
// app/partenaires/organismes/page.tsx — Créer et gérer les accès partenaires.
//
// Ouvrir un accès, c'est ouvrir des places d'examen dont nous répondons devant le
// certificateur : réservé à la direction et au management.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const BLEU = "#2F72DE";

type Partenaire = {
  id: string; raison_sociale: string; siret: string | null; email: string | null;
  telephone: string | null; contact_nom: string | null; centre: string | null;
  jours_autorises: string[]; horaires_autorises: string[];
  plafond_places: number | null; surbooking_autorise: boolean;
  tarif_tef_irn: number | null; tarif_civique: number | null;
  actif: boolean; acces: string; lien_premier_acces: string | null;
  derniere_connexion: string | null; note: string | null;
  demandes: { total: number; attente: number };
};

const VIDE = {
  id: "", raison_sociale: "", siret: "", email: "", telephone: "", contact_nom: "",
  centre: "", jours_autorises: [] as string[], horaires_autorises: [] as string[],
  plafond_places: "", surbooking_autorise: false,
  tarif_tef_irn: "", tarif_civique: "", note: "",
};

const dateFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "jamais";

export default function OrganismesPartenaires() {
  const [liste, setListe] = useState<Partenaire[] | null>(null);
  const [jours, setJours] = useState<string[]>([]);
  const [horaires, setHoraires] = useState<string[]>([]);
  const [centres, setCentres] = useState<string[]>([]);
  const [f, setF] = useState({ ...VIDE });
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [lien, setLien] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const charger = useCallback(async () => {
    const r = await fetch("/api/partenaires", { cache: "no-store" });
    const j = await r.json();
    if (j?.ok) { setListe(j.partenaires); setJours(j.jours ?? []); }
    else setListe([]);
    const o = await fetch("/api/partenaires", { method: "OPTIONS" }).then((x) => x.json()).catch(() => null);
    if (o?.ok) { setHoraires(o.horaires ?? []); setCentres(o.centres ?? []); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  function bascule(champ: "jours_autorises" | "horaires_autorises", v: string) {
    setF((x) => {
      const l = x[champ];
      return { ...x, [champ]: l.includes(v) ? l.filter((y) => y !== v) : [...l, v] };
    });
  }

  async function enregistrer() {
    if (!f.raison_sociale.trim()) { setMsg({ t: "err", m: "La raison sociale est obligatoire." }); return; }
    setBusy(true); setMsg(null); setLien(null);
    try {
      const r = await fetch("/api/partenaires", {
        method: f.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = await r.json();
      if (!j?.ok) { setMsg({ t: "err", m: j?.erreur ?? "Enregistrement impossible." }); return; }
      if (j.lien_premier_acces) setLien(j.lien_premier_acces);
      setMsg({ t: "ok", m: f.id ? "Modifications enregistrées." : `${f.raison_sociale} est créé.` });
      setF({ ...VIDE }); setOuvert(false);
      await charger();
    } finally { setBusy(false); }
  }

  async function basculerActif(p: Partenaire) {
    await fetch("/api/partenaires", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, actif: !p.actif }),
    });
    await charger();
  }

  async function regenerer(p: Partenaire) {
    const r = await fetch("/api/partenaires", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, action: "regenerer_acces" }),
    });
    const j = await r.json();
    if (j?.ok) { setLien(j.lien_premier_acces); setMsg({ t: "ok", m: `Nouvel accès pour ${p.raison_sociale}. L'ancien lien et le mot de passe ne fonctionnent plus.` }); }
    await charger();
  }

  function editer(p: Partenaire) {
    setF({
      id: p.id, raison_sociale: p.raison_sociale, siret: p.siret ?? "", email: p.email ?? "",
      telephone: p.telephone ?? "", contact_nom: p.contact_nom ?? "", centre: p.centre ?? "",
      jours_autorises: p.jours_autorises ?? [], horaires_autorises: p.horaires_autorises ?? [],
      plafond_places: p.plafond_places?.toString() ?? "",
      surbooking_autorise: p.surbooking_autorise,
      tarif_tef_irn: p.tarif_tef_irn?.toString() ?? "",
      tarif_civique: p.tarif_civique?.toString() ?? "", note: p.note ?? "",
    });
    setOuvert(true); setMsg(null); setLien(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organismes partenaires</h1>
          <p className="mt-1 text-sm text-gray-600">
            Chaque partenaire inscrit ses candidats depuis son propre espace, et ne voit
            que les créneaux que vous lui ouvrez.
          </p>
        </div>
        <Link href="/partenaires" className="text-sm font-semibold underline underline-offset-2"
              style={{ color: BLEU }}>
          Voir les inscriptions à valider →
        </Link>
      </div>

      {/* ── Le lien de premier accès, à transmettre ─────────────────────── */}
      {lien && (
        <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Lien de premier accès — à transmettre au partenaire
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Il lui permet de définir son mot de passe. Ensuite, il se connectera avec
            son adresse e-mail. Ce lien ne fonctionne qu&apos;une fois.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs text-gray-800">
              {typeof window !== "undefined" ? window.location.origin : ""}{lien}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}${lien}`);
                setCopie(true); setTimeout(() => setCopie(false), 2000);
              }}
              className="rounded-lg px-3 py-2 text-xs font-bold text-white"
              style={{ background: "#059669" }}>
              {copie ? "✓ Copié" : "Copier"}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${
          msg.t === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {msg.m}
        </p>
      )}

      {/* ── Le formulaire ───────────────────────────────────────────────── */}
      {!ouvert ? (
        <button onClick={() => { setF({ ...VIDE }); setOuvert(true); setLien(null); setMsg(null); }}
                className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow"
                style={{ background: BLEU }}>
          + Créer un accès partenaire
        </button>
      ) : (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">
            {f.id ? `Modifier ${f.raison_sociale}` : "Nouvel organisme partenaire"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-600">Raison sociale *</span>
              <input value={f.raison_sociale} onChange={(e) => setF({ ...f, raison_sociale: e.target.value })}
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">SIRET (14 chiffres)</span>
              <input value={f.siret} onChange={(e) => setF({ ...f, siret: e.target.value })}
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Contact (nom)</span>
              <input value={f.contact_nom} onChange={(e) => setF({ ...f, contact_nom: e.target.value })}
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                E-mail — c&apos;est son identifiant de connexion
              </span>
              <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email"
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Téléphone</span>
              <input value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })}
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Ce que le partenaire pourra réserver
            </p>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Centre</span>
              <select value={f.centre} onChange={(e) => setF({ ...f, centre: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Tous les centres</option>
                {centres.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <p className="mb-1.5 text-xs font-medium text-gray-600">Jours ouverts *</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {jours.map((j) => (
                <button key={j} type="button" onClick={() => bascule("jours_autorises", j)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${
                          f.jours_autorises.includes(j) ? "text-white" : "bg-white text-gray-600 ring-1 ring-gray-300"}`}
                        style={f.jours_autorises.includes(j) ? { background: BLEU } : undefined}>
                  {j}
                </button>
              ))}
            </div>

            <p className="mb-1.5 text-xs font-medium text-gray-600">Horaires ouverts *</p>
            <div className="flex flex-wrap gap-1.5">
              {horaires.map((h) => (
                <button key={h} type="button" onClick={() => bascule("horaires_autorises", h)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          f.horaires_autorises.includes(h) ? "text-white" : "bg-white text-gray-600 ring-1 ring-gray-300"}`}
                        style={f.horaires_autorises.includes(h) ? { background: BLEU } : undefined}>
                  {h}
                </button>
              ))}
            </div>
            {(!f.jours_autorises.length || !f.horaires_autorises.length) && (
              <p className="mt-2 text-xs text-amber-800">
                Sans jour ni horaire, le partenaire ouvrira un portail vide.
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">
                Places par session
              </span>
              <input value={f.plafond_places} onChange={(e) => setF({ ...f, plafond_places: e.target.value })}
                     type="number" min="1" placeholder="sans limite"
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Tarif TEF IRN (€)</span>
              <input value={f.tarif_tef_irn} onChange={(e) => setF({ ...f, tarif_tef_irn: e.target.value })}
                     type="number" min="0" placeholder="150"
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Tarif civique (€)</span>
              <input value={f.tarif_civique} onChange={(e) => setF({ ...f, tarif_civique: e.target.value })}
                     type="number" min="0" placeholder="60"
                     className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Note interne</span>
            <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>

          <div className="mt-4 flex gap-2">
            <button onClick={enregistrer} disabled={busy}
                    className="rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow disabled:opacity-50"
                    style={{ background: BLEU }}>
              {busy ? "…" : f.id ? "Enregistrer" : "Créer et générer le lien d'accès"}
            </button>
            <button onClick={() => { setOuvert(false); setF({ ...VIDE }); setMsg(null); }}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── La liste ────────────────────────────────────────────────────── */}
      <h2 className="mt-8 mb-3 text-base font-bold text-gray-900">
        {liste === null ? "Chargement…" : `${liste.length} organisme${liste.length > 1 ? "s" : ""}`}
      </h2>
      <div className="space-y-2">
        {(liste ?? []).map((p) => (
          <div key={p.id}
               className={`rounded-xl border p-4 ${p.actif ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-70"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-sm font-bold text-gray-900">{p.raison_sociale}</span>
                {!p.actif && <span className="ml-2 text-xs text-gray-500">désactivé</span>}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  p.acces === "actif" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                  {p.acces === "actif" ? "accès actif" : "mot de passe à définir"}
                </span>
                {p.demandes.attente > 0 && (
                  <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                    {p.demandes.attente} à valider
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {p.demandes.total} demande{p.demandes.total > 1 ? "s" : ""} · dernière connexion {dateFr(p.derniere_connexion)}
              </span>
            </div>

            <p className="mt-1 text-xs text-gray-600">
              {p.email ?? "pas d'e-mail — le partenaire ne pourra pas se connecter"}
              {p.centre ? ` · ${p.centre}` : " · tous centres"}
              {p.jours_autorises?.length ? ` · ${p.jours_autorises.join(", ")}` : " · aucun jour ouvert"}
              {p.horaires_autorises?.length ? ` · ${p.horaires_autorises.join(", ")}` : ""}
              {p.plafond_places ? ` · ${p.plafond_places} places/session` : ""}
            </p>

            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <button onClick={() => editer(p)} className="font-semibold underline underline-offset-2"
                      style={{ color: BLEU }}>Modifier</button>
              <button onClick={() => regenerer(p)} className="font-semibold text-amber-800 underline underline-offset-2">
                Regénérer l&apos;accès
              </button>
              <button onClick={() => basculerActif(p)} className="font-semibold text-gray-600 underline underline-offset-2">
                {p.actif ? "Désactiver" : "Réactiver"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
