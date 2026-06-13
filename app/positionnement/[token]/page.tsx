"use client";

/**
 * MYSTORY — Écran de notation formatrice (accès par jeton, mobile).
 * Affiche le candidat + CE/CO auto, saisit EE + EO → finalise le positionnement.
 */
import { useEffect, useState } from "react";

type Pos = {
  certif: string; civilite: string | null; nom: string; prenom: string;
  niveau_vise: string | null; ce_sur20: number | null; co_sur10: number | null;
  ee_sur10: number | null; eo_sur10: number | null; total_sur20: number | null;
  niveau_global: string | null; remarques: string | null; statut: string;
};

export default function NotationFormatrice({ params }: { params: { token: string } }) {
  const [p, setP] = useState<Pos | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ee, setEe] = useState(""); const [eo, setEo] = useState(""); const [rem, setRem] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState<null | { niveau: string; total: number; dossier: boolean }>(null);

  useEffect(() => {
    fetch(`/api/positionnement/${params.token}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setP(j.positionnement); if (j.positionnement.remarques) setRem(j.positionnement.remarques); } else setErreur(j.erreur || "Introuvable."); })
      .catch(() => setErreur("Chargement impossible."));
  }, [params.token]);

  async function noter() {
    const e = Number(ee), o = Number(eo);
    if (!(e >= 0 && e <= 10) || !(o >= 0 && o <= 10)) { setErreur("EE et EO doivent être entre 0 et 10."); return; }
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`/api/positionnement/${params.token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ee_sur10: e, eo_sur10: o, remarques: rem }),
      });
      const j = await r.json();
      if (j.ok) setFini({ niveau: j.niveau_global, total: j.total_sur20, dossier: j.dossier_cree });
      else setErreur(j.erreur || "Échec.");
    } catch { setErreur("Envoi impossible."); }
    finally { setEnvoi(false); }
  }

  const champ = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-extrabold text-gray-900">Notation — Expression écrite & orale</h1>
      <p className="mt-1 text-sm text-gray-500">Réservé à la formatrice. Saisissez les deux notes pour finaliser le niveau du candidat.</p>

      {erreur && <p className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{erreur}</p>}

      {p && !fini && (
        <>
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-lg font-bold text-gray-900">{p.civilite ? p.civilite + " " : ""}{p.prenom} {p.nom}</div>
            <div className="mt-1 text-sm text-gray-500">{p.certif === "LEVELTEL" ? "LEVELTEL" : "TEF IRN"}{p.niveau_vise ? ` · niveau visé ${p.niveau_vise}` : ""}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500">Compréhension écrite</div><div className="font-bold">{p.ce_sur20 ?? "—"} / 20</div></div>
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500">Compréhension orale</div><div className="font-bold">{p.co_sur10 ?? "—"} / 10</div></div>
            </div>
          </div>

          {p.statut === "complet" ? (
            <p className="mt-4 rounded-lg bg-amber-50 border border-amber-300 p-3 text-sm text-amber-800">
              Ce positionnement est déjà finalisé (niveau {p.niveau_global ?? "—"}). Vous pouvez renoter pour corriger.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            <div><label className="text-sm font-medium text-gray-700">Expression écrite / 10</label>
              <input type="number" min="0" max="10" step="0.5" value={ee} onChange={(e) => setEe(e.target.value)} className={champ} inputMode="decimal" /></div>
            <div><label className="text-sm font-medium text-gray-700">Expression orale / 10</label>
              <input type="number" min="0" max="10" step="0.5" value={eo} onChange={(e) => setEo(e.target.value)} className={champ} inputMode="decimal" /></div>
            <div><label className="text-sm font-medium text-gray-700">Remarques (optionnel)</label>
              <textarea value={rem} onChange={(e) => setRem(e.target.value)} rows={3} className={champ} /></div>
          </div>

          <button onClick={noter} disabled={envoi || ee === "" || eo === ""}
            className="mt-4 w-full rounded-xl bg-mystory px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {envoi ? "Enregistrement…" : "Finaliser le niveau"}
          </button>
        </>
      )}

      {fini && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-center">
          <div className="text-sm text-gray-500">Niveau global</div>
          <div className="mt-1 text-4xl font-extrabold text-mystory">{fini.niveau}</div>
          <div className="mt-1 text-sm text-gray-600">{fini.total} / 20</div>
          <p className="mt-3 text-sm text-green-700">✓ Positionnement finalisé.{fini.dossier ? " Dossier créé." : " (Dossier non créé : email candidat manquant.)"}</p>
        </div>
      )}
    </main>
  );
}
