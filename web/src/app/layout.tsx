import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "katex/dist/katex.min.css"; // Formeln in Karteikarten und Zusammenfassungen (Mathe-Modus)
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/components/theme";

// Schrift wird beim Bauen mitgeliefert, die App lädt nichts aus dem Netz nach.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "Studi-Helfer",
  description: "All your university files in one place",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Gewähltes Erscheinungsbild vor dem ersten Bild setzen */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
