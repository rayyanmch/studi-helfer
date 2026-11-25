"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, motion } from "motion/react";
import { DownloadButtons, Section } from "./ui";
import { useReducedMotion } from "@/lib/hooks";

const WORD = "sorted";
// Beginnt alphabetisch sortiert („deorst“) und sortiert sich dann zum Wort.
const START = [...WORD].map((_, i) => i).sort((a, b) => WORD[a].localeCompare(WORD[b]));

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export function Hero() {
  const wordRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

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
    for (const i of START) {
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
      return animate(
        el,
        { x: [dx, 0], y: [0, arc, 0] },
        { duration: 0.95, delay: 0.75 + i * 0.035, ease: [0.65, 0, 0.35, 1], y: { duration: 0.95, delay: 0.75 + i * 0.035, ease: "easeInOut", times: [0, 0.5, 1] } },
      );
    });
    host.dataset.ready = "";
    return () => controls.forEach((c) => c?.stop());
  }, [reduced]);

  return (
    <Section id="top" className="pt-[clamp(132px,20vh,220px)]">
      <h1 className="m-0 text-[clamp(76px,13.6vw,188px)] font-medium leading-[0.9] tracking-[-0.055em]">
        <motion.span className="inline-block" {...(reduced ? {} : rise(0.1))}>
          Uni,
        </motion.span>{" "}
        <motion.span className="inline-block" {...(reduced ? {} : rise(0.3))}>
          <span ref={wordRef} data-sort-word className="relative inline-block whitespace-nowrap" aria-label="sorted.">
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
        className="m-0 mt-10 max-w-[30em] text-[clamp(19px,1.6vw,22px)] leading-[1.45] text-muted text-pretty"
        {...(reduced ? {} : rise(1.05))}
      >
        New slides land in the right folder on your Mac. Deadlines land in your week. You stop digging through ILIAS
        and Moodle.
      </motion.p>
      <motion.div className="mt-9" {...(reduced ? {} : rise(1.2))}>
        <DownloadButtons />
        <p className="m-0 mt-4 text-sm text-muted">For Macs with Apple silicon. Works with ILIAS and Moodle.</p>
      </motion.div>
    </Section>
  );
}
