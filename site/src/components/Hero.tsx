"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { animate, motion } from "motion/react";
import { Cpu, Lock, Plug } from "lucide-react";
import { DownloadButtons } from "./ui";
import { AppFrame } from "./app/AppFrame";
import { TodayScreen, type Done } from "./app/TodayScreen";
import { useReducedMotion, useToday } from "@/lib/hooks";
import { dict, type Lang } from "@/lib/i18n";

// Hero als eigene Fläche mit Rand (Idee D): feine Karo-Struktur, die zum Rand ausläuft,
// zwei dezente Locher-Löcher, unten wächst das App-Fenster heraus.

// Das Wort beginnt alphabetisch sortiert („deorst“, „eiorrstt“) und sortiert sich dann zu sich selbst.
const startOrder = (word: string) => [...word].map((_, i) => i).sort((a, b) => word[a].localeCompare(word[b]) || a - b);

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] as const },
});

const TRUST_ICONS = [Cpu, Plug, Lock];

export function Hero({ lang }: { lang: Lang }) {
  const t = dict[lang].hero;
  const WORD = t.word;
  const wordRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const today = useToday();
  const [done, setDone] = useState<Done>({ sheet5: true });

  useLayoutEffect(() => {
    const host = wordRef.current;
    if (!host) return;
    const letters = [...host.querySelectorAll<HTMLElement>("[data-l]")];
    if (reduced || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      host.dataset.ready = "";
      return;
    }
    const lefts = letters.map((el) => el.offsetLeft);
    const widths = letters.map((el) => el.offsetWidth);
    const startX: number[] = [];
    let x = lefts[0];
    for (const i of startOrder(WORD)) {
      startX[i] = x;
      x += widths[i];
    }
    const size = parseFloat(getComputedStyle(host).fontSize);
    const controls = letters.map((el, i) => {
      const dx = startX[i] - lefts[i];
      el.style.transform = `translateX(${dx}px)`;
      if (Math.abs(dx) < 1) return null;
      // Wer nach rechts muss, geht oben herum, wer nach links muss, unten: nichts überlappt.
      const arc = (dx < 0 ? -1 : 1) * size * 0.14;
      const timing = { duration: 0.95, delay: 0.75 + i * 0.035 };
      return animate(
        el,
        { x: [dx, 0], y: [0, arc, 0] },
        { ...timing, ease: [0.65, 0, 0.35, 1], y: { ...timing, ease: "easeInOut", times: [0, 0.5, 1] } },
      );
    });
    host.dataset.ready = "";
    return () => controls.forEach((c) => c?.stop());
  }, [reduced, WORD]);

  return (
    <div className="px-3 pt-3">
      <section
        id="top"
        className="relative overflow-hidden rounded-[28px] bg-[#fbfcfe] shadow-[inset_0_0_0_1px_var(--ring)]"
      >
        {/* Feine Karo-Struktur, läuft zum Rand hin aus */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgb(22 32 42 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(22 32 42 / 0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 26%, #000 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 26%, #000 30%, transparent 80%)",
          }}
        />
        {/* Zwei Locher-Löcher: der einzige Hinweis auf den Ordner */}
        {[37, 51].map((top) => (
          <span
            key={top}
            aria-hidden
            className="absolute left-7 hidden size-[18px] rounded-full bg-bg shadow-[inset_0_1px_3px_rgb(22_32_42/0.2)] md:block"
            style={{ top: `${top}%` }}
          />
        ))}

        <div className="relative z-10 flex flex-col items-center px-6 pt-[148px] text-center sm:px-8">
          <h1 className={`m-0 ${t.size} leading-[0.92] font-medium tracking-[-0.055em]`}>
            <motion.span className="inline-block" {...(reduced ? {} : rise(0.1))}>
              {t.first}
            </motion.span>{" "}
            <motion.span className="inline-block" {...(reduced ? {} : rise(0.3))}>
              <span ref={wordRef} data-sort-word className="relative inline-block whitespace-nowrap" aria-label={`${WORD}.`}>
                {[...WORD].map((ch, i) => (
                  <span key={i} data-l aria-hidden className="inline-block will-change-transform">
                    {ch}
                  </span>
                ))}
                <span aria-hidden>.</span>
              </span>
            </motion.span>
          </h1>
          <motion.p
            className="m-0 mt-7 max-w-[29em] text-[clamp(18px,1.5vw,21px)] leading-[1.45] text-muted text-pretty"
            {...(reduced ? {} : rise(1.05))}
          >
            {t.sub}
          </motion.p>
          <motion.div className="mt-8" {...(reduced ? {} : rise(1.2))}>
            <DownloadButtons lang={lang} align="center" />
          </motion.div>
          <motion.ul
            className="m-0 mt-7 flex list-none flex-wrap justify-center gap-x-7 gap-y-2.5 p-0 text-[13.5px] text-muted"
            {...(reduced ? {} : rise(1.35))}
          >
            {t.trust.map((text, i) => {
              const Icon = TRUST_ICONS[i];
              return (
                <li key={text} className="inline-flex items-center gap-2">
                  <Icon aria-hidden size={15} strokeWidth={1.8} />
                  {text}
                </li>
              );
            })}
          </motion.ul>
        </div>

        {/* Das App-Fenster wächst unten aus der Fläche (die Fläche schneidet es ab) */}
        <div className="relative z-10 mx-auto mt-16 h-[340px] max-w-[1020px] overflow-hidden px-4 pt-2 sm:px-8 md:h-[430px]">
        <motion.div
          initial={reduced ? false : { y: 140 }}
          animate={{ y: 0 }}
          transition={{ duration: 1.2, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <AppFrame
            id="hero"
            active="today"
            className="rounded-t-[14px] shadow-[0_0_0_1px_var(--ring),0_30px_70px_-24px_rgb(var(--shadow-color)/0.35)]"
          >
            <TodayScreen
              today={today}
              done={done}
              onToggle={(id) => setDone((d) => ({ ...d, [id]: !d[id] }))}
              className="p-5 pb-28 sm:px-8 sm:pt-7"
            />
          </AppFrame>
        </motion.div>
        </div>
      </section>
    </div>
  );
}
