// Beispielwoche für die Mockups. Die Tage rechnen sich vom echten heutigen Datum aus,
// damit die Seite immer „diese Woche“ zeigt (Wochenenden bleiben leer und schmal, wie in der App).

export type CourseKey = "se" | "bwl" | "mathe" | "db";
export type Tone = "blue" | "orange" | "green" | "plum";

export const COURSES: Record<CourseKey, { name: string; short: string; tone: Tone }> = {
  bwl: { name: "BWL", short: "BWL", tone: "orange" },
  db: { name: "Datenbanken", short: "DB", tone: "plum" },
  mathe: { name: "Mathe I", short: "Mathe I", tone: "green" },
  se: { name: "Softwaretechnik", short: "SE", tone: "blue" },
};

export type Item = {
  id: string;
  course: CourseKey;
  title: string;
  time: string;
  kind: "class" | "due";
  place?: string;
  done?: boolean;
};

// Was an den nächsten Werktagen ansteht, der Reihe nach.
const WEEKDAY_ITEMS: Item[][] = [
  [
    { id: "lecture", course: "mathe", title: "Mathe I Lecture", time: "10:00–11:30", place: "Aula 1", kind: "class" },
    { id: "sheet4", course: "se", title: "Übungsblatt 4", time: "by 23:59", kind: "due" },
  ],
  [{ id: "case", course: "bwl", title: "Fallstudie Logistik", time: "by 12:00", kind: "due" }],
  [
    { id: "tutorial", course: "se", title: "SE Tutorial", time: "14:00", place: "Seminarraum 2", kind: "class" },
    { id: "sheet5", course: "db", title: "Übungsblatt 5", time: "by 18:00", kind: "due", done: true },
  ],
  [{ id: "exercise", course: "mathe", title: "Mathe I Exercise", time: "12:00–13:30", place: "Group 5", kind: "class" }],
];

export type Day = { date: Date; weekend: boolean; isToday: boolean; items: Item[] };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

export function nextDays(today: Date, count = 4): Day[] {
  let w = 0;
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i);
    const weekend = isWeekend(date);
    const items = weekend ? [] : (WEEKDAY_ITEMS[w++] ?? []);
    return { date, weekend, isToday: i === 0, items };
  });
}

/** Erster Werktag ab heute: dort liegt die Abgabe von Übungsblatt 4. */
export function firstWeekday(today: Date): Date {
  let d = today;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

export const dayShort = (d: Date) => `${WD[d.getDay()]} ${d.getDate()}`;
export const dayLong = (d: Date) => `${WD_LONG[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`;
export const weekdayName = (d: Date) => WD_LONG[d.getDay()];
export const germanDate = (d: Date) =>
  `${WD_DE[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
const WD_DE_SHORT = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const MONTH_DE_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
/** Datum wie in der Menüleiste des Macs: „Wed 25 Nov“ bzw. „Mi. 25. Nov.“ */
export const menuBarDate = (d: Date, lang: "en" | "de" = "en") =>
  lang === "de"
    ? `${WD_DE_SHORT[d.getDay()]} ${d.getDate()}. ${MONTH_DE_SHORT[d.getMonth()]}`
    : `${WD[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()].slice(0, 3)}`;

/** „Tonight“, „tomorrow“ oder Wochentag, aus Sicht von heute. */
export function relativeDay(today: Date, d: Date): string {
  const diff = Math.round((fromKey(keyOf(d)).getTime() - fromKey(keyOf(today)).getTime()) / 86_400_000);
  if (diff === 0) return "tonight";
  if (diff === 1) return "tomorrow";
  return `on ${WD_LONG[d.getDay()]}`;
}

// Vorlesungswoche nach der Faustregel der Uni Köln: Wintersemester ab dem 2. Montag im Oktober
// bis zum 1. Freitag im Februar, Weihnachtsruhe 23.12.–06.01. zählt nicht; Sommersemester ab dem
// 1. Montag im April bis zum 3. Freitag im Juli.
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1, 12);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7, 12);
}
export function lectureWeek(d: Date): number | null {
  const y = d.getFullYear();
  const m = d.getMonth();
  const weeksSince = (start: Date) => Math.floor((d.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  if (m >= 9 || m <= 1) {
    const startYear = m >= 9 ? y : y - 1;
    const start = nthWeekday(startYear, 9, 1, 2);
    const end = nthWeekday(startYear + 1, 1, 5, 1);
    if (d < start || d > end) return null;
    const breakStart = new Date(startYear, 11, 23);
    const breakEnd = new Date(startYear + 1, 0, 6, 23);
    if (d >= breakStart && d <= breakEnd) return null;
    return d > breakEnd ? weeksSince(start) - 2 : weeksSince(start);
  }
  const start = nthWeekday(y, 3, 1, 1);
  const end = nthWeekday(y, 6, 5, 3);
  if (d < start || d > end) return null;
  return weeksSince(start);
}

/** Montag bis Freitag der Woche von heute (am Wochenende die nächste Woche). */
export function workWeek(today: Date): Date[] {
  const wd = today.getDay();
  const offset = wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd;
  const monday = addDays(today, offset);
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/** „November 23–27“ bzw. „November 30–December 4“ */
export function rangeLabel(days: Date[]): string {
  const a = days[0];
  const b = days[days.length - 1];
  const end = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${MONTH[b.getMonth()]} ${b.getDate()}`;
  return `${MONTH[a.getMonth()]} ${a.getDate()}–${end}`;
}
