"use client";

// Startseite „Today“ (früher „Next 4 days“). Oben: Titel, Datum und Vorlesungswoche, ein Satz für den Tag (Kurse, nächste
// Abgabe, Wetter, nächste Klausur), Wetter in der Uni-Stadt und wichtige Mails zu Terminen (abgesagt, verschoben …).
// Dann die nächsten 4 Tage (WeekView in Overview.tsx), darunter „New mail“ (neueste Mails) und „At a glance“
// (Karteikarten, Lernplan der Woche, Mensa).

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ChartPie,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Layers,
  Mail,
  Moon,
  Sun,
  Sunset,
  UtensilsCrossed,
} from "lucide-react";
import { colorOf, examLabel, inDays, nameOf, shortOf, tone } from "./ui";
import { openEvent } from "./EventDialog";
import { BADGE_RED } from "./MailBadge";
import { CountUp } from "./motion";
import { bare, courseById, startMinutes, withCourse } from "./calendar-bits";
import { useApp } from "@/lib/app-store";
import { placeLabel } from "@/lib/rooms";
import { mailDate, openMail, useMail } from "@/lib/mail-data";
import { guessCourse } from "@/lib/mail-tools";
import { EVENT_MAIL_LABEL, useEventMails, type EventMail } from "@/lib/event-mail";
import { CITY, firstRain, loadWeather, sky, useWeather, wet, type Weather, type WeatherDay } from "@/lib/weather";
import { minutesFor, useStudy, useTodayCards } from "@/lib/study";
import { useProgress } from "@/lib/progress";
import { loadMensa, readPrefs, useMensa, type Dish, type MensaPrefs } from "@/lib/mensa";
import { REMIND_DAYS, useExamRegistered } from "@/lib/exam-reg";
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

/** Uhrzeit, die jede Minute weiterläuft (Datum um Mitternacht, „heute“ oder „morgen“ am Abend). */
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
  const p = { size, "aria-hidden": true as const, strokeWidth: 1.75 };
  const sun = "var(--c-ochre)";
  const rain = "var(--c-blue)";
  if (s === "clear") return day ? <Sun {...p} style={{ color: sun }} /> : <Moon {...p} className="text-muted" />;
  if (s === "partly") return day ? <CloudSun {...p} className="text-muted" /> : <CloudMoon {...p} className="text-muted" />;
  if (s === "fog") return <CloudFog {...p} className="text-muted" />;
  if (s === "drizzle") return <CloudDrizzle {...p} style={{ color: rain }} />;
  if (s === "rain" || s === "showers") return <CloudRain {...p} style={{ color: rain }} />;
  if (s === "snow") return <CloudSnow {...p} className="text-muted" />;
  if (s === "storm") return <CloudLightning {...p} className="text-muted" />;
  return <Cloud {...p} className="text-muted" />;
}

/** Wetter eines Tages für den Kopf der 4-Tage-Ansicht. */
export function DayWeather({ day }: { day: WeatherDay | undefined }) {
  if (!day) return null;
  return (
    <span
      className="ml-auto inline-flex items-center gap-1 text-[12px] tabular-nums text-muted"
      title={`${sky(day.code).label}, ${day.min}° to ${day.max}°${day.rain >= 30 ? `, ${day.rain}% chance of rain` : ""}`}
    >
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

// --- Kopf der Startseite ------------------------------------------------------------

export function TodayView({ deadlines, done, onOpen }: { deadlines: Deadline[]; done: string[]; onOpen: (view: string) => void }) {
  const app = useApp();
  const now = useNow();
  const { data: weather } = useWeather();
  const progress = useProgress();
  const notes = useEventMails(deadlines);
  const registered = useExamRegistered();
  useEffect(() => {
    void loadWeather();
  }, []);

  const today = isoOfDate(now) > (app.today || "") ? isoOfDate(now) : app.today || isoOfDate(now);
  // Abends geht es im Satz schon um morgen
  const aboutDay = now.getHours() >= 19 ? addDaysIso(today, 1) : today;
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const week =
    progress.currentWeek >= 1 && progress.currentWeek <= progress.lastWeek
      ? `Week ${progress.currentWeek} of ${progress.lastWeek}`
      : progress.currentWeek > progress.lastWeek
        ? "Exam period"
        : null;

  const classes = deadlines
    .filter((d) => d.date === aboutDay && d.kind !== "abgabe" && courseById(d.courseId) && startMinutes(d.time) >= 0)
    .sort((a, b) => startMinutes(a.time) - startMinutes(b.time));
  const nextDue = deadlines
    .filter((d) => d.kind === "abgabe" && !done.includes(d.id) && d.date >= today && d.date <= addDaysIso(today, 6) && courseById(d.courseId))
    .sort((a, b) => a.date.localeCompare(b.date) || startMinutes(a.time) - startMinutes(b.time))[0];
  const nextExam = deadlines.filter((d) => d.kind === "klausur" && d.date >= today && courseById(d.courseId)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const examDays = nextExam ? Math.round((Date.parse(`${nextExam.date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000) : null;
  const askRegistered = nextExam && examDays != null && !registered.includes(nextExam.id) && examDays <= REMIND_DAYS;

  // Mails, die einen kommenden Termin ändern (nicht nur „Mail about this“)
  const alerts: { d: Deadline; mails: EventMail[] }[] = [];
  for (const d of deadlines) {
    const list = (notes.get(d.id) ?? []).filter((x) => x.kind !== "info");
    if (list.length && d.date >= today && d.date <= addDaysIso(today, 7)) alerts.push({ d, mails: list });
  }
  alerts.sort((a, b) => a.d.date.localeCompare(b.d.date));

  return (
    <div className="stagger flex flex-col gap-4">
      <header className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="min-w-[280px] flex-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Today</h1>
          <p className="mt-1 text-muted">
            {dateLine}
            {week ? ` · ${week}` : ""}
          </p>
          <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-muted">
            {brief({ aboutDay, today, classes, nextDue, weather })}
            {nextExam && examDays != null && (
              <>
                {" "}
                <button onClick={() => openEvent(nextExam, { onOpenCourse: () => onOpen(nextExam.courseId) })} className="rounded text-left hover:text-text hover:underline">
                  Next exam: {nameOf(courseById(nextExam.courseId)!)} {inDays(examDays)}.
                </button>
                {askRegistered && (
                  <>
                    {" "}
                    <button
                      onClick={() => openEvent(nextExam, { onOpenCourse: () => onOpen(nextExam.courseId) })}
                      className="rounded font-semibold text-[var(--focus)] hover:underline"
                    >
                      Registered in KLIPS?
                    </button>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <WeatherNow weather={weather} day={aboutDay} tomorrow={aboutDay !== today} />
      </header>

      {alerts.length > 0 && (
        <section aria-label="Changes from your mail" className="flex flex-col gap-2">
          {alerts.slice(0, 3).map(({ d, mails }) => (
            <Alert key={d.id} d={d} mails={mails} today={today} />
          ))}
        </section>
      )}
    </div>
  );
}

/** Ein Satz für den Tag: Kurse, nächste Abgabe, Wetter (Regen zur Kurszeit wird erwähnt). */
function brief({
  aboutDay,
  today,
  classes,
  nextDue,
  weather,
}: {
  aboutDay: string;
  today: string;
  classes: Deadline[];
  nextDue: Deadline | undefined;
  weather: Weather | null;
}): ReactNode {
  const when = aboutDay === today ? "today" : "tomorrow";
  const out: ReactNode[] = [];
  if (classes.length) {
    const f = classes[0];
    const course = courseById(f.courseId)!;
    const room = placeLabel(f.location);
    out.push(
      <span key="c">
        {classes.length === 1 ? "One class" : `${classes.length} classes`} {when}, {classes.length === 1 ? "" : "the first "}at{" "}
        <strong className="font-semibold text-text">{hhmm(startMinutes(f.time))}</strong> ({withCourse(bare(f.title), course)}
        {room ? `, ${room}` : ""}).{" "}
      </span>,
    );
  } else out.push(<span key="c">No classes {when}. </span>);

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
    const rain = firstRain(weather.hours, `${aboutDay}T07:00`, `${aboutDay}T20:00`);
    const dayW = weather.days.find((d) => d.date === aboutDay);
    if (rain) {
      const rh = +rain.time.slice(11, 13) * 60;
      const hit = classes.find((c) => Math.abs(startMinutes(c.time) - rh) <= 60);
      out.push(
        <span key="w">
          Rain likely from {rain.time.slice(11, 16)}
          {hit ? `, right around ${withCourse(bare(hit.title), courseById(hit.courseId)!)}` : ""}, so take an umbrella.
        </span>,
      );
    } else if (dayW) {
      out.push(
        <span key="w">
          {wet(dayW.code) ? sky(dayW.code).label : "Dry"} {when}, up to {dayW.max}° in {CITY}.
        </span>,
      );
    }
  }
  return out;
}

function WeatherNow({ weather, day, tomorrow }: { weather: Weather | null; day: string; tomorrow: boolean }) {
  if (!weather) return null;
  const t = weather.days.find((d) => d.date === day) ?? weather.days[0];
  const s = sky(weather.now.code);
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-surface py-3 pl-3 pr-4" aria-label={`Weather in ${CITY}: ${weather.now.temp} degrees, ${s.label}`}>
      <span className="grid size-10 place-items-center rounded-[8px] bg-sunken">
        <WeatherIcon code={weather.now.code} day={weather.now.day} size={20} />
      </span>
      <span className="leading-tight">
        <span className="block text-[22px] font-semibold tabular-nums">
          <CountUp value={weather.now.temp} suffix="°" />
        </span>
        <span className="block text-[12px] text-muted">
          {s.label} in {CITY}
        </span>
      </span>
      {t && (
        <span className="ml-1 border-l border-line-soft pl-3 text-[12px] leading-5 text-muted">
          <span className="block tabular-nums">
            {tomorrow ? "Tomorrow" : "Today"} {t.min}–{t.max}°
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <Sunset size={12} aria-hidden /> Sunset {t.sunset}
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
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-sunken">
        <Mail size={15} aria-hidden />
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
          Mail from {senderName(m.mail)}: “{m.mail.subject}”
        </span>
      </p>
      <button onClick={() => openMail(m.mail.id)} className="press inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-3 text-[13px] font-semibold hover:bg-hover">
        Read mail <ArrowRight size={13} aria-hidden />
      </button>
    </div>
  );
}

/** Absendername ohne Anführungszeichen und Escapes („\"Mattermost Notifications\"“ → „Mattermost Notifications“). */
function senderName(m: { fromName: string; fromAddress: string }) {
  const n = m.fromName.replace(/\\"/g, "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  return n || m.fromAddress;
}

// --- Unter den nächsten 4 Tagen: neue Mails und ein kurzer Überblick --------------------

export function TodayWidgets({ onOpen }: { onOpen: (view: string) => void }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <NewMail onOpen={() => onOpen("mail")} />
      <AtAGlance onOpen={onOpen} />
    </div>
  );
}

function NewMail({ onOpen }: { onOpen: () => void }) {
  const app = useApp();
  const mail = useMail();
  const today = app.today;
  const connected = mail.accounts.filter((a) => a.connected).map((a) => a.id);
  const courses = app.courses.filter((c) => !c.semester || c.semester === "current");
  // Die neuesten Mails der letzten Tage, ohne Newsletter und Werbung
  const since = addDaysIso(today || isoOfDate(new Date()), -4);
  const list = mail.messages
    .filter((m) => m.folder === "inbox" && !mail.snoozed[m.id] && connected.includes(m.accountId) && !m.unsubscribe && m.date.slice(0, 10) >= since)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  return (
    <section aria-labelledby="new-mail-title">
      <div className="mb-2.5 flex items-baseline gap-3">
        <h2 id="new-mail-title" className="flex-1 text-[17px] font-bold">
          New mail
        </h2>
        <button onClick={onOpen} className="rounded text-[13px] font-semibold text-[var(--focus)] hover:underline">
          Open Mail
        </button>
      </div>
      {!connected.length ? (
        <p className="rounded-[10px] bg-surface px-4 py-4 text-[13px] text-muted">Connect your uni mail in Mail. It uses your ILIAS login, and mails from your profs show up here</p>
      ) : list.length === 0 ? (
        <p className="rounded-[10px] bg-surface px-4 py-4 text-[13px] text-muted">
          No new mail in the last few days{connected.includes("uni") ? "" : ". Connect your uni mail to see mails from your profs here"}
        </p>
      ) : (
        <ul className="rounded-[10px] bg-surface px-1.5 py-1">
          {list.map((m) => {
            const course = courseById(m.courseId ?? guessCourse(m, courses) ?? "");
            return (
              <li key={m.id}>
                <button onClick={() => openMail(m.id)} className="flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-hover">
                  <span className="flex w-4 shrink-0 justify-center" aria-hidden>
                    {m.unread ? (
                      <span className="size-2 rounded-full" style={{ background: course ? tone(colorOf(course)) : "var(--text)" }} />
                    ) : course ? (
                      <span className="size-2 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${tone(colorOf(course))}` }} />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate text-[13px] ${m.unread ? "font-semibold" : ""}`}>{senderName(m)}</span>
                      {course && (
                        <span className="shrink-0 text-[12px] font-semibold" style={{ color: tone(colorOf(course), "ink") }}>
                          {shortOf(course)}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted">{mailDate(m.date, today)}</span>
                    </span>
                    <span className="block truncate text-[13px] text-muted">{m.subject || "(no subject)"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AtAGlance({ onOpen }: { onOpen: (view: string) => void }) {
  const due = useTodayCards().length;
  const study = useStudy();
  const model = useProgress();
  const now = useNow();
  const { data } = useMensa();
  const [prefs] = useState<MensaPrefs>(readPrefs);
  useEffect(() => {
    void loadMensa();
  }, []);

  // Karteikarten
  const streak = study.stats.streak;
  const cardsValue = due ? `${due} ${due === 1 ? "card" : "cards"} to learn` : "All done for today";
  const cardsSub = due
    ? [`About ${minutesFor(due)} min`, streak > 1 ? `${streak}-day streak` : study.stats.today ? "Day 1 of your streak" : null].filter(Boolean).join(" · ")
    : study.stats.today
      ? `${study.stats.today} learned today`
      : "New cards come with your lectures";

  // Lernplan der Woche
  const live = model.modules.filter((m) => m.thisWeek && m.thisWeek.hours > 0);
  const top = [...live].sort((a, b) => (b.thisWeek?.hours ?? 0) - (a.thisWeek?.hours ?? 0))[0];
  const rated = model.modules.filter((m) => m.status !== "none");
  const onTrack = rated.filter((m) => m.status === "ontrack" || m.status === "ahead").length;
  const weekValue = rated.length ? `${onTrack} of ${rated.length} courses on track` : top ? `${top.course.name} is the biggest` : "Plan your week";
  const weekSub = top ? `Plan about ${Math.max(1, Math.round(top.thisWeek!.hours))} h for ${top.course.name}` : "Tick off what you’ve done";

  // Mensa: heute bis 15 Uhr, sonst der nächste Tag mit Speiseplan
  const todayIso = isoOfDate(now);
  const openToday = now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() < 15;
  const location = data ? (data.locations.includes(prefs.location) ? prefs.location : data.locations[0]) : null;
  const pick = (iso: string): Dish | undefined =>
    (data?.days[iso] ?? [])
      .filter((d) => d.location === location && d.group !== "side" && d.group !== "dessert" && !d.soldOut)
      .filter((d) => prefs.diet === "all" || (prefs.diet === "vegan" ? d.diet === "vegan" : d.diet !== null))[0];
  const nextIso = data ? Object.keys(data.days).sort().find((iso) => iso > todayIso && pick(iso)) : undefined;
  const dish = openToday ? pick(todayIso) : nextIso ? pick(nextIso) : undefined;
  const lunchLabel = openToday ? "Lunch today" : nextIso ? `Lunch ${dayWord(nextIso, todayIso)}` : "Lunch";
  const price = dish?.prices[prefs.price];
  const place = location?.replace(/^Mensa\s+/i, "");
  const lunchSub = dish
    ? [price != null ? `€${price.toFixed(2)}` : null, dish.diet === "vegan" ? "vegan" : dish.diet ? "vegetarian" : null, place].filter(Boolean).join(" · ")
    : "Menus, prices and vegan options";

  return (
    <section aria-labelledby="glance-title">
      <h2 id="glance-title" className="mb-2.5 text-[17px] font-bold">
        At a glance
      </h2>
      <ul className="rounded-[10px] bg-surface px-1.5 py-1">
        <GlanceRow icon={<Layers size={16} aria-hidden />} label="Flashcards" value={cardsValue} sub={cardsSub} onClick={() => onOpen("study")} />
        <GlanceRow icon={<ChartPie size={16} aria-hidden />} label="This week" value={weekValue} sub={weekSub} onClick={() => onOpen("progress")} />
        <GlanceRow
          icon={<UtensilsCrossed size={16} aria-hidden />}
          label={lunchLabel}
          value={dish ? dish.name : data ? "No menu yet" : "Loading the menu…"}
          sub={lunchSub}
          onClick={() => onOpen("mensa")}
        />
      </ul>
    </section>
  );
}

function GlanceRow({ icon, label, value, sub, onClick }: { icon: ReactNode; label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-hover">
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-sunken text-muted">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-muted">{label}</span>
          <span className="block truncate text-[14px] font-semibold">{value}</span>
          <span className="block truncate text-[12px] text-muted">{sub}</span>
        </span>
        <ChevronRight size={14} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </button>
    </li>
  );
}
