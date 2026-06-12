"use client";

/**
 * MYSTORY — /examens/corrections (§2.6).
 * N° d'attestation → champ à corriger (menus adaptés au champ et au type d'examen)
 * → nouvelle valeur → renvoi des documents « (corrigée) » par email.
 * Chaque correction est inscrite au registre immuable et journalisée.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

const SOUS_TYPES_CIVIQUE = ["Carte de séjour pluriannuelle", "Carte de résident", "Naturalisation"];
const MOTIVATIONS_TEF = ["04. Intégration française", "05. Carte de séjour pluriannuelle", "06. Carte de résident en France", "10. Naturalisation française"];
const PLATEFORMES = ["Passetontef", "Prepcivique", "Prepmyfuture"];

const CHAMPS: Array<{ id: string; libelle: string; groupe: string }> = [
  { id: "nom", libelle: "Nom", groupe: "Identité" },
  { id: "prenom", libelle: "Prénom", groupe: "Identité" },
  { id: "civilite", libelle: "Civilité", groupe: "Identité" },
  { id: "date_naissance", libelle: "Date de naissance", groupe: "Identité" },
  { id: "email", libelle: "Email", groupe: "Identité" },
  { id: "telephone", libelle: "Téléphone", groupe: "Identité" },
  { id: "num_piece_identite", libelle: "N° étranger / pièce d'identité", groupe: "Identité" },
  { id: "session", libelle: "Session (date / horaire)", groupe: "Examen" },
  { id: "sous_type", libelle: "Sous-type / motivation", groupe: "Examen" },
  { id: "montant", libelle: "Montant", groupe: "Paiement" },
  { id: "mode_paiement", libelle: "Mode de paiement", groupe: "Paiement" },
  { id: "dont_cb", libelle: "Dont CB", groupe: "Paiement" },
  { id: "statut_paiement", libelle: "Statut du paiement", groupe: "Paiement" },
  { id: "reste_a_payer", libelle: "Reste à payer", groupe: "Paiement" },
  { id: "vendu_par", libelle: "Vendu par", groupe: "Vente" },
  { id: "agence", libelle: "Agence", groupe: "Vente" },
];

export default function PageCorrections() {
  const [numero, setNumero] = useState("MYS-2026-");
  const [vente, setVente] = useState<any>(null);
  const [historique, setHistorique] = useState<any[]>([]);
  const [champ, setChamp] = useState("");
  const [valeur, setValeur] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [renvoyer, setRenvoyer] = useState(true);
  const [demandePar, setDemandePar] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<any>(null);

  useEffect(() => { try { setDemandePar(localStorage.getItem("mystory_auteur") ?? ""); } catch {} }, []);
  useEffect(() => {
    if (champ !== "session" || !vente) return;
    fetch("/api/examens/sessions", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j.ok) setSessions(j.sessions.filter((s: any) => s.type === vente.type_examen)); })
      .catch(() => {});
  }, [champ, vente]);

  async function chercher() {
    setBusy(true); setErreur(null); setVente(null); setResultat(null); setChamp(""); setValeur("");
    try {
      const r = await fetch(`/api/examens/corrections?numero=${encodeURIComponent(numero.trim())}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erreur);
      setVente(j.vente); setHistorique(j.historique);
    } catch (e: any) { setErreur(e?.message ?? "Vente introuvable."); }
    finally { setBusy(false); }
  }

  async function corriger() {
    setBusy(true); setErreur(null); setResultat(null);
    try {
      const r = await fetch("/api/examens/corrections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_attestation: vente.numero_attestation, champ, nouvelle_valeur: valeur,
          demande_par: demandePar.trim(), renvoyer_documents: renvoyer,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error((j.recap ?? [j.erreur]).join(" "));
      try { if (demandePar.trim()) localStorage.setItem("mystory_auteur", demandePar.trim()); } catch {}
      setResultat(j);
      await chercher();
    } catch (e: any) { setErreur(e?.message ?? "Échec de la correction."); }
    finally { setBusy(false); }
  }

  const champStyle = "border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-full";

  function saisieValeur() {
    if (!vente) return null;
    const t = vente.type_examen;
    const select = (options: string[]) => (
      <select value={valeur} onChange={(e) => setValeur(e.target.value)} className={champStyle}>
        <option value="">—</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    switch (champ) {
      case "civilite": return select(["Madame", "Monsieur", "Autre"]);
      case "sous_type": return select(t === "Examen_civique" ? SOUS_TYPES_CIVIQUE : t === "TEF_IRN" ? MOTIVATIONS_TEF : PLATEFORMES);
      case "mode_paiement": return select(["Espèces", "CB", "Mixte"]);
      case "statut_paiement": return select(["Payé", "Inclus CPF", "Acompte", "Remboursé", "Annulé"]);
      case "agence": return select(["Gagny", "Sarcelles", "Rosny"]);
      case "date_naissance": return <input type="date" value={valeur} onChange={(e) => setValeur(e.target.value)} className={champStyle} />;
      case "montant": case "dont_cb": case "reste_a_payer":
        return <input type="number" min={0} step="0.01" value={valeur} onChange={(e) => setValeur(e.target.value)} className={champStyle} />;
      case "session":
        return (
          <select value={valeur} onChange={(e) => setValeur(e.target.value)} className={champStyle}>
            <option value="">— Nouvelle session (même type) —</option>
            {sessions.map((s: any) => (
              <option key={s.id} value={s.id} disabled={s.restantes <= 0}>
                {s.date_examen} · {s.horaire} {s.restantes <= 0 ? "(COMPLET)" : `(${s.restantes} places)`}
              </option>
            ))}
          </select>
        );
      default:
        return <input value={valeur} onChange={(e) => setValeur(e.target.value)} className={champStyle} />;
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Corrections tracées</h1>
          <p className="text-sm text-gray-500">Chaque correction est inscrite au registre immuable · documents regénérés « (corrigée) »</p>
        </div>
        <Link href="/examens" className="px-4 py-2 rounded-lg text-sm border border-gray-300 bg-white text-gray-700">← Sessions</Link>
      </div>

      <div className="flex gap-2 mb-5">
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="MYS-2026-01508"
               className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white flex-1 font-mono" />
        <button onClick={chercher} disabled={busy} className="px-4 py-2 rounded-lg text-sm text-white bg-mystory disabled:opacity-50">
          {busy ? "…" : "Rechercher"}
        </button>
      </div>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2 text-sm mb-4">{erreur}</div>}
      {resultat && (
        <div className="bg-green-50 border border-green-200 text-green-900 rounded-lg px-4 py-3 text-sm mb-4">
          ✅ <strong>{resultat.champ}</strong> corrigé : « {resultat.ancienne_valeur ?? "—"} » → « {resultat.nouvelle_valeur} ».
          {resultat.cci_decoche && <span className="block">⚠️ Inscription CCI décochée — vérifier/modifier l'inscription côté CCI.</span>}
          <span className="block">
            {resultat.email?.envoye
              ? "📧 Documents corrigés renvoyés (« remplace la version précédente »)."
              : resultat.documents_regeneres?.length
                ? `Documents regénérés${resultat.email?.erreur ? ` — email non envoyé : ${resultat.email.erreur}` : " (renvoi non demandé)."}`
                : "Documents non regénérés."}
          </span>
        </div>
      )}

      {vente && (
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-gray-800">{vente.numero_attestation}</p>
            <p>👤 {vente.stagiaires?.civilite} {vente.stagiaires?.prenom} <strong>{vente.stagiaires?.nom}</strong> · {vente.stagiaires?.email} · {vente.stagiaires?.telephone}</p>
            <p>📝 {vente.type_examen === "TEF_IRN" ? "TEF IRN" : vente.type_examen === "Examen_civique" ? "Examen civique" : "Vente plateforme"}{vente.sous_type ? ` — ${vente.sous_type}` : ""}</p>
            {vente.sessions_examen && <p>📅 {vente.sessions_examen.date_examen} · {vente.sessions_examen.horaire} {vente.inscrit_cci ? "· ✓ CCI" : "· ⚠️ non inscrit CCI"}</p>}
            <p>💶 {vente.montant} € · {vente.mode_paiement} · {vente.statut_paiement}{Number(vente.reste_a_payer) > 0 ? ` (reste ${vente.reste_a_payer} €)` : ""} · vendu par {vente.vendu_par} ({vente.agence})</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">Champ à corriger
              <select value={champ} onChange={(e) => { setChamp(e.target.value); setValeur(""); }} className={`${champStyle} mt-1`}>
                <option value="">—</option>
                {["Identité", "Examen", "Paiement", "Vente"].map((g) => (
                  <optgroup key={g} label={g}>
                    {CHAMPS.filter((c) => c.groupe === g).map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            {champ && <label className="text-sm">Nouvelle valeur<div className="mt-1">{saisieValeur()}</div></label>}
          </div>

          {champ && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={renvoyer} onChange={(e) => setRenvoyer(e.target.checked)} />
                Renvoyer les documents corrigés par email
              </label>
              <input value={demandePar} onChange={(e) => setDemandePar(e.target.value)} placeholder="Demandé par (prénom)"
                     className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white w-44" />
              <button onClick={corriger} disabled={busy || !valeur || !demandePar.trim()}
                      className="px-4 py-2 rounded-lg text-sm text-white bg-mystory disabled:opacity-50">
                {busy ? "Correction…" : "Appliquer la correction"}
              </button>
            </div>
          )}

          {historique.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Historique des corrections</p>
              <ul className="space-y-1 text-sm">
                {historique.map((h: any) => (
                  <li key={h.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <strong>{h.champ_corrige}</strong> : « {h.ancienne_valeur ?? "—"} » → « {h.nouvelle_valeur ?? "—"} »
                    <span className="text-xs text-gray-400"> · {h.demande_par} · {new Date(h.horodatage).toLocaleString("fr-FR")}{h.documents_renvoyes ? " · 📧 documents renvoyés" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
