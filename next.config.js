/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ne pas bundler le moteur de rendu PDF : il est chargé tel quel côté serveur.
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
    // Inclure le dossier templates/ dans la fonction qui génère la convention.
    outputFileTracingIncludes: {
      "/api/conventions/send": ["./templates/**"],
    },
  },
};
module.exports = nextConfig;
