import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

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
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
