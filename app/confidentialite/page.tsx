"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL, type Role } from "@/lib/roles";

type Contrat = { id: string; statut: string; envoye_le: string | null; signe_le: string | null } | null;
type Personne = {
  personne_type: "salarie" | "formateur";
  ref: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  roles: string[];
  contrat: Contrat;
};

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  signee: { label: "Signé", cls: "badge-success" },
  envoye_a_signer: { label: "Envoyé à signer", cls: "badge-info" },
  signature_en_cours: { label: "Signature en cours", cls: "badge-warning" },
  genere: { label: "Brouillon", cls: "badge-neutral" },
  annule: { label: "Annulé", cls: "badge-neutral" },
};

function roleLabel(r: string): string {
  return ROLE_LABEL[r as Role] ?? r;
}

export default function ConfidentialitePage() {
  const [personnes, setPersonnes] = useState<Personne[] | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [signUrls, setSignUrls] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    const r = await fetch("/api/confidentialite", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setPersonnes(j.personnes);
    else setErreur(j.erreur || "Chargement impossible.");
  }
  useEffect(() => { charger(); }, []);

  async function envoyer(p: Personne) {
    const cle = `${p.personne_type}:${p.ref}`;
    const email = (p.email ?? emails[cle] ?? "").trim();
    setErreur(null);
    if (!email) { setErreur("Renseigne l'e-mail du signataire d'abord."); return; }
    setBusy(cle);
    try {
      const r = await fetch("/api/confidentialite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personne_type: p.personne_type, personne_ref: p.ref,
          nom: p.nom, prenom: p.prenom, email, roles: p.roles,
          poste: p.roles.map(roleLabel).join(" · "),
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Envoi impossible."); return; }
      if (j.signUrl) setSignUrls((m) => ({ ...m, [cle]: j.signUrl }));
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Envoi impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="page-header">
        <h1 className="page-title">Contrats de confidentialité</h1>
        <p className="page-subtitle">Engagement de confidentialité signé par chaque membre (formateurs &amp; salariés). Signature électronique, à distance ou sur place.</p>
      </div>

      {erreur && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erreur}</div>}

      {personnes === null ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : personnes.length === 0 ? (
        <div className="empty-state">Aucun membre actif.</div>
      ) : (
        <div className="space-y-3">
          {personnes.map((p) => {
            const cle = `${p.personne_type}:${p.ref}`;
            const st = p.contrat ? (STATUT_BADGE[p.contrat.statut] ?? STATUT_BADGE.genere) : null;
            const signUrl = signUrls[cle];
            return (
              <div key={cle} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{p.prenom} {p.nom}
                      <span className="ml-2 badge badge-neutral">{p.personne_type === "formateur" ? "Formateur" : "Salarié"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.roles.length > 0 ? p.roles.map((r) => (
                        <span key={r} className="badge badge-info">{roleLabel(r)}</span>
                      )) : <span className="text-xs text-gray-400">Rôle à préciser</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {st && <span className={`badge ${st.cls}`}>{st.label}</span>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {p.email ? (
                    <span className="text-sm text-gray-600">{p.email}</span>
                  ) : (
                    <input
                      type="email" placeholder="E-mail du signataire"
                      value={emails[cle] ?? ""}
                      onChange={(e) => setEmails((m) => ({ ...m, [cle]: e.target.value }))}
                      className="input w-64"
                    />
                  )}
                  <button onClick={() => envoyer(p)} disabled={busy === cle} className="btn-primary !py-1.5 !text-sm">
                    {busy === cle ? "Envoi…" : (p.contrat?.statut === "signee" ? "Renvoyer un nouveau contrat" : "Envoyer à signer")}
                  </button>
                </div>

                {signUrl && (
                  <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm">
                    <p className="font-medium text-green-800">Envoyé à signer ✓ — le membre reçoit le lien par e-mail.</p>
                    <p className="text-xs text-gray-600">Pour signer <strong>sur place</strong>, ouvre ce lien :</p>
                    <a href={signUrl} target="_blank" rel="noreferrer" className="break-all text-mystory underline">{signUrl}</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
