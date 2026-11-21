"use client";

// Kalender-Tab (Variante O2): Woche als Zeitraster Montag bis Sonntag wie in Google Kalender, dazu 4 Wochen.
// Mit „‹ ›“ blättern, „Today“ springt zurück. ILIAS-Termine und Google-Termine stehen zusammen;
// überlappende Termine stehen in Spalten nebeneinander, gleiche Termine aus beiden Quellen werden einer.

import { useEffect, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, colorOf, examLabel, nameOf, shortOf, tone } from "./ui";
import { openEvent, openNewEvent } from "./EventDialog";
import { CalendarChip, DAY_MS, MonthView, abbrTitle, bare, courseById, isoOf, mondayOf, parseDay, startMinutes, timeRange, todayMs } from "./calendar-bits";
import { setCalendar, useMail, type GoogleEvent } from "@/lib/mail-data";
import { useApp } from "@/lib/app-store";
import type { Deadline } from "@/lib/mock-data";

const HOUR = 46; // Höhe einer Stunde im Raster (px)
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MODE_KEY = "studi.calMode";

type Mode = "week" | "month";

/** Ein Termin im Raster: von ILIAS (d), von Google (ev) oder beides (gleiche Zeit, ähnlicher Titel). */
interface Slot {
  key: string;
  start: number; // Minuten ab Mitternacht
  end: number;
  d: Deadline | null;
  ev: GoogleEvent | null;
  both: boolean;
  col: number;
  cols: number;
}

const words = (s: string) =>
  new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
const similar = (a: string, b: string) => [...words(a)].some((w) => words(b).has(w));

/** Spalten für überlappende Termine (wie in Google Kalender): jede Gruppe bekommt so viele Spalten wie nötig. */
function layout(slots: Omit<Slot, "col" | "cols">[]): Slot[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Slot[] = [];
  let group: Slot[] = [];
  let groupEnd = -1;
  const close = () => {
    const cols = Math.max(1, ...group.map((s) => s.col + 1));
    group.forEach((s) => (s.cols = cols));
    out.push(...group);
    group = [];
  };
  for (const s of sorted) {
    if (group.length && s.start >= groupEnd) close();
    const ends: number[] = [];
    for (const g of group) ends[g.col] = Math.max(ends[g.col] ?? 0, g.end);
    let col = ends.findIndex((e) => e <= s.start);
    if (col < 0) col = ends.length;
    group.push({ ...s, col, cols: 1 });
    groupEnd = Math.max(groupEnd, s.end);
  }
  if (group.length) close();
  return out;
}

export function CalendarView({
  deadlines,
  done,
  onToggle,
  onOpenCourse,
}: {
  deadlines: Deadline[];
  done: string[];
  onToggle: (id: string) => void;
  onOpenCourse: (id: string) => void;
}) {
  const app = useApp();
  const mail = useMail();
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return window.localStorage.getItem(MODE_KEY) === "month" ? "month" : "week";
    } catch {
      return "week";
    }
  });
  const [offset, setOffset] = useState(0); // Wochen ab dieser Woche
  const [dir, setDir] = useState(0); // Richtung der letzten Bewegung (für die Animation)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const pickMode = (m: Mode) => {
    setMode(m);
    setOffset(0);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      // egal
    }
  };
  const step = mode === "week" ? 1 : 4;
  const go = (n: number) => {
    setDir(Math.sign(n));
    setOffset((o) => (n === 0 ? 0 : o + n * step));
  };

  const googleConnected = mail.accounts.some((a) => a.id === "gmail" && a.connected);
  const showIlias = mail.calendars.ilias || !googleConnected;
  const googleEvents = googleConnected && mail.calendars.google ? mail.events : [];
  const [showClasses, setShowClasses] = useState(() => {
    try {
      return window.localStorage.getItem("studi.showClasses") !== "0";
    } catch {
      return true;
    }
  });
  const toggleClasses = () =>
    setShowClasses((v) => {
      try {
        window.localStorage.setItem("studi.showClasses", v ? "0" : "1");
      } catch {
        // egal
      }
      return !v;
    });
  const hasClasses = deadlines.some((d) => d.kind === "termin");
  const ilias = showIlias ? (showClasses ? deadlines : deadlines.filter((d) => d.kind !== "termin")) : [];

  const start = mondayOf(todayMs()) + offset * 7 * DAY_MS;
  const lastDay = start + (mode === "week" ? 6 : 27) * DAY_MS;
  const fmt = (ms: number, year = false) => {
    const d = new Date(ms);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year ? `, ${d.getUTCFullYear()}` : ""}`;
  };
  const rangeLabel = `${fmt(start)} – ${fmt(lastDay, true)}`;

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Calendar</h1>
          <p className="mt-1 text-muted">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => go(0)} disabled={offset === 0}>
            Today
          </Button>
          <div className="flex">
            <button onClick={() => go(-1)} aria-label={mode === "week" ? "Previous week" : "Previous 4 weeks"} className="press flex size-8 items-center justify-center rounded-l-lg border border-line bg-surface hover:bg-hover">
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button onClick={() => go(1)} aria-label={mode === "week" ? "Next week" : "Next 4 weeks"} className="press -ml-px flex size-8 items-center justify-center rounded-r-lg border border-line bg-surface hover:bg-hover">
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-[9px] bg-sunken p-[3px]">
            {(["week", "month"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => pickMode(m)}
                className={`h-7 rounded-[7px] px-3.5 transition-colors ${mode === m ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-text"}`}
              >
                {m === "week" ? "Week" : "4 weeks"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {googleConnected && (
          <>
            <CalendarChip on={mail.calendars.ilias} onChange={(on) => setCalendar("ilias", on)} dashed={false}>
              ILIAS deadlines
            </CalendarChip>
            <CalendarChip on={mail.calendars.google} onChange={(on) => setCalendar("google", on)} dashed>
              Google Calendar
            </CalendarChip>
          </>
        )}
        {hasClasses && (
          <label className="ml-1 inline-flex cursor-default items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={showClasses} onChange={toggleClasses} className="accent-[var(--accent)]" />
            Show classes and events
          </label>
        )}
        <Button variant="plain" className="ml-auto" onClick={() => openNewEvent()}>
          <CalendarPlus size={14} aria-hidden /> Add event
        </Button>
      </div>

      <div key={`${mode}-${offset}`} className="cal-enter" style={{ ["--cal-dir" as string]: dir }}>
        {mode === "month" ? (
          <MonthView deadlines={ilias} events={googleEvents} done={done} onOpen={onOpenCourse} start={start} />
        ) : (
          <WeekGrid start={start} today={app.today} now={now} deadlines={ilias} events={googleEvents} done={done} onToggle={onToggle} onOpenCourse={onOpenCourse} />
        )}
      </div>
    </>
  );
}

function WeekGrid({
  start,
  today,
  now,
  deadlines,
  events,
  done,
  onToggle,
  onOpenCourse,
}: {
  start: number;
  today: string;
  now: Date;
  deadlines: Deadline[];
  events: GoogleEvent[];
  done: string[];
  onToggle: (id: string) => void;
  onOpenCourse: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = isoOf(start + i * DAY_MS);
    const ds = deadlines.filter((d) => d.date === iso && courseById(d.courseId));
    const es = events.filter((e) => e.date === iso);
    // Mit Uhrzeit von–bis ins Raster, alles andere (Abgaben, ganztägig) in die Zeile oben
    const timed: Omit<Slot, "col" | "cols">[] = [];
    const top: { key: string; d: Deadline | null; ev: GoogleEvent | null }[] = [];
    for (const d of ds) {
      const r = timeRange(d.time) ?? (d.kind === "termin" && startMinutes(d.time) >= 0 ? [startMinutes(d.time), startMinutes(d.time) + 60] as [number, number] : null);
      if (r && d.kind !== "abgabe") timed.push({ key: d.id, start: r[0], end: Math.max(r[1], r[0] + 20), d, ev: null, both: false });
      else top.push({ key: d.id, d, ev: null });
    }
    for (const ev of es) {
      const r = timeRange(ev.time) ?? (startMinutes(ev.time) >= 0 ? ([startMinutes(ev.time), startMinutes(ev.time) + 60] as [number, number]) : null);
      if (!r) {
        top.push({ key: `g-${ev.id}`, d: null, ev });
        continue;
      }
      // Gleiche Zeit und ähnlicher Titel wie ein ILIAS-Termin: derselbe Termin, nur einmal zeigen
      const twin = timed.find((t) => t.d && !t.both && t.start === r[0] && t.end === r[1] && similar(t.d.title + " " + (courseById(t.d.courseId)?.name ?? ""), ev.title));
      if (twin) {
        twin.both = true;
        twin.ev = ev;
      } else timed.push({ key: `g-${ev.id}`, start: r[0], end: Math.max(r[1], r[0] + 20), d: null, ev, both: false });
    }
    return { iso, num: new Date(start + i * DAY_MS).getUTCDate(), wd: i, today: iso === today, slots: layout(timed), top };
  });

  // Sichtbare Stunden: mindestens 8 bis 18 Uhr, sonst so weit die Termine reichen
  const all = days.flatMap((d) => d.slots);
  const h0 = Math.max(0, Math.min(8, ...all.map((s) => Math.floor(s.start / 60))));
  const h1 = Math.min(24, Math.max(18, ...all.map((s) => Math.ceil(s.end / 60))));
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hasTop = days.some((d) => d.top.length > 0);

  const newAt = (iso: string, minute: number) => {
    const h = Math.min(22, Math.floor(minute / 60));
    const pad = (n: number) => String(n).padStart(2, "0");
    openNewEvent({ date: iso, start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` });
  };

  return (
    <div className="mt-6 overflow-hidden rounded-[12px] bg-surface shadow-[0_0_0_1px_var(--line)]">
      {/* Kopf: Wochentage */}
      <div className="grid border-b border-line-soft" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
        <span />
        {days.map((d) => (
          <div key={d.iso} className={`flex items-center gap-1.5 px-2 py-2.5 ${d.wd >= 5 ? "text-muted" : ""}`}>
            <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 font-bold ${d.today ? "bg-accent text-on-accent" : ""}`}>{d.num}</span>
            <span className={d.today ? "font-semibold" : "text-muted"}>{WD[d.wd]}</span>
          </div>
        ))}
      </div>

      {/* Abgaben und ganztägige Termine */}
      {hasTop && (
        <div className="grid border-b border-line-soft" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
          <span className="px-2 py-1.5 text-right text-[11px] leading-tight text-muted">due &amp; all day</span>
          {days.map((d) => (
            <div key={d.iso} className={`flex min-w-0 flex-col gap-1 border-l border-line-soft p-1 ${d.wd >= 5 ? "bg-sunken/50" : ""}`}>
              {d.top.map((t) => (t.d ? <TopChip key={t.key} d={t.d} done={done.includes(t.d.id)} onToggle={() => onToggle(t.d!.id)} onOpenCourse={onOpenCourse} /> : <TopGoogle key={t.key} ev={t.ev!} />))}
            </div>
          ))}
        </div>
      )}

      {/* Zeitraster */}
      <div className="relative grid" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
        <div className="relative" style={{ height: hours.length * HOUR }}>
          {hours.map((h, i) => (
            <span key={h} className="absolute right-2 text-[11px] tabular-nums text-muted" style={{ top: i * HOUR - 7 }}>
              {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.iso}
            className={`relative border-l border-line-soft ${d.wd >= 5 ? "bg-sunken/50" : ""}`}
            style={{ height: hours.length * HOUR }}
            onDoubleClick={(e) => {
              if (e.target !== e.currentTarget) return;
              const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
              newAt(d.iso, h0 * 60 + (y / HOUR) * 60);
            }}
            title="Double-click to add an event"
          >
            {hours.map((h, i) => (
              <span key={h} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-line-soft" style={{ top: i * HOUR }} />
            ))}
            {d.slots.map((s) => (
              <GridBlock key={s.key} slot={s} h0={h0} done={s.d ? done.includes(s.d.id) : false} onOpenCourse={onOpenCourse} />
            ))}
            {d.today && nowMin >= h0 * 60 && nowMin <= h1 * 60 && (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowMin - h0 * 60) / 60) * HOUR - 4 }}>
                <span className="size-2 rounded-full bg-danger" />
                <span className="h-[2px] flex-1 bg-danger" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GridBlock({ slot, h0, done, onOpenCourse }: { slot: Slot; h0: number; done: boolean; onOpenCourse: (id: string) => void }) {
  const top = ((slot.start - h0 * 60) / 60) * HOUR + 1;
  const height = Math.max(20, ((slot.end - slot.start) / 60) * HOUR - 3);
  const gap = 3;
  const left = `calc(${(slot.col / slot.cols) * 100}% + ${gap}px)`;
  const width = `calc(${100 / slot.cols}% - ${gap * 2}px)`;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const time = `${hhmm(slot.start)}–${hhmm(slot.end)}`;
  const tiny = height < 40;

  if (slot.d) {
    const d = slot.d;
    const course = courseById(d.courseId)!;
    const c = d.color ?? colorOf(course);
    const exam = d.kind === "klausur";
    const title = exam ? examLabel(d.title, course) : bare(d.title);
    return (
      <button
        onClick={() => openEvent(d, { onOpenCourse: () => onOpenCourse(d.courseId) })}
        title={[`${d.title}, ${nameOf(course)}, ${time}`, slot.both ? "Also in Google Calendar" : "", d.location ? `Room: ${d.location}` : ""].filter(Boolean).join(" · ")}
        className={`cal-block absolute overflow-hidden rounded-[6px] px-1.5 py-1 text-left leading-tight ${done ? "opacity-50" : ""}`}
        style={{
          top,
          height,
          left,
          width,
          background: tone(c, "soft"),
          boxShadow: exam ? `inset 0 0 0 2px ${tone(c)}` : slot.both ? `inset 0 0 0 1.5px ${tone(c)}` : undefined,
        }}
      >
        <span className="block truncate text-[11px] font-semibold" style={{ color: tone(c, "ink") }}>
          {tiny ? `${hhmm(slot.start)} ${abbrTitle(title, 30)}` : time}
          {slot.both && <span className="ml-1 font-bold" style={{ color: "#4285f4" }}>+G</span>}
        </span>
        {!tiny && <span className="block text-[12px] font-semibold">{slot.cols > 2 ? abbrTitle(title, 14) : title}</span>}
        {!tiny && height > 64 && <span className="block truncate text-[11px] text-muted">{d.location || shortOf(course)}</span>}
      </button>
    );
  }
  const ev = slot.ev!;
  const color = ev.color ?? "var(--muted)";
  return (
    <div
      title={[ev.title, time, ev.location ?? "", ev.calendar ? `Google Calendar: ${ev.calendar}` : "Google Calendar"].filter(Boolean).join(" · ")}
      className="cal-block absolute overflow-hidden rounded-[6px] px-1.5 py-1 leading-tight"
      style={{ top, height, left, width, border: `1.5px dashed ${color}`, background: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
    >
      <span className="block truncate text-[11px] font-semibold">
        {tiny ? `${hhmm(slot.start)} ${ev.title}` : time} <span className="font-bold" style={{ color: "#4285f4" }}>G</span>
      </span>
      {!tiny && <span className="block text-[12px] font-semibold">{slot.cols > 2 ? abbrTitle(ev.title, 14) : ev.title}</span>}
      {!tiny && height > 64 && ev.location && <span className="block truncate text-[11px] text-muted">{ev.location}</span>}
    </div>
  );
}

function TopChip({ d, done, onToggle, onOpenCourse }: { d: Deadline; done: boolean; onToggle: () => void; onOpenCourse: (id: string) => void }) {
  const course = courseById(d.courseId)!;
  const c = d.color ?? colorOf(course);
  const exam = d.kind === "klausur";
  const checkable = d.kind === "abgabe";
  const label = exam ? examLabel(d.title, course) : bare(d.title);
  const due = parseDay(d.date) <= todayMs() + 2 * DAY_MS && checkable && !done;
  return (
    <div
      className={`flex min-w-0 items-center gap-1 rounded-[5px] py-0.5 pl-1.5 pr-1 text-[11px] font-semibold ${done ? "line-through" : ""}`}
      style={done ? { background: "var(--sunken)", color: "var(--muted)" } : due || exam ? { background: tone(c), color: "var(--on-solid)" } : { background: tone(c, "soft"), color: tone(c, "ink") }}
    >
      <button onClick={() => openEvent(d, { onOpenCourse: () => onOpenCourse(d.courseId) })} title={`${d.title}, ${nameOf(course)}, ${d.time}`} className="min-w-0 flex-1 truncate text-left">
        {abbrTitle(label, 22)}
      </button>
      {checkable && (
        <button onClick={onToggle} aria-label={done ? `Mark ${d.title} as not done` : `Mark ${d.title} as done`} className="flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-current opacity-80 hover:opacity-100">
          {done && <span className="size-1.5 rounded-full bg-current" />}
        </button>
      )}
    </div>
  );
}

function TopGoogle({ ev }: { ev: GoogleEvent }) {
  const color = ev.color ?? "var(--muted)";
  return (
    <span title={`${ev.title}${ev.calendar ? ` · Google Calendar: ${ev.calendar}` : ""}`} className="truncate rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold" style={{ border: `1.5px dashed ${color}` }}>
      {abbrTitle(ev.title, 22)}
    </span>
  );
}
