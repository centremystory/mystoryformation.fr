"use client";
// app/partenaires/page.tsx — Valider les inscriptions déposées par les prescripteurs.
//
// L'organisme partenaire dépose ses candidats depuis son portail ; c'est ici qu'on
// accepte ou refuse. Un refus exige un motif : l'article 4 de la convention nous
// engage à le motiver, et le partenaire le lit dans son espace.
import { useCallback, useEffect, useState } from "react";

const BLEU = "#2F72DE";

type Demande = {
  id: string; partenaire: string; nom: string; prenom: string;
  email: string | null; telephone: string | null; naissance: string | null;
  statut: string; motif_refus: string | null; demande_le: string;
  decide_le: string | null; decide_par: string | null;
  session: { type: string; date: string; horaire: string; centre: string | null; capacite: number | null } | null;
  civilite?: string | null; genre?: string | null; lieu_naissance?: string | null;
  langue_maternelle?: string | null; nationalite?: string | null;
  adresse?: string | null; code_postal?: string | null; ville?: string | null; pays?: string | null;
  num_piece?: string | null; sous_type?: string | null; piece_nom?: string | null;
};

const LIB_TYPE: Record<string, string> = { TEF_IRN: "TEF IRN", Examen_civique: "Examen civique" };
const dateFr = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
};

export default function PagePartenaires() {
  const [demandes, setDemandes] = useState<Demande[] | null>(null);
  const [filtre, setFiltre] = useState("en_attente");
  const [busy, setBusy] = useState<string | null>(null);
  const [motif, setMotif] = useState<Record<string, string>>({});
  const [refusOuvert, setRefusOuvert] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setDemandes(null);
    const r = await fetch(`/api/partenaires/demandes?statut=${filtre}`, { cache: "no-store" });
    const j = await r.json();
    setDemandes(j?.ok ? j.demandes : []);
  }, [filtre]);

  useEffect(() => { charger(); }, [charger]);

  async function decider(id: string, decision: "confirmee" | "refusee") {
    if (decision === "refusee" && !(motif[id] ?? "").trim()) {
      setRefusOuvert((o) => ({ ...o, [id]: true }));
      setErr("Un refus doit être motivé : le partenaire lira ce motif dans son espace.");
      return;
    }
    setBusy(id); setErr(null);
    try {
      const r = await fetch("/api/partenaires/demandes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, motif: motif[id] ?? "" }),
      });
      const j = await r.json();
      if (!j?.ok) { setErr(j?.erreur ?? "Décision impossible."); return; }
      setDemandes((ds) => (ds ?? []).filter((d) => d.id !== id));
    } finally { setBusy(null); }
  }

  const enAttente = (demandes ?? []).filter((d) => d.statut === "en_attente").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900">Inscriptions partenaires</h1>
      <p className="mt-1 text-sm text-gray-600">
        Candidats déposés par les organismes prescripteurs. Chaque demande est validée
        par le centre&nbsp;: c&apos;est nous qui répondons de la régularité de la passation
        devant le certificateur.
      </p>

      <a href="/partenaires/organismes"
         className="mt-3 inline-block text-sm font-semibold underline underline-offset-2"
         style={{ color: BLEU }}>
        Gérer les accès partenaires →
      </a>

      <div className="mt-4 flex gap-2">
        {[["en_attente", "À valider"], ["confirmee", "Confirmées"],
          ["refusee", "Refusées"], ["toutes", "Toutes"]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    filtre === v ? "text-white" : "bg-gray-100 text-gray-600"}`}
                  style={filtre === v ? { background: BLEU } : undefined}>
            {l}{v === "en_attente" && enAttente > 0 ? ` (${enAttente})` : ""}
          </button>
        ))}
      </div>

      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}

      {demandes === null ? <p className="mt-6 text-sm text-gray-400">Chargement…</p> :
       demandes.length === 0 ? (
        <p className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ Rien à traiter.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {demandes.map((d) => (
            <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                    {d.partenaire}
                  </span>
                  <span className="ml-2 text-sm font-semibold text-gray-900">
                    {d.prenom} {d.nom}
                  </span>
                  {d.naissance && (
                    <span className="ml-2 text-xs text-gray-500">né·e le {dateFr(d.naissance)}</span>
                  )}
                </div>
                {d.session && (
                  <span className="text-xs text-gray-600">
                    {LIB_TYPE[d.session.type] ?? d.session.type} · <b>{dateFr(d.session.date)}</b> ·{" "}
                    {d.session.horaire}{d.session.centre ? ` · ${d.session.centre}` : ""}
                  </span>
                )}
              </div>

              <p className="mt-1 text-xs text-gray-500">
                {d.email ?? "pas de courriel"}{d.telephone ? ` · ${d.telephone}` : ""}
              </p>

              {/* Tout ce que la CCI demande, sous les yeux : le partenaire l'a saisi,
                  personne n'a a rappeler le candidat ni a rouvrir un autre ecran. */}
              <div className="mt-2 grid gap-x-6 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700 sm:grid-cols-2">
                {d.sous_type && <span><b>Mention :</b> {d.sous_type}</span>}
                {d.civilite && <span><b>Civilité :</b> {d.civilite}{d.genre ? ` (${d.genre})` : ""}</span>}
                {d.lieu_naissance && <span><b>Né·e à :</b> {d.lieu_naissance}</span>}
                {d.nationalite && <span><b>Nationalité :</b> {d.nationalite}</span>}
                {d.langue_maternelle && <span><b>Langue maternelle :</b> {d.langue_maternelle}</span>}
                {d.num_piece && <span><b>N° pièce :</b> {d.num_piece}</span>}
                {(d.adresse || d.ville) && (
                  <span className="sm:col-span-2">
                    <b>Adresse :</b> {[d.adresse, d.code_postal, d.ville, d.pays].filter(Boolean).join(" ")}
                  </span>
                )}
                {d.piece_nom && (
                  <span className="sm:col-span-2 text-emerald-700">
                    ✓ Pièce d&apos;identité jointe : {d.piece_nom}
                  </span>
                )}
              </div>

              {d.motif_refus && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800">
                  Refusé : {d.motif_refus}
                </p>
              )}

              {d.statut === "en_attente" && (
                <>
                  {refusOuvert[d.id] && (
                    <input
                      value={motif[d.id] ?? ""}
                      onChange={(e) => setMotif((m) => ({ ...m, [d.id]: e.target.value }))}
                      placeholder="Motif du refus — le partenaire le lira dans son espace"
                      className="mt-3 w-full rounded-lg border border-red-200 px-3 py-2 text-sm" />
                  )}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => decider(d.id, "confirmee")} disabled={busy === d.id}
                            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            style={{ background: "#059669" }}>
                      {busy === d.id ? "…" : "Confirmer la place"}
                    </button>
                    <button onClick={() => decider(d.id, "refusee")} disabled={busy === d.id}
                            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
                      Refuser
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
