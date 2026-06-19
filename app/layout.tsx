import "./globals.css";
import { Inter } from "next/font/google";
import AppShell from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

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
