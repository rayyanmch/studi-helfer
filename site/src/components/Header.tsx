"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
// In der Mitte schlichte Links zu den Abschnitten; der, in dem man gerade ist, steht in Tinte.
export function Header({ lang }: { lang: Lang }) {
  const t = dict[lang].nav;
  const scrolled = useSyncExternalStore(onScroll, () => window.scrollY > 8, () => false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = t.links.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => !!e);
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        setActive(t.links.find((l) => visible.get(l.id))?.id ?? null);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [t.links]);

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div
        aria-hidden
        className={`glass absolute inset-0 transition-opacity duration-300 ${scrolled ? "opacity-100" : "opacity-0"}`}
        style={{ maskImage: "linear-gradient(black 70%, transparent)" }}
      />
      <div className="relative mx-auto grid h-16 max-w-[1160px] grid-cols-[1fr_auto] items-center gap-6 px-6 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <a
          href={`${t.home === "/" ? "" : t.home}#top`}
          className="flex items-center gap-2.5 justify-self-start text-[19px] font-semibold tracking-[-0.01em] text-ink"
        >
          <AppIcon size={30} />
          Ordo
        </a>
        <nav aria-label={t.linksLabel} className="hidden items-center gap-7 lg:flex">
          {t.links.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              aria-current={active === l.id ? "true" : undefined}
              className={`text-sm transition-colors duration-200 hover:text-ink ${active === l.id ? "text-ink" : "text-muted"}`}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-6 justify-self-end">
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
