"use client";

/**
 * MYSTORY — « Émargement du jour » (tablette au centre de Gagny, accès équipe).
 * Pour chaque demi-journée : signature du stagiaire (sur tablette OU via QR sur son téléphone)
 * + signature de la formatrice. La demi-journée est validée quand les DEUX ont signé.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import SignaturePad from "@/components/SignaturePad";

type Seance = {
  id: string; dossier_id: string; certif: string | null; stagiaire: string;
  formatrice: string | null; demi_journee: string; heures: number; token: string;
  signe_stagiaire: boolean; signe_formatrice: boolean; emarge_le: string | null; statut: string;
};

const DEMI_LABEL: Record<string, string> = { matin: "Matin", apres_midi: "Après-midi" };

function parisToday(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
function parisDemiDefaut(): "matin" | "apres_midi" {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 13 ? "matin" : "apres_midi";
}

const BADGE: Record<string, { t: string; c: string }> = {
  complet: { t: "✅ Émargé", c: "bg-green-100 text-green-800" },
  attente_formatrice: { t: "🖊️ Attente formatrice", c: "bg-amber-100 text-amber-800" },
  attente_stagiaire: { t: "🖊️ Attente stagiaire", c: "bg-amber-100 text-amber-800" },
  a_faire: { t: "⬜ À émarger", c: "bg-gray-100 text-gray-600" },
};

export default function EmargementDuJour() {
  const [date, setDate] = useState(parisToday());
  const [demi, setDemi] = useState<"matin" | "apres_midi">(parisDemiDefaut());
  const [seances, setSeances] = useState<Seance[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sel, setSel] = useState<Seance | null>(null);

  const charger = useCallback(async () => {
    setChargement(true); setErreur(null);
    try {
      const r = await fetch(`/api/emargement/jour?date=${date}&demi=${demi}`);
      const j = await r.json();
      if (j.ok) setSeances(j.seances);
      else setErreur(j.erreur || "Lecture impossible.");
    } catch { setErreur("Lecture impossible."); }
    finally { setChargement(false); }
  }, [date, demi]);

  useEffect(() => { charger(); }, [charger]);

  // Rafraîchit la séance sélectionnée à partir de la liste rechargée.
  useEffect(() => {
    if (!sel) return;
    const maj = seances.find((s) => s.id === sel.id);
    if (maj) setSel(maj);
  }, [seances]); // eslint-disable-line react-hooks/exhaustive-deps

  const totaux = useMemo(() => {
    const total = seances.length;
    const faits = seances.filter((s) => s.statut === "complet").length;
    return { total, faits };
  }, [seances]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">🖊️ Émargement du jour</h1>
      <p className="mt-1 text-sm text-gray-500">
        Lieu : <b>Gagny</b> — signature stagiaire + formatrice par demi-journée. Présence horodatée au dépôt (anti-antidate).
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
               className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
          {(["matin", "apres_midi"] as const).map((d) => (
            <button key={d} onClick={() => setDemi(d)}
              className={`px-4 py-2 text-sm ${demi === d ? "bg-mystory text-white" : "bg-white text-gray-700"}`}>
              {DEMI_LABEL[d]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-gray-500">{totaux.faits}/{totaux.total} émargés</span>
      </div>

      {erreur && <p className="mt-4 text-sm text-red-600">{erreur}</p>}
      {chargement && <p className="mt-4 text-sm text-gray-400">Chargement…</p>}

      {!chargement && seances.length === 0 && (
        <p className="mt-8 text-center text-sm text-gray-400">Aucune séance sur ce créneau.</p>
      )}

      <ul className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
        {seances.map((s) => {
          const b = BADGE[s.statut] ?? BADGE.a_faire;
          return (
            <li key={s.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-gray-900">{s.stagiaire}</div>
                <div className="text-xs text-gray-500">
                  {DEMI_LABEL[s.demi_journee]} · {s.heures} h · {s.certif ?? ""} {s.formatrice ? `· ${s.formatrice}` : ""}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${b.c}`}>{b.t}</span>
              <button onClick={() => setSel(s)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                {s.statut === "complet" ? "Voir" : "Émarger"}
              </button>
            </li>
          );
        })}
      </ul>

      {sel && <ModaleEmargement seance={sel} onClose={() => setSel(null)} onMaj={charger} />}
    </main>
  );
}

function ModaleEmargement({ seance, onClose, onMaj }: { seance: Seance; onClose: () => void; onMaj: () => void }) {
  const [sigS, setSigS] = useState<string | null>(null);
  const [sigF, setSigF] = useState<string | null>(null);
  const [busy, setBusy] = useState<"stagiaire" | "formatrice" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [montrerQr, setMontrerQr] = useState(false);

  const lienQr = useMemo(
    () => `${window.location.origin}/emargement/signer?token=${seance.token}`,
    [seance.token],
  );

  useEffect(() => {
    if (montrerQr && !qr) {
      QRCode.toDataURL(lienQr, { width: 260, margin: 1 }).then(setQr).catch(() => setErreur("QR indisponible."));
    }
  }, [montrerQr, qr, lienQr]);

  async function signer(role: "stagiaire" | "formatrice", signature: string) {
    setBusy(role); setErreur(null);
    try {
      const r = await fetch("/api/emargement/signer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, seanceId: seance.id, signature }),
      });
      const j = await r.json();
      if (!j.ok) { setErreur(j.erreur || "Échec."); return; }
      onMaj();
    } catch { setErreur("Échec de l'enregistrement."); }
    finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 max-h-[92vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{seance.stagiaire}</h2>
            <p className="text-xs text-gray-500">{DEMI_LABEL[seance.demi_journee]} · {seance.heures} h · Gagny</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {seance.emarge_le && (
          <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            ✅ Demi-journée émargée — présence enregistrée.
          </div>
        )}

        {/* Signature du stagiaire */}
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-gray-800">1 · Signature du stagiaire</h3>
          {seance.signe_stagiaire ? (
            <p className="mt-1 text-sm text-green-700">✅ Signée</p>
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setMontrerQr((v) => !v)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                  {montrerQr ? "Masquer le QR" : "📱 QR pour le téléphone du stagiaire"}
                </button>
              </div>
              {montrerQr && (
                <div className="mt-3 flex flex-col items-center rounded-xl border border-gray-200 p-4">
                  {qr ? <img src={qr} alt="QR de signature" width={220} height={220} /> : <span className="text-xs text-gray-400">Génération du QR…</span>}
                  <p className="mt-2 text-center text-[11px] text-gray-500">Le stagiaire scanne, signe sur son téléphone, puis la formatrice contresigne ci-dessous.</p>
                </div>
              )}
              <p className="mt-3 text-xs text-gray-500">…ou signature directe sur la tablette :</p>
              <div className="mt-1"><SignaturePad onChange={setSigS} height={170} disabled={busy === "stagiaire"} /></div>
              <button onClick={() => sigS && signer("stagiaire", sigS)} disabled={!sigS || busy !== null}
                className="mt-1 w-full rounded-xl bg-mystory py-2.5 text-white text-sm font-semibold disabled:opacity-50">
                {busy === "stagiaire" ? "Enregistrement…" : "Enregistrer la signature du stagiaire"}
              </button>
            </>
          )}
        </section>

        {/* Signature de la formatrice */}
        <section className="mt-6 border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-800">2 · Signature de la formatrice</h3>
          {seance.signe_formatrice ? (
            <p className="mt-1 text-sm text-green-700">✅ Signée</p>
          ) : (
            <>
              <div className="mt-2"><SignaturePad onChange={setSigF} height={170} disabled={busy === "formatrice"} /></div>
              <button onClick={() => sigF && signer("formatrice", sigF)} disabled={!sigF || busy !== null}
                className="mt-1 w-full rounded-xl bg-mystory py-2.5 text-white text-sm font-semibold disabled:opacity-50">
                {busy === "formatrice" ? "Enregistrement…" : "Enregistrer la signature de la formatrice"}
              </button>
            </>
          )}
        </section>

        {erreur && <p className="mt-4 text-sm text-red-600">{erreur}</p>}
      </div>
    </div>
  );
}
