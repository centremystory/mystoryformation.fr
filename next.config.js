/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Bascule B4 : l'ancien QCM prospect pointe désormais vers le kiosque (nouveau moteur de tests).
      // Réversible : retirer ces redirections et restaurer le rewrite /qcm -> /qcm.html pour revenir en arrière.
      { source: "/qcm", destination: "/test", permanent: false },
      { source: "/qcm.html", destination: "/test", permanent: false },
    ];
  },
  experimental: {
    // Chromium (paquet complet @sparticuz/chromium : binaire + libs système embarqués) — ne pas bundler.
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
    // Inclure les templates dans la fonction de génération de la convention.
    outputFileTracingIncludes: {
      "/api/conventions/send": ["./templates/**"],
    },
  },
};
module.exports = nextConfig;
