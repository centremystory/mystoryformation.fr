import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "MYSTORY — CRM",
  description: "Back-office MYSTORY Formation : inscriptions, dossiers, équipe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
