// app/classement/page.tsx
// Classement vendeurs EXAMENS par agence — lit le cache calculé chaque soir à 19h par n8n.
// Règle : prime 2 % acquise à l'encaissement · CPF / remboursé / annulé = sans prime.
"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";

type Vendeur = { vendeur: string; ventes: number; ca: number; prime_acquise: number; prime_attente: number };
type Agence = { nom: string; vendeurs: Vendeur[]; totaux: { ventes: number; ca: number; prime_acquise: number; prime_attente: number } };
type Classement = {
  periode_debut: string;
  periode_fin: string;
  maj_le: string;
  payload: {
    agences: Agence[];
    total_centre: { ventes: number; ca: number; prime_acquise: number; prime_attente: number };
    regle?: string;
  };
};

const MEDAILLES = ["🥇", "🥈", "🥉"];

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
}
function dateFR(iso: string) {
  const [a, m, j] = (iso || "").split("-");
  return a && m && j ? `${j}/${m}/${a}` : iso;
}

export default function ClassementPage() {
  const [classement, setClassement] = useState<Classement | null>(null);
  const [message, setMessage] = useState<string>("");
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/classement")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.classement) setClassement(d.classement);
        else setMessage(d.message || d.erreur || "Classement indisponible.");
      })
      .catch(() => setMessage("Impossible de charger le classement."))
      .finally(() => setChargement(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">🏆 Classement vendeurs — Examens</h1>

        {classement && (
          <p className="mt-1 text-sm text-gray-600">
            Primes du trimestre du <strong>{dateFR(classement.periode_debut)}</strong> au{" "}
            <strong>{dateFR(classement.periode_fin)}</strong> · prime 2 % acquise à l'encaissement (CPF / remboursé /
            annulé = sans prime) · mise à jour{" "}
            {new Date(classement.maj_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
          </p>
        )}

        {chargement && <p className="mt-8 text-gray-500">Chargement…</p>}
        {!chargement && !classement && (
          <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">{message}</div>
        )}

        {classement && (
          <>
            {/* Total centre */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Tuile titre="Ventes examens" valeur={String(classement.payload.total_centre.ventes)} />
              <Tuile titre="CA total" valeur={eur(classement.payload.total_centre.ca)} />
              <Tuile titre="Primes acquises" valeur={eur(classement.payload.total_centre.prime_acquise)} accent />
              <Tuile titre="Primes en attente" valeur={eur(classement.payload.total_centre.prime_attente)} />
            </div>

            {/* Une carte par agence */}
            {classement.payload.agences.map((a) => (
              <section key={a.nom} className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-3" style={{ backgroundColor: "#2F72DE" }}>
                  <h2 className="font-semibold text-white">{a.nom === "AUTRES" ? "🌍 " : "🏢 "}{a.nom}</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="px-5 py-2 font-medium">Rang</th>
                      <th className="px-5 py-2 font-medium">Vendeur</th>
                      <th className="px-5 py-2 text-right font-medium">Ventes</th>
                      <th className="px-5 py-2 text-right font-medium">CA</th>
                      <th className="px-5 py-2 text-right font-medium">Prime acquise</th>
                      <th className="px-5 py-2 text-right font-medium">Prime en attente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let rang = 0;
                      return a.vendeurs.map((v) => {
                        const label = v.prime_acquise > 0 ? MEDAILLES[rang] || String(rang + 1) : "—";
                        if (v.prime_acquise > 0) rang += 1;
                        return (
                          <tr key={v.vendeur} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                            <td className="px-5 py-2 text-lg">{label}</td>
                            <td className="px-5 py-2 font-medium text-gray-900">{v.vendeur}</td>
                            <td className="px-5 py-2 text-right">{v.ventes}</td>
                            <td className="px-5 py-2 text-right">{eur(v.ca)}</td>
                            <td className="px-5 py-2 text-right font-semibold text-green-700">{eur(v.prime_acquise)}</td>
                            <td className="px-5 py-2 text-right text-amber-600">{eur(v.prime_attente)}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-gray-900">
                      <td className="px-5 py-2" colSpan={2}>TOTAL {a.nom}</td>
                      <td className="px-5 py-2 text-right">{a.totaux.ventes}</td>
                      <td className="px-5 py-2 text-right">{eur(a.totaux.ca)}</td>
                      <td className="px-5 py-2 text-right text-green-700">{eur(a.totaux.prime_acquise)}</td>
                      <td className="px-5 py-2 text-right text-amber-600">{eur(a.totaux.prime_attente)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            ))}

            <p className="mt-6 text-xs text-gray-400">
              Source : Suivi des ventes examens (Google Sheet) · calcul quotidien à 19h par le robot n8n « Classement
              vendeurs AUTO » · la trace de chaque mise à jour est conservée dans le journal du CRM.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Tuile({ titre, valeur, accent }: { titre: string; valeur: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">{titre}</div>
      <div className={`mt-1 text-xl font-bold ${accent ? "text-green-700" : "text-gray-900"}`}>{valeur}</div>
    </div>
  );
}
