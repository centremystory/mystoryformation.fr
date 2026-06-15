// app/page.tsx — Accueil du CRM : tableau de bord à deux espaces (Formation / Examen)
// Compteurs temps réel (lecture seule, service_role côté serveur) + deux grandes portes + transverse.
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { conformiteFormateurs } from "@/lib/conformiteFormateurs";

export const dynamic = "force-dynamic";

async function compter() {
  const zero = { enCours: 0, complets: 0, aRelancer: 0, fleOk: 0, fleTotal: 0 };
  try {
    const [incomplets, complets, relances, formatrices] = await Promise.all([
      supabaseAdmin.from("dossiers").select("id", { count: "exact", head: true }).eq("statut", "incomplet"),
      supabaseAdmin.from("dossiers").select("id", { count: "exact", head: true }).eq("statut", "complet"),
      supabaseAdmin.from("v_conventions_a_relancer").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("formatrices").select("justificatif_fle").eq("actif", true),
    ]);
    const actives = formatrices.data ?? [];
    return {
      enCours: incomplets.count ?? 0,
      complets: complets.count ?? 0,
      aRelancer: relances.count ?? 0,
      fleOk: actives.filter((f) => f.justificatif_fle).length,
      fleTotal: actives.length,
    };
  } catch {
    return zero; // le tableau de bord s'affiche même si la base est indisponible
  }
}

async function aTraiter() {
  const zero = { participation: 0, identite: 0, conges: 0, messages: 0, formateurDocs: 0, incidents: 0 };
  try {
    const estCpf = (d: any) => d.financement === "CPF" || d.origine_fonds === "CPF_CDC";
    const [dossiers, conges, messages, fdocs] = await Promise.all([
      supabaseAdmin.from("dossiers").select("financement, origine_fonds, participation_forfaitaire_reglee, participation_forfaitaire_exemptee, cpf_identite_ok"),
      supabaseAdmin.from("conges").select("id", { count: "exact", head: true }).eq("statut", "en_attente"),
      supabaseAdmin.from("messages_prospects").select("id", { count: "exact", head: true }).eq("statut", "nouveau"),
      supabaseAdmin.from("formateur_documents").select("id", { count: "exact", head: true }).eq("statut", "envoye_a_signer"),
    ]);
    const incidents = await supabaseAdmin.from("incidents_techniques").select("id", { count: "exact", head: true }).eq("resolu", false);
    const cpf = (dossiers.data ?? []).filter(estCpf);
    return {
      participation: cpf.filter((d: any) => !d.participation_forfaitaire_reglee && !d.participation_forfaitaire_exemptee).length,
      identite: cpf.filter((d: any) => !d.cpf_identite_ok).length,
      conges: conges.count ?? 0,
      messages: messages.count ?? 0,
      formateurDocs: fdocs.count ?? 0,
      incidents: incidents.count ?? 0,
    };
  } catch { return zero; }
}

function Compteur({ libelle, valeur, accent }: { libelle: string; valeur: string; accent?: "ambre" | "vert" }) {
  const couleur = accent === "ambre" ? "text-amber-600" : accent === "vert" ? "text-emerald-700" : "text-gray-900";
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{libelle}</p>
      <p className={`text-2xl font-semibold ${couleur}`}>{valeur}</p>
    </div>
  );
}

export default async function Accueil() {
  const [c, t, cf] = await Promise.all([compter(), aTraiter(), conformiteFormateurs()]);
  const actions = [
    { label: "Conventions à relancer", n: c.aRelancer, href: "/formation" },
    { label: "Participations 150 € à régler", n: t.participation, href: "/formation" },
    { label: "Identités CPF à confirmer", n: t.identite, href: "/formation" },
    { label: "Congés en attente", n: t.conges, href: "/conges" },
    { label: "Messages prospects", n: t.messages, href: "/messages" },
    { label: "Documents formateur à signer", n: t.formateurDocs, href: "/formateurs" },
    { label: "Formatrices sans justificatif FLE (séance à venir)", n: cf.fleManquant.length, href: "/equipe" },
    { label: "Charte/contrat formateur à signer (séance à venir)", n: cf.docsManquant.length, href: "/formateurs" },
    { label: "Incidents techniques", n: t.incidents, href: "/incidents" },
  ].filter((a) => a.n > 0);
  const heure = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit" });
  const salut = parseInt(heure) < 18 ? "Bonjour" : "Bonsoir";

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <header className="flex items-center gap-3 mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/embleme-bleu.png" alt="MYSTORY" className="h-11 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{salut} 👋</h1>
          <p className="text-sm text-gray-500">Tableau de bord MYSTORY — Formation &amp; Examen.</p>
        </div>
      </header>

      {/* Compteurs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Compteur libelle="Dossiers en cours" valeur={String(c.enCours)} />
        <Compteur libelle="Dossiers complets" valeur={String(c.complets)} accent="vert" />
        <Compteur libelle="Conventions à relancer" valeur={String(c.aRelancer)} accent={c.aRelancer > 0 ? "ambre" : undefined} />
        <Compteur libelle="Formatrices en règle" valeur={`${c.fleOk} / ${c.fleTotal}`} accent={c.fleOk === c.fleTotal ? "vert" : "ambre"} />
      </div>

      {/* À traiter */}
      <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">À traiter</p>
      {actions.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-8 text-sm text-emerald-800">Tout est à jour ✅</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {actions.map((a) => (
            <Link key={a.label} href={a.href}
              className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-4 py-3 hover:border-mystory transition-colors">
              <span className="text-sm text-gray-700">{a.label}</span>
              <span className="text-sm font-semibold text-amber-600 bg-amber-50 rounded-full px-2.5 py-0.5">{a.n}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Deux grandes portes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl p-6 bg-mystory-clair border border-transparent">
          <div className="text-3xl">🎓</div>
          <p className="text-xl font-bold text-gray-900 mt-2">Espace Formation</p>
          <p className="text-sm text-gray-600 mt-1">
            Inscriptions, suivi des dossiers, tests de positionnement, émargement, import EDOF.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/formation" className="px-4 py-2 rounded-lg bg-white text-mystory border border-mystory text-sm font-medium hover:bg-mystory hover:text-white transition-colors">
              Ouvrir l'espace
            </Link>
            <Link href="/inscriptions/nouvelle" className="px-4 py-2 rounded-lg bg-mystory text-white text-sm font-medium hover:opacity-90 transition-opacity">
              ＋ Inscription Formation
            </Link>
          </div>
        </div>

        <div className="rounded-2xl p-6 bg-mystory-clair border border-transparent">
          <div className="text-3xl">📝</div>
          <p className="text-xl font-bold text-gray-900 mt-2">Espace Examen</p>
          <p className="text-sm text-gray-600 mt-1">
            Inscriptions, sessions, jour J, corrections, classement des vendeurs — centre d'examen : Gagny.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/examen" className="px-4 py-2 rounded-lg bg-white text-mystory border border-mystory text-sm font-medium hover:bg-mystory hover:text-white transition-colors">
              Ouvrir l'espace
            </Link>
            <Link href="/examens/vente" className="px-4 py-2 rounded-lg bg-mystory text-white text-sm font-medium hover:opacity-90 transition-opacity">
              ＋ Inscription Examen
            </Link>
          </div>
        </div>
      </div>

      {/* Transverse */}
      <p className="text-xs uppercase tracking-wide text-gray-400 mt-8 mb-2">Transverse</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/equipe"
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">👥</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">Équipe</p>
          <p className="text-sm text-gray-500 mt-1">Formateurs (justificatifs FLE) et commerciaux.</p>
        </Link>
        <Link href="/factures"
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">🧾</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">Factures</p>
          <p className="text-sm text-gray-500 mt-1">Facturation et relances.</p>
        </Link>
        <Link href="/bpf"
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">📊</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">BPF</p>
          <p className="text-sm text-gray-500 mt-1">Bilan pédagogique et financier.</p>
        </Link>
        <Link href="/taches"
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-mystory hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-lg bg-mystory-clair flex items-center justify-center text-mystory text-xl">✅</div>
          <p className="font-semibold text-gray-900 mt-3 group-hover:text-mystory">Tâches par agence</p>
          <p className="text-sm text-gray-500 mt-1">Le pense-bête opérationnel de chaque site.</p>
        </Link>
      </div>
    </main>
  );
}
