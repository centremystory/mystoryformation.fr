"use client";
// app/equipe/page.tsx — Équipe MYSTORY (Formateurs + Commerciaux)
// Règles : pas de suppression (désactivation uniquement, traçabilité 5 ans) ·
// gestion ouverte à toute l'équipe (mot de passe d'équipe via le middleware global).
// Formateurs : badge ✅ En règle = justificatif FLE tracé (pièce + date en base) · ⏳ = pièce manquante
//   → un formateur ⏳ n'apparaît pas dans le menu du formulaire d'inscription.
// Commerciaux : liste simple (pas de justificatif FLE), activation / désactivation.
import { useCallback, useEffect, useRef, useState } from "react";

const BLEU = "#2F72DE";

type Formatrice = {
  id: string;
  nom: string;
  prenom: string | null;
  justificatif_fle: boolean;
  justificatif_url: string | null;
  justificatif_lien: string | null; // URL signée 1 h fournie par l'API
  justificatif_date: string | null;
  actif: boolean;
  created_at: string;
};

type Commercial = {
  id: string;
  nom: string;
  prenom: string | null;
  actif: boolean;
  created_at: string;
};

type Membre = {
  id: string;
  prenom: string | null;
  nom: string;
  role: string | null;
  actif: boolean;
};

// Libellés de fonction (rôles applicatifs -> intitulé lisible affiché sur la page Équipe).
const FONCTION_LABEL: Record<string, string> = {
  direction: "Directeur / Direction",
  pedagogie: "Responsable pédagogique & qualité",
  secretariat: "Assistante de direction / Secrétariat",
  communication: "Communication & marketing",
  formatrice: "Formatrice",
  commercial: "Développement commercial",
};
function fonctionLabel(role: string | null): string {
  return (role && FONCTION_LABEL[role]) || role || "—";
}

function dateFr(iso: string | null): string {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

export default function PageEquipe() {
  const [formatrices, setFormatrices] = useState<Formatrice[]>([]);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Formulaire d'ajout — formateur
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [enCours, setEnCours] = useState(false);

  // Formulaire d'ajout — commercial
  const [ajoutOuvertC, setAjoutOuvertC] = useState(false);
  const [nomC, setNomC] = useState("");
  const [prenomC, setPrenomC] = useState("");
  const [enCoursC, setEnCoursC] = useState(false);

  // Upload : formateur ciblé par l'input fichier caché
  const [uploadEnCours, setUploadEnCours] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cibleUploadRef = useRef<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const [rF, rC, rR] = await Promise.all([
        fetch("/api/equipe", { cache: "no-store" }),
        fetch("/api/equipe/commerciaux", { cache: "no-store" }),
        fetch("/api/equipe/roles", { cache: "no-store" }),
      ]);
      const jF = await rF.json();
      if (!jF.ok) throw new Error(jF.erreur || "Erreur de chargement (formateurs).");
      setFormatrices(jF.formatrices);
      const jC = await rC.json();
      if (!jC.ok) throw new Error(jC.erreur || "Erreur de chargement (commerciaux).");
      setCommerciaux(jC.commerciaux);
      const jR = await rR.json();
      if (!jR.ok) throw new Error(jR.erreur || "Erreur de chargement (rôles).");
      setMembres(jR.membres);
    } catch (e: any) {
      setErreur(e?.message || "Erreur de chargement.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  function notifier(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  }

  // ----- Formateurs -----
  async function ajouter() {
    if (!nom.trim() || !prenom.trim()) { setErreur("Nom et prénom sont obligatoires."); return; }
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch("/api/equipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nom.trim(), prenom: prenom.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur lors de l'ajout.");
      setNom(""); setPrenom(""); setAjoutOuvert(false);
      notifier(`${j.formatrice.prenom} ${j.formatrice.nom} ajouté·e — dépose son justificatif FLE pour la rendre éligible.`);
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de l'ajout.");
    } finally {
      setEnCours(false);
    }
  }

  function ouvrirSelecteur(id: string) {
    cibleUploadRef.current = id;
    fileInputRef.current?.click();
  }

  async function fichierChoisi(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = cibleUploadRef.current;
    e.target.value = ""; // permet de re-sélectionner le même fichier plus tard
    if (!file || !id) return;
    setUploadEnCours(id); setErreur(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("fichier", file);
      const r = await fetch("/api/equipe/justificatif", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Échec de l'envoi.");
      notifier(`Justificatif FLE enregistré pour ${j.formatrice.prenom ?? ""} ${j.formatrice.nom} ✅`);
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Échec de l'envoi.");
    } finally {
      setUploadEnCours(null);
      cibleUploadRef.current = null;
    }
  }

  async function basculerActif(f: Formatrice) {
    const verbe = f.actif ? "Désactiver" : "Réactiver";
    const detail = f.actif
      ? "Sa fiche et son justificatif restent consultables (traçabilité 5 ans), mais la personne disparaît des menus."
      : "La personne réapparaîtra dans les menus si son justificatif FLE est en règle.";
    if (!confirm(`${verbe} ${f.prenom ?? ""} ${f.nom} ?\n\n${detail}`)) return;
    setErreur(null);
    try {
      const r = await fetch("/api/equipe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, actif: !f.actif }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur lors de la mise à jour.");
      notifier(`${f.prenom ?? ""} ${f.nom} ${f.actif ? "désactivé·e" : "réactivé·e"}.`);
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de la mise à jour.");
    }
  }

  // ----- Commerciaux -----
  async function ajouterCommercial() {
    if (!nomC.trim() || !prenomC.trim()) { setErreur("Nom et prénom sont obligatoires."); return; }
    setEnCoursC(true); setErreur(null);
    try {
      const r = await fetch("/api/equipe/commerciaux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nomC.trim(), prenom: prenomC.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur lors de l'ajout.");
      setNomC(""); setPrenomC(""); setAjoutOuvertC(false);
      notifier(`${j.commercial.prenom ?? ""} ${j.commercial.nom} ajouté·e à l'équipe commerciale.`);
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de l'ajout.");
    } finally {
      setEnCoursC(false);
    }
  }

  async function basculerActifCommercial(c: Commercial) {
    const verbe = c.actif ? "Désactiver" : "Réactiver";
    const detail = c.actif
      ? "Sa fiche reste consultable (traçabilité), mais la personne est marquée inactive."
      : "La personne sera de nouveau marquée active.";
    if (!confirm(`${verbe} ${c.prenom ?? ""} ${c.nom} ?\n\n${detail}`)) return;
    setErreur(null);
    try {
      const r = await fetch("/api/equipe/commerciaux", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, actif: !c.actif }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur || "Erreur lors de la mise à jour.");
      notifier(`${c.prenom ?? ""} ${c.nom} ${c.actif ? "désactivé·e" : "réactivé·e"}.`);
      await charger();
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de la mise à jour.");
    }
  }

  const nbEnRegle = formatrices.filter((f) => f.actif && f.justificatif_fle).length;
  const nbManquants = formatrices.filter((f) => f.actif && !f.justificatif_fle).length;

  return (
    <main className="max-w-4xl mx-auto p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: BLEU }}>Équipe</h1>
        <p className="text-sm text-gray-600 mt-1">
          Rôles &amp; fonctions, formateurs et commerciaux de MYSTORY. Aucune suppression — on désactive (traçabilité 5 ans).
        </p>
      </header>

      {message && (
        <div className="mb-4 px-4 py-3 rounded border border-green-200 bg-green-50 text-green-800 text-sm">{message}</div>
      )}
      {erreur && (
        <div className="mb-4 px-4 py-3 rounded border border-red-200 bg-red-50 text-red-800 text-sm">{erreur}</div>
      )}

      {/* ===================== Section Rôles & responsabilités ===================== */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Rôles &amp; responsabilités</h2>
        <p className="text-sm text-gray-600 mb-4">
          Fonctions de l'équipe (Direction, pédagogie, secrétariat, communication…). Affichage en lecture seule —
          la gestion des comptes et des accès se fait dans <span className="font-medium">Comptes &amp; accès</span> (réservé à la Direction).
        </p>

        {chargement ? (
          <p className="text-gray-500">Chargement…</p>
        ) : membres.length === 0 ? (
          <p className="text-gray-500">Aucun compte enregistré pour l'instant.</p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Membre</th>
                  <th className="px-4 py-3 font-medium">Fonction</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {membres.map((m) => (
                  <tr key={m.id} className={`border-t ${m.actif ? "" : "opacity-50 bg-gray-50"}`}>
                    <td className="px-4 py-3 font-medium">{m.prenom ? `${m.prenom} ` : ""}{m.nom}</td>
                    <td className="px-4 py-3">{fonctionLabel(m.role)}</td>
                    <td className="px-4 py-3">{m.actif ? "Actif" : "Inactif"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===================== Section Formateurs ===================== */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Formateurs</h2>
        <p className="text-sm text-gray-600 mb-4">
          Toute personne affichée « formatrice » sur un document stagiaire doit avoir un justificatif FLE au dossier.
          Seuls les profils <strong>actifs ✅</strong> apparaissent dans le formulaire d'inscription.
        </p>

        {/* Compteurs */}
        <div className="flex gap-3 mb-6 text-sm">
          <span className="px-3 py-1.5 rounded-full bg-green-50 text-green-800 border border-green-200">
            ✅ {nbEnRegle} en règle
          </span>
          <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            ⏳ {nbManquants} justificatif{nbManquants > 1 ? "s" : ""} manquant{nbManquants > 1 ? "s" : ""}
          </span>
        </div>

        {/* Ajout formateur */}
        <div className="mb-6">
          {!ajoutOuvert ? (
            <button
              onClick={() => setAjoutOuvert(true)}
              className="px-4 py-2 rounded text-white font-medium"
              style={{ background: BLEU }}
            >
              + Ajouter un formateur
            </button>
          ) : (
            <div className="border rounded p-4 bg-gray-50 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="block mb-1 font-medium">Prénom</span>
                <input value={prenom} onChange={(e) => setPrenom(e.target.value)}
                       className="border rounded px-3 py-2 w-44" placeholder="Prénom" />
              </label>
              <label className="text-sm">
                <span className="block mb-1 font-medium">Nom</span>
                <input value={nom} onChange={(e) => setNom(e.target.value)}
                       className="border rounded px-3 py-2 w-44" placeholder="NOM" />
              </label>
              <button onClick={ajouter} disabled={enCours}
                      className="px-4 py-2 rounded text-white font-medium disabled:opacity-50"
                      style={{ background: BLEU }}>
                {enCours ? "Ajout…" : "Ajouter"}
              </button>
              <button onClick={() => { setAjoutOuvert(false); setNom(""); setPrenom(""); }}
                      className="px-4 py-2 rounded border text-gray-700">
                Annuler
              </button>
              <p className="w-full text-xs text-gray-500 m-0">
                La personne arrive en ⏳ — dépose ensuite son justificatif FLE pour la rendre éligible aux documents stagiaires.
              </p>
            </div>
          )}
        </div>

        {/* Input fichier caché, partagé par tous les boutons de dépôt */}
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
               className="hidden" onChange={fichierChoisi} />

        {/* Tableau formateurs */}
        {chargement ? (
          <p className="text-gray-500">Chargement…</p>
        ) : formatrices.length === 0 ? (
          <p className="text-gray-500">Aucun formateur pour l'instant — ajoute la première personne ci-dessus.</p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Formateur</th>
                  <th className="px-4 py-3 font-medium">Conformité FLE</th>
                  <th className="px-4 py-3 font-medium">Justificatif</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {formatrices.map((f) => (
                  <tr key={f.id} className={`border-t ${f.actif ? "" : "opacity-50 bg-gray-50"}`}>
                    <td className="px-4 py-3 font-medium">
                      {f.prenom ? `${f.prenom} ` : ""}{f.nom}
                    </td>
                    <td className="px-4 py-3">
                      {f.justificatif_fle ? (
                        <span className="text-green-700">✅ En règle</span>
                      ) : (
                        <span className="text-amber-700">⏳ Justificatif manquant</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.justificatif_lien ? (
                        <span>
                          <a href={f.justificatif_lien} target="_blank" rel="noreferrer"
                             className="underline" style={{ color: BLEU }}>
                            Voir la pièce
                          </a>
                          {f.justificatif_date && (
                            <span className="text-gray-500"> · déposée le {dateFr(f.justificatif_date)}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{f.actif ? "Actif" : "Inactif"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => ouvrirSelecteur(f.id)} disabled={uploadEnCours === f.id}
                              className="px-3 py-1.5 rounded border mr-2 disabled:opacity-50"
                              style={{ color: BLEU, borderColor: BLEU }}>
                        {uploadEnCours === f.id ? "Envoi…" : f.justificatif_fle ? "Remplacer la pièce" : "Déposer le justificatif"}
                      </button>
                      <button onClick={() => basculerActif(f)}
                              className="px-3 py-1.5 rounded border text-gray-700">
                        {f.actif ? "Désactiver" : "Réactiver"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===================== Section Commerciaux ===================== */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Commerciaux</h2>
        <p className="text-sm text-gray-600 mb-4">
          Équipe de développement commercial. Pas de justificatif FLE requis — simple suivi des membres.
        </p>

        {/* Ajout commercial */}
        <div className="mb-6">
          {!ajoutOuvertC ? (
            <button
              onClick={() => setAjoutOuvertC(true)}
              className="px-4 py-2 rounded text-white font-medium"
              style={{ background: BLEU }}
            >
              + Ajouter un commercial
            </button>
          ) : (
            <div className="border rounded p-4 bg-gray-50 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="block mb-1 font-medium">Prénom</span>
                <input value={prenomC} onChange={(e) => setPrenomC(e.target.value)}
                       className="border rounded px-3 py-2 w-44" placeholder="Prénom" />
              </label>
              <label className="text-sm">
                <span className="block mb-1 font-medium">Nom</span>
                <input value={nomC} onChange={(e) => setNomC(e.target.value)}
                       className="border rounded px-3 py-2 w-44" placeholder="NOM" />
              </label>
              <button onClick={ajouterCommercial} disabled={enCoursC}
                      className="px-4 py-2 rounded text-white font-medium disabled:opacity-50"
                      style={{ background: BLEU }}>
                {enCoursC ? "Ajout…" : "Ajouter"}
              </button>
              <button onClick={() => { setAjoutOuvertC(false); setNomC(""); setPrenomC(""); }}
                      className="px-4 py-2 rounded border text-gray-700">
                Annuler
              </button>
            </div>
          )}
        </div>

        {/* Tableau commerciaux */}
        {chargement ? (
          <p className="text-gray-500">Chargement…</p>
        ) : commerciaux.length === 0 ? (
          <p className="text-gray-500">Aucun commercial pour l'instant — ajoute la première personne ci-dessus.</p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Commercial</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {commerciaux.map((c) => (
                  <tr key={c.id} className={`border-t ${c.actif ? "" : "opacity-50 bg-gray-50"}`}>
                    <td className="px-4 py-3 font-medium">
                      {c.prenom ? `${c.prenom} ` : ""}{c.nom}
                    </td>
                    <td className="px-4 py-3">{c.actif ? "Actif" : "Inactif"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => basculerActifCommercial(c)}
                              className="px-3 py-1.5 rounded border text-gray-700">
                        {c.actif ? "Désactiver" : "Réactiver"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400 mt-4">
        Pas de suppression possible : une personne ayant participé à des dossiers ou des ventes doit rester
        consultable 5 ans (RGPD / audit). Utilise « Désactiver » pour les départs.
      </p>
    </main>
  );
}
