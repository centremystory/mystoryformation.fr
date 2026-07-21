"use client";
// app/formation/AlertesFormation.tsx — Panneau d'alertes du hub Formation.
// (15) Participation forfaitaire 150€ non réglée · (16) Identité CPF (rappel J+14).
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Participation = { dossierId: string; stagiaire: string; agence: string | null; montant: number; dateValidation: string | null };
type Identite = { dossierId: string; stagiaire: string; agence: string | null; envoyeLe: string | null; jours: number | null; statut: "a_envoyer" | "en_attente" | "rappel" };
type Data = { participation: Participation[]; identite: Identite[]; rappelsIdentite: number; montantParticipation: number; delaiRappelJours: number };

export default function AlertesFormation() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [charge, setCharge] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/formation/alertes", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setData(j);
    } catch { /* silencieux : un hub ne doit pas planter sur une alerte */ }
    finally { setCharge(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function agir(dossierId: string, action: string, marqueur: string, motif?: string) {
    setBusy(marqueur);
    try {
      await apiFetch("/api/formation/alertes", {
        method: "PATCH",
        body: JSON.stringify({ dossierId, action, motif }),
      });
      toast.success("Alerte mise à jour.");
      await charger();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible — réessayez.");
    } finally { setBusy(null); }
  }

  if (charge || !data) return null;
  const { participation, identite } = data;
  if (participation.length === 0 && identite.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {participation.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900 mb-2">
            💶 Participation forfaitaire {data.montantParticipation} € — {participation.length} dossier(s) à régler
          </h2>
          <div className="space-y-1.5">
            {participation.map((p) => (
              <div key={p.dossierId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 min-w-[180px] text-amber-900">
                  {p.stagiaire}{p.agence ? <span className="text-amber-700/70"> · {p.agence}</span> : null}
                </span>
                <button onClick={() => agir(p.dossierId, "participation_reglee", `reg-${p.dossierId}`)}
                  disabled={busy === `reg-${p.dossierId}`}
                  className="px-2.5 py-1 rounded-lg text-xs bg-mystory text-white disabled:opacity-50">Marquer réglée</button>
                <button onClick={() => {
                    const m = typeof window !== "undefined" ? (window.prompt("Motif d'exonération (demandeur d'emploi, abondement…) :", "") ?? undefined) : undefined;
                    agir(p.dossierId, "participation_exoneree", `exo-${p.dossierId}`, m);
                  }}
                  disabled={busy === `exo-${p.dossierId}`}
                  className="px-2.5 py-1 rounded-lg text-xs border border-amber-300 text-amber-800 disabled:opacity-50">Exonérer</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {identite.length > 0 && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">
            🪪 Vérification d'identité CPF — {data.rappelsIdentite > 0 ? `${data.rappelsIdentite} rappel(s) à J+${data.delaiRappelJours}` : `${identite.length} à suivre`}
          </h2>
          <div className="space-y-1.5">
            {identite.map((i) => (
              <div key={i.dossierId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 min-w-[180px] text-blue-900">
                  {i.stagiaire}{i.agence ? <span className="text-blue-700/70"> · {i.agence}</span> : null}
                  {i.statut === "rappel" && <span className="ml-2 text-xs font-semibold text-red-700">⏰ rappel (J+{i.jours})</span>}
                  {i.statut === "en_attente" && <span className="ml-2 text-xs text-blue-700/70">envoyé il y a {i.jours} j</span>}
                  {i.statut === "a_envoyer" && <span className="ml-2 text-xs text-blue-700/70">à envoyer</span>}
                </span>
                {i.statut === "a_envoyer" && (
                  <button onClick={() => agir(i.dossierId, "identite_envoyee", `env-${i.dossierId}`)}
                    disabled={busy === `env-${i.dossierId}`}
                    className="px-2.5 py-1 rounded-lg text-xs bg-mystory text-white disabled:opacity-50">Courriel envoyé</button>
                )}
                <button onClick={() => agir(i.dossierId, "identite_ok", `ok-${i.dossierId}`)}
                  disabled={busy === `ok-${i.dossierId}`}
                  className="px-2.5 py-1 rounded-lg text-xs border border-blue-300 text-blue-800 disabled:opacity-50">Identité confirmée</button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-blue-700/70 mt-2">« Courriel envoyé » démarre le compteur ; un rappel s'affiche {data.delaiRappelJours} jours plus tard si l'identité n'est pas confirmée.</p>
        </section>
      )}
    </div>
  );
}
