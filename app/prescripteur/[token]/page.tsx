"use client";
// app/prescripteur/[token]/page.tsx — PREMIER ACCES uniquement.
//
// 10/09/2026 — le portail est passe a une authentification par adresse et mot de
// passe. Ce chemin ne sert plus qu'au tout premier acces : il permet au partenaire
// de poser son mot de passe sans qu'on ait a lui en transmettre un par courriel.
// Les anciens liens deja communiques continuent donc de fonctionner, en menant la
// ou il faut plutot qu'en tombant sur une page morte.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PremierAcces() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [etat, setEtat] = useState<"verif" | "invalide">("verif");

  useEffect(() => {
    (async () => {
      // Le jeton d'URL reste valable pour LIRE : s'il resout, on envoie le
      // partenaire poser son mot de passe. Sinon on le renvoie a la connexion.
      const r = await fetch(`/api/prescripteur/${token}`, { cache: "no-store" });
      if (r.ok) { router.replace(`/prescripteur/mot-de-passe?token=${token}`); return; }
      setEtat("invalide");
    })();
  }, [token, router]);

  if (etat === "verif") return <div className="p-8 text-sm text-gray-400">Vérification…</div>;
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-lg font-semibold text-gray-900">Lien invalide ou expiré</p>
      <p className="mt-2 text-sm text-gray-600">
        Votre espace est désormais protégé par un mot de passe.
      </p>
      <a href="/prescripteur/connexion"
         className="mt-4 inline-block rounded-xl bg-[#2F72DE] px-5 py-2.5 text-sm font-bold text-white">
        Accéder à mon espace
      </a>
    </div>
  );
}
