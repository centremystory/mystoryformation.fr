/** @type {import('next').NextConfig} */
const nextConfig = {
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
