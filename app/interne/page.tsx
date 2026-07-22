"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/components/ui/Toast";

type Reponse = {
  id: string;
  parent_id: string | null;
  auteur_nom: string;
  auteur_role: string | null;
  contenu: string;
  statut: string;
  cree_le: string;
  resolu_le: string | null;
  resolu_par: string | null;
};
type Question = Reponse & { reponses: Reponse[] };

const ROLE_FR: Record<string, string> = {
  direction: "Direction",
  manager: "Manager",
  commercial: "Commercial",
  formatrice: "Formatrice",
  back_office: "Back-office",
  staff: "Équipe",
};

function dateFr(s: string): string {
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InternePage() {
  const toast = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [chargement, setChargement] = useState(true);
  const [nouvelle, setNouvelle] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reponse, setReponse] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    try {
      const r = await fetch("/api/interne", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setQuestions(j.questions as Question[]);
      else setErreur(j.erreur || "Chargement impossible.");
    } catch {
      setErreur("Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, []);
  useEffect(() => {
    charger();
  }, [charger]);

  async function poser() {
    setErreur(null);
    if (!nouvelle.trim()) {
      setErreur("Écris ta question.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/interne", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: nouvelle }),
      });
      const j = await r.json();
      if (!j.ok) {
        setErreur(j.erreur || "Envoi impossible.");
        return;
      }
      setNouvelle("");
      await charger();
    } finally {
      setBusy(false);
    }
  }

  async function repondre(qid: string) {
    const txt = (reponse[qid] || "").trim();
    if (!txt) return;
    setBusy(true);
    try {
      const r = await fetch("/api/interne", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: txt, parent_id: qid }),
      });
      const j = await r.json();
      if (j.ok) {
        setReponse((m) => ({ ...m, [qid]: "" }));
        await charger();
      } else {
        setErreur(j.erreur || "Réponse impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function agir(id: string, action: "resoudre" | "rouvrir" | "archiver") {
    const MSG: Record<string, string> = {
      resoudre: "Question marquée résolue.",
      rouvrir: "Question rouverte.",
      archiver: "Question archivée.",
    };
    try {
      await apiFetch("/api/interne", {
        method: "PATCH",
        body: JSON.stringify({ id, action }),
      });
      toast.success(MSG[action] ?? "Question mise à jour.");
      await charger();
    } catch (e: any) {
      toast.error(e?.message ?? "Action impossible — réessayez.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Questions internes</h1>
        <p className="page-subtitle">
          Pose une question à l&apos;équipe, réponds, marque comme résolue. Visible par toute l&apos;équipe.
        </p>
      </div>

      {erreur && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erreur}</div>
      )}

      <div className="card p-4 mb-6">
        <label className="block text-sm font-medium mb-2">Poser une question</label>
        <textarea
          className="input w-full"
          rows={3}
          placeholder="Ex. : Quelqu'un connaît la procédure pour un report d'examen TEF ?"
          value={nouvelle}
          onChange={(e) => setNouvelle(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <button className="btn-primary" disabled={busy} onClick={poser}>
            Publier
          </button>
        </div>
      </div>

      {chargement ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune question pour l&apos;instant.</p>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold">{q.auteur_nom}</span>
                  {q.auteur_role && (
                    <span className="badge badge-info ml-2">{ROLE_FR[q.auteur_role] || q.auteur_role}</span>
                  )}
                  <span className="ml-2 text-xs text-gray-400">{dateFr(q.cree_le)}</span>
                </div>
                {q.statut === "resolue" ? (
                  <span className="badge badge-success">Résolue</span>
                ) : (
                  <span className="badge badge-warning">Ouverte</span>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm">{q.contenu}</p>

              {q.reponses.length > 0 && (
                <div className="mt-3 space-y-2 border-l-2 border-gray-200 pl-3">
                  {q.reponses.map((r) => (
                    <div key={r.id}>
                      <span className="text-sm font-medium">{r.auteur_nom}</span>
                      {r.auteur_role && (
                        <span className="ml-2 text-xs text-gray-400">{ROLE_FR[r.auteur_role] || r.auteur_role}</span>
                      )}
                      <span className="ml-2 text-xs text-gray-400">{dateFr(r.cree_le)}</span>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{r.contenu}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <input
                  className="input flex-1 !py-1 text-sm"
                  placeholder="Répondre…"
                  value={reponse[q.id] || ""}
                  onChange={(e) => setReponse((m) => ({ ...m, [q.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") repondre(q.id);
                  }}
                />
                <button className="btn-ghost !py-1 !px-2 text-sm" disabled={busy} onClick={() => repondre(q.id)}>
                  Répondre
                </button>
              </div>

              <div className="mt-2 flex items-center gap-3 text-xs">
                {q.statut === "ouverte" ? (
                  <button className="text-green-700 hover:underline" onClick={() => agir(q.id, "resoudre")}>
                    Marquer résolue
                  </button>
                ) : (
                  <button className="text-gray-500 hover:underline" onClick={() => agir(q.id, "rouvrir")}>
                    Rouvrir
                  </button>
                )}
                {q.resolu_par && q.statut === "resolue" && (
                  <span className="text-gray-400">résolue par {q.resolu_par}</span>
                )}
                <button className="ml-auto text-gray-400 hover:underline" onClick={() => agir(q.id, "archiver")}>
                  Archiver
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
