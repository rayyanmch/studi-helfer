"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/hooks";
import type { Tone } from "@/lib/week";
import { dict, type Lang } from "@/lib/i18n";

// Register wie am Ordner im Logo: Navigation am rechten Rand. Das Register des Abschnitts,
// in dem man gerade ist, steht weiter heraus.
const TABS: { id: "files" | "deadlines" | "reminders" | "more"; tone: Tone }[] = [
  { id: "files", tone: "blue" },
  { id: "deadlines", tone: "orange" },
  { id: "reminders", tone: "green" },
  { id: "more", tone: "plum" },
];

const WIDTH = 76;
const spring = { type: "spring", bounce: 0, duration: 0.45 } as const;

export function RegisterTabs({ lang }: { lang: Lang }) {
  const t = dict[lang].nav;
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const els = TABS.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => !!e);
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        // Der Abschnitt, der die Mitte des Fensters kreuzt, gewinnt
        setActive(TABS.find((t) => visible.get(t.id))?.id ?? null);
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <nav
      aria-label={t.sectionsLabel}
      className="fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 flex-col gap-1.5 min-[1240px]:flex"
    >
      {TABS.map((tab, i) => {
        const offset = active === tab.id ? 4 : hover === tab.id ? 18 : 26;
        return (
          <motion.div
            key={tab.id}
            initial={reduced ? false : { x: WIDTH }}
            animate={{ x: 0 }}
            transition={{ ...spring, duration: 0.8, delay: 1.5 + i * 0.07 }}
          >
            <motion.a
              href={`#${tab.id}`}
              aria-current={active === tab.id ? "true" : undefined}
              onPointerEnter={() => setHover(tab.id)}
              onPointerLeave={() => setHover(null)}
              animate={{ x: offset }}
              transition={reduced ? { duration: 0 } : spring}
              className="relative flex h-[118px] items-center rounded-l-[12px] text-[13.5px] font-semibold tracking-[0.01em] focus-visible:outline-offset-[-4px]"
              style={{
                width: WIDTH,
                paddingLeft: 13,
                background: `var(--c-${tab.tone})`,
                color: "var(--on-solid)",
                boxShadow:
                  "inset 0 1px 0 rgb(255 255 255 / 0.22), inset 1px 0 0 rgb(255 255 255 / 0.08), -6px 8px 18px -10px rgb(var(--shadow-color) / 0.45)",
              }}
            >
              <span className="[writing-mode:vertical-rl]">{t.sections[tab.id]}</span>
            </motion.a>
          </motion.div>
        );
      })}
    </nav>
  );
}
