import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

// Dieselbe Schrift wie die App; wird beim Bauen mitgeliefert.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ordo: uni, sorted",
  description:
    "Ordo puts your ILIAS and Moodle files, deadlines and exams on your Mac, sorted and on time. Sign in once with your uni account.",
  applicationName: "Ordo",
  openGraph: {
    title: "Ordo: uni, sorted",
    description: "New slides land in the right folder on your Mac. Deadlines land in your week.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#121519" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={instrument.variable} suppressHydrationWarning>
      <head>
        {/* Markiert, dass JavaScript läuft: erst dann wartet „sorted.“ auf seine Animation */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
