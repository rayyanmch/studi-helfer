import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Instrument_Sans } from "next/font/google";
import { dict, type Lang } from "@/lib/i18n";
import "./globals.css";

// Gemeinsames Grundgerüst für / (englisch) und /de (deutsch). Zwei Root-Layouts,
// damit <html lang> stimmt; der Wechsel zwischen ihnen lädt die Seite neu.

// Dieselbe Schrift wie die App; wird beim Bauen mitgeliefert.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export function metadataFor(lang: Lang): Metadata {
  const t = dict[lang].meta;
  return {
    title: t.title,
    description: t.description,
    applicationName: "Ordo",
    openGraph: { title: t.title, description: t.og, type: "website", locale: lang === "de" ? "de_DE" : "en_US" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#121519" },
  ],
};

export function Shell({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <html lang={lang} className={instrument.variable} suppressHydrationWarning>
      <head>
        {/* Markiert, dass JavaScript läuft: erst dann wartet „sorted.“ auf seine Animation */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
