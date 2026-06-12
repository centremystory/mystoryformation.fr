/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mystory: {
          DEFAULT: "#2F72DE", // bleu de la charte MYSTORY
          fonce: "#1F56B0",
          clair: "#EAF1FC",
        },
      },
    },
  },
  plugins: [],
};
