"use client";

// app/direction/page.tsx — Cockpit Direction : pilotage en un écran (activité, acquisition,
// finances), alimenté automatiquement depuis la base. Lecture seule. Réservé Direction/Manager.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Donnees = {
  periode: { debut: string; fin: string; agence: string | null };
  activite: { inscriptions: number; clotures: number; heuresDispensees: number; elevesEnFormation: number };
  acquisition: { prospects: number; inscriptions: number; ventesExamen: number; tauxConversion: number | null };
  finances: {
    facture: number; encaisse: number; aEncaisser: number;
    caExamens: number; resteExamens: number; parTypeExamen: Record<string, number>;
  };
};

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const TYPE_LABEL: Record<string, string> = { TEF_IRN: "TEF IRN", CIVIQUE: "Civique", civique: "Civique" };

function periodes() {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  const debutMoisDernier = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const finMoisDernier = new Date(now.getFullYear(), now.getMonth(), 0);
  const debutAnnee = new Date(now.getFullYear(), 0, 1);
  return {
    mois: { label: "Ce mois", debut: iso(debutMois), fin: iso(now) },
    mois_dernier: { label: "Mois dernier", debut: iso(debutMoisDernier), fin: iso(finMoisDernier) },
    annee: { label: "Cette année", debut: iso(debutAnnee), fin: iso(now) },
  };
}

function Stat({ libelle, valeur, note, href }: { libelle: string; valeur: string; note?: string; href?: string }) {
  const contenu = (
    <>
      <div className="text-xs text-gray-500">{libelle}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valeur}</div>
      {note && <div className="mt-0.5 text-[11px] text-gray-400">{note}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card !px-4 !py-3 block transition-colors hover:border-mystory hover:bg-gray-50">
        {contenu}
      </Link>
    );
  }
  return <div className="card !px-4 !py-3">{contenu}</div>;
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{titre}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </section>
  );
}

export default function DirectionPage() {
  const P = useMemo(periodes, []);
  const [periode, setPeriode] = useState<keyof ReturnType<typeof periodes>>("mois");
  const [agence, setAgence] = useState<string>("");
  const [data, setData] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const p = P[periode];
      const qs = new URLSearchParams({ debut: p.debut, fin: p.fin });
      if (agence) qs.set("agence", agence);
      const r = await fetch(`/api/direction?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setData(j as Donnees);
      else setErreur(j.erreur || "Chargement impossible.");
    } catch {
      setErreur("Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, [P, periode, agence]);
  useEffect(() => {
    charger();
  }, [charger]);

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <header className="page-header">
        <div>
          <h1 className="page-title">Cockpit Direction</h1>
          <p className="page-subtitle">Pilotage en un écran, alimenté automatiquement. Lieu de formation : <strong>Gagny</strong>.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-1.5">
          {(Object.keys(P) as (keyof typeof P)[]).map((k) => (
            <button key={k} onClick={() => setPeriode(k)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                periode === k ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{P[k].label}</button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {([["", "Toutes agences"], ["Gagny", "Gagny"], ["Sarcelles", "Sarcelles"], ["Rosny", "Rosny"]] as const).map(([v, l]) => (
            <button key={v || "all"} onClick={() => setAgence(v)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                agence === v ? "bg-mystory text-white border-mystory" : "bg-white text-gray-600 border-gray-300 hover:border-mystory hover:text-mystory"
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {erreur ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erreur}</div>
      ) : chargement || !data ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <>
          <p className="mb-4 text-xs text-gray-400">
            Période : {data.periode.debut} → {data.periode.fin}
            {data.periode.agence ? ` · ${data.periode.agence}` : " · toutes agences"}
          </p>

          <Bloc titre="Activité">
            <Stat libelle="Inscriptions formation" valeur={String(data.activite.inscriptions)} note="dossiers créés sur la période" href="/dossiers" />
            <Stat libelle="Dossiers clôturés" valeur={String(data.activite.clotures)} href="/dossiers?vue=complet" />
            <Stat libelle="Heures dispensées" valeur={`${data.activite.heuresDispensees} h`} note="séances émargées (durée réelle)" href="/suivi-eleves" />
            <Stat libelle="Élèves en formation" valeur={String(data.activite.elevesEnFormation)} note="en cours, instantané" href="/suivi-eleves" />
          </Bloc>

          <Bloc titre="Acquisition">
            <Stat libelle="Nouveaux prospects" valeur={String(data.acquisition.prospects)} note="messages reçus" href="/messages" />
            <Stat libelle="Inscriptions formation" valeur={String(data.acquisition.inscriptions)} href="/dossiers" />
            <Stat libelle="Ventes examen" valeur={String(data.acquisition.ventesExamen)} href="/examen" />
            <Stat
              libelle="Taux (indicatif)"
              valeur={data.acquisition.tauxConversion == null ? "—" : `${data.acquisition.tauxConversion} %`}
              note="inscriptions ÷ prospects"
            />
          </Bloc>

          <Bloc titre="Finances">
            <Stat libelle="Facturé (période)" valeur={eur(data.finances.facture)} note="hors annulations" href="/factures" />
            <Stat libelle="Encaissé (période)" valeur={eur(data.finances.encaisse)} note="d'après date de paiement" href="/factures" />
            <Stat libelle="À encaisser" valeur={eur(data.finances.aEncaisser)} note="encours total non réglé" href="/factures" />
            <Stat libelle="CA examens (période)" valeur={eur(data.finances.caExamens)} note="ventes TEF / civique" href="/examen" />
          </Bloc>

          {(data.finances.resteExamens > 0 || Object.keys(data.finances.parTypeExamen).length > 0) && (
            <div className="card !px-4 !py-3 text-sm text-gray-600">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {Object.entries(data.finances.parTypeExamen).map(([t, m]) => (
                  <span key={t}>{TYPE_LABEL[t] || t} : <strong className="tabular-nums">{eur(m)}</strong></span>
                ))}
                <span>Reste à encaisser examens : <strong className="tabular-nums">{eur(data.finances.resteExamens)}</strong></span>
              </div>
            </div>
          )}

          <p className="mt-6 text-[11px] leading-relaxed text-gray-400">
            Chiffres calculés en direct depuis le CRM (dossiers, émargements, factures, ventes d&apos;examen, messages prospects).
            « À encaisser » = total des factures émises non encore réglées, toutes périodes confondues.
            Le taux d&apos;acquisition est indicatif : les prospects ne sont pas rattachés à une agence.
          </p>
        </>
      )}
    </main>
  );
}
