"use client";

import { motion } from "motion/react";
import { Check, CloudRain } from "lucide-react";
import { tone } from "../ui";
import { COURSES, dayLong, dayShort, lectureWeek, nextDays, relativeDay, type Day, type Item } from "@/lib/week";

export type Done = Record<string, boolean>;

// „Today“ mit den nächsten 4 Tagen. Abgaben lassen sich abhaken, der Satz oben passt sich an.
export function TodayScreen({
  today,
  done,
  onToggle,
  className = "",
}: {
  today: Date;
  done: Done;
  onToggle: (id: string) => void;
  className?: string;
}) {
  const days = nextDays(today);
  const week = lectureWeek(today);
  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[28px] leading-[1.1] font-bold tracking-[-0.02em]">Today</div>
          <div className="tnum mt-1 text-[13px] text-muted">
            {dayLong(today)}
            {week ? `. Lecture week ${week}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <CloudRain aria-hidden size={19} strokeWidth={1.8} style={{ color: "var(--c-blue)" }} />
          Rain from 14:00
        </div>
      </div>
      <p className="m-0 max-w-[46em] text-[15.5px] leading-[1.5]">{sentence(today, days, done)}</p>
      <div>
        <div className="mb-2.5 text-[15px] font-semibold">Next 4 days</div>
        <div
          className="grid grid-cols-2 gap-2 sm:[grid-template-columns:var(--cols)]"
          style={{
            ["--cols" as string]: days.map((d) => (d.weekend ? "0.5fr" : d.items.length > 1 ? "1.3fr" : "1fr")).join(" "),
          }}
        >
          {days.map((d) => (
            <DayColumn key={d.date.toDateString()} day={d} done={done} onToggle={onToggle} />
          ))}
        </div>
      </div>
    </div>
  );
}

function sentence(today: Date, days: Day[], done: Done): string {
  const first = days.find((d) => !d.weekend);
  const sheet4Day = days.find((d) => d.items.some((i) => i.id === "sheet4"));
  const parts: string[] = [days[0].weekend ? "Nothing on today." : "Mathe I at 10:00 in Aula 1."];
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

function DayColumn({ day, done, onToggle }: { day: Day; done: Done; onToggle: (id: string) => void }) {
  if (day.weekend)
    return (
      <div className="tnum min-h-[180px] rounded-[10px] bg-sunken px-2.5 py-3 text-[12.5px] font-semibold text-muted">
        {dayShort(day.date)}
      </div>
    );
  return (
    <div className="flex min-h-[180px] flex-col gap-1.5 rounded-[10px] bg-surface p-3">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="tnum font-semibold">{dayShort(day.date)}</span>
        {day.isToday && (
          <span className="rounded-[6px] bg-accent px-[7px] py-px text-[11.5px] font-semibold text-on-accent">Today</span>
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
        className="rounded-[8px] px-2.5 py-2 text-[12.5px] leading-[1.35]"
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
      className="flex items-start gap-2 rounded-[8px] px-2.5 py-2 text-[12.5px] leading-[1.35] transition-colors duration-300"
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
        className="relative mt-px grid size-[15px] flex-none cursor-pointer place-items-center rounded-full before:absolute before:-inset-2.5 before:content-['']"
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
