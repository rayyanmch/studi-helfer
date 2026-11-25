"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { H2, Lead, tone } from "./ui";
import { useReducedMotion, useToday } from "@/lib/hooks";
import { dayShort, firstWeekday, germanDate, keyOf } from "@/lib/week";
import { dict, type Lang } from "@/lib/i18n";

// Das Übungsblatt: Ein Textmarker fährt über die Abgabezeile, ein Faden führt zur Frist in der Woche.
export function FinePrint({ lang }: { lang: Lang }) {
  const copy = dict[lang].fine;
  const today = useToday();
  const due = firstWeekday(today);
  const isToday = keyOf(due) === keyOf(today);

  const wrapRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const inView = useInView(wrapRef, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const [hot, setHot] = useState(false);
  const on = inView || reduced;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const draw = () => {
      const w = wrap.getBoundingClientRect();
      const m = markRef.current!.getBoundingClientRect();
      const c = chipRef.current!.getBoundingClientRect();
      let d: string;
      let end: [number, number];
      if (c.left > m.right) {
        const sx = m.right - w.left + 8;
        const sy = m.top - w.top + m.height / 2;
        const ex = c.left - w.left - 10;
        const ey = c.top - w.top + c.height / 2;
        const mx = (sx + ex) / 2;
        d = `M${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`;
        end = [ex, ey];
      } else {
        const sx = m.left - w.left + m.width * 0.3;
        const sy = m.bottom - w.top + 8;
        const ex = c.left - w.left + 40;
        const ey = c.top - w.top - 10;
        const my = (sy + ey) / 2;
        d = `M${sx} ${sy} C ${sx} ${my}, ${ex} ${my}, ${ex} ${ey}`;
        end = [ex, ey];
      }
      pathRef.current?.setAttribute("d", d);
      dotRef.current?.setAttribute("cx", String(end[0]));
      dotRef.current?.setAttribute("cy", String(end[1]));
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    document.fonts?.ready.then(draw);
    return () => ro.disconnect();
  }, [today]);

  const t = (delay: number) => (reduced ? { duration: 0 } : { delay, duration: 0.7, ease: [0.65, 0, 0.35, 1] as const });

  return (
    <div ref={wrapRef} className="relative grid items-center gap-16 md:grid-cols-2 md:gap-20">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <motion.path
          ref={pathRef}
          fill="none"
          stroke="var(--faint)"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={on ? { pathLength: 1, opacity: 1 } : {}}
          transition={t(0.85)}
        />
        <motion.circle
          ref={dotRef}
          r={3.5}
          fill="var(--faint)"
          initial={{ scale: 0 }}
          animate={on ? { scale: 1 } : {}}
          transition={reduced ? { duration: 0 } : { delay: 1.5, type: "spring", bounce: 0.4, duration: 0.4 }}
        />
      </svg>

      <div
        lang="de"
        className="relative mx-auto w-full max-w-[470px] rounded-[6px] bg-paper px-10 pt-10 pb-11 text-[13.5px] leading-[1.6] text-[var(--paper-ink)] transition-transform duration-500 ease-[var(--ease-out)] md:mx-0"
        style={{
          transform: hot ? "rotate(-1.4deg) translateY(-4px)" : "rotate(-2deg)",
          boxShadow: "0 1px 2px rgb(22 32 42 / 0.08), 0 40px 70px -34px rgb(var(--shadow-color) / 0.45)",
        }}
      >
        <div className="flex justify-between text-xs text-[#6b7580]">
          <span>Softwaretechnik</span>
          <span>WiSe 2026/27</span>
        </div>
        <div className="mt-6 text-[22px] font-bold tracking-[-0.01em] text-[#16202a]">Übungsblatt 4</div>
        <div className="text-[15px] text-[#6b7580]">Entwurfsmuster</div>
        <div className="mt-6 font-semibold text-[#16202a]">Aufgabe 1: Observer (6 Punkte)</div>
        <p className="m-0">
          Eine Wetterstation misst Temperatur und Luftdruck. Mehrere Anzeigen sollen sich automatisch aktualisieren,
          sobald neue Werte vorliegen. Modellieren Sie die Lösung als Klassendiagramm.
        </p>
        <div className="mt-3.5 font-semibold text-[#16202a]">Aufgabe 2: Fabrikmethode (4 Punkte)</div>
        <p className="m-0">Erweitern Sie Ihr Modell so, dass neue Anzeigetypen ohne Änderung der Station hinzukommen.</p>
        <p className="m-0 mt-5">
          <span
            ref={markRef}
            className="marker tnum font-semibold text-[#16202a]"
            data-on={on}
            data-hot={hot}
            style={{ transitionDelay: on && !hot ? "150ms" : "0ms" }}
          >
            Abgabe: {germanDate(due)}, 23:59 Uhr
          </span>
          , in Zweiergruppen.
        </p>
      </div>

      <div className="max-w-[460px]">
        <H2>{copy.title}</H2>
        <Lead className="mt-6">{copy.lead}</Lead>
        <div lang="en" className="mt-10 max-w-[330px] rounded-[14px] bg-surface p-3.5 shadow-[0_0_0_1px_var(--ring)]">
          <div className="flex items-center justify-between text-[13px]">
            <span className="tnum font-semibold">{dayShort(due)}</span>
            {isToday && (
              <span className="rounded-[6px] bg-accent px-[7px] py-px text-xs font-semibold text-on-accent">Today</span>
            )}
          </div>
          <motion.div
            ref={chipRef}
            onPointerEnter={() => setHot(true)}
            onPointerLeave={() => setHot(false)}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={on ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={reduced ? { duration: 0 } : { delay: 1.45, type: "spring", bounce: 0.15, duration: 0.5 }}
            className="mt-2.5 flex cursor-default items-start gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] leading-[1.35]"
            style={{ ...tone("blue"), background: "var(--c)", color: "var(--on-solid)" }}
          >
            <span className="mt-px size-[15px] flex-none rounded-full shadow-[inset_0_0_0_1.5px_currentColor]" />
            <div>
              <div className="font-semibold">Übungsblatt 4</div>
              <div className="opacity-85">Softwaretechnik, by 23:59</div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={on ? { opacity: 1 } : {}}
            transition={reduced ? { duration: 0 } : { delay: 1.8, duration: 0.5 }}
            className="mt-2.5 flex items-center gap-2 text-xs text-muted"
          >
            <svg aria-hidden width="11" height="13" viewBox="0 0 14 17">
              <path d="M1 2a1 1 0 0 1 1-1h7l4 4v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Found in Uebungsblatt_04.pdf, page 1
          </motion.div>
        </div>
      </div>
    </div>
  );
}
