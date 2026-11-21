"use client";

// Bausteine für Kalender (Startseite „Next 4 days“ und Kalender-Tab): Zeiten lesen, Überschneidungen,
// Google-Termine (Look G2), Kalender-Schalter, 4-Wochen-Ansicht.

import { AlertTriangle, Check } from "lucide-react";
import { colorOf, examLabel, nameOf, shortOf, tone } from "./ui";
import { openEvent } from "./EventDialog";
import { openGoogleEvent } from "./GoogleEventDialog";
import { placeLabel } from "@/lib/rooms";
import { appStore } from "@/lib/app-store";
import type { GoogleEvent } from "@/lib/mail-data";
import type { EventMail } from "@/lib/event-mail";
import { MailBadge, cancelledStyle } from "./MailBadge";
import type { Deadline } from "@/lib/mock-data";

export const DAY_MS = 86_400_000;

export function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const todayMs = () => parseDay(appStore.get().today);
export const daysFromToday = (iso: string) => Math.round((parseDay(iso) - todayMs()) / DAY_MS);
/** Montag der Woche, in der `ms` liegt. */
export const mondayOf = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;
export const courseById = (id: string) => appStore.get().courses.find((c) => c.id === id);
// Titel ohne „Submit “ vorne, für enge Stellen
export const bare = (t: string) => t.replace(/^Submit /, "");

/** „Lecture“, „Exercise · Group 3“ … sagen allein nicht, welcher Kurs: Kurzname davor (nicht nur Farbe). */
export const withCourse = (plain: string, course: Parameters<typeof shortOf>[0]) =>
  /^(lecture|exercise|tutorial|seminar|lab|class)\b/i.test(plain) ? `${shortOf(course)} ${plain}` : plain;

export function MonthView({
  deadlines,
  events,
  done,
  onOpen,
  start = mondayOf(todayMs()),
  notes,
}: {
  deadlines: Deadline[];
  events: GoogleEvent[];
  done: string[];
  onOpen: (id: string) => void;
  start?: number; // Montag der ersten Woche (ms, UTC)
  notes?: Map<string, EventMail[]>; // Mails zu einzelnen Terminen (roter Hinweis)
}) {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(start + i * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    const diff = daysFromToday(iso);
    return {
      iso,
      num: d.getUTCDate(),
      month: d.getUTCDate() === 1 ? MONTHS[d.getUTCMonth()] : "",
      weekend: i % 7 >= 5,
      past: diff < 0,
      today: diff === 0,
      // Abgaben und Klausuren zuerst (sonst verschwinden sie hinter „+3 more“), gleiche Termine aus Google nur einmal
      entries: mergeTwins(
        [
          ...deadlines.filter((x) => x.date === iso && courseById(x.courseId)).map((d) => ({ key: d.id, at: startMinutes(d.time), d, ev: null as GoogleEvent | null })),
          ...events.filter((x) => x.date === iso).map((ev) => ({ key: `g-${ev.id}`, at: startMinutes(ev.time), d: null as Deadline | null, ev })),
        ].sort((a, b) => a.at - b.at),
      ).sort((a, b) => Number(Boolean(b.d && b.d.kind !== "termin")) - Number(Boolean(a.d && a.d.kind !== "termin")) || a.at - b.at),
    };
  });

  return (
    <div className="mt-6">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 px-1 text-[12px] text-muted" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="The next 4 weeks">
        {cells.map((cell) => (
          <div
            key={cell.iso}
            role="listitem"
            className={`flex min-h-[92px] min-w-0 flex-col gap-1 rounded-[9px] p-1.5 ${cell.weekend ? "bg-sunken" : "bg-surface"} ${
              cell.today ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""
            } ${cell.past ? "opacity-45" : ""}`}
          >
            <span className="px-0.5 text-[12px] font-semibold">
              {cell.num}
              {cell.month && <span className="ml-1 font-normal text-muted">{cell.month}</span>}
            </span>
            {cell.entries.slice(0, 3).map((e) => {
                if (e.ev) {
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => openGoogleEvent(e.ev!)}
                      aria-label={`${e.ev.title}, ${e.ev.time}`}
                      className="hit truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] font-semibold text-muted"
                      style={{ border: `1.5px dashed ${e.ev.color ?? "var(--muted)"}` }}
                    >
                      {abbrTitle(e.ev.title)}
                    </button>
                  );
                }
                const d = e.d!;
                const course = courseById(d.courseId)!;
                const c = d.color ?? colorOf(course);
                const isDone = d.kind === "abgabe" && done.includes(d.id);
                const exam = d.kind === "klausur";
                const plain = bare(d.title);
                const label = exam ? examLabel(d.title, course) : withCourse(plain, course);
                const mails = notes?.get(d.id) ?? [];
                const cancelled = mails.some((m) => m.kind === "cancelled");
                return (
                  <div key={e.key} className="relative flex min-w-0">
                  <button
                    onClick={() => openEvent(d, { onOpenCourse: () => onOpen(d.courseId) })}
                    aria-label={`${d.title}, ${nameOf(course)}, ${d.time}${cancelled ? ", cancelled according to a mail" : ""}`}
                    className={`hit min-w-0 flex-1 truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] font-semibold ${isDone || cancelled ? "line-through" : ""}`}
                    style={
                      cancelled && !isDone
                        ? { ...cancelledStyle(tone(c), tone(c, "soft")), color: tone(c, "ink") }
                        : isDone
                        ? { background: "var(--sunken)", color: "var(--muted)" }
                        : exam
                          ? { background: tone(c), color: "var(--on-solid)" }
                          : { background: tone(c, "soft"), color: tone(c, "ink") }
                    }
                  >
                    {abbrTitle(label, 18)}
                  </button>
                  {mails.length > 0 && <MailBadge mails={mails} small className="absolute -right-1 -top-1.5" />}
                  </div>
                );
              })}
            {cell.entries.length > 3 && <span className="px-1 text-[11px] text-muted">+{cell.entries.length - 3} more</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Schalter für einen Kalender (Haken in der Kapsel). „dashed“ zeigt, wie dessen Termine aussehen.
export function CalendarChip({
  on,
  onChange,
  dashed,
  small = false,
  children,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  dashed: boolean;
  small?: boolean; // kleiner, z. B. neben „Next 4 days“ auf der Startseite
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`press flex items-center gap-2 rounded-full pl-2 font-semibold transition-colors ${small ? "h-7 pr-3 text-[12px]" : "h-8 pr-3.5"} ${on ? "bg-accent text-on-accent" : "bg-surface text-muted shadow-[inset_0_0_0_1.5px_var(--line)] hover:bg-hover"}`}
    >
      <span
        aria-hidden
        className={`flex size-[18px] items-center justify-center rounded-full ${on ? "bg-white/25" : ""}`}
        style={on ? undefined : { border: "2px solid var(--line)" }}
      >
        {on && <Check size={10} strokeWidth={3.6} />}
      </span>
      {children}
      <span
        aria-hidden
        className="ml-0.5 h-3 w-5 rounded-[3px]"
        style={dashed ? { border: `1.5px dashed ${on ? "currentColor" : "var(--muted)"}`, opacity: on ? 0.8 : 0.6 } : { background: "currentColor", opacity: on ? 0.8 : 0.4 }}
      />
    </button>
  );
}

/** Beginn in Minuten für die Reihenfolge am Tag: „10:00 to 11:30“ → 600, „by 23:55“ → 1435, ganztägig → -1. */
export function startMinutes(time: string): number {
  const m = /(\d{1,2}):(\d{2})/.exec(time);
  return m ? +m[1] * 60 + +m[2] : -1;
}

/** Von–bis in Minuten: „10:00 to 11:30“ (Google), „10:00–11:30“ (Stundenplan, eigene Termine), „10:00 - 11:30“. */
export function timeRange(time: string): [number, number] | null {
  const m = /(\d{1,2}):(\d{2})\s*(?:to|–|—|-|bis)\s*(\d{1,2}):(\d{2})/.exec(time);
  return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : null;
}

/** Name des Termins, mit dem sich dieser überschneidet (gleiche Zeit zählt nicht: das ist meist derselbe Termin). */
export function clashWith<T extends { key: string; d: Deadline | null; ev: GoogleEvent | null }>(all: T[], one: T): string | null {
  const a = timeRange(one.d?.time ?? one.ev?.time ?? "");
  if (!a) return null;
  for (const other of all) {
    if (other.key === one.key) continue;
    const b = timeRange(other.d?.time ?? other.ev?.time ?? "");
    if (b && a[0] < b[1] && b[0] < a[1] && !(a[0] === b[0] && a[1] === b[1])) return other.d?.title ?? other.ev?.title ?? "another event";
  }
  return null;
}

/** Kürzel für die enge Monatsansicht: „Mathe Vorlesung“ → „Mathe VL“, zu lange Titel werden gekürzt. */
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bvorlesung(en)?\b/gi, "VL"],
  [/\blecture\b/gi, "Lec"],
  [/\b(ü|ue|u)bung(en)?\b/gi, "Ü"],
  [/\bexercises?\b/gi, "Ex"],
  [/\btutorium\b/gi, "Tut"],
  [/\btutorial\b/gi, "Tut"],
  [/\bseminar\b/gi, "Sem"],
  [/\bklausur\b/gi, "Exam"],
  [/\bpraktikum\b/gi, "Prak"],
  [/\bsprechstunde\b/gi, "Office h."],
];
export function abbrTitle(title: string, max = 17): string {
  let t = title;
  for (const [re, short] of ABBREVIATIONS) t = t.replace(re, short);
  t = t.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Termin aus dem Google Kalender: gestrichelter Rand, kein Kreis (Termine hakt man nicht ab).
export function GoogleBlock({ ev, clash = null }: { ev: GoogleEvent; clash?: string | null }) {
  const color = ev.color ?? "var(--muted)";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openGoogleEvent(ev)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openGoogleEvent(ev))}
      className="hit relative rounded-[7px] bg-surface px-2 py-2 outline-none"
      style={{ border: `1.5px dashed ${color}` }}
      title={[ev.title, ev.calendar ? `Google Calendar: ${ev.calendar}` : "Google Calendar", "Click for details"].join(" · ")}
    >
      <span
        aria-hidden
        className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-[5px] bg-bg text-[10px] font-bold shadow-[inset_0_0_0_1.5px_var(--line)]"
        style={{ color: "#4285f4" }}
      >
        G
      </span>
      <span className="inline-block max-w-full truncate rounded-full px-2 text-[12px] font-semibold text-text" style={{ background: `color-mix(in srgb, ${color} 24%, var(--surface))` }}>
        {ev.time.replace(" to ", "–")}
      </span>
      <span className="mt-1 block pr-[18px] text-[13px] font-semibold leading-snug">{ev.title}</span>
      {ev.location && <span className="block truncate text-[12px] text-muted">{placeLabel(ev.location)}</span>}
      {clash && <ClashTag other={clash} />}
    </div>
  );
}

export function ClashTag({ other }: { other: string }) {
  return (
    <span
      title={`Overlaps with ${other}`}
      className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 text-[11px] font-bold leading-[17px]"
      style={{ background: tone("ochre", "soft"), color: tone("ochre", "ink") }}
    >
      <AlertTriangle size={10} aria-hidden /> Overlaps
    </span>
  );
}


// --- Überschneidungen in der Liste (Startseite „Next 4 days“) ---------------------------

const titleWords = (s: string) =>
  new Set(
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
/** Zwei Titel meinen wahrscheinlich denselben Termin („ISM - Vorlesung“ / „ISM Vorlesung“). */
export const similarTitles = (a: string, b: string) => [...titleWords(a)].some((w) => titleWords(b).has(w));

export interface DayEntry {
  key: string;
  at: number;
  d: Deadline | null;
  ev: GoogleEvent | null;
  alsoGoogle?: boolean; // ILIAS-Termin steht genauso auch in Google
}
export type TimedEntry = DayEntry & { start: number; end: number };
export type DayRow = { kind: "one"; e: DayEntry } | { kind: "group"; key: string; items: TimedEntry[] };

// Wörter, die in fast jedem Termin stehen und allein nichts über den Kurs sagen
const GENERIC = new Set([
  "vorlesung", "lecture", "ubung", "uebung", "exercise", "tutorium", "tutorial", "seminar", "gruppe", "group", "sitzung", "session",
  "fur", "der", "die", "das", "und", "and", "the", "for", "von", "mit", "zur", "zum", "einfuhrung", "introduction", "grundlagen",
  "studierende", "online", "virtuell", "raum", "room", "hall", "horsaal",
]);
const courseWords = (s: string) => new Set([...titleWords(s)].filter((w) => !GENERIC.has(w)));

/**
 * Derselbe Termin aus ILIAS und Google? Beginn höchstens 10 Minuten auseinander und ein Kurswort gemeinsam. Für den Kurs
 * zählen Titel, Kurzname, voller Name und die Teile („Mathe I Lecture“ = „Mathematik für Studierende der Informatik I“).
 */
export function sameEvent(d: Deadline, ev: GoogleEvent): boolean {
  const a = startMinutes(d.time);
  const b = startMinutes(ev.time);
  if (a < 0 || b < 0 || Math.abs(a - b) > 10) return false;
  const c = courseById(d.courseId);
  const mine = courseWords([d.title, c?.name, c?.short, c?.fullName, ...(c?.parts ?? []).map((p) => p.label)].filter(Boolean).join(" "));
  const theirs = courseWords(ev.title);
  return [...theirs].some((w) => mine.has(w));
}

/** Gleiche Termine aus ILIAS und Google (gleiche Zeit, ähnlicher Titel) nur einmal zeigen. */
export function mergeTwins(entries: DayEntry[]): DayEntry[] {
  const out = entries.map((e) => ({ ...e }));
  const drop = new Set<string>();
  for (const g of out) {
    if (!g.ev) continue;
    const twin = out.find((x) => x.d && !x.alsoGoogle && x.d.kind !== "abgabe" && sameEvent(x.d, g.ev!));
    if (twin) {
      twin.alsoGoogle = true;
      drop.add(g.key);
    }
  }
  return out.filter((e) => !drop.has(e.key));
}

/** Teilt die Tagesliste in einzelne Termine und Gruppen, die sich zeitlich überschneiden. */
export function overlapRows(entries: DayEntry[]): DayRow[] {
  const rows: DayRow[] = [];
  let cur: TimedEntry[] = [];
  let curEnd = -1;
  const flush = () => {
    if (cur.length === 1) rows.push({ kind: "one", e: cur[0] });
    else if (cur.length > 1) rows.push({ kind: "group", key: cur.map((c) => c.key).join("+"), items: cur });
    cur = [];
    curEnd = -1;
  };
  for (const e of entries) {
    const r = timeRange(e.d?.time ?? e.ev?.time ?? "");
    if (!r) {
      flush();
      rows.push({ kind: "one", e });
      continue;
    }
    if (cur.length && r[0] < curEnd) {
      cur.push({ ...e, start: r[0], end: r[1] });
      curEnd = Math.max(curEnd, r[1]);
    } else {
      flush();
      cur = [{ ...e, start: r[0], end: r[1] }];
      curEnd = r[1];
    }
  }
  flush();
  return rows;
}

/** Zeitabschnitte, in denen mindestens zwei Termine gleichzeitig laufen. */
export function sharedZones(items: { start: number; end: number }[]): [number, number][] {
  const points = [...new Set(items.flatMap((i) => [i.start, i.end]))].sort((a, b) => a - b);
  const zones: [number, number][] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    const n = items.filter((i) => i.start < b && i.end > a).length;
    if (n < 2) continue;
    const last = zones[zones.length - 1];
    if (last && last[1] === a) last[1] = b;
    else zones.push([a, b]);
  }
  return zones;
}
