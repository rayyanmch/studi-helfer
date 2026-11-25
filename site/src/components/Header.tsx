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

// Schwebende Navigation als Pille (Idee D). Beim Scrollen wird der Schatten etwas kräftiger,
// damit sie sich vom Inhalt darunter löst. Der aktuelle Abschnitt steht in Tinte.
export function Header({ lang }: { lang: Lang }) {
  const t = dict[lang].nav;
  const scrolled = useSyncExternalStore(onScroll, () => window.scrollY > 24, () => false);
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
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-6 pt-[26px]">
      <div
        className={`pill pointer-events-auto flex h-14 w-full max-w-[940px] items-center gap-6 rounded-full pr-2 pl-[18px] transition-shadow duration-300 ${
          scrolled
            ? "shadow-[0_0_0_1px_var(--ring),0_14px_36px_-14px_rgb(var(--shadow-color)/0.35)]"
            : "shadow-[0_0_0_1px_var(--ring),0_10px_28px_-16px_rgb(var(--shadow-color)/0.25)]"
        }`}
      >
        <a
          href={`${t.home === "/" ? "" : t.home}#top`}
          className="flex flex-none items-center gap-2.5 text-[17px] font-semibold tracking-[-0.01em] text-ink"
        >
          <AppIcon size={26} />
          Ordo
        </a>
        <nav aria-label={t.linksLabel} className="ml-auto hidden items-center gap-6 min-[1100px]:flex">
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
        <div className="ml-auto flex items-center gap-5 min-[1100px]:ml-0">
          <LangLink lang={lang} className="hidden text-sm text-muted hover:text-ink sm:block" />
          <a
            href={DOWNLOAD_URL}
            className="press inline-flex h-10 items-center gap-2 rounded-full bg-accent px-[18px] text-sm font-semibold text-on-accent"
          >
            <ArrowDown aria-hidden className="nudge" size={15} strokeWidth={2.2} />
            {t.download}
          </a>
        </div>
      </div>
    </header>
  );
}
