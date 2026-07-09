"use client";
// app/formateurs/[id]/page.tsx — Fiche formateur individuelle
// Identité éditable (PATCH /api/formateurs existant, whitelist + journal), justificatif FLE
// (via la formatrice liée), documents charte/contrat DocuSeal (statut + envoi/relance),
// questionnaire administratif. Conformité : un formateur affiché sur un document stagiaire
// doit avoir un justificatif FLE au dossier — le voyant est mis en évidence.
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Doc = { id: string; type: string; statut: string; sign_url: string | null; signe_le: string | null; fichier_signe_path: string | null };
type Formateur = {
  id: string; civilite: string | null; prenom: string | null; nom: string | null;
  email: string | null; telephone: string | null; type: string | null;
  raison_sociale: string | null; siret: string | null; adresse: string | null;
  cree_le: string | null; actif: boolean | null; formatrice_id: string | null;
  formatrice: { id: string; nom: string; prenom: string | null; justificatif_fle: boolean | null } | null;
  formateur_documents: Doc[]; formateur_questionnaire: { id: string; horodatage: string; reponses: unknown }[];
};

const STATUT_DOC: Record<string, { label: string; cls: string }> = {
  envoye: { label: "Envoyé — en attente de signature", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  signe: { label: "Signé ✔", cls: "bg-green-50 text-green-700 border-green-200" },
};

function fdate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString("fr-FR") : "—";
}

export default function FicheFormateurPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [f, setF] = useState<Formateur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  async function charger() {
    const r = await fetch(`/api/formateurs/${id}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErreur(j.erreur ?? "Erreur"); return; }
    setF(j.formateur);
    setForm({
      civilite: j.formateur.civilite ?? "", prenom: j.formateur.prenom ?? "", nom: j.formateur.nom ?? "",
      email: j.formateur.email ?? "", telephone: j.formateur.telephone ?? "",
      raisonSociale: j.formateur.raison_sociale ?? "", siret: j.formateur.siret ?? "", adresse: j.formateur.adresse ?? "",
    });
  }
  useEffect(() => { charger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function enregistrer() {
    setBusy("save"); setInfo(null); setErreur(null);
    const r = await fetch("/api/formateurs", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...form }),
    });
    const j = await r.json(); setBusy(null);
    if (!r.ok || !j.ok) { setErreur(j.erreur ?? "Échec de l'enregistrement"); return; }
    setInfo("Identité enregistrée ✔ (tracé au journal)"); setEdit(false); charger();
  }

  async function envoyerDoc(type: "charte" | "contrat") {
    setBusy(type); setInfo(null); setErreur(null);
    const r = await fetch("/api/formateurs/envoyer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formateurId: id, type }),
    });
    const j = await r.json(); setBusy(null);
    if (!r.ok || !j.ok) { setErreur(j.erreur ?? "Échec de l'envoi"); return; }
    setInfo(`${type === "charte" ? "Charte" : "Contrat"} envoyé·e en signature ✔`); charger();
  }

  const docs = useMemo(() => {
    const par = new Map<string, Doc>();
    for (const d of f?.formateur_documents ?? []) par.set(d.type, d);
    return par;
  }, [f]);

  if (erreur && !f) return <main className="max-w-3xl mx-auto p-6"><p className="text-red-600 text-sm">{erreur}</p></main>;
  if (!f) return <main className="max-w-3xl mx-auto p-6"><p className="text-gray-400 text-sm">Chargement…</p></main>;

  const fleOk = f.formatrice?.justificatif_fle === true;
  const questionnaire = f.formateur_questionnaire?.[0];

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <button onClick={() => router.push("/formateurs")} className="text-xs text-gray-400 hover:text-gray-600">← Formateurs</button>
          <h1 className="text-xl font-bold text-gray-900">
            {[f.civilite, f.prenom, f.nom].filter(Boolean).join(" ") || "Formateur"}
            {f.actif === false && <span className="ml-2 text-xs font-semibold text-gray-400">(archivé)</span>}
          </h1>
          <p className="text-sm text-gray-500">
            {f.type === "societe" ? `Société${f.raison_sociale ? " · " + f.raison_sociale : ""}${f.siret ? " · SIRET " + f.siret : ""}` : "Indépendant·e"}
            {" · fiche créée le "}{fdate(f.cree_le)}
          </p>
        </div>
        <span className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold ${fleOk ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {fleOk ? "Justificatif FLE ✔" : "Justificatif FLE MANQUANT"}
        </span>
      </div>

      {erreur && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{erreur}</div>}
      {info && <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2">{info}</div>}

      {/* Identité */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Identité & contact</h2>
          {!edit ? (
            <button onClick={() => setEdit(true)} className="text-xs font-semibold text-blue-600">Modifier</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setEdit(false); charger(); }} className="text-xs text-gray-500">Annuler</button>
              <button onClick={enregistrer} disabled={busy === "save"} className="rounded-lg bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
                {busy === "save" ? "…" : "Enregistrer"}
              </button>
            </div>
          )}
        </div>
        {!edit ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-gray-400 text-xs">Email</dt><dd>{f.email ?? "—"}</dd></div>
            <div><dt className="text-gray-400 text-xs">Téléphone</dt><dd>{f.telephone ?? "—"}</dd></div>
            <div className="col-span-2"><dt className="text-gray-400 text-xs">Adresse</dt><dd>{f.adresse ?? "—"}</dd></div>
          </dl>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([["civilite","Civilité"],["prenom","Prénom"],["nom","Nom"],["email","Email"],["telephone","Téléphone"],["raisonSociale","Raison sociale"],["siret","SIRET"],["adresse","Adresse"]] as const).map(([k, label]) => (
              <input key={k} value={form[k] ?? ""} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                placeholder={label} className={`rounded-lg border border-gray-300 px-3 py-2 text-sm ${k === "adresse" ? "col-span-2" : ""}`} />
            ))}
          </div>
        )}
      </section>

      {/* Conformité FLE */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Qualification FLE (Qualiopi)</h2>
        {f.formatrice ? (
          <p className="mt-2 text-sm text-gray-600">
            Rattaché·e à la formatrice <span className="font-medium text-gray-900">{[f.formatrice.prenom, f.formatrice.nom].filter(Boolean).join(" ")}</span>
            {" — justificatif FLE : "}
            {fleOk ? <span className="font-semibold text-green-700">présent ✔</span> : <span className="font-semibold text-red-700">manquant ✖</span>}
            {" · "}<a href="/equipe" className="text-blue-600 underline">gérer sur la page Équipe</a>
          </p>
        ) : (
          <p className="mt-2 text-sm text-red-700">
            Aucune formatrice liée — ce formateur ne peut pas apparaître sur un document stagiaire.
            Liez-le depuis la <a href="/formateurs" className="underline">liste des formateurs</a>.
          </p>
        )}
        <p className="mt-1 text-xs text-gray-400">Rappel : toute personne affichée « formatrice » sur un document stagiaire doit avoir un justificatif FLE au dossier — sans exception.</p>
      </section>

      {/* Documents */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Documents contractuels (DocuSeal)</h2>
        <ul className="mt-3 space-y-2">
          {(["charte", "contrat"] as const).map((t) => {
            const d = docs.get(t);
            const st = d ? STATUT_DOC[d.statut] ?? { label: d.statut, cls: "bg-gray-50 text-gray-600 border-gray-200" } : null;
            return (
              <li key={t} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-800">{t === "charte" ? "Charte formateur" : "Contrat de prestation (confidentialité + RGPD)"}</span>
                  <div className="mt-0.5 text-xs">
                    {d ? (
                      <span className={`inline-block rounded border px-1.5 py-0.5 ${st!.cls}`}>
                        {st!.label}{d.signe_le ? ` le ${fdate(d.signe_le)}` : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">Jamais envoyé</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d?.sign_url && d.statut !== "signe" && (
                    <a href={d.sign_url} target="_blank" className="text-xs text-blue-600 underline">Lien de signature</a>
                  )}
                  {d?.statut !== "signe" && (
                    <button onClick={() => envoyerDoc(t)} disabled={busy === t}
                      className="rounded-lg bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
                      {busy === t ? "…" : d ? "Relancer" : "Envoyer"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Questionnaire */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-900">Questionnaire administratif</h2>
        {questionnaire ? (
          <p className="mt-2 text-sm text-gray-600">Rempli le {fdate(questionnaire.horodatage)} ✔ — les réponses ont alimenté la fiche.</p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Pas encore rempli — le lien est envoyé avec les documents.</p>
        )}
      </section>
    </main>
  );
}
