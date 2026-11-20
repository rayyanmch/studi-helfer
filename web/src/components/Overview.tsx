"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Inbox, LogIn, RefreshCw, WifiOff } from "lucide-react";
import { Button, FileIcon, Notice, Spinner, Swatch, colorOf, tone } from "./ui";
import type { Problem } from "./AppShell";
import {
  courses,
  countFiles,
  countNew,
  deadlines,
  digests,
  LAST_SYNC,
  TODAY,
  type Course,
  type CourseFile,
  type Deadline,
} from "@/lib/mock-data";

const FAIL_ID = "rechnernetze";
const DAY_MS = 86_400_000;
const SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

type View = "week" | "new" | string;

function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const todayMs = parseDay(TODAY);
const daysFromToday = (iso: string) => Math.round((parseDay(iso) - todayMs) / DAY_MS);
const isUrgent = (d: Deadline) => d.kind === "abgabe" && daysFromToday(d.date) <= 3;
const courseById = (id: string) => courses.find((c) => c.id === id);

export function Overview({
  courseIds,
  problem,
  onProblem,
  onRelogin,
}: {
  courseIds: string[];
  problem: Problem;
  onProblem: (p: Problem) => void;
  onRelogin: () => void;
}) {
  const list = courses.filter((c) => courseIds.includes(c.id));
  const [view, setView] = useState<View>("week");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(LAST_SYNC);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const sync = () => {
    if (syncing) return;
    setSyncing(true);
    timer.current = window.setTimeout(() => {
      setSyncing(false);
      if (problem === "courseFailed" || problem === "offline") onProblem("none");
      if (problem !== "loginExpired") {
        const now = new Date();
        setLastSync(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      }
    }, 1400);
  };

  const course = list.find((c) => c.id === view);
  const newCount = list.reduce((n, c) => n + countNew(c), 0);
  const mine = deadlines.filter((d) => courseIds.includes(d.courseId));

  return (
    <div className="flex h-full bg-bg">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="drag h-[52px] shrink-0" />
        <nav className="scroll flex-1 px-3 pb-3" aria-label="Navigation">
          <div className="flex flex-col gap-0.5">
            <NavItem active={view === "week"} onClick={() => setView("week")} icon={<CalendarDays size={15} aria-hidden />}>
              Nächste 7 Tage
            </NavItem>
            <NavItem active={view === "new"} onClick={() => setView("new")} icon={<Inbox size={15} aria-hidden />} count={newCount}>
              Neu
            </NavItem>
          </div>
          <p className="mb-1.5 mt-6 px-2.5 text-[12px] text-muted">Deine Kurse</p>
          <div className="flex flex-col gap-0.5">
            {list.map((c) => (
              <NavItem
                key={c.id}
                active={view === c.id}
                onClick={() => setView(c.id)}
                icon={<Swatch color={colorOf(c)} />}
                count={countNew(c)}
                warn={problem === "courseFailed" && c.id === FAIL_ID}
              >
                {c.name}
              </NavItem>
            ))}
          </div>
        </nav>
        <SyncStatus problem={problem} syncing={syncing} lastSync={lastSync} onSync={sync} />
      </aside>

      <main className="scroll min-w-0 flex-1">
        <div className="drag h-[28px]" />
        <div className="mx-auto max-w-[1080px] px-10 pb-12">
          <Banners problem={problem} onRetry={sync} onRelogin={onRelogin} courseId={course?.id} />
          {view === "week" && <WeekView list={list} deadlines={mine} onOpen={setView} />}
          {view === "new" && <NewView list={list} />}
          {course && <CourseView course={course} deadlines={mine.filter((d) => d.courseId === course.id)} />}
        </div>
      </main>
    </div>
  );
}

// --- Seitenleiste -----------------------------------------------------------

function NavItem({
  active,
  onClick,
  icon,
  count = 0,
  warn,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count?: number;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors ${
        active ? "bg-accent font-semibold text-on-accent" : "hover:bg-hover"
      }`}
    >
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {warn ? (
        <AlertTriangle size={13} className={active ? "" : "text-danger"} aria-label="Fehler beim Sync" />
      ) : (
        count > 0 && (
          <span className={`text-[12px] tabular-nums ${active ? "opacity-80" : "text-muted"}`}>{count}</span>
        )
      )}
    </button>
  );
}

function SyncStatus({
  problem,
  syncing,
  lastSync,
  onSync,
}: {
  problem: Problem;
  syncing: boolean;
  lastSync: string;
  onSync: () => void;
}) {
  let icon = <span className="size-2 rounded-full bg-ok" aria-hidden />;
  let text = `Aktuell, ${lastSync}`;
  if (syncing) {
    icon = <Spinner size={12} />;
    text = "Synchronisiere…";
  } else if (problem === "offline") {
    icon = <WifiOff size={13} className="text-warn" aria-hidden />;
    text = `Offline, Stand ${lastSync}`;
  } else if (problem === "loginExpired") {
    icon = <LogIn size={13} className="text-warn" aria-hidden />;
    text = "Anmeldung abgelaufen";
  } else if (problem === "courseFailed") {
    icon = <AlertTriangle size={13} className="text-danger" aria-hidden />;
    text = "1 Kurs mit Fehler";
  }

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 rounded-[10px] bg-bg py-2 pl-3 pr-1.5">
        <span className="flex w-3 justify-center">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[12px]" aria-live="polite">
          {text}
        </span>
        <button
          onClick={onSync}
          disabled={syncing || problem === "loginExpired"}
          aria-label="Jetzt synchronisieren"
          title="Jetzt synchronisieren"
          className="flex size-7 items-center justify-center rounded-md bg-surface hover:bg-hover disabled:opacity-45"
        >
          <RefreshCw size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Banners({
  problem,
  onRetry,
  onRelogin,
  courseId,
}: {
  problem: Problem;
  onRetry: () => void;
  onRelogin: () => void;
  courseId?: string;
}) {
  if (problem === "offline")
    return (
      <div className="mb-5">
        <Notice tone="warn" icon={<WifiOff size={16} aria-hidden />} action={<Button onClick={onRetry}>Erneut versuchen</Button>}>
          Keine Verbindung zu ILIAS. Du siehst den Stand von heute früh.
        </Notice>
      </div>
    );
  if (problem === "loginExpired")
    return (
      <div className="mb-5">
        <Notice tone="warn" icon={<LogIn size={16} aria-hidden />} action={<Button onClick={onRelogin}>Neu anmelden</Button>}>
          Deine ILIAS-Anmeldung ist abgelaufen. Deine Dateien bleiben erhalten.
        </Notice>
      </div>
    );
  if (problem === "courseFailed" && (!courseId || courseId === FAIL_ID))
    return (
      <div className="mb-5">
        <Notice tone="danger" icon={<AlertTriangle size={16} aria-hidden />} action={<Button onClick={onRetry}>Erneut versuchen</Button>}>
          Rechnernetze konnte nicht synchronisiert werden. Die anderen Kurse sind aktuell.
        </Notice>
      </div>
    );
  return null;
}

// --- Nächste 7 Tage ---------------------------------------------------------

function WeekView({ list, deadlines, onOpen }: { list: Course[]; deadlines: Deadline[]; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayMs + i * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    return { iso, num: d.getUTCDate(), wd, weekend: wd === 0 || wd === 6, items: deadlines.filter((x) => x.date === iso) };
  });

  const due = deadlines.filter((d) => d.kind === "abgabe" && daysFromToday(d.date) >= 0 && daysFromToday(d.date) < 7);
  const first = [...due].sort((a, b) => a.date.localeCompare(b.date))[0];
  const kurse = new Set(due.map((d) => d.courseId)).size;

  const newFiles = list.flatMap((c) =>
    c.folders.flatMap((f) => f.files.filter((x) => x.isNew || x.changeNote).map((file) => ({ file, course: c, folder: f.name }))),
  );
  const withDigest = list.filter((c) => digests[c.id]);

  return (
    <>
      <header className="pt-3">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Nächste 7 Tage</h1>
        <p className="mt-1 text-muted">
          {due.length === 0
            ? "Keine Abgaben in den nächsten 7 Tagen."
            : `${due.length} ${due.length === 1 ? "Abgabe" : "Abgaben"} in ${kurse} ${kurse === 1 ? "Kurs" : "Kursen"}.`}
          {first && ` Zuerst fällig: ${first.title.replace(/ abgeben$/, "")} am ${LONG[new Date(parseDay(first.date)).getUTCDay()]}.`}
        </p>
      </header>

      <div className="mt-6 grid grid-cols-7 gap-1.5" role="list" aria-label="Die nächsten 7 Tage">
        {days.map((day, i) => (
          <div key={day.iso} role="listitem" className="flex min-w-0 flex-col gap-1.5">
            <div className="flex h-7 items-center gap-1.5 px-1">
              {i === 0 ? (
                <>
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-1.5 font-bold text-on-accent">
                    {day.num}
                  </span>
                  <span className="font-semibold">Heute</span>
                </>
              ) : (
                <>
                  <span className="font-bold">{day.num}</span>
                  <span className="text-muted">{SHORT[day.wd]}</span>
                </>
              )}
            </div>
            <div className={`flex min-h-[200px] flex-col gap-1.5 rounded-[10px] p-1.5 ${day.weekend ? "bg-sunken" : "bg-surface"}`}>
              {day.items.map((d) => (
                <DeadlineBlock key={d.id} d={d} onClick={() => onOpen(d.courseId)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="neu-titel">
          <div className="mb-2.5 flex items-baseline">
            <h2 id="neu-titel" className="flex-1 text-[17px] font-bold">
              Neu in deinen Kursen
            </h2>
          </div>
          {newFiles.length === 0 ? (
            <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">Seit dem letzten Sync ist nichts Neues dazugekommen.</p>
          ) : (
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {newFiles.map(({ file, course }) => (
                <FileRow key={file.id} file={file} sub={course.name} color={colorOf(course)} compact />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="kurz-titel">
          <h2 id="kurz-titel" className="mb-2.5 text-[17px] font-bold">
            Kurz zusammengefasst
          </h2>
          <div className="flex flex-col gap-3.5">
            {withDigest.map((c) => (
              <p key={c.id} className="flex gap-3">
                <span className="mt-[5px]">
                  <Swatch color={colorOf(c)} />
                </span>
                <span>
                  <strong className="font-semibold">{c.name}:</strong> {digests[c.id]}
                </span>
              </p>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function DeadlineBlock({ d, onClick }: { d: Deadline; onClick: () => void }) {
  const course = courseById(d.courseId);
  if (!course) return null;
  const c = colorOf(course);
  const urgent = isUrgent(d);
  return (
    <button
      onClick={onClick}
      title={d.source ? `Gefunden in ${d.source}` : undefined}
      className="rounded-[7px] px-2 py-1.5 text-left transition-[filter] hover:brightness-[0.97]"
      style={urgent ? { background: tone(c), color: "var(--on-solid)" } : { background: tone(c, "soft") }}
    >
      <span className="block text-[12px] font-semibold" style={urgent ? undefined : { color: tone(c, "ink") }}>
        {d.time}
      </span>
      <span className="block text-[13px] font-semibold leading-snug">{d.title}</span>
      <span className={`block truncate text-[12px] ${urgent ? "opacity-90" : "text-muted"}`}>{course.name}</span>
    </button>
  );
}

// --- Neu ------------------------------------------------------------------

function NewView({ list }: { list: Course[] }) {
  const items = list.flatMap((c) =>
    c.folders.flatMap((f) =>
      f.files.filter((x) => x.isNew || x.changeNote).map((file) => ({ file, course: c, where: `${c.name}, ${f.name}` })),
    ),
  );
  return (
    <>
      <header className="pt-3">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Neu</h1>
        <p className="mt-1 text-muted">Neue und geänderte Dateien seit dem letzten Sync.</p>
      </header>
      {items.length === 0 ? (
        <p className="mt-6 rounded-[10px] bg-surface px-4 py-5 text-muted">Seit dem letzten Sync ist nichts Neues dazugekommen.</p>
      ) : (
        <ul className="mt-6 rounded-[10px] bg-surface px-1.5 py-1">
          {items.map(({ file, course, where }) => (
            <FileRow key={file.id} file={file} sub={where} color={colorOf(course)} />
          ))}
        </ul>
      )}
    </>
  );
}

// --- Kurs -------------------------------------------------------------------

function CourseView({ course, deadlines }: { course: Course; deadlines: Deadline[] }) {
  const [closed, setClosed] = useState<string[]>([]);
  const toggle = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const c = colorOf(course);
  const n = countFiles(course);
  const upcoming = deadlines.filter((d) => daysFromToday(d.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <header className="flex flex-wrap items-end gap-4 pt-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-[30px] font-bold leading-tight tracking-[-0.02em]">
            <Swatch color={c} size={14} />
            <span className="truncate">{course.name}</span>
          </h1>
          <p className="mt-1 text-muted">
            {course.lecturer}, {n} {n === 1 ? "Datei" : "Dateien"}
          </p>
        </div>
        <Button>Im Finder zeigen</Button>
      </header>

      {(digests[course.id] || upcoming.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          {digests[course.id] && (
            <p className="rounded-[10px] bg-surface px-4 py-3.5 leading-relaxed">{digests[course.id]}</p>
          )}
          {upcoming.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {upcoming.map((d) => {
                const wd = new Date(parseDay(d.date)).getUTCDay();
                const urgent = isUrgent(d);
                return (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5"
                    style={urgent ? { background: tone(c), color: "var(--on-solid)" } : { background: tone(c, "soft") }}
                  >
                    <span className="w-8 text-center">
                      <span className="block text-[11px] font-semibold opacity-80">{SHORT[wd]}</span>
                      <span className="block text-[17px] font-bold leading-none">{Number(d.date.slice(8))}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{d.title}</span>
                      <span className="block text-[12px] opacity-80">{d.time}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="mt-7 flex flex-col gap-5">
        {course.folders.map((f) => {
          const open = !closed.includes(f.id);
          return (
            <section key={f.id}>
              <button
                onClick={() => toggle(f.id)}
                aria-expanded={open}
                className="-ml-1.5 mb-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[15px] font-bold hover:bg-hover"
              >
                {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                {f.name}
                <span className="ml-1 text-[13px] font-normal text-muted">{f.files.length}</span>
              </button>
              {open && (
                <ul className="rounded-[10px] bg-surface px-1.5 py-1">
                  {f.files.map((x) => (
                    <FileRow key={x.id} file={x} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

// --- Datei-Zeile ------------------------------------------------------------

function FileRow({
  file,
  sub,
  color,
  compact,
}: {
  file: CourseFile;
  sub?: string;
  color?: ReturnType<typeof colorOf>;
  compact?: boolean;
}) {
  const changed = Boolean(file.changeNote);
  return (
    <li className="group flex min-h-[46px] items-center gap-3 rounded-[7px] px-2.5 py-1.5 hover:bg-hover focus-within:bg-hover">
      {color ? <Swatch color={color} /> : <FileIcon kind={file.kind} />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {file.name}
          {changed && <span className="ml-2 text-[12px] font-semibold text-warn">geändert</span>}
          {!changed && file.isNew && !compact && <span className="ml-2 text-[12px] font-semibold text-ok">neu</span>}
        </p>
        {(sub || changed) && (
          <p className="truncate text-[12px] text-muted">{changed ? file.changeNote : sub}</p>
        )}
      </div>
      <div className="hidden items-center gap-1.5 group-hover:flex group-focus-within:flex">
        {changed && <Button className="h-7 px-2.5">Unterschied</Button>}
        <Button className="h-7 px-2.5">Öffnen</Button>
        {!compact && <Button className="h-7 px-2.5">Im Finder zeigen</Button>}
      </div>
      <span className="w-[64px] shrink-0 text-right text-[12px] text-muted group-hover:hidden group-focus-within:hidden">
        {file.updated}
      </span>
      {!compact && (
        <span className="w-[56px] shrink-0 text-right text-[12px] tabular-nums text-muted">{file.size}</span>
      )}
    </li>
  );
}
