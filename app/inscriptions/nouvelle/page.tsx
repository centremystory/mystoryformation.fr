"use client";
// app/inscriptions/nouvelle/page.tsx — Nouvelle inscription formation
// Le bouton Enregistrer reste grisé tant que le dossier n'est pas 100 % conforme.
import { useEffect, useMemo, useState } from "react";
import {
  CATALOGUE, CRENEAUX, CodeFormule, Creneau, SeanceInput,
  validerInscription, validerPlanning, proposerPlanning,
} from "@/lib/inscriptions/regles";

const BLEU = "#2F72DE";
const JOURS = [
  { v: 1, l: "Lun" }, { v: 2, l: "Mar" }, { v: 3, l: "Mer" }, { v: 4, l: "Jeu" },
  { v: 5, l: "Ven" }, { v: 6, l: "Sam" }, { v: 0, l: "Dim" },
];

export default function NouvelleInscription() {
  const [form, setForm] = useState({
    civilite: "", nom: "", prenom: "", email: "", telephone: "",
    adresse: "", cp: "", ville: "", dateNaissance: "", villeNaissance: "",
    certification: "TEF_IRN" as const, financement: "CPF" as const,
    numeroEdof: "", dateCommandeValidee: "",
    formule: "16H" as CodeFormule, niveauVise: "B1" as const,
    agenceInscription: "GAGNY" as const, resteAChargeAccepte: false,
    declencherContractualisation: true, formatriceId: "", formatriceLibre: "",
    remise: 0, remiseMotif: "",
  });
  const [formatrices, setFormatrices] = useState<{ id: string; nom: string; prenom: string | null }[]>([]);
  useEffect(() => {
    fetch("/api/inscriptions").then(r => r.json())
      .then(d => setFormatrices(d.formatrices ?? [])).catch(() => {});
  }, []);
  const [seances, setSeances] = useState<SeanceInput[]>([]);
  const [gen, setGen] = useState({ premiere: "", creneau: "MATIN" as "MATIN" | "APRES_MIDI", jours: [2, 6] });
  const [envoi, setEnvoi] = useState<"idle" | "loading" | "ok" | "erreur">("idle");
  const [erreursApi, setErreursApi] = useState<string[]>([]);
  const [doublon, setDoublon] = useState<{ message: string; existant?: { nom: string; certif: string | null; statut: string | null; cree_le: string | null } } | null>(null);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const f = CATALOGUE[form.formule];
  const cpf = form.financement === "CPF";

  const vIns = useMemo(() => validerInscription({ ...form, numeroEdof: form.numeroEdof || null, dateCommandeValidee: form.dateCommandeValidee || null }), [form]);
  const vPlan = useMemo(() => validerPlanning(form.formule, seances, cpf ? form.dateCommandeValidee || null : null), [form.formule, seances, form.dateCommandeValidee, cpf]);
  const totalH = seances.reduce((s, x) => s + CRENEAUX[x.creneau].heures, 0);
  const conforme = vIns.ok && vPlan.ok && !!form.formatriceId;
  // EDOF facultatif à la saisie : on peut enregistrer sans, mais on ne peut pas envoyer
  // la convention tant que le N° EDOF et la date de validation manquent (gate de conformité).
  const edofIncomplet = cpf && (!form.numeroEdof.trim() || !form.dateCommandeValidee);
  const avertissements = [...vIns.avertissements, ...vPlan.avertissements];

  const genererPlan = () => {
    if (!gen.premiere || gen.jours.length === 0) return;
    setSeances(proposerPlanning(form.formule, gen.premiere, gen.creneau, gen.jours));
  };
  const majSeance = (i: number, patch: Partial<SeanceInput>) =>
    setSeances(s => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const enregistrer = async (confirmerDoublon = false) => {
    setEnvoi("loading"); setErreursApi([]); setDoublon(null);
    const res = await fetch("/api/inscriptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stagiaire: { civilite: form.civilite, adresse: form.adresse, cp: form.cp, ville: form.ville,
                     dateNaissance: form.dateNaissance, villeNaissance: form.villeNaissance },
        inscription: { ...form, declencherContractualisation: form.declencherContractualisation && !edofIncomplet, confirmerDoublon }, seances,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) { setEnvoi("ok"); return; }
    if (data.doublon) { setEnvoi("erreur"); setDoublon({ message: data.message, existant: data.existant }); return; }
    setEnvoi("erreur"); setErreursApi(data.erreurs ?? ["Erreur serveur."]);
  };

  if (envoi === "ok") return (
    <main className="max-w-2xl mx-auto p-8 text-center space-y-4">
      <div className="text-5xl">✅</div>
      <h1 className="page-title">Inscription enregistrée</h1>
      <p>{form.declencherContractualisation
        ? "Dossier créé et conforme — la convention part automatiquement en signature DocuSeal (le stagiaire la reçoit par email dans quelques minutes)."
        : "Dossier créé et conforme. La convention partira quand tu déclencheras la contractualisation depuis la fiche dossier."}</p>
      <a href="/inscriptions/nouvelle" className="btn-primary"
         onClick={() => location.reload()}>Nouvelle inscription</a>
    </main>
  );

  const champ = "border rounded px-2 py-1.5 w-full text-sm";
  const label = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="page-title">Nouvelle inscription — Formation</h1>

      {/* Identité */}
      <section className="bg-white border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label className={label}>Civilité</label>
          <select className={champ} value={form.civilite} onChange={e => set("civilite", e.target.value)}>
            <option value="">—</option><option>Madame</option><option>Monsieur</option><option>Autre</option></select></div>
        <div><label className={label}>NOM *</label><input className={champ} value={form.nom} onChange={e => set("nom", e.target.value.toUpperCase())} /></div>
        <div><label className={label}>Prénom *</label><input className={champ} value={form.prenom} onChange={e => set("prenom", e.target.value)} /></div>
        <div><label className={label}>Téléphone *</label><input className={champ} value={form.telephone} onChange={e => set("telephone", e.target.value)} placeholder="06 12 34 56 78" /></div>
        <div className="col-span-2"><label className={label}>Email *</label><input className={champ} value={form.email} onChange={e => set("email", e.target.value)} /></div>
        <div className="col-span-2"><label className={label}>Adresse</label><input className={champ} value={form.adresse} onChange={e => set("adresse", e.target.value)} /></div>
        <div><label className={label}>CP</label><input className={champ} value={form.cp} onChange={e => set("cp", e.target.value)} /></div>
        <div><label className={label}>Ville</label><input className={champ} value={form.ville} onChange={e => set("ville", e.target.value)} /></div>
        <div><label className={label}>Date de naissance</label><input type="date" className={champ} value={form.dateNaissance} onChange={e => set("dateNaissance", e.target.value)} /></div>
        <div><label className={label}>Ville de naissance</label><input className={champ} value={form.villeNaissance} onChange={e => set("villeNaissance", e.target.value)} /></div>
      </section>

      {/* Dossier */}
      <section className="bg-white border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label className={label}>Certification</label>
          <select className={champ} value={form.certification} onChange={e => set("certification", e.target.value)}>
            <option value="TEF_IRN">TEF IRN</option><option value="LEVELTEL">LEVELTEL</option></select></div>
        <div><label className={label}>Formule *</label>
          <select className={champ} value={form.formule} onChange={e => { set("formule", e.target.value); setSeances([]); }}>
            {Object.values(CATALOGUE).map(x => <option key={x.code} value={x.code}>{x.libelle}</option>)}</select></div>
        <div><label className={label}>Niveau visé</label>
          <select className={champ} value={form.niveauVise} onChange={e => set("niveauVise", e.target.value)}>
            <option>A1</option><option>A2</option><option>B1</option><option>B2</option></select></div>
        <div><label className={label}>Agence d'inscription (interne)</label>
          <select className={champ} value={form.agenceInscription} onChange={e => set("agenceInscription", e.target.value)}>
            <option value="GAGNY">Gagny</option><option value="SARCELLES">Sarcelles</option><option value="ROSNY">Rosny</option></select></div>
        <div><label className={label}>Formatrice référente *</label>
          <select className={champ} value={form.formatriceId} onChange={e => set("formatriceId", e.target.value)}>
            <option value="">— choisir —</option>
            {formatrices.map(fm => <option key={fm.id} value={fm.id}>{fm.prenom ? `${fm.prenom} ${fm.nom}` : fm.nom}</option>)}
          </select>
          {formatrices.length === 0 && <p className="text-xs text-red-600 mt-1">Aucune formatrice active avec justificatif FLE — à compléter dans la table formatrices.</p>}
        </div>
        <div className="col-span-2">
          <label className={label}>Formatrice indépendante intervenante <span className="font-normal text-gray-500">(facultatif)</span></label>
          <input className={champ} value={form.formatriceLibre} onChange={e => set("formatriceLibre", e.target.value)}
                 placeholder="ex. Lavania (Queeness), IFIE Formation…" />
          {form.formatriceLibre.trim() && (
            <p className="text-xs text-amber-700 mt-1">⚠️ Conformité : le justificatif FLE et la charte/contrat de cette intervenante doivent être au dossier (suivi côté Formateurs). La formatrice référente FLE ci-dessus reste obligatoire.</p>
          )}
        </div>
        <div><label className={label}>Financement *</label>
          <select className={champ} value={form.financement} onChange={e => { const v = e.target.value; set("financement", v); if (v === "CPF") { set("remise", 0); set("remiseMotif", ""); } }}>
            <option value="CPF">CPF</option><option value="Perso">Fonds propres (Perso)</option>
            <option value="OPCO">OPCO</option><option value="PoleEmploi">France Travail (Pôle Emploi)</option></select></div>
        {!cpf && <>
          <div><label className={label}>Remise (€) <span className="font-normal text-gray-500">(hors CPF)</span></label>
            <input type="number" min={0} step="1" className={champ} value={form.remise}
                   onChange={e => set("remise", Math.max(0, Number(e.target.value) || 0))} /></div>
          <div className="col-span-2"><label className={label}>Motif de la remise <span className="font-normal text-gray-500">(traçabilité)</span></label>
            <input className={champ} value={form.remiseMotif} onChange={e => set("remiseMotif", e.target.value)} placeholder="ex. geste commercial, tarif partenaire…" /></div>
        </>}
        {cpf && <>
          <div><label className={label}>N° dossier EDOF <span className="font-normal text-gray-500">(facultatif — complété ensuite via l'import EDOF)</span></label><input className={champ} value={form.numeroEdof} onChange={e => set("numeroEdof", e.target.value)} /></div>
          <div className="col-span-2"><label className={label}>Date validation commande EDOF <span className="font-normal text-gray-500">(facultatif — complétée ensuite ; déclenche le délai de 11 j ouvrés)</span></label>
            <input type="date" className={champ} value={form.dateCommandeValidee} onChange={e => set("dateCommandeValidee", e.target.value)} /></div>
        </>}
        <div className="col-span-2 md:col-span-4 text-sm text-gray-600">
          💶 {f.prixEuros} €{(!cpf && form.remise > 0) ? ` − ${form.remise} € remise = ${Math.max(0, f.prixEuros - form.remise)} € net` : ""} — {f.dureeHeures} h · {f.seances3h} × 3h{f.seanceFinaleHeures ? ` + finale ${f.seanceFinaleHeures}h` : ""} · {f.descriptionFinale}
        </div>
      </section>

      {/* Planning */}
      <section className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Planning des séances</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${totalH === f.dureeHeures ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {totalH} h / {f.dureeHeures} h
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3 bg-gray-50 rounded p-3">
          <div><label className={label}>1re séance</label>
            <input type="date" className={champ} value={gen.premiere} onChange={e => setGen(g => ({ ...g, premiere: e.target.value }))} /></div>
          <div><label className={label}>Créneau</label>
            <select className={champ} value={gen.creneau} onChange={e => setGen(g => ({ ...g, creneau: e.target.value as any }))}>
              <option value="MATIN">Matin 9h30–12h30</option><option value="APRES_MIDI">Après-midi 14h–17h</option></select></div>
          <div><label className={label}>Jours de cours</label>
            <div className="flex gap-1">{JOURS.map(j => (
              <button key={j.v} type="button"
                className={`px-2 py-1 rounded text-xs border ${gen.jours.includes(j.v) ? "text-white" : "bg-white"}`}
                style={gen.jours.includes(j.v) ? { background: BLEU } : {}}
                onClick={() => setGen(g => ({ ...g, jours: g.jours.includes(j.v) ? g.jours.filter(x => x !== j.v) : [...g.jours, j.v] }))}>
                {j.l}</button>))}</div></div>
          <button type="button" onClick={genererPlan} className="btn-primary">
            ⚡ Générer un plan conforme</button>
        </div>
        {seances.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500">
              <th className="py-1">#</th><th>Date</th><th>Créneau</th><th>Heures</th><th></th></tr></thead>
            <tbody>{seances.map((s, i) => (
              <tr key={i} className="border-t">
                <td className="py-1">{i + 1}</td>
                <td><input type="date" className="border rounded px-1 py-0.5" value={s.date} onChange={e => majSeance(i, { date: e.target.value })} /></td>
                <td className="flex gap-1 items-center py-1">
                  <select className="border rounded px-1 py-0.5" value={s.creneau}
                    onChange={e => majSeance(i, { creneau: e.target.value as Creneau,
                      demiJournee: e.target.value.startsWith("FINALE") ? (s.demiJournee ?? "MATIN") : undefined })}>
                    {Object.entries(CRENEAUX).map(([k, c]) => <option key={k} value={k}>{c.libelle}</option>)}</select>
                  {s.creneau.startsWith("FINALE") && (
                    <select className="border rounded px-1 py-0.5" value={s.demiJournee ?? "MATIN"}
                      onChange={e => majSeance(i, { demiJournee: e.target.value as any })}>
                      <option value="MATIN">sur créneau matin</option>
                      <option value="APRES_MIDI">sur créneau après-midi</option>
                    </select>)}
                </td>
                <td>{CRENEAUX[s.creneau].heures} h</td>
                <td><button type="button" className="text-red-500" onClick={() => setSeances(x => x.filter((_, j) => j !== i))}>✕</button></td>
              </tr>))}</tbody>
          </table>
        )}
      </section>

      {/* Verdict */}
      {(!vIns.ok || !vPlan.ok || !form.formatriceId) && (
        <section className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-bold text-red-700 mb-1">⛔ Dossier non conforme — enregistrement bloqué</h3>
          <ul className="list-disc ml-5 text-sm text-red-700">
            {[...vIns.erreurs, ...vPlan.erreurs,
              ...(!form.formatriceId ? ["Formatrice référente obligatoire (justificatif FLE requis)."] : [])
             ].map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </section>
      )}
      {avertissements.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-1">⏳ À compléter avant les documents officiels</h3>
          <ul className="list-disc ml-5 text-sm text-amber-800">
            {avertissements.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}
      {erreursApi.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {erreursApi.map((e, i) => <p key={i}>{e}</p>)}
        </section>
      )}

      {doublon && (
        <section className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-900">
          <h3 className="font-semibold mb-1">⚠️ Doublon possible</h3>
          <p>{doublon.message}</p>
          {doublon.existant && (
            <p className="mt-1 text-amber-800">
              Dossier existant : <b>{doublon.existant.nom || "—"}</b>
              {doublon.existant.certif ? ` · ${doublon.existant.certif}` : ""}
              {doublon.existant.statut ? ` · ${doublon.existant.statut}` : ""}
              {doublon.existant.cree_le ? ` · créé le ${new Date(doublon.existant.cree_le).toLocaleDateString("fr-FR")}` : ""}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => { setDoublon(null); setEnvoi("idle"); }}
              className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-800 text-sm font-medium">
              Annuler — c'est bien un doublon
            </button>
            <button onClick={() => enregistrer(true)} disabled={envoi === "loading"}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">
              {envoi === "loading" ? "Création…" : "J'ai vérifié — créer quand même"}
            </button>
          </div>
        </section>
      )}

      <label className={`flex items-center gap-2 rounded-lg p-3 text-sm ${edofIncomplet ? "bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed" : "bg-blue-50 border border-blue-200 cursor-pointer"}`}>
        <input type="checkbox" disabled={edofIncomplet}
          checked={form.declencherContractualisation && !edofIncomplet}
          onChange={e => set("declencherContractualisation", e.target.checked)} />
        <span>🚀 <b>Envoyer la convention en signature dès l'enregistrement</b> — {edofIncomplet
          ? "disponible une fois le N° EDOF et la date de validation complétés (la convention officielle exige l'EDOF)."
          : "la validation EDOF étant faite, la convention + annexes partent automatiquement au stagiaire via DocuSeal. Décocher pour différer."}</span>
      </label>

      <button disabled={!conforme || envoi === "loading"} onClick={() => enregistrer()}
        className="w-full py-3 rounded-lg text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: conforme ? "#16a34a" : "#9ca3af" }}>
        {envoi === "loading" ? "Enregistrement…" : conforme ? "✅ Enregistrer l'inscription (dossier conforme)" : "Compléter le dossier pour enregistrer"}
      </button>
    </main>
  );
}
