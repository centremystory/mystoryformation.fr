/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ne pas bundler le moteur de rendu PDF : il est chargé tel quel côté serveur.
    serverComponentsExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
    // Inclure dans la fonction : les templates ET le binaire Chromium (sinon "Failed to launch").
    outputFileTracingIncludes: {
      "/api/conventions/send": [
        "./templates/**",
        "./node_modules/@sparticuz/chromium/bin/**"
      ],
    },
  },
};
module.exports = nextConfig;
