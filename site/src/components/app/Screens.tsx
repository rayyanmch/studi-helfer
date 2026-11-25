"use client";

import { useState } from "react";
import { CookingPot, Drumstick, Navigation, Salad, Soup, CalendarPlus, type LucideIcon } from "lucide-react";
import { DocGlyph, tone } from "../ui";
import { COURSES, dayShort, keyOf, nextDays, rangeLabel, workWeek, type CourseKey, type Tone } from "@/lib/week";

// Die übrigen Bildschirme der Live-Vorschau, mit Beispieldaten. In jedem passiert etwas:
// neue Datei, neue Mail, Jetzt-Linie, Karte umdrehen.

function Title({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[28px] leading-[1.1] font-bold tracking-[-0.02em]">{title}</div>
        <div className="tnum mt-1 text-[13px] text-muted">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function CourseChip({ course }: { course: CourseKey }) {
  const c = COURSES[course];
  return (
    <span
      className="rounded-[6px] px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ ...tone(c.tone), background: "var(--soft)", color: "var(--ink-c)" }}
    >
      {c.name}
    </span>
  );
}

/* ---------- Dateien (New) ---------- */

const NEW_FILES: { name: string; course: CourseKey; when: string; fresh?: boolean }[] = [
  { name: "VL07_Zustandsautomaten.pdf", course: "se", when: "just now", fresh: true },
  { name: "Blatt08.pdf", course: "mathe", when: "07:00" },
  { name: "Fallstudie_Marketing.docx", course: "bwl", when: "07:00" },
  { name: "Uebungsblatt_06.pdf", course: "db", when: "yesterday" },
  { name: "Uebungsblatt_04_Loesung.pdf", course: "se", when: "yesterday" },
];

export function FilesScreen() {
  return (
    <div className="stagger-in flex flex-col gap-4">
      <Title title="New" sub="Files you haven’t opened yet">
        <span className="inline-flex h-[30px] items-center rounded-[8px] bg-surface px-3 text-[13px] font-semibold shadow-[0_0_0_1px_var(--line)]">
          Mark all as seen
        </span>
      </Title>
      <div className="overflow-hidden rounded-[12px] bg-surface text-[13.5px]">
        {NEW_FILES.map((f, i) => (
          <div
            key={f.name}
            className={`flex h-[50px] items-center gap-3 bg-surface px-4 ${i ? "border-t border-line-soft" : ""} ${f.fresh ? "newrow" : ""}`}
          >
            <DocGlyph t={COURSES[f.course].tone} size={14} />
            <span className="truncate font-semibold">{f.name}</span>
            <span className="ml-auto hidden sm:block">
              <CourseChip course={f.course} />
            </span>
            <span
              className={`tnum w-[68px] flex-none text-right text-[12.5px] max-sm:ml-auto ${f.fresh ? "font-semibold" : "text-muted"}`}
              style={f.fresh ? { color: "var(--c-blue)" } : undefined}
            >
              {f.when}
            </span>
          </div>
        ))}
      </div>
      <p className="m-0 text-[12.5px] text-muted">Checked just now. Everything is in your Uni folder, sorted by course.</p>
    </div>
  );
}

/* ---------- Kalender (Woche) ---------- */

const CLASSES: { day: number; start: number; end: number; course: CourseKey; title: string; note?: string }[] = [
  { day: 0, start: 600, end: 690, course: "mathe", title: "Mathe I Lecture" },
  { day: 0, start: 840, end: 930, course: "bwl", title: "BWL Lecture" },
  { day: 1, start: 720, end: 810, course: "mathe", title: "Mathe I Exercise" },
  { day: 2, start: 600, end: 690, course: "mathe", title: "Mathe I Lecture" },
  { day: 2, start: 720, end: 810, course: "se", title: "SE Lecture" },
  { day: 3, start: 600, end: 690, course: "db", title: "DB Lecture" },
  { day: 3, start: 840, end: 930, course: "bwl", title: "BWL Tutorial" },
  { day: 4, start: 840, end: 930, course: "se", title: "SE Tutorial", note: "room 1.21" },
];
const FROM = 480;
const TO = 990;
const HEIGHT = 330;
const y = (min: number) => ((min - FROM) / (TO - FROM)) * HEIGHT;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function CalendarScreen({ today, now }: { today: Date; now: number | null }) {
  const week = workWeek(today);
  const todayKey = keyOf(today);
  // Abgaben der nächsten Tage oben in die Spalte des Tages
  const due = nextDays(today, 7).flatMap((d) => d.items.filter((i) => i.kind === "due").map((i) => ({ i, key: keyOf(d.date) })));
  return (
    <div className="stagger-in flex flex-col gap-3.5">
      <Title title="Calendar" sub={rangeLabel(week)}>
        <div className="flex rounded-[8px] bg-sunken p-[3px] text-[12.5px] font-semibold">
          <span className="rounded-[6px] bg-surface px-2.5 py-1">Week</span>
          <span className="px-2.5 py-1 text-muted">4 weeks</span>
        </div>
      </Title>
      <div className="grid grid-cols-[40px_repeat(5,minmax(0,1fr))] gap-1.5 text-[12px]">
        <span />
        {week.map((d) => (
          <span key={d.toDateString()} className={`tnum font-semibold ${keyOf(d) === todayKey ? "" : "text-muted"}`}>
            {dayShort(d)}
          </span>
        ))}
        <span />
        {week.map((d) => (
          <span key={d.toDateString()} className="flex min-h-[22px] flex-col gap-1">
            {due
              .filter((x) => x.key === keyOf(d))
              .map(({ i }) => (
                <span
                  key={i.id}
                  className={`truncate rounded-[6px] px-1.5 py-0.5 font-semibold ${i.done ? "line-through" : ""}`}
                  style={{
                    ...tone(COURSES[i.course].tone),
                    background: i.done ? "var(--sunken)" : "var(--c)",
                    color: i.done ? "var(--muted)" : "var(--on-solid)",
                  }}
                >
                  {i.title}
                </span>
              ))}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[40px_repeat(5,minmax(0,1fr))] gap-1.5 text-[11.5px]" style={{ height: HEIGHT }}>
        <div className="tnum relative text-faint">
          {[480, 600, 720, 840, 960].map((m) => (
            <span key={m} className="absolute -translate-y-1/2" style={{ top: Math.max(6, y(m)) }}>
              {hhmm(m)}
            </span>
          ))}
        </div>
        {week.map((d, di) => {
          const isToday = keyOf(d) === todayKey;
          return (
            <div
              key={d.toDateString()}
              className="relative rounded-[8px] bg-surface"
              style={isToday ? { boxShadow: "inset 0 0 0 1.5px var(--accent)" } : undefined}
            >
              {CLASSES.filter((c) => c.day === di).map((c) => (
                <div
                  key={c.title + c.start}
                  className="absolute inset-x-1 overflow-hidden rounded-[7px] px-2 py-1.5 leading-[1.3]"
                  style={{
                    ...tone(COURSES[c.course].tone),
                    top: y(c.start),
                    height: y(c.end) - y(c.start) - 2,
                    background: "var(--soft)",
                    color: "var(--ink-c)",
                  }}
                >
                  <div className="truncate font-semibold">{c.title}</div>
                  <div className="tnum truncate">{c.note ? `${hhmm(c.start)}, ${c.note}` : `${hhmm(c.start)}–${hhmm(c.end)}`}</div>
                </div>
              ))}
              {isToday && now !== null && now >= FROM && now <= TO && (
                <div aria-hidden className="absolute inset-x-0 h-[2px] bg-[#d64545]" style={{ top: y(now) }}>
                  <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-[#d64545]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Mail ---------- */

const MAILS: { from: string; subject: string; when: string; course?: CourseKey; unread?: boolean; fresh?: boolean }[] = [
  { from: "Lehrstuhl Softwaretechnik", subject: "Tutorium am Freitag in Raum 1.21", when: "now", course: "se", unread: true, fresh: true },
  { from: "ILIAS", subject: "Neue Datei in Mathe I: Blatt08.pdf", when: "07:02", course: "mathe", unread: true },
  { from: "Fachschaft WiSo", subject: "Klausurtraining BWL am Samstag", when: "Tue", course: "bwl" },
  { from: "Studierendensekretariat", subject: "Rückmeldung zum Sommersemester", when: "Mon" },
];

export function MailScreen() {
  return (
    <div className="flex h-full gap-3.5">
      <div className="stagger-in flex w-full flex-none flex-col gap-3 md:w-[300px]">
        <div className="text-[28px] leading-[1.1] font-bold tracking-[-0.02em]">Mail</div>
        <div className="overflow-hidden rounded-[12px] bg-surface text-[13px]">
          {MAILS.map((m, i) => (
            <div
              key={m.subject}
              className={`bg-surface px-3.5 py-2.5 ${i ? "border-t border-line-soft" : ""} ${m.fresh ? "newrow" : ""}`}
              style={m.fresh ? { boxShadow: "inset 3px 0 0 var(--c-blue)" } : undefined}
            >
              <div className="flex justify-between gap-2">
                <span className={m.unread ? "font-bold" : "font-semibold"}>{m.from}</span>
                <span className="tnum flex-none text-muted" style={m.fresh ? { color: "var(--c-blue)", fontWeight: 600 } : undefined}>
                  {m.when}
                </span>
              </div>
              <div lang="de" className={`mt-0.5 truncate ${m.unread ? "" : "text-muted"}`}>
                {m.subject}
              </div>
              {m.course && (
                <div className="mt-1.5">
                  <CourseChip course={m.course} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="stagger-in hidden min-w-0 flex-1 flex-col rounded-[12px] bg-surface px-6 py-5 text-[13.5px] leading-[1.55] md:flex">
        <div className="text-[12.5px] text-muted">Lehrstuhl Softwaretechnik, now</div>
        <div lang="de" className="mt-1.5 text-[19px] font-bold tracking-[-0.01em]">
          Tutorium am Freitag in Raum 1.21
        </div>
        <p lang="de" className="m-0 mt-3.5">
          Liebe Studierende,
          <br />
          das Tutorium am Freitag findet ausnahmsweise in Raum 1.21 statt. Danach wieder wie gewohnt.
        </p>
        <div className="mt-5 rounded-[10px] p-3.5" style={{ background: "var(--c-blue-soft)", color: "var(--c-blue-ink)" }}>
          <div className="font-bold">Room changed</div>
          <div className="mt-0.5">SE Tutorial, Fri 14:00: Seminarraum 2 → 1.21. Only this week.</div>
          <div className="mt-2.5 flex gap-2 text-[12.5px] font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-white" style={{ background: "var(--c-blue)" }}>
              <Navigation aria-hidden size={13} strokeWidth={2.2} />
              Route
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-surface px-3 py-1.5">
              <CalendarPlus aria-hidden size={13} strokeWidth={2.2} />
              Show in calendar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Mensa ---------- */

const DISHES: { name: string; tag?: "Vegan" | "Vegetarian"; counter: string; icon: LucideIcon; tone: Tone | "ochre" | "rose" }[] = [
  { name: "Lentil dal with basmati rice", tag: "Vegan", counter: "Counter 1", icon: CookingPot, tone: "green" },
  { name: "Spinach and ricotta cannelloni", tag: "Vegetarian", counter: "Counter 2", icon: Salad, tone: "ochre" },
  { name: "Chicken curry with jasmine rice", counter: "Counter 3", icon: Drumstick, tone: "orange" },
  { name: "Tomato soup", tag: "Vegan", counter: "Soup bar", icon: Soup, tone: "rose" },
];
const DISH_COLORS: Record<string, [string, string]> = {
  green: ["var(--c-green-soft)", "var(--c-green-ink)"],
  orange: ["var(--c-orange-soft)", "var(--c-orange-ink)"],
  ochre: ["#f6f0dc", "#765d14"],
  rose: ["#f8e8eb", "#8c3341"],
};

export function MensaScreen() {
  return (
    <div className="stagger-in flex flex-col gap-4">
      <Title title="Mensa" sub="Mensa Zülpicher Straße, open until 14:30">
        <div className="flex gap-1.5 text-[12.5px] font-semibold">
          <span className="rounded-full bg-accent px-3 py-1 text-on-accent">All</span>
          <span className="rounded-full bg-surface px-3 py-1 shadow-[0_0_0_1px_var(--line)]">Vegetarian</span>
          <span className="rounded-full bg-surface px-3 py-1 shadow-[0_0_0_1px_var(--line)]">Vegan</span>
        </div>
      </Title>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {DISHES.map(({ name, tag, counter, icon: Icon, tone: t }) => {
          const [bg, ink] = DISH_COLORS[t];
          return (
            <div key={name} className="flex items-center gap-3.5 rounded-[12px] bg-surface p-4">
              <span className="grid size-[52px] flex-none place-items-center rounded-full" style={{ background: bg }}>
                <Icon aria-hidden size={24} strokeWidth={1.8} style={{ color: ink }} />
              </span>
              <div className="text-[13.5px] leading-[1.4]">
                <div className="font-semibold">{name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-muted">
                  {tag && (
                    <span
                      className="rounded-[5px] px-1.5 text-[11.5px] font-semibold"
                      style={tag === "Vegan" ? { background: "var(--c-green-soft)", color: "var(--c-green-ink)" } : { background: "#f6f0dc", color: "#765d14" }}
                    >
                      {tag}
                    </span>
                  )}
                  {counter}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="m-0 text-[12.5px] text-muted">Lunch shows up on your Today screen too, Monday to Friday.</p>
    </div>
  );
}

/* ---------- Lernen (Karteikarte) ---------- */

export function StudyScreen() {
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(4);
  return (
    <div className="stagger-in flex flex-col items-center gap-4">
      <div className="self-stretch">
        <Title title="Study" sub="Softwaretechnik, week 6">
          <span className="tnum text-[13px] text-muted">{known} of 13 today, about 3 min</span>
        </Title>
      </div>
      <div className="flex gap-1 self-stretch" aria-hidden>
        {Array.from({ length: 13 }, (_, i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors duration-300"
            style={{ background: i < known ? "var(--c-green)" : "var(--line)" }}
          />
        ))}
      </div>
      <div className="relative mt-2 h-[290px] w-full max-w-[560px]">
        <div className="absolute inset-[22px_30px_-10px] rounded-[18px] bg-[#dfe6ee]" style={{ transform: "rotate(-3deg)" }} />
        <div className="absolute inset-[10px_14px_-2px] rounded-[18px] bg-sunken" style={{ transform: "rotate(1.5deg)" }} />
        <div className="absolute inset-0 flex flex-col justify-between rounded-[18px] bg-surface px-8 py-7 shadow-[0_0_0_1px_var(--ring),0_20px_40px_-24px_rgb(var(--shadow-color)/0.4)]">
          <div className="text-[23px] leading-[1.3] font-semibold tracking-[-0.01em]">What does the Observer pattern decouple?</div>
          {flipped && (
            <div className="stagger-in">
              <p className="m-0 text-[15.5px] leading-[1.5] text-muted">
                The subject from its observers. The subject only knows that someone listens, not what they do with the update.
              </p>
            </div>
          )}
          <div className="flex justify-center gap-2.5">
            {!flipped ? (
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="press h-10 cursor-pointer rounded-full bg-accent px-5 text-sm font-semibold text-on-accent"
              >
                Show answer
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setFlipped(false)}
                  className="press h-10 cursor-pointer rounded-full px-[18px] text-sm font-semibold"
                  style={{ background: "var(--c-orange-soft)", color: "var(--c-orange-ink)" }}
                >
                  Didn’t know
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKnown((k) => Math.min(13, k + 1));
                    setFlipped(false);
                  }}
                  className="press h-10 cursor-pointer rounded-full px-[18px] text-sm font-semibold"
                  style={{ background: "var(--c-green-soft)", color: "var(--c-green-ink)" }}
                >
                  Knew it
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
