// Eigene Termine (CustomEvent) in einzelne Termine (Deadline) auflösen, plus Ausblenden erkannter Termine.
// Rein und ohne Seiteneffekte: läuft im Browser (Beispieldaten) wie in der Mac-App.
// Vorlesungszeit und Feiertage wie desktop/lib/schedule.js (Uni Köln, NRW).

import type { CustomEvent, Deadline } from "./mock-data";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
/** 0 = Montag … 6 = Sonntag */
export const weekdayOf = (isoDate: string) => (parseIso(isoDate).getDay() + 6) % 7;

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = new Date(year, month, 1);
  const offset = (weekday - ((first.getDay() + 6) % 7) + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** Vorlesungszeit an der Uni Köln (Faustregel): WiSe 2. Mo im Oktober bis 1. Fr im Februar, SoSe 2. Mo im April bis 4. Fr im Juli. */
export function lecturePeriod(today: Date) {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (m >= 7 || m <= 1) {
    const ys = m >= 7 ? y : y - 1;
    return { start: iso(nthWeekday(ys, 9, 0, 2)), end: iso(nthWeekday(ys + 1, 1, 4, 1)) };
  }
  return { start: iso(nthWeekday(y, 3, 0, 2)), end: iso(nthWeekday(y, 6, 4, 4)) };
}

function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(year, month - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

const closedCache = new Map<number, Set<string>>();
/** Tage ohne Lehre: Feiertage NRW, Weihnachtspause (23.12.–06.01., Uni Köln „Weihnachtsruhe“), Rosenmontag. */
export function isClosedDay(isoDate: string) {
  const y = Number(isoDate.slice(0, 4));
  let set = closedCache.get(y);
  if (!set) {
    set = new Set<string>();
    for (const yy of [y - 1, y]) {
      const e = easter(yy);
      for (const d of [new Date(yy, 0, 1), addDays(e, -2), addDays(e, 1), new Date(yy, 4, 1), addDays(e, 39), addDays(e, 50), addDays(e, 60), new Date(yy, 9, 3), new Date(yy, 10, 1), addDays(e, -48)])
        set.add(iso(d));
      for (let d = new Date(yy, 11, 23); d <= new Date(yy + 1, 0, 6); d = addDays(d, 1)) set.add(iso(d));
    }
    closedCache.set(y, set);
  }
  return set.has(isoDate);
}

/** Alle Tage eines eigenen Termins zwischen from und to (ISO, inklusive). */
export function occurrences(ev: CustomEvent, from: string, to: string, today = new Date()): string[] {
  const out: string[] = [];
  const skip = new Set(ev.exceptions);
  const keep = (day: string) => day >= from && day <= to && !skip.has(day) && !(ev.skipHolidays && ev.repeat !== "none" && isClosedDay(day));
  if (ev.repeat === "none") return keep(ev.date) ? [ev.date] : [];

  const until = ev.until ?? lecturePeriod(parseIso(ev.date) > today ? parseIso(ev.date) : today).end;
  const last = until < to ? until : to;
  const start = parseIso(ev.date);
  if (ev.repeat === "daily") {
    for (let d = start, n = 0; iso(d) <= last && n < 800; d = addDays(d, 1), n++) if (keep(iso(d))) out.push(iso(d));
    return out;
  }
  if (ev.repeat === "monthly") {
    for (let n = 0; n < 36; n++) {
      const d = new Date(start.getFullYear(), start.getMonth() + n, start.getDate());
      if (d.getDate() !== start.getDate()) continue; // 31. gibt es nicht in jedem Monat
      if (iso(d) > last) break;
      if (keep(iso(d))) out.push(iso(d));
    }
    return out;
  }
  const step = ev.repeat === "biweekly" ? 14 : 7;
  const days = ev.weekdays.length ? [...ev.weekdays].sort() : [weekdayOf(ev.date)];
  for (let week = mondayOf(start), n = 0; iso(week) <= last && n < 200; week = addDays(week, step), n++) {
    for (const wd of days) {
      const d = addDays(week, wd);
      if (d < start || iso(d) > last) continue;
      if (keep(iso(d))) out.push(iso(d));
    }
  }
  return out;
}

/** Uhrzeit-Text wie bei erkannten Terminen: „by 23:55“, „14:00–15:30“, „10:00“, „all day“. */
export function timeLabel(ev: Pick<CustomEvent, "kind" | "start" | "end">) {
  if (!ev.start) return "all day";
  if (ev.kind === "abgabe") return `by ${ev.start}`;
  return ev.end ? `${ev.start}–${ev.end}` : ev.start;
}

const OTHER_ID = "other";

/** Eigene Termine als Deadlines für Wochenstreifen, Monat und Modulseite (14 Tage zurück bis 200 Tage voraus). */
export function expandCustom(events: CustomEvent[], today: Date): Deadline[] {
  const from = iso(addDays(today, -14));
  const to = iso(addDays(today, 200));
  const out: Deadline[] = [];
  for (const ev of events) {
    for (const day of occurrences(ev, from, to, today)) {
      out.push({
        id: `custom|${ev.id}|${day}`,
        courseId: ev.moduleId ?? OTHER_ID,
        title: ev.title || "Untitled",
        date: day,
        time: timeLabel(ev),
        kind: ev.kind,
        source: ev.location || undefined,
        color: ev.color ?? undefined,
        customId: ev.id,
        notes: ev.notes || undefined,
        location: ev.location || undefined,
      });
    }
  }
  return out;
}

/** Serie eines erkannten Termins: Wochentermin aus Orga-Folien oder Serie aus einem Kalender-Abo. */
export function seriesOf(id: string): string | undefined {
  if (id.startsWith("orga|")) return id.replace(/\|\d{4}-\d{2}-\d{2}$/, "");
  if (id.startsWith("cal|") && id.includes("@")) return id.slice(0, id.lastIndexOf("@"));
  return undefined;
}

/** Erkannte Termine ohne ausgeblendete, plus eigene Termine; nach Datum und Uhrzeit sortiert. */
export function composeDeadlines(auto: Deadline[], custom: CustomEvent[], hidden: string[], today: Date): Deadline[] {
  const hide = new Set(hidden);
  const list = auto
    .map((d) => (d.seriesId || !seriesOf(d.id) ? d : { ...d, seriesId: seriesOf(d.id) }))
    .filter((d) => !hide.has(d.id) && !(d.seriesId && hide.has(d.seriesId)));
  const all = [...list, ...expandCustom(custom, today)];
  const startOf = (d: Deadline) => (d.time === "all day" ? "00:00" : (d.time.match(/\d{1,2}:\d{2}/)?.[0] ?? "23:59").padStart(5, "0"));
  return all.sort((a, b) => a.date.localeCompare(b.date) || startOf(a).localeCompare(startOf(b)));
}

/** Aus einem Uhrzeit-Text Start und Ende lesen („14:00–15:30“ → 14:00/15:30, „by 23:55“ → 23:55). */
export function parseTimeLabel(time: string): { start: string | null; end: string | null } {
  if (!time || time === "all day") return { start: null, end: null };
  if (/midnight/i.test(time)) return { start: "23:59", end: null };
  const m = time.match(/(\d{1,2}:\d{2})(?:\s*[–-]\s*(\d{1,2}:\d{2}))?/);
  return m ? { start: m[1].padStart(5, "0"), end: m[2] ? m[2].padStart(5, "0") : null } : { start: null, end: null };
}

export function newEventId() {
  return `ev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
