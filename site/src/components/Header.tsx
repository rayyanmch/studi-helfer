"use client";

import { useSyncExternalStore } from "react";
import { ArrowDown } from "lucide-react";
import { AppIcon } from "./ui";
import { LangLink } from "./LangHint";
import { DOWNLOAD_URL } from "@/lib/links";
import { dict, type Lang } from "@/lib/i18n";

const onScroll = (cb: () => void) => {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
};

// Kopfzeile: oben durchsichtig, beim Scrollen Glas mit weicher Kante statt harter Linie.
export function Header({ lang }: { lang: Lang }) {
  const t = dict[lang].nav;
  const scrolled = useSyncExternalStore(onScroll, () => window.scrollY > 8, () => false);

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div
        aria-hidden
        className={`glass absolute inset-0 transition-opacity duration-300 ${scrolled ? "opacity-100" : "opacity-0"}`}
        style={{ maskImage: "linear-gradient(black 70%, transparent)" }}
      />
      <div className="relative mx-auto flex h-16 max-w-[1160px] items-center gap-6 px-6 sm:px-8">
        <a href={`${t.home === "/" ? "" : t.home}#top`} className="flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.01em] text-ink">
          <AppIcon size={30} />
          Ordo
        </a>
        <div className="ml-auto flex items-center gap-6">
          <LangLink lang={lang} className="hidden text-sm text-muted hover:text-ink sm:block" />
          <a
            href={DOWNLOAD_URL}
            className="press inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface"
          >
            <ArrowDown aria-hidden className="nudge" size={15} strokeWidth={2.2} />
            {t.download}
          </a>
        </div>
      </div>
    </header>
  );
}
