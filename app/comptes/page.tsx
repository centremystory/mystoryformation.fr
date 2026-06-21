"use client";
// app/comptes/page.tsx — Comptes & accès (réservé Direction).
// Créer des comptes, changer le rôle, activer/désactiver, réinitialiser le mot de passe.
// Affiche aussi la matrice « rôles → actions sensibles » (référence).
import { useCallback, useEffect, useState } from "react";
import { ROLES, ROLE_LABEL, PERMISSIONS, type Role } from "@/lib/roles";

type Compte = {
  id: string; nom: string; prenom: string | null; email: string; role: Role; roles?: string[] | null;
  actif: boolean; doit_changer_mdp: boolean; cree_le: string; derniere_connexion: string | null;
};

function dateFr(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function PageComptes() {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [interdit, setInterdit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // formulaire de création
  const [nom, setNom] = useState(""); const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState(""); const [roles, setRoles] = useState<string[]>(["commercial"]);
  const [mdp, setMdp] = useState("");

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/comptes", { cache: "no-store" });
      if (r.status === 403) { setInterdit(true); return; }
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur de chargement.");
      setComptes(j.utilisateurs);
    } catch (e: any) { setErreur(e?.message || "Erreur de chargement."); }
    finally { setChargement(false); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function creer() {
    if (!nom.trim() || !email.trim() || mdp.length < 8) { setErreur("Nom, email et mot de passe (8 car. min) requis."); return; }
    setBusy("__create__"); setErreur(null); setInfo(null);
    try {
      const r = await fetch("/api/comptes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, prenom, email, roles, motDePasse: mdp }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Création impossible."); return; }
      setInfo(j.emailEnvoye ? "Compte créé — email d'accès envoyé à la personne." : "Compte créé — mais l'email d'accès n'a pas pu partir (vérifie le canal email).");
      setNom(""); setPrenom(""); setEmail(""); setRoles(["commercial"]); setMdp("");
      await charger();
    } catch (e: any) { setErreur(e?.message || "Création impossible."); }
    finally { setBusy(null); }
  }

  async function patch(id: string, body: any, marqueur: string) {
    setBusy(marqueur); setErreur(null); setInfo(null);
    try {
      const r = await fetch("/api/comptes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Action impossible."); return; }
      if (typeof j.emailEnvoye === "boolean") {
        setInfo(j.emailEnvoye ? "Mot de passe réinitialisé — email envoyé à la personne." : "Mot de passe réinitialisé — mais l'email n'a pas pu partir.");
      }
      await charger();
    } catch (e: any) { setErreur(e?.message || "Action impossible."); }
    finally { setBusy(null); }
  }

  function reinitialiser(c: Compte) {
    const nouveau = typeof window !== "undefined"
      ? window.prompt(`Nouveau mot de passe temporaire pour ${c.prenom ?? ""} ${c.nom} (8 car. min) :`, "")
      : null;
    if (!nouveau) return;
    if (nouveau.length < 8) { setErreur("Mot de passe : 8 caractères minimum."); return; }
    patch(c.id, { action: "reset", motDePasse: nouveau }, `reset-${c.id}`);
  }

  if (interdit) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="page-title">Comptes & accès</h1>
        <p className="mt-3 text-gray-600">Cette page est réservée à la <strong>Direction</strong>.</p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Comptes & accès</h1>
          <p className="page-subtitle">Une connexion par personne. Les comptes ne sont jamais supprimés, seulement désactivés.</p>
        </div>
      </header>

      {erreur && <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{erreur}</div>}
      {info && <div className="mb-4 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">{info}</div>}

      {/* Création */}
      <section className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Créer un compte</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" className="input" />
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="input" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" inputMode="email" className="input" />
          <div className="input sm:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-gray-500">Rôles :</span>
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={roles.includes(r)}
                  onChange={(e) => setRoles((rs) => e.target.checked ? [...rs, r] : rs.filter((x) => x !== r))} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <input value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="Mot de passe temporaire (8 car. min)" className="input sm:col-span-2" />
        </div>
        <button onClick={creer} disabled={busy === "__create__"} className="btn-primary mt-3">
          {busy === "__create__" ? "Création…" : "Créer le compte"}
        </button>
        <p className="mt-2 text-xs text-gray-400">La personne se connecte avec son email + ce mot de passe, puis tu peux le réinitialiser à tout moment.</p>
      </section>

      {/* Liste */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Comptes</h2>
        {chargement ? <p className="text-gray-500 text-sm">Chargement…</p> : comptes.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucun compte. Crée le premier ci-dessus.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
            {comptes.map((c) => (
              <div key={c.id} className={`flex flex-wrap items-center gap-2 px-4 py-3 text-sm ${c.actif ? "" : "opacity-60"}`}>
                <span className="flex-1 min-w-[160px]">
                  <span className="font-medium text-gray-900">{c.prenom ? `${c.prenom} ` : ""}{c.nom}</span>
                  <span className="block text-xs text-gray-400">{c.email} · connexion : {dateFr(c.derniere_connexion)}</span>
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {ROLES.map((r) => {
                    const actuels = (c.roles && c.roles.length > 0 ? c.roles : [c.role]);
                    const coche = actuels.includes(r);
                    return (
                      <label key={r} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={coche} disabled={busy === `role-${c.id}`}
                          onChange={(e) => {
                            const nouveaux = e.target.checked ? [...actuels, r] : actuels.filter((x) => x !== r);
                            if (nouveaux.length === 0) return;
                            patch(c.id, { action: "role", roles: nouveaux }, `role-${c.id}`);
                          }} />
                        {ROLE_LABEL[r]}
                      </label>
                    );
                  })}
                </div>
                <button onClick={() => reinitialiser(c)} disabled={busy === `reset-${c.id}`}
                  className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-300 text-gray-600 hover:border-mystory hover:text-mystory">
                  Réinitialiser le mdp
                </button>
                <button onClick={() => patch(c.id, { action: "actif", actif: !c.actif }, `actif-${c.id}`)} disabled={busy === `actif-${c.id}`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border ${c.actif ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                  {c.actif ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Matrice rôles → restrictions */}
      <section>
        <h2 className="text-sm font-semibold text-gray-800 mb-2">Rôles & restrictions</h2>
        <p className="text-xs text-gray-500 mb-2">Tout le reste (inscriptions, génération de documents, planning, tâches, envoi du dossier, examens, consultation) est ouvert à tout staff connecté. Seules ces actions sont restreintes :</p>
        <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100 text-sm">
          {(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((a) => (
            <div key={a} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="flex-1 min-w-[200px] text-gray-800">{PERMISSIONS[a].label}</span>
              <span className="flex flex-wrap gap-1">
                {PERMISSIONS[a].roles.map((r) => (
                  <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-mystory-clair text-mystory">{ROLE_LABEL[r]}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          L'application de ces restrictions sur chaque bouton se branche progressivement. Tant que la bascule n'est pas finie,
          la connexion par <strong>mot de passe d'équipe</strong> garde un accès complet (filet de sécurité).
        </p>
      </section>

      <SauvegardeSection />
    </main>
  );
}

function SauvegardeSection() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function envoyer() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/backup", { method: "POST" });
      const j = await r.json();
      setMsg(j.ok ? `Sauvegarde envoyée par email (${j.total} lignes, ${j.tables} tables).` : (j.erreur || "Erreur."));
    } catch { setMsg("Erreur réseau."); } finally { setBusy(false); }
  }
  return (
    <section className="mt-6 border border-gray-200 rounded-xl bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Sauvegarde de la base</h2>
      <p className="text-sm text-gray-500 mb-3">
        Export complet des données (un ZIP de fichiers JSON), à conserver hors de Supabase. Une sauvegarde automatique est aussi envoyée chaque semaine par email.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href="/api/admin/backup" className="btn-primary">⬇️ Télécharger une sauvegarde</a>
        <button onClick={envoyer} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm bg-white disabled:opacity-50">
          {busy ? "Envoi…" : "✉️ Envoyer par email maintenant"}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
      <p className="text-xs text-gray-400 mt-3">
        Les PDF du bucket et les mots de passe ne sont pas inclus. Pour une restauration à un instant T, le plan Supabase Pro (backups quotidiens + PITR) reste recommandé.
      </p>
    </section>
  );
}
