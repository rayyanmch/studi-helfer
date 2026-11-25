"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { BatteryFull, Search, Wifi } from "lucide-react";
import { AppIcon, H2, Lead, Section } from "./ui";
import { useReducedMotion, useToday } from "@/lib/hooks";
import { menuBarDate, nextDays } from "@/lib/week";

// Mitteilungen gleiten wie auf dem Mac von rechts herein, die zweite etwas später.
export function Reminders() {
  const today = useToday();
  const days = nextDays(today, 7);
  // Abend vor der BWL-Abgabe (zweiter Werktag); liegt der vor heute, eben heute
  const caseDay = days.find((d) => d.items.some((i) => i.id === "case"))?.date ?? today;
  const evening = new Date(caseDay);
  evening.setDate(evening.getDate() - 1);
  const shown = evening < today ? today : evening;

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const slide = (delay: number) => ({
    initial: reduced ? false : ({ x: "112%", opacity: 0 } as const),
    animate: inView || reduced ? { x: 0, opacity: 1 } : {},
    transition: { type: "spring" as const, bounce: 0.12, duration: 0.7, delay },
  });

  return (
    <Section id="reminders" className="pt-[200px]">
      <div className="grid items-center gap-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="max-w-[460px]">
          <H2>And taps you on the shoulder.</H2>
          <Lead className="mt-6">
            The evening before a deadline and three hours before. A week before each exam, with a nudge to register,
            because being in the course is not enough.
          </Lead>
        </div>
        <div ref={ref} className="min-h-[300px] overflow-hidden rounded-[20px] bg-[var(--desk)] shadow-[0_0_0_1px_var(--ring)]">
          <div className="flex h-[30px] items-center justify-end gap-4 bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] px-4 text-[12.5px] font-semibold">
            <BatteryFull aria-hidden size={17} strokeWidth={1.8} />
            <Wifi aria-hidden size={15} strokeWidth={2.2} />
            <Search aria-hidden size={14} strokeWidth={2.4} />
            <span className="tnum">{menuBarDate(shown)} 18:00</span>
          </div>
          <div className="flex flex-col items-end gap-2.5 p-4">
            <motion.div {...slide(0.15)} className="w-full flex justify-end">
              <Note title="Due tomorrow: Fallstudie Logistik" time="now" body="BWL, by 12:00" />
            </motion.div>
            <motion.div {...slide(0.7)} className="w-full flex justify-end opacity-95">
              <Note title="Exam in one week: Datenbanken" time="09:00" body="10:00, Hörsaal C. Registered for the exam?" />
            </motion.div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Note({ title, time, body }: { title: string; time: string; body: string }) {
  return (
    <div
      className="flex w-full max-w-[372px] gap-3 rounded-[16px] px-3.5 py-3"
      style={{
        background: "var(--glass)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        boxShadow: "0 12px 30px -14px rgb(var(--shadow-color) / 0.4), inset 0 0 0 0.5px rgb(255 255 255 / 0.25)",
      }}
    >
      <AppIcon size={36} className="flex-none" />
      <div className="min-w-0 flex-1 text-[13px] leading-[1.35]">
        <div className="flex justify-between gap-2.5">
          <span className="font-semibold">{title}</span>
          <span className="tnum flex-none text-muted">{time}</span>
        </div>
        <div>{body}</div>
      </div>
    </div>
  );
}
