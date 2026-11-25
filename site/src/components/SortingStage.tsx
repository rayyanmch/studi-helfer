"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { Check } from "lucide-react";
import { DocGlyph, TrafficLights, tone } from "./ui";
import { useMedia, useReducedMotion } from "@/lib/hooks";
import { COURSES, type CourseKey } from "@/lib/week";

type Platform = "ilias" | "moodle";

// Vier Dateien, tief vergraben auf der Lernplattform, landen sortiert im Uni-Ordner.
// Reihenfolge = Reihenfolge im Finder (alphabetisch nach Kurs).
const FILES: {
  course: CourseKey;
  file: string;
  folder: string;
  path: Record<Platform, string>;
  tilt: number;
  top: number;
  left: number;
  right: number;
  order: number;
}[] = [
  {
    course: "bwl",
    file: "Fallstudie_Logistik.docx",
    folder: "Übungen",
    path: {
      ilias: "Magazin › WiSo-Fakultät › [WS26/27] Grundlagen der BWL › Übungen › Woche 5 ›",
      moodle: "Meine Kurse › Grundlagen der BWL (WiSe 26/27) › Woche 5 › Fallstudien ›",
    },
    tilt: -2.4,
    top: 0,
    left: 0,
    right: 22,
    order: 0,
  },
  {
    course: "db",
    file: "Uebungsblatt_05.pdf",
    folder: "Übungen",
    path: {
      ilias: "[WS26/27] Datenbanken › Übungen › Übungsblätter ›",
      moodle: "Meine Kurse › Datenbanken › Woche 7 › Aufgaben ›",
    },
    tilt: 2.6,
    top: 280,
    left: 40,
    right: 0,
    order: 1,
  },
  {
    course: "mathe",
    file: "Blatt07.pdf",
    folder: "Übung",
    path: {
      ilias: "Magazin › MathNat › [WS26/27] Mathematik für Studierende der Informatik I › Übungsgruppen › Gruppe 05 ›",
      moodle: "Meine Kurse › Mathematik für Informatik I › Übungsgruppe 05 › Abgaben ›",
    },
    tilt: -1,
    top: 184,
    left: 8,
    right: 14,
    order: 2,
  },
  {
    course: "se",
    file: "VL06_Entwurfsmuster.pdf",
    folder: "Vorlesung",
    path: {
      ilias: "Mein Schreibtisch › [WS26/27] Softwaretechnik › Material › Vorlesung ›",
      moodle: "Meine Kurse › Softwaretechnik › Thema 6: Entwurfsmuster ›",
    },
    tilt: 1.8,
    top: 92,
    left: 30,
    right: 0,
    order: 3,
  },
];

type Geo = { sx: number; sy: number; ex: number; ey: number };

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bez = (a: number, b: number, c: number, d: number, t: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;

export function SortingStage() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const forumRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const geo = useRef<Geo[]>([]);
  const [platform, setPlatform] = useState<Platform>("ilias");

  const reduced = useReducedMotion();
  const wide = useMedia("(min-width: 900px)", true);
  const pinned = wide && !reduced;

  const progress = useMotionValue(0);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 260, damping: 40, mass: 0.6, restDelta: 0.0005 });
  const inView = useInView(stageRef, { once: true, amount: 0.45 });

  function render(p: number) {
    FILES.forEach((f, i) => {
      const g = geo.current[i];
      const chip = chipRefs.current[i];
      const src = fileRefs.current[i];
      const slot = slotRefs.current[f.order];
      if (!g || !chip || !src || !slot) return;
      const l = clamp((p - (0.06 + i * 0.17)) / 0.3);
      const e = ease(l);
      const dx = g.ex - g.sx;
      const x = bez(g.sx, g.sx + dx * 0.35, g.ex - dx * 0.3, g.ex, e);
      const y = bez(g.sy, g.sy - 80 - i * 10, g.ey - 50, g.ey, e);
      const lift = Math.sin(Math.PI * e);
      const rot = f.tilt * (1 - e) + lift * (i % 2 ? 5 : -5);
      chip.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${rot}deg) scale(${1 + 0.07 * lift})`;
      chip.style.opacity = l > 0 && l < 1 ? "1" : "0";
      chip.style.boxShadow = `0 ${3 + 18 * lift}px ${8 + 28 * lift}px -${4 + 8 * lift}px rgb(var(--shadow-color) / ${0.14 + 0.3 * lift}), 0 0 0 1px rgb(var(--shadow-color) / 0.07)`;
      src.style.opacity = l > 0 ? "0.22" : "1";
      slot.dataset.filled = String(l >= 1);
    });
    const done = p > 0.88;
    if (forumRef.current) forumRef.current.dataset.done = String(done);
    if (captionRef.current) captionRef.current.dataset.on = String(done);
  }

  // Start- und Zielpunkte messen (nach Schriftwechsel, Größenänderung und Plattform-Umschalter)
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const box = stage.getBoundingClientRect();
      geo.current = FILES.map((f, i) => {
        const s = fileRefs.current[i]!.getBoundingClientRect();
        const t = slotRefs.current[f.order]!.getBoundingClientRect();
        const cw = chipRefs.current[i]!.offsetWidth;
        return {
          sx: s.left - box.left - 34 + cw / 2,
          sy: s.top - box.top + s.height / 2,
          ex: t.left - box.left + cw / 2,
          ey: t.top - box.top + t.height / 2,
        };
      });
      render(progress.get());
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  useMotionValueEvent(progress, "change", render);
  useMotionValueEvent(smooth, "change", (v) => {
    if (pinned) progress.set(v);
  });

  // Ohne Pinnen (Handy) spielt die Szene einmal ab, sobald sie zu sehen ist; bei „Bewegung reduzieren“ gleich fertig.
  useLayoutEffect(() => {
    if (reduced) progress.set(1);
    else if (pinned) progress.set(smooth.get());
    else if (inView) {
      const a = animate(progress, 1, { duration: 2.8, ease: "linear" });
      return () => a.stop();
    }
  }, [reduced, pinned, inView, progress, smooth]);

  return (
    <section ref={sectionRef} id="files" className="relative md:h-[300vh] md:motion-reduce:h-auto">
      <div className="md:sticky md:top-0 md:flex md:h-svh md:items-center md:motion-reduce:static">
        <div className="mx-auto w-full max-w-[1160px] px-6 pt-24 sm:px-8 md:pt-16">
          <div
            ref={stageRef}
            className="relative grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,.5fr)_minmax(0,1fr)] md:gap-6"
          >
            {/* Links: so liegt es auf der Plattform */}
            <div>
              <div className="flex items-center gap-3 text-[15px] font-semibold text-muted">
                In
                <PlatformSwitch value={platform} onChange={setPlatform} />
              </div>
              <div className="relative mt-5 flex flex-col gap-2.5 md:block md:h-[420px]">
                {FILES.map((f, i) => (
                  <div
                    key={f.file}
                    className="static rounded-[10px] bg-surface px-3.5 py-3 text-[13px] leading-[1.45] text-faint shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08)] md:absolute"
                    style={{ top: f.top, left: f.left, right: f.right, transform: `rotate(${f.tilt}deg)` }}
                  >
                    <motion.span key={platform} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
                      {f.path[platform]}{" "}
                    </motion.span>
                    <span
                      ref={(el) => {
                        fileRefs.current[i] = el;
                      }}
                      className="ghost font-semibold whitespace-nowrap text-ink"
                    >
                      {f.file}
                    </span>
                  </div>
                ))}
                <div
                  ref={forumRef}
                  className="forum static rounded-[10px] bg-surface px-3.5 py-3 text-[13px] leading-[1.45] text-faint opacity-50 transition-opacity duration-500 data-[done=true]:opacity-25 md:absolute"
                  style={{ top: 364, left: 10, right: 30, transform: "rotate(-1.6deg)" }}
                >
                  Forum › Allgemeines › <span className="forum-text font-semibold text-ink">Re: Re: Wo finde ich die Folien?</span>
                </div>
              </div>
            </div>

            <div aria-hidden className="hidden md:block" />

            {/* Rechts: so liegt es auf dem Mac */}
            <div>
              <div className="flex h-[30px] items-center text-[15px] font-semibold text-muted">On your Mac</div>
              <div className="mt-5 overflow-hidden rounded-[14px] bg-surface text-[13.5px] shadow-[0_0_0_1px_var(--ring),0_24px_44px_-26px_rgb(var(--shadow-color)/0.45)]">
                <div className="flex h-10 items-center gap-3 border-b border-line-soft px-3.5">
                  <TrafficLights size={10} />
                  <span className="font-semibold">Uni</span>
                </div>
                <div className="flex flex-col gap-0.5 px-2.5 pt-2.5 pb-3.5">
                  {[...FILES]
                    .sort((a, b) => a.order - b.order)
                    .map((f, k) => {
                      const c = COURSES[f.course];
                      return (
                        <div key={f.file} className={k ? "mt-1.5" : ""} style={tone(c.tone)}>
                          <div className="flex h-7 items-center gap-2.5 px-2 font-semibold">
                            <span className="h-[9px] w-3 rounded-[2px]" style={{ background: "var(--c)" }} />
                            {c.name}
                          </div>
                          <div className="flex h-7 items-center pr-2 pl-[30px] text-muted">{f.folder}</div>
                          <div
                            ref={(el) => {
                              slotRefs.current[f.order] = el;
                            }}
                            data-filled="false"
                            className="slot ml-[42px] flex h-7 items-center gap-2 rounded-[7px] pr-2.5 pl-3"
                          >
                            <DocGlyph t={c.tone} size={12} />
                            <span className="truncate font-semibold">{f.file}</span>
                            <span className="tnum ml-auto flex-none text-xs" style={{ color: "var(--ink-c)" }}>
                              07:00
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              <p
                ref={captionRef}
                data-on="false"
                className="m-0 mt-4 flex items-center gap-2 text-[15px] text-muted opacity-0 transition-opacity duration-500 data-[on=true]:opacity-100"
              >
                <Check aria-hidden size={16} strokeWidth={2.4} style={{ color: "var(--c-green)" }} />
                Sorted at 07:00, while you were asleep. Spotlight finds them too.
              </p>
            </div>

            {/* Die fliegenden Dateien */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {FILES.map((f, i) => (
                <div
                  key={f.file}
                  ref={(el) => {
                    chipRefs.current[i] = el;
                  }}
                  className="absolute top-0 left-0 flex items-center gap-2 rounded-[10px] bg-surface px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap opacity-0 will-change-transform"
                >
                  <DocGlyph t={COURSES[f.course].tone} size={14} />
                  {f.file}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformSwitch({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  return (
    <div role="radiogroup" aria-label="Learning platform" className="relative flex rounded-full bg-sunken p-[3px]">
      {(["ilias", "moodle"] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          onClick={() => onChange(p)}
          className="press relative h-[26px] rounded-full px-3 text-[13px] font-semibold text-muted aria-checked:text-ink"
        >
          {value === p && (
            <motion.span
              layoutId="platform-thumb"
              className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgb(var(--shadow-color)/0.16)]"
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            />
          )}
          <span className="relative">{p === "ilias" ? "ILIAS" : "Moodle"}</span>
        </button>
      ))}
    </div>
  );
}
