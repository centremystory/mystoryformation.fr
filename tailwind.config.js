/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");
const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Charte MYSTORY
        mystory: {
          DEFAULT: "#2F72DE",
          fonce: "#1F56B0",
          clair: "#EAF1FC",
        },
        // Tokens sémantiques (réutilisent les palettes Tailwind)
        success: colors.emerald,
        warning: colors.amber,
        danger: colors.rose,
        // Fond de l'application (gris très clair, esprit SaaS épuré)
        canvas: "#FAFBFC",
      },
      fontFamily: {
        sans: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        // Ombres très douces (Linear / Notion)
        soft: "0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)",
        card: "0 1px 2px 0 rgb(16 24 40 / 0.05)",
        pop: "0 4px 12px -2px rgb(16 24 40 / 0.10), 0 2px 6px -2px rgb(16 24 40 / 0.06)",
      },
    },
  },
  plugins: [],
};
