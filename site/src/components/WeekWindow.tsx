"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  ArrowDownToLine,
  CalendarDays,
  ChartColumn,
  Check,
  CloudRain,
  Folder,
  Layers,
  Mail,
  MapPin,
  Sun,
  Utensils,
} from "lucide-react";
import { AppIcon, H2, Lead, TrafficLights, tone } from "./ui";
import { useReducedMotion, useToday } from "@/lib/hooks";
import { COURSES, dayLong, dayShort, lectureWeek, nextDays, relativeDay, type Day, type Item } from "@/lib/week";

// Das App-Fenster „Today“ mit den nächsten 4 Tagen. Richtet sich beim Hereinscrollen auf;
// Abgaben lassen sich abhaken, der Satz oben passt sich an.
export function WeekWindow() {
  const today = useToday();
  const days = nextDays(today);
  const [done, setDone] = useState<Record<string, boolean>>({ sheet5: true });
  const toggle = (id: string) => setDone((d) => ({ ...d, [id]: !d[id] }));

  const frameRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start end", "start 0.3"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [60, 0]);

  return (
    <div className="pt-[200px]">
      <div className="max-w-[640px]">
        <H2>Your week, at one glance.</H2>
        <Lead className="mt-6">
          Lectures, deadlines and exams in your course colours. Free days shrink so busy ones get the room. Tick off what
          you have handed in.
        </Lead>
      </div>
      <div className="mt-16 [perspective:1800px]">
        <motion.div
          ref={frameRef}
          style={reduced ? undefined : { rotateX, scale, y, transformOrigin: "50% 0%" }}
          className="flex overflow-hidden rounded-[14px] bg-bg text-ink shadow-[0_0_0_1px_var(--ring),0_30px_60px_-24px_rgb(var(--shadow-color)/0.28),0_90px_140px_-70px_rgb(var(--shadow-color)/0.4)]"
        >
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col gap-5 p-5 sm:px-8 sm:pt-7 sm:pb-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[30px] leading-[1.1] font-bold tracking-[-0.02em]">Today</div>
                <div className="tnum mt-1 text-sm text-muted">
                  {dayLong(today)}
                  {lectureWeek(today) ? `. Lecture week ${lectureWeek(today)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted">
                <CloudRain aria-hidden size={20} strokeWidth={1.8} style={{ color: "var(--c-blue)" }} />
                Rain from 14:00
              </div>
            </div>
            <p className="m-0 max-w-[46em] text-[17px] leading-[1.5]">{sentence(today, days, done)}</p>
            <div>
              <div className="mb-2.5 text-[17px] font-semibold">Next 4 days</div>
              <div
                className="grid grid-cols-2 gap-2 sm:[grid-template-columns:var(--cols)]"
                style={{
                  ["--cols" as string]: days
                    .map((d) => (d.weekend ? "0.5fr" : d.items.length > 1 ? "1.3fr" : "1fr"))
                    .join(" "),
                }}
              >
                {days.map((d) => (
                  <DayColumn key={d.date.toDateString()} day={d} done={done} onToggle={toggle} />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function sentence(today: Date, days: Day[], done: Record<string, boolean>): ReactNode {
  const first = days.find((d) => !d.weekend);
  const sheet4Day = days.find((d) => d.items.some((i) => i.id === "sheet4"));
  const parts: string[] = [];
  if (days[0].weekend) parts.push("Nothing on today.");
  else parts.push("Mathe I at 10:00 in Aula 1.");
  if (sheet4Day && !done.sheet4) {
    parts.push(`Übungsblatt 4 for SE is due ${relativeDay(today, sheet4Day.date)} at 23:59.`);
  } else if (sheet4Day) {
    const next = days.flatMap((d) => d.items.map((i) => ({ i, d }))).find(({ i }) => i.kind === "due" && !done[i.id]);
    parts.push(
      next
        ? `Übungsblatt 4 is handed in. Next up: ${next.i.title} for ${COURSES[next.i.course].name}, ${relativeDay(today, next.d.date).replace("tonight", "today")} ${next.i.time}.`
        : "Everything due this week is handed in.",
    );
  }
  if (first === days[0]) parts.push("Rain from 14:00, so take an umbrella.");
  return parts.join(" ");
}

function DayColumn({ day, done, onToggle }: { day: Day; done: Record<string, boolean>; onToggle: (id: string) => void }) {
  if (day.weekend)
    return (
      <div className="tnum min-h-[200px] rounded-[10px] bg-sunken px-2.5 py-3 text-[13px] font-semibold text-muted">
        {dayShort(day.date)}
      </div>
    );
  return (
    <div className="flex min-h-[200px] flex-col gap-1.5 rounded-[10px] bg-surface p-3">
      <div className="flex items-center justify-between text-[13px]">
        <span className="tnum font-semibold">{dayShort(day.date)}</span>
        {day.isToday && (
          <span className="rounded-[6px] bg-accent px-[7px] py-px text-xs font-semibold text-on-accent">Today</span>
        )}
      </div>
      {day.items.map((it) => (
        <Event key={it.id} item={it} done={!!done[it.id]} onToggle={() => onToggle(it.id)} />
      ))}
    </div>
  );
}

function Event({ item, done, onToggle }: { item: Item; done: boolean; onToggle: () => void }) {
  const c = COURSES[item.course];
  if (item.kind === "class")
    return (
      <div
        className="rounded-[8px] px-2.5 py-2 text-[13px] leading-[1.35]"
        style={{ ...tone(c.tone), background: "var(--soft)", color: "var(--ink-c)" }}
      >
        <div className="font-semibold">{item.title}</div>
        <div className="tnum">
          {item.time}
          {item.place ? `, ${item.place}` : ""}
        </div>
      </div>
    );
  return (
    <div
      className="flex items-start gap-2 rounded-[8px] px-2.5 py-2 text-[13px] leading-[1.35] transition-colors duration-300"
      style={{
        ...tone(c.tone),
        background: done ? "var(--sunken)" : "var(--c)",
        color: done ? "var(--muted)" : "var(--on-solid)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
        className="relative mt-px grid size-[15px] flex-none place-items-center rounded-full before:absolute before:-inset-2.5 before:content-['']"
        style={{ boxShadow: done ? "none" : "inset 0 0 0 1.5px currentColor", background: done ? "var(--accent)" : "transparent" }}
      >
        {done && (
          <motion.span
            initial={{ scale: 0.3 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
            className="grid place-items-center"
          >
            <Check size={10} strokeWidth={3.5} style={{ color: "var(--on-accent)" }} />
          </motion.span>
        )}
      </button>
      <div>
        <div className={`font-semibold ${done ? "line-through" : ""}`}>{item.title}</div>
        <div className={done ? "" : "opacity-85"}>
          {c.short}, {item.time}
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const row = "flex h-8 items-center gap-2.5 rounded-[8px] px-2.5";
  const icon = { size: 15, strokeWidth: 2, "aria-hidden": true, className: "text-muted" } as const;
  const count = (n: number) => <span className="tnum ml-auto text-xs text-muted">{n}</span>;
  return (
    <div className="hidden w-[208px] flex-none flex-col gap-0.5 border-r border-line-soft bg-surface px-3 py-4 text-[13.5px] md:flex">
      <div className="px-1.5 pb-5">
        <TrafficLights />
      </div>
      <div className="flex items-center gap-2.5 px-1.5 pb-4">
        <AppIcon size={26} />
        <div className="flex flex-col leading-[1.25]">
          <span className="font-semibold">Ordo</span>
          <span className="text-xs text-muted">Your uni account</span>
        </div>
      </div>
      <div className={`${row} bg-accent font-semibold text-on-accent`}>
        <Sun size={15} strokeWidth={2} aria-hidden />
        Today
      </div>
      <div className={row}>
        <CalendarDays {...icon} />
        Calendar
      </div>
      <div className={row}>
        <ArrowDownToLine {...icon} />
        New{count(4)}
      </div>
      <div className={row}>
        <Folder {...icon} />
        Courses
      </div>
      <div className={row}>
        <Mail {...icon} />
        Mail{count(2)}
      </div>
      <div className="px-2.5 pt-3.5 pb-1 text-xs text-muted">Learn</div>
      <div className={row}>
        <Layers {...icon} />
        Study{count(13)}
      </div>
      <div className={row}>
        <ChartColumn {...icon} />
        Progress
      </div>
      <div className="px-2.5 pt-3.5 pb-1 text-xs text-muted">Campus</div>
      <div className={row}>
        <MapPin {...icon} />
        Places
      </div>
      <div className={row}>
        <Utensils {...icon} />
        Mensa
      </div>
      <div className="mt-auto px-2.5 pt-5 text-xs leading-[1.45] text-muted">
        Last checked
        <br />
        <span className="text-ink">today, 07:00</span>
      </div>
    </div>
  );
}
