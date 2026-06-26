import "./globals.css";
import localFont from "next/font/local";
import AppShell from "@/components/AppShell";

// Inter auto-hébergé (next/font/local) : aucun fetch Google Fonts au build → build déterministe.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata = {
  title: "MYSTORY — CRM",
  description: "Back-office MYSTORY Formation : inscriptions, dossiers, équipe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
