import type { Metadata } from "next";
import Link from "next/link";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

// 404 für beide Sprachen (zwei Root-Layouts, deshalb eine eigene Seite mit <html>).
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = { title: "Ordo: page not found" };

export default function GlobalNotFound() {
  return (
    <html lang="en" className={instrument.variable}>
      <body>
        <main className="mx-auto flex min-h-svh max-w-[1160px] flex-col justify-center px-6 sm:px-8">
          <h1 className="m-0 text-[clamp(44px,7vw,96px)] leading-none font-medium tracking-[-0.045em]">
            This page doesn&apos;t exist.
          </h1>
          <p className="m-0 mt-4 text-[clamp(22px,2.4vw,32px)] font-medium tracking-[-0.02em] text-muted" lang="de">
            Diese Seite gibt es nicht.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/" className="press inline-flex h-12 items-center rounded-full bg-accent px-6 font-semibold text-on-accent">
              Back to Ordo
            </Link>
            <Link
              href="/de"
              lang="de"
              className="press inline-flex h-12 items-center rounded-full px-6 font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
            >
              Zurück zu Ordo
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
