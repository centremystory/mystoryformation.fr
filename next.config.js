/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Bascule B4 : l'ancien QCM prospect pointe désormais vers le kiosque (nouveau moteur de tests).
      // Réversible : retirer ces redirections et restaurer le rewrite /qcm -> /qcm.html pour revenir en arrière.
      { source: "/qcm", destination: "/test/kiosque", permanent: false },
      { source: "/qcm.html", destination: "/test/kiosque", permanent: false },
    ];
  },
  experimental: {
    // Chromium chargé à l'exécution depuis un paquet distant (chromium-min) — ne pas bundler.
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"],
    // Inclure les templates dans la fonction de génération de la convention.
    outputFileTracingIncludes: {
      "/api/conventions/send": ["./templates/**"],
    },
  },
};
module.exports = nextConfig;
