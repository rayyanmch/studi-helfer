"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useReducedMotion } from "@/lib/hooks";
import { dict, LANG_KEY, rememberLang, type Lang } from "@/lib/i18n";

/** Link zur anderen Sprache; merkt sich die Wahl, damit der Hinweis nicht mehr kommt. */
export function LangLink({
  lang,
  className = "text-muted hover:text-ink",
  children,
}: {
  lang: Lang;
  className?: string;
  children?: ReactNode;
}) {
  const other = dict[lang].nav.other;
  return (
    <Link
      href={other.href}
      hrefLang={other.lang}
      lang={other.lang}
      prefetch={false}
      onClick={() => rememberLang(other.lang)}
      className={className}
    >
      {children ?? other.label}
    </Link>
  );
}

// Auf der englischen Seite: Ist Deutsch die erste Sprache des Browsers und hat man noch nie
// gewählt, schlägt ein kleiner Hinweis unten die deutsche Seite vor. Kein automatisches Umleiten.
export function LangHint() {
  const [show, setShow] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LANG_KEY);
    } catch {}
    const first = (navigator.languages?.[0] ?? navigator.language ?? "").toLowerCase();
    if (stored || !first.startsWith("de")) return;
    const id = setTimeout(() => setShow(true), 2200);
    return () => clearTimeout(id);
  }, []);

  const dismiss = () => {
    rememberLang("en");
    setShow(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <AnimatePresence>
        {show && (
          <motion.div
            lang="de"
            role="region"
            aria-label="Sprache"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            className="glass pointer-events-auto flex items-center gap-3 rounded-full py-2 pr-2 pl-5 text-sm shadow-[0_0_0_1px_var(--ring),0_16px_40px_-18px_rgb(var(--shadow-color)/0.45)]"
          >
            <span>Diese Seite gibt es auch auf Deutsch.</span>
            <LangLink
              lang="en"
              className="press inline-flex h-8 items-center rounded-full bg-accent px-3.5 font-semibold text-on-accent"
            >
              Auf Deutsch lesen
            </LangLink>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Hinweis schließen"
              className="press grid size-8 place-items-center rounded-full text-muted hover:bg-[var(--hover,rgb(var(--shadow-color)/0.06))] hover:text-ink"
            >
              <X aria-hidden size={16} strokeWidth={2.2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
