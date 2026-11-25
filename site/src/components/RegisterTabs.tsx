"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/hooks";
import type { Tone } from "@/lib/week";

// Register wie am Ordner im Logo: Navigation am rechten Rand. Das Register des Abschnitts,
// in dem man gerade ist, steht weiter heraus.
const TABS: { id: string; label: string; tone: Tone }[] = [
  { id: "files", label: "Files", tone: "blue" },
  { id: "deadlines", label: "Deadlines", tone: "orange" },
  { id: "reminders", label: "Reminders", tone: "green" },
  { id: "more", label: "More", tone: "plum" },
];

const WIDTH = 76;
const spring = { type: "spring", bounce: 0, duration: 0.45 } as const;

export function RegisterTabs() {
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
      aria-label="Sections"
      className="fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 flex-col gap-1.5 min-[1240px]:flex"
    >
      {TABS.map((t, i) => {
        const offset = active === t.id ? 4 : hover === t.id ? 18 : 26;
        return (
          <motion.div
            key={t.id}
            initial={reduced ? false : { x: WIDTH }}
            animate={{ x: 0 }}
            transition={{ ...spring, duration: 0.8, delay: 1.5 + i * 0.07 }}
          >
            <motion.a
              href={`#${t.id}`}
              aria-current={active === t.id ? "true" : undefined}
              onPointerEnter={() => setHover(t.id)}
              onPointerLeave={() => setHover(null)}
              animate={{ x: offset }}
              transition={reduced ? { duration: 0 } : spring}
              className="relative flex h-[118px] items-center rounded-l-[12px] text-[13.5px] font-semibold tracking-[0.01em] focus-visible:outline-offset-[-4px]"
              style={{
                width: WIDTH,
                paddingLeft: 13,
                background: `var(--c-${t.tone})`,
                color: "var(--on-solid)",
                boxShadow:
                  "inset 0 1px 0 rgb(255 255 255 / 0.22), inset 1px 0 0 rgb(255 255 255 / 0.08), -6px 8px 18px -10px rgb(var(--shadow-color) / 0.45)",
              }}
            >
              <span className="[writing-mode:vertical-rl]">{t.label}</span>
            </motion.a>
          </motion.div>
        );
      })}
    </nav>
  );
}
