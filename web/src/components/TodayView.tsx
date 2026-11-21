"use client";

// Startseite „Today“ (früher „Next 4 days“): ein Blick am Morgen. Begrüßung mit Datum und Vorlesungswoche, Wetter in der
// Uni-Stadt, wichtige Mails zu Terminen (abgesagt, verschoben …) ganz oben, der Tag als Zeitleiste (Kurse und Wetter je
// Stunde, Regen zur Kurszeit wird erwähnt), kurze Karten aus Study, Progress, Mail und Mensa. Darunter die nächsten 4 Tage.

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Flag,
  Flame,
  GraduationCap,
  Layers,
  Mail,
  Moon,
  Sun,
  Sunset,
  UtensilsCrossed,
  ChartPie,
} from "lucide-react";
import { colorOf, examLabel, inDays, shortOf, tone } from "./ui";
import { openEvent } from "./EventDialog";
import { openGoogleEvent } from "./GoogleEventDialog";
import { MailBadge, BADGE_RED, cancelledStyle } from "./MailBadge";
import { CountUp } from "./motion";
import { bare, courseById, startMinutes, timeRange, withCourse } from "./calendar-bits";
import { useApp } from "@/lib/app-store";
import { placeLabel } from "@/lib/rooms";
import { useMail, openMail, type GoogleEvent } from "@/lib/mail-data";
import { guessCourse } from "@/lib/mail-tools";
import { EVENT_MAIL_LABEL, useEventMails, type EventMail } from "@/lib/event-mail";
import { CITY, firstRain, loadWeather, sky, useWeather, wet, type Weather, type WeatherDay } from "@/lib/weather";
import { useTodayCards, useStudy, minutesFor } from "@/lib/study";
import { useProgress } from "@/lib/progress";
import { loadMensa, readPrefs, useMensa, type Dish, type MensaPrefs } from "@/lib/mensa";
import type { Deadline } from "@/lib/mock-data";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const isoOfDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoOfDate(d);
};
const dayWord = (iso: string, today: string) => {
  if (iso === today) return "today";
  if (iso === addDaysIso(today, 1)) return "tomorrow";
  return `on ${WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()]}`;
};

/** Uhrzeit, die jede Minute weiterläuft (für „jetzt“-Linie und Begrüßung). */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

// --- Wetter-Symbol --------------------------------------------------------------

export function WeatherIcon({ code, day = true, size = 16 }: { code: number; day?: boolean; size?: number }) {
  const s = sky(code).sky;
  const p = { size, "aria-hidden": true as const, strokeWidth: 1.9 };
  const sun = "var(--c-ochre)";
  const rain = "var(--c-blue)";
  if (s === "clear") return day ? <Sun {...p} style={{ color: sun }} /> : <Moon {...p} className="text-muted" />;
  if (s === "partly") return day ? <CloudSun {...p} style={{ color: sun }} /> : <CloudMoon {...p} className="text-muted" />;
  if (s === "fog") return <CloudFog {...p} className="text-muted" />;
  if (s === "drizzle") return <CloudDrizzle {...p} style={{ color: rain }} />;
  if (s === "rain" || s === "showers") return <CloudRain {...p} style={{ color: rain }} />;
  if (s === "snow") return <CloudSnow {...p} style={{ color: "var(--c-indigo)" }} />;
  if (s === "storm") return <CloudLightning {...p} style={{ color: "var(--c-plum)" }} />;
  return <Cloud {...p} className="text-muted" />;
}

/** Wetter eines Tages für den Kopf der 4-Tage-Ansicht. */
export function DayWeather({ day }: { day: WeatherDay | undefined }) {
  if (!day) return null;
  return (
    <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-muted" title={`${sky(day.code).label}, ${day.min}° to ${day.max}°${day.rain >= 30 ? `, ${day.rain}% chance of rain` : ""}`}>
      <WeatherIcon code={day.code} size={14} /> {day.max}°
    </span>
  );
}

export function useWeatherDays(): Map<string, WeatherDay> {
  const { data } = useWeather();
  useEffect(() => {
    void loadWeather();
  }, []);
  return new Map((data?.days ?? []).map((d) => [d.date, d]));
}

// --- Startseite -------------------------------------------------------------------

interface DayItem {
  key: string;
  start: number;
  end: number;
  d: Deadline | null;
  ev: GoogleEvent | null;
  pin: boolean; // Abgabe: nur ein Zeitpunkt
}

export function TodayView({ deadlines, done, onOpen }: { deadlines: Deadline[]; done: string[]; onOpen: (view: string) => void }) {
  const app = useApp();
  const mail = useMail();
  const now = useNow();
  const { data: weather } = useWeather();
  const progress = useProgress();
  const notes = useEventMails(deadlines);
  useEffect(() => {
    void loadWeather();
  }, []);

  const today = app.today || isoOfDate(now);
  const hour = now.getHours();
  // Abends zeigt die Zeitleiste schon morgen
  const showDay = hour >= 19 ? addDaysIso(today, 1) : today;
  const dayLabel = showDay === today ? "Your day" : "Tomorrow";
  const greeting = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const week =
    progress.currentWeek >= 1 && progress.currentWeek <= progress.lastWeek ? `Week ${progress.currentWeek} of ${progress.lastWeek}` : progress.currentWeek > progress.lastWeek ? "Exam period" : null;

  // Google-Termine des Tages (wenn verbunden und eingeschaltet)
  const googleOn = mail.accounts.some((a) => a.id === "gmail" && a.connected) && mail.calendars.google;
  const items: DayItem[] = [
    ...deadlines
      .filter((d) => d.date === showDay && courseById(d.courseId) && startMinutes(d.time) >= 0)
      .map((d) => {
        const r = timeRange(d.time);
        const start = r?.[0] ?? startMinutes(d.time);
        const pin = d.kind === "abgabe";
        return { key: d.id, start, end: pin ? start : (r?.[1] ?? start + 90), d, ev: null, pin };
      }),
    ...(googleOn ? mail.events : [])
      .filter((ev) => ev.date === showDay && startMinutes(ev.time) >= 0)
      .map((ev) => {
        const r = timeRange(ev.time);
        const start = r?.[0] ?? startMinutes(ev.time);
        return { key: `g-${ev.id}`, start, end: r?.[1] ?? start + 60, d: null, ev, pin: false };
      }),
  ].sort((a, b) => a.start - b.start);
  const classes = items.filter((i) => !i.pin);

  // Wichtige Mails zu kommenden Terminen (nicht nur „Mail about this“)
  const alerts: { d: Deadline; mails: EventMail[] }[] = [];
  for (const d of deadlines) {
    const list = (notes.get(d.id) ?? []).filter((x) => x.kind !== "info");
    if (list.length && d.date >= today && d.date <= addDaysIso(today, 7)) alerts.push({ d, mails: list });
  }
  alerts.sort((a, b) => a.d.date.localeCompare(b.d.date));

  // Nächste offene Abgabe und nächste Klausur
  const nextDue = deadlines
    .filter((d) => d.kind === "abgabe" && !done.includes(d.id) && d.date >= today && d.date <= addDaysIso(today, 6) && courseById(d.courseId))
    .sort((a, b) => a.date.localeCompare(b.date) || startMinutes(a.time) - startMinutes(b.time))[0];
  const nextExam = deadlines
    .filter((d) => d.kind === "klausur" && d.date >= today && courseById(d.courseId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const examDays = nextExam ? Math.round((Date.parse(`${nextExam.date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000) : null;

  const briefing = brief({ showDay, today, classes, nextDue, weather });

  return (
    <div className="stagger flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-[260px] flex-1">
          <p className="text-[13px] font-semibold text-muted">
            {dateLine}
            {week ? ` · ${week}` : ""}
          </p>
          <h1 className="mt-0.5 text-[34px] font-bold leading-tight tracking-[-0.025em]">{greeting}</h1>
          <p className="mt-1.5 max-w-[680px] text-[15px] leading-relaxed text-muted">{briefing}</p>
        </div>
        <WeatherNow weather={weather} />
      </header>

      {alerts.length > 0 && (
        <section aria-label="Changes from your mail" className="flex flex-col gap-2">
          {alerts.slice(0, 3).map(({ d, mails }) => (
            <Alert key={d.id} d={d} mails={mails} today={today} />
          ))}
        </section>
      )}

      <DayLine
        label={dayLabel}
        dayIso={showDay}
        isToday={showDay === today}
        items={items}
        weather={weather}
        now={now}
        notes={notes}
        done={done}
        onOpen={onOpen}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudyTile onOpen={() => onOpen("study")} />
        <ProgressTile onOpen={() => onOpen("progress")} />
        <MailTile onOpen={() => onOpen("mail")} />
        <MensaTile now={now} onOpen={() => onOpen("mensa")} />
      </div>

      {nextExam && examDays != null && (
        <button
          onClick={() => openEvent(nextExam, { onOpenCourse: () => onOpen(nextExam.courseId) })}
          className="hit -mt-1 flex w-fit items-center gap-2 self-start rounded-full bg-surface px-3.5 py-1.5 text-[13px]"
        >
          <GraduationCap size={14} style={{ color: tone(colorOf(courseById(nextExam.courseId)!), "ink") }} aria-hidden />
          <span>
            <strong className="font-semibold">{examLabel(nextExam.title, courseById(nextExam.courseId)!)}</strong>
            <span className="text-muted"> {inDays(examDays)}</span>
          </span>
        </button>
      )}
    </div>
  );
}

/** Zwei, drei Sätze für den Morgen: Kurse, nächste Abgabe, Wetter (Regen zur Kurszeit wird erwähnt). */
function brief({
  showDay,
  today,
  classes,
  nextDue,
  weather,
}: {
  showDay: string;
  today: string;
  classes: DayItem[];
  nextDue: Deadline | undefined;
  weather: Weather | null;
}): ReactNode {
  const when = showDay === today ? "today" : "tomorrow";
  const out: ReactNode[] = [];
  if (classes.length) {
    const f = classes[0];
    const course = f.d ? courseById(f.d.courseId) : undefined;
    const title = f.d && course ? withCourse(bare(f.d.title), course) : f.ev?.title ?? "";
    const room = f.d ? placeLabel(f.d.location) : placeLabel(f.ev?.location);
    out.push(
      <span key="c">
        {classes.length === 1 ? "One class" : `${classes.length} classes`} {when}, {classes.length === 1 ? "" : "the first "}at{" "}
        <strong className="font-semibold text-text">{hhmm(f.start)}</strong> ({title}
        {room ? `, ${room}` : ""}).{" "}
      </span>,
    );
  } else out.push(<span key="c">{when === "today" ? "No classes today." : "No classes tomorrow."} </span>);

  if (nextDue) {
    const course = courseById(nextDue.courseId)!;
    out.push(
      <span key="d">
        <strong className="font-semibold text-text">{withCourse(bare(nextDue.title), course)}</strong> is due {dayWord(nextDue.date, today)}
        {startMinutes(nextDue.time) >= 0 ? ` at ${hhmm(startMinutes(nextDue.time))}` : ""}.{" "}
      </span>,
    );
  } else out.push(<span key="d">Nothing due this week. </span>);

  if (weather) {
    const rain = firstRain(weather.hours, `${showDay}T07:00`, `${showDay}T20:00`);
    const dayW = weather.days.find((d) => d.date === showDay);
    if (rain) {
      const rh = +rain.time.slice(11, 13) * 60;
      const hit = classes.find((c) => Math.abs(c.start - rh) <= 60 || (rh >= c.start && rh <= c.end));
      const cName = hit?.d ? withCourse(bare(hit.d.title), courseById(hit.d.courseId)!) : hit?.ev?.title;
      out.push(
        <span key="w">
          Rain likely from {rain.time.slice(11, 16)}
          {cName ? `, right around ${cName}` : ""}, so take an umbrella.
        </span>,
      );
    } else if (dayW) out.push(<span key="w">{wet(dayW.code) ? sky(dayW.code).label : "Dry"} {when}, up to {dayW.max}° in {CITY}.</span>);
  }
  return out;
}

function WeatherNow({ weather }: { weather: Weather | null }) {
  if (!weather) return null;
  const t = weather.days[0];
  const s = sky(weather.now.code);
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-surface px-4 py-3" aria-label={`Weather in ${CITY}: ${weather.now.temp} degrees, ${s.label}`}>
      <span className="grid size-11 place-items-center rounded-[12px] bg-sunken">
        <WeatherIcon code={weather.now.code} day={weather.now.day} size={24} />
      </span>
      <span className="leading-tight">
        <span className="block text-[24px] font-bold tabular-nums">
          <CountUp value={weather.now.temp} suffix="°" />
        </span>
        <span className="block text-[12px] text-muted">
          {s.label} in {CITY}
        </span>
      </span>
      {t && (
        <span className="ml-1 border-l border-line-soft pl-3 text-[12px] leading-[18px] text-muted">
          <span className="block">
            H {t.max}° · L {t.min}°
          </span>
          <span className="flex items-center gap-1">
            <Sunset size={12} aria-hidden /> {t.sunset}
          </span>
        </span>
      )}
    </div>
  );
}

function Alert({ d, mails, today }: { d: Deadline; mails: EventMail[]; today: string }) {
  const course = courseById(d.courseId)!;
  const m = mails[0];
  const cancelled = m.kind === "cancelled";
  const title = d.kind === "klausur" ? examLabel(d.title, course) : withCourse(bare(d.title), course);
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-surface px-4 py-3" style={{ boxShadow: `inset 3px 0 0 ${cancelled ? BADGE_RED : "var(--warn)"}` }}>
      <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-sunken">
        <Mail size={16} aria-hidden />
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: BADGE_RED }}>
          {mails.length}
        </span>
      </span>
      <p className="min-w-0 flex-1 text-[14px] leading-snug">
        <strong className="font-semibold">
          {title} {dayWord(d.date, today)}
          {startMinutes(d.time) >= 0 ? ` at ${hhmm(startMinutes(d.time))}` : ""}:
        </strong>{" "}
        <span className="font-semibold" style={{ color: cancelled ? BADGE_RED : "var(--warn)" }}>
          {EVENT_MAIL_LABEL[m.kind].toLowerCase()}
        </span>
        <span className="block truncate text-[13px] text-muted">
          Mail from {m.mail.fromName || m.mail.fromAddress}: “{m.mail.subject}”
        </span>
      </p>
      <button onClick={() => openMail(m.mail.id)} className="press inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-semibold hover:bg-hover">
        Read mail <ArrowRight size={13} aria-hidden />
      </button>
    </div>
  );
}

// --- Der Tag als Zeitleiste --------------------------------------------------------

function DayLine({
  label,
  dayIso,
  isToday,
  items,
  weather,
  now,
  notes,
  done,
  onOpen,
}: {
  label: string;
  dayIso: string;
  isToday: boolean;
  items: DayItem[];
  weather: Weather | null;
  now: Date;
  notes: Map<string, EventMail[]>;
  done: string[];
  onOpen: (view: string) => void;
}) {
  const progress = useProgress();
  const due = useTodayCards().length;
  const timed = items.filter((i) => !i.pin);
  const pins = items.filter((i) => i.pin);
  const h0 = Math.max(0, Math.min(8, ...items.map((i) => Math.floor(i.start / 60))));
  const h1 = Math.min(24, Math.max(20, ...items.map((i) => Math.ceil(i.end / 60))));
  const hours = Array.from({ length: h1 - h0 }, (_, k) => h0 + k);
  const span = (h1 - h0) * 60;
  const pct = (m: number) => ((m - h0 * 60) / span) * 100;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= h0 * 60 && nowMin <= h1 * 60;

  // Spuren für Überschneidungen
  const lanes: number[] = [];
  const placed = timed.map((it) => {
    let lane = lanes.findIndex((end) => end <= it.start);
    if (lane < 0) {
      lane = lanes.length;
      lanes.push(it.end);
    } else lanes[lane] = it.end;
    return { it, lane };
  });
  const laneH = 46;
  const step = progress.steps.find((s) => s.kind === "catchup") ?? progress.steps[0];

  return (
    <section aria-label={label} className="rounded-[14px] bg-surface px-5 pb-4 pt-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[17px] font-bold">{label}</h2>
        <span className="text-[12px] text-muted">
          {timed.length ? `${timed.length} ${timed.length === 1 ? "class" : "classes and events"}` : isToday ? "Nothing scheduled" : "Nothing scheduled yet"}
          {weather ? ` · weather in ${CITY} by the hour` : ""}
        </span>
      </div>
      <div className="relative">
        {/* Wetter je Stunde */}
        {weather && (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }} aria-hidden>
            {hours.map((h, k) => {
              const w = weather.hours.find((x) => x.time === `${dayIso}T${String(h).padStart(2, "0")}:00`);
              const past = isToday && (h + 1) * 60 <= nowMin;
              return (
                <div key={h} className={`flex flex-col items-center gap-0.5 ${past ? "opacity-40" : ""}`}>
                  {w ? <WeatherIcon code={w.code} day={w.day} size={16} /> : <span className="h-4" />}
                  <span className="text-[11px] font-semibold tabular-nums">{w ? `${w.temp}°` : ""}</span>
                  <span className="flex h-5 w-[6px] items-end overflow-hidden rounded-full bg-sunken" title={w ? `${w.rain}% rain` : undefined}>
                    <span
                      className="grow-y block w-full rounded-full"
                      style={{ height: `${w ? Math.max(0, w.rain) : 0}%`, background: "var(--c-blue)", opacity: 0.75, "--delay": `${200 + k * 30}ms` } as React.CSSProperties}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {/* Stunden */}
        <div className="mt-1 grid border-t border-line-soft pt-1" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }} aria-hidden>
          {hours.map((h) => (
            <span key={h} className="text-center text-[11px] tabular-nums text-muted">
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
        {/* Abgaben als Fähnchen */}
        {pins.length > 0 && (
          <div className="relative mt-2 h-[24px]">
            {pins.map((p) => {
              const d = p.d!;
              const course = courseById(d.courseId)!;
              const c = d.color ?? colorOf(course);
              const isDone = done.includes(d.id);
              return (
                <button
                  key={p.key}
                  onClick={() => openEvent(d, { onOpenCourse: () => onOpen(d.courseId) })}
                  className={`hit absolute top-0 flex max-w-[45%] -translate-x-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${isDone ? "line-through" : ""}`}
                  style={{ left: `${Math.min(92, Math.max(8, pct(p.start)))}%`, background: isDone ? "var(--sunken)" : tone(c), color: isDone ? "var(--muted)" : "var(--on-solid)" }}
                >
                  <Flag size={11} aria-hidden /> <span className="truncate">{withCourse(bare(d.title), course)} · due {hhmm(p.start)}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* Kurse und Termine */}
        {timed.length > 0 ? (
          <div className="relative mt-2" style={{ height: lanes.length * laneH }}>
            {placed.map(({ it, lane }, k) => (
              <DayBlock key={it.key} it={it} lane={lane} laneH={laneH} left={pct(it.start)} width={pct(it.end) - pct(it.start)} mails={it.d ? (notes.get(it.d.id) ?? []) : []} index={k} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] bg-sunken px-3.5 py-2.5 text-[13px]">
            <span className="text-muted">{isToday ? "A free day." : "Nothing in your calendar for tomorrow."}</span>
            {step && (
              <button onClick={() => onOpen("progress")} className="hit inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 font-semibold">
                <span className="size-2 rounded-full" style={{ background: tone(colorOf(step.module.course)) }} />
                {step.kind === "catchup" ? "Catch up on" : "Get ahead on"} {step.module.course.name} · Week {step.week.n}
                <span className="font-normal text-muted">≈ {Math.max(1, Math.round(step.left))} h</span>
              </button>
            )}
            {due > 0 && (
              <button onClick={() => onOpen("study")} className="hit inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 font-semibold">
                <Layers size={13} aria-hidden /> {due} cards <span className="font-normal text-muted">≈ {minutesFor(due)} min</span>
              </button>
            )}
          </div>
        )}
        {showNow && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 z-[5] flex flex-col items-center" style={{ left: `${pct(nowMin)}%` }}>
            <span className="-translate-x-1/2 rounded-full px-1.5 text-[10px] font-bold leading-[15px] text-white" style={{ background: "var(--danger)" }}>
              {hhmm(nowMin)}
            </span>
            <span className="w-[2px] flex-1 -translate-x-1/2 rounded-full" style={{ background: "var(--danger)" }} />
          </span>
        )}
      </div>
    </section>
  );
}

function DayBlock({
  it,
  lane,
  laneH,
  left,
  width,
  mails,
  index,
  onOpen,
}: {
  it: DayItem;
  lane: number;
  laneH: number;
  left: number;
  width: number;
  mails: EventMail[];
  index: number;
  onOpen: (view: string) => void;
}) {
  const cancelled = mails.some((m) => m.kind === "cancelled");
  const pos = { left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`, top: lane * laneH, height: laneH - 6, animationDelay: `${120 + index * 50}ms` };
  if (it.d) {
    const d = it.d;
    const course = courseById(d.courseId)!;
    const c = d.color ?? colorOf(course);
    const exam = d.kind === "klausur";
    const title = exam ? examLabel(d.title, course) : withCourse(bare(d.title), course);
    const room = placeLabel(d.location);
    return (
      <div className="lift-in absolute" style={pos}>
        <button
          onClick={() => openEvent(d, { onOpenCourse: () => onOpen(d.courseId) })}
          aria-label={`${title}, ${hhmm(it.start)} to ${hhmm(it.end)}${room ? `, ${room}` : ""}${cancelled ? ", cancelled according to a mail" : ""}`}
          className="hit block size-full overflow-hidden rounded-[8px] px-2 py-1 text-left leading-tight"
          style={cancelled ? cancelledStyle(tone(c), tone(c, "soft")) : { background: tone(c, "soft"), boxShadow: exam ? `inset 0 0 0 2px ${tone(c)}` : `inset 3px 0 0 ${tone(c)}` }}
        >
          <span className="block truncate text-[11px] font-semibold tabular-nums" style={{ color: tone(c, "ink") }}>
            {hhmm(it.start)}–{hhmm(it.end)}
          </span>
          <span className={`block truncate text-[13px] font-semibold ${cancelled ? "line-through" : ""}`}>
            {title}
            {room && <span className="font-normal text-muted"> · {room}</span>}
          </span>
        </button>
        {mails.length > 0 && <MailBadge mails={mails} className="absolute -right-1.5 -top-2" />}
      </div>
    );
  }
  const ev = it.ev!;
  const color = ev.color ?? "var(--muted)";
  return (
    <div className="lift-in absolute" style={pos}>
      <button
        onClick={() => openGoogleEvent(ev)}
        aria-label={`${ev.title}, ${hhmm(it.start)} to ${hhmm(it.end)}`}
        className="hit block size-full overflow-hidden rounded-[8px] px-2 py-1 text-left leading-tight"
        style={{ border: `1.5px dashed ${color}`, background: `color-mix(in srgb, ${color} 12%, var(--surface))` }}
      >
        <span className="block truncate text-[11px] font-semibold tabular-nums text-muted">
          {hhmm(it.start)}–{hhmm(it.end)} <span style={{ color: "#4285f4" }}>G</span>
        </span>
        <span className="block truncate text-[13px] font-semibold">{ev.title}</span>
      </button>
    </div>
  );
}

// --- Karten aus den anderen Tabs ----------------------------------------------------

function Tile({ icon, label, onClick, children, ariaLabel }: { icon: ReactNode; label: string; onClick: () => void; children: ReactNode; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="lift group flex min-h-[138px] flex-col rounded-[14px] bg-surface p-4 text-left hover:shadow-[0_0_0_1px_var(--line),0_8px_22px_rgba(0,0,0,0.07)]"
    >
      <span className="flex w-full items-center gap-1.5 text-[12px] font-semibold text-muted">
        {icon}
        {label}
        <ChevronRight size={14} className="ml-auto -translate-x-1 opacity-0 transition-[transform,opacity] duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
      </span>
      <span className="mt-2 flex w-full flex-1 flex-col">{children}</span>
    </button>
  );
}

function StudyTile({ onOpen }: { onOpen: () => void }) {
  const due = useTodayCards().length;
  const study = useStudy();
  const streak = study.stats.streak;
  return (
    <Tile icon={<Layers size={13} aria-hidden />} label="Flashcards" onClick={onOpen} ariaLabel={due ? `${due} flashcards to learn today. Open Study` : "Flashcards: all done for today. Open Study"}>
      {due ? (
        <>
          <span className="text-[28px] font-bold leading-none tabular-nums">
            <CountUp value={due} />
          </span>
          <span className="mt-1 text-[13px] font-semibold">cards to learn today</span>
          <span className="mt-auto pt-2 text-[12px] text-muted">About {minutesFor(due)} min{streak > 1 ? "" : ". Start a streak today."}</span>
        </>
      ) : (
        <>
          <span className="grid size-9 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--ok) 16%, transparent)", color: "var(--ok)" }}>
            <Check size={18} strokeWidth={3} aria-hidden />
          </span>
          <span className="mt-2 text-[13px] font-semibold">All done for today</span>
          <span className="mt-auto pt-2 text-[12px] text-muted">{study.stats.today ? `${study.stats.today} cards learned today` : "New cards come with your lectures"}</span>
        </>
      )}
      {streak > 1 && (
        <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--c-orange-ink)]">
          <Flame size={12} aria-hidden /> {streak}-day streak
        </span>
      )}
    </Tile>
  );
}

function ProgressTile({ onOpen }: { onOpen: () => void }) {
  const model = useProgress();
  const live = model.modules.filter((m) => m.thisWeek && m.thisWeek.hours > 0);
  const total = live.reduce((a, m) => a + (m.thisWeek?.hours ?? 0), 0) || 1;
  const top = [...live].sort((a, b) => (b.thisWeek?.hours ?? 0) - (a.thisWeek?.hours ?? 0))[0];
  const rated = model.modules.filter((m) => m.status !== "none");
  const onTrack = rated.filter((m) => m.status === "ontrack" || m.status === "ahead").length;
  const behind = rated.filter((m) => m.status === "behind" || m.status === "slightly");
  return (
    <Tile icon={<ChartPie size={13} aria-hidden />} label="This week" onClick={onOpen} ariaLabel="Your study plan for this week. Open Progress">
      {rated.length ? (
        <>
          <span className="text-[28px] font-bold leading-none tabular-nums">
            {onTrack}
            <span className="text-[17px] text-muted"> / {rated.length}</span>
          </span>
          <span className="mt-1 text-[13px] font-semibold">courses on track</span>
          {behind[0] && <span className="mt-0.5 truncate text-[12px] text-[var(--warn)]">{behind[0].course.name} needs attention</span>}
        </>
      ) : (
        <>
          <span className="text-[15px] font-bold leading-snug">{top ? `${top.course.name} needs the most` : "Your weekly plan"}</span>
          <span className="mt-1 text-[12px] text-muted">
            {top ? `About ${Math.max(1, Math.round(top.thisWeek!.hours))} of your ${model.hours} hours. Rate your weeks to see if you’re on track.` : "Rate your weeks to see if you’re on track."}
          </span>
        </>
      )}
      {live.length > 0 && (
        <span className="mt-auto flex h-2 w-full gap-[2px] overflow-hidden rounded-full pt-0" aria-hidden>
          {live.map((m) => (
            <span key={m.course.id} className="grow-x h-full rounded-full" style={{ flexGrow: m.thisWeek!.hours / total, background: tone(colorOf(m.course)) }} />
          ))}
        </span>
      )}
    </Tile>
  );
}

function MailTile({ onOpen }: { onOpen: () => void }) {
  const app = useApp();
  const mail = useMail();
  const connected = mail.accounts.filter((a) => a.connected).map((a) => a.id);
  const courses = app.courses.filter((c) => !c.semester || c.semester === "current");
  const inbox = mail.messages
    .filter((m) => m.folder === "inbox" && !mail.snoozed[m.id] && connected.includes(m.accountId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const unread = inbox.filter((m) => m.unread);
  const courseMail = (m: (typeof inbox)[number]) => m.courseId ?? guessCourse(m, courses);
  // Wichtigste ungelesene Mail: aus einem Kurs, sonst aus dem Uni-Postfach, sonst keine Werbung (Newsletter zählen nicht)
  const top = unread.find((m) => courseMail(m)) ?? unread.find((m) => m.accountId === "uni" && !m.unsubscribe) ?? unread.find((m) => !m.unsubscribe);
  const topCourse = top ? courseById(courseMail(top) ?? "") : undefined;
  if (!connected.length) {
    return (
      <Tile icon={<Mail size={13} aria-hidden />} label="Mail" onClick={onOpen} ariaLabel="Mail is not connected. Open Mail">
        <span className="text-[15px] font-bold leading-snug">Your uni mail, right here</span>
        <span className="mt-1 text-[12px] text-muted">Connect it once with your ILIAS login. Mails from your profs show up next to their course.</span>
      </Tile>
    );
  }
  return (
    <Tile
      icon={<Mail size={13} aria-hidden />}
      label="Mail"
      onClick={() => (top ? openMail(top.id) : onOpen())}
      ariaLabel={top ? `${unread.length} unread mails. Open “${top.subject}”` : "No unread mail. Open Mail"}
    >
      <span className="text-[28px] font-bold leading-none tabular-nums">
        <CountUp value={unread.length} />
      </span>
      <span className="mt-1 text-[13px] font-semibold">{unread.length === 1 ? "unread mail" : "unread mails"}</span>
      {top ? (
        <span className="mt-auto pt-2 text-[12px] leading-snug">
          {topCourse && (
            <span className="mr-1 inline-flex items-center gap-1 font-semibold" style={{ color: tone(colorOf(topCourse), "ink") }}>
              <span className="size-1.5 rounded-full" style={{ background: tone(colorOf(topCourse)) }} />
              {shortOf(topCourse)}
            </span>
          )}
          <span className="line-clamp-2 text-muted">
            {top.fromName || top.fromAddress}: {top.subject}
          </span>
        </span>
      ) : (
        <span className="mt-auto pt-2 text-[12px] text-muted">{unread.length ? "Nothing from your courses, only newsletters." : "Inbox zero. Nice."}</span>
      )}
    </Tile>
  );
}

function MensaTile({ now, onOpen }: { now: Date; onOpen: () => void }) {
  const { data } = useMensa();
  const [prefs] = useState<MensaPrefs>(readPrefs);
  useEffect(() => {
    void loadMensa();
  }, []);
  const weekday = now.getDay() >= 1 && now.getDay() <= 5;
  const openToday = weekday && now.getHours() < 15;
  const location = data ? (data.locations.includes(prefs.location) ? prefs.location : data.locations[0]) : null;
  const pick = (iso: string): Dish | undefined =>
    (data?.days[iso] ?? [])
      .filter((d) => d.location === location && d.group !== "side" && d.group !== "dessert" && !d.soldOut)
      .filter((d) => prefs.diet === "all" || (prefs.diet === "vegan" ? d.diet === "vegan" : d.diet !== null))[0];
  const todayIso = isoOfDate(now);
  const nextIso = data ? Object.keys(data.days).sort().find((iso) => iso > todayIso && pick(iso)) : undefined;
  const dish = openToday ? pick(todayIso) : nextIso ? pick(nextIso) : undefined;
  const when = openToday ? "Lunch today" : nextIso ? `Lunch ${dayWord(nextIso, todayIso)}` : "Lunch";
  const price = dish?.prices[prefs.price];
  const place = location?.replace(/^Mensa\s+/i, "");
  return (
    <Tile icon={<UtensilsCrossed size={13} aria-hidden />} label={when} onClick={onOpen} ariaLabel={dish ? `${when}: ${dish.name}. Open Mensa` : "Open Mensa"}>
      {dish ? (
        <>
          <span className="line-clamp-2 text-[15px] font-bold leading-snug">{dish.name}</span>
          <span className="mt-auto flex flex-wrap items-center gap-x-2 pt-2 text-[12px] text-muted">
            {price != null && <span className="font-semibold text-text">€{price.toFixed(2)}</span>}
            {dish.diet && (
              <span className="rounded-full px-1.5 font-semibold" style={{ background: "var(--c-green-soft)", color: "var(--c-green-ink)" }}>
                {dish.diet === "vegan" ? "vegan" : "vegetarian"}
              </span>
            )}
            {place && <span className="truncate">{place}</span>}
          </span>
          {!openToday && <span className="mt-0.5 text-[12px] text-muted">The Mensa is closed {weekday ? "now" : "today"}.</span>}
        </>
      ) : (
        <>
          <span className="text-[15px] font-bold leading-snug">{data ? "No menu yet" : "Loading the menu…"}</span>
          <span className="mt-auto pt-2 text-[12px] text-muted">See all Mensas, prices and vegan options.</span>
        </>
      )}
    </Tile>
  );
}

