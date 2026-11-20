"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Inbox,
  LogIn,
  RefreshCw,
  Search,
  WifiOff,
  X,
} from "lucide-react";
import { Button, FileIcon, Notice, Spinner, Swatch, colorOf, nameOf, shortOf, tone } from "./ui";
import { ImportPanel, jobProgress, useJob, type Job } from "./ImportJob";
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
  user,
  onEditCourses,
  importRun = 0,
  failImport = false,
}: {
  courseIds: string[];
  problem: Problem;
  onProblem: (p: Problem) => void;
  onRelogin: () => void;
  user: string;
  onEditCourses: () => void;
  importRun?: number; // zählt hoch, wenn ein erster Import starten soll
  failImport?: boolean;
}) {
  const list = courses.filter((c) => courseIds.includes(c.id));
  const [view, setView] = useState<View>("week");
  const [lastSync, setLastSync] = useState(LAST_SYNC);
  const [done, setDone] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [closedRun, setClosedRun] = useState(0); // Import-Lauf, dessen Fenster geschlossen wurde
  const searchRef = useRef<HTMLInputElement>(null);

  const { job, start, stop, dismiss, retry } = useJob((finished) => {
    if (finished.rows.some((r) => r.status === "failed")) return;
    if (problem === "courseFailed" || problem === "offline") onProblem("none");
    const now = new Date();
    setLastSync(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  });

  // Erster Import: startet, sobald AppShell importRun hochzählt (Übersicht ist sofort benutzbar)
  useEffect(() => {
    if (importRun > 0) {
      start("import", courses.filter((c) => courseIds.includes(c.id)), failImport);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importRun]);

  // ⌘F springt ins Suchfeld (wie in jeder Mac-App)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const syncing = Boolean(job?.running);
  const sync = () => {
    if (syncing || problem === "loginExpired") return;
    start("sync", list);
  };

  const toggleDone = (id: string) => setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const open = (v: View) => {
    setQuery("");
    setView(v);
  };

  const course = list.find((c) => c.id === view);
  const newCount = list.reduce((n, c) => n + countNew(c), 0);
  const mine = deadlines.filter((d) => courseIds.includes(d.courseId));
  const searching = query.trim().length > 0;

  return (
    <div className="flex h-full bg-bg">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="drag h-[44px] shrink-0" />
        <ProfileMenu user={user} onEditCourses={onEditCourses} onLogout={onRelogin} />
        <nav className="scroll flex-1 px-3 pb-3 pt-3" aria-label="Navigation">
          <div className="flex flex-col gap-0.5">
            <NavItem active={!searching && view === "week"} onClick={() => open("week")} icon={<CalendarDays size={15} aria-hidden />}>
              Nächste 7 Tage
            </NavItem>
            <NavItem active={!searching && view === "new"} onClick={() => open("new")} icon={<Inbox size={15} aria-hidden />} count={newCount}>
              Neu
            </NavItem>
          </div>
          <p className="mb-1.5 mt-6 px-2.5 text-[12px] text-muted">Deine Kurse</p>
          <div className="flex flex-col gap-0.5">
            {list.map((c) => (
              <NavItem
                key={c.id}
                active={!searching && view === c.id}
                onClick={() => open(c.id)}
                icon={<Swatch color={colorOf(c)} />}
                count={countNew(c)}
                warn={problem === "courseFailed" && c.id === FAIL_ID}
              >
                {nameOf(c)}
              </NavItem>
            ))}
          </div>
        </nav>
        <SyncStatus problem={problem} job={job} lastSync={lastSync} onSync={sync} onStop={stop} />
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        {job?.kind === "import" && closedRun !== importRun && (
          <ImportPanel
            job={job}
            onRetry={retry}
            onClose={() => {
              setClosedRun(importRun);
              if (!job.running) dismiss();
            }}
          />
        )}
        <header className="drag flex h-[52px] shrink-0 items-center justify-end gap-3 px-6">
          <label className="no-drag flex h-8 w-[260px] items-center gap-2 rounded-lg bg-surface px-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
            <Search size={14} className="shrink-0 text-muted" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Suchen"
              aria-label="Dateien, Abgaben und Kurse suchen"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted focus-visible:outline-none"
            />
            {searching ? (
              <button
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Suche leeren"
                className="flex size-[18px] items-center justify-center rounded-full bg-muted/40 text-surface hover:bg-muted/60"
              >
                <X size={11} strokeWidth={3} aria-hidden />
              </button>
            ) : (
              <kbd className="font-sans text-[12px] text-muted">⌘F</kbd>
            )}
          </label>
        </header>

        <div className="scroll flex-1">
          <div className="mx-auto max-w-[1080px] px-10 pb-12">
            <Banners problem={problem} onRetry={sync} onRelogin={onRelogin} courseId={course?.id} />
            {searching ? (
              <SearchView query={query.trim()} list={list} deadlines={mine} done={done} onOpen={open} />
            ) : (
              <>
                {view === "week" && <WeekView list={list} deadlines={mine} done={done} onToggle={toggleDone} onOpen={open} />}
                {view === "new" && <NewView list={list} />}
                {course && (
                  <CourseView
                    course={course}
                    deadlines={mine.filter((d) => d.courseId === course.id)}
                    done={done}
                    onToggle={toggleDone}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Seitenleiste -----------------------------------------------------------

function ProfileMenu({ user, onEditCourses, onLogout }: { user: string; onEditCourses: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Klick daneben oder Esc schließt das Menü
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex h-8 w-full items-center rounded-md px-2.5 text-left hover:bg-hover";

  return (
    <div ref={ref} className="relative px-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="no-drag flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-64.png" alt="" width={32} height={32} className="size-8 shrink-0" draggable={false} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold leading-tight">Studi-Helfer</span>
          <span className="block truncate text-[12px] text-muted">{user}, Uni Köln</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-3 right-3 top-full z-20 mt-1 rounded-[10px] bg-surface p-1.5 shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,0.14)]"
        >
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onEditCourses();
            }}
          >
            Kurse ändern
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            className={`${item} text-danger`}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

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
      className={`flex min-h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left leading-snug transition-colors ${
        active ? "bg-accent font-semibold text-on-accent" : "hover:bg-hover"
      }`}
    >
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="line-clamp-2 min-w-0 flex-1">{children}</span>
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
  job,
  lastSync,
  onSync,
  onStop,
}: {
  problem: Problem;
  job: Job | null;
  lastSync: string;
  onSync: () => void;
  onStop: () => void;
}) {
  // Variante D2: während des Holens Balken, „3 von 6 Kursen, gerade BWL“ und Stopp
  if (job?.running) {
    const { n, done, cur, frac } = jobProgress(job);
    return (
      <div className="p-3">
        <div className="rounded-[10px] bg-bg px-3 py-2.5" aria-live="polite">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Spinner size={12} />
            {job.kind === "import" ? "Hole deine Kurse…" : "Hole neue Dateien…"}
          </p>
          <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out" style={{ width: `${frac * 100}%` }} />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
              {done} von {n} Kursen{cur ? `, gerade ${cur.name}` : ""}
            </span>
            <button
              onClick={onStop}
              className="rounded-md bg-danger-soft px-2 py-0.5 text-[12px] font-semibold text-danger transition-opacity hover:opacity-80"
            >
              Stopp
            </button>
          </div>
        </div>
      </div>
    );
  }

  let icon = <span className="size-2 rounded-full bg-ok" aria-hidden />;
  let label = "Zuletzt geholt";
  let text = `heute, ${lastSync}`;
  if (job?.stopped) {
    icon = <span className="size-2 rounded-full bg-warn" aria-hidden />;
    label = "Holen gestoppt";
    text = `Stand: heute, ${lastSync}`;
  } else if (problem === "offline") {
    icon = <WifiOff size={13} className="text-warn" aria-hidden />;
    label = "Offline";
    text = `Stand: heute, ${lastSync}`;
  } else if (problem === "loginExpired") {
    icon = <LogIn size={13} className="text-warn" aria-hidden />;
    label = "Anmeldung abgelaufen";
    text = "Bitte neu anmelden";
  } else if (problem === "courseFailed") {
    icon = <AlertTriangle size={13} className="text-danger" aria-hidden />;
    label = "1 Kurs mit Fehler";
    text = `Rest: heute, ${lastSync}`;
  }

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 rounded-[10px] bg-bg py-2 pl-3 pr-1.5">
        <span className="flex w-3 justify-center">{icon}</span>
        <span className="min-w-0 flex-1" aria-live="polite">
          <span className="block truncate text-[11px] text-muted">{label}</span>
          <span className="block truncate text-[12px] font-semibold">{text}</span>
        </span>
        <button
          onClick={onSync}
          disabled={problem === "loginExpired"}
          aria-label="Jetzt neue Dateien holen"
          title="Jetzt neue Dateien holen"
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

function WeekView({
  list,
  deadlines,
  done,
  onToggle,
  onOpen,
}: {
  list: Course[];
  deadlines: Deadline[];
  done: string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [range, setRange] = useState<"week" | "month">("week");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayMs + i * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    const items = deadlines.filter((x) => x.date === iso);
    return { iso, num: d.getUTCDate(), wd: d.getUTCDay(), items, wide: items.length > 0, today: i === 0 };
  });

  const open = deadlines.filter(
    (d) => d.kind === "abgabe" && !done.includes(d.id) && daysFromToday(d.date) >= 0 && daysFromToday(d.date) < 7,
  );
  const first = [...open].sort((a, b) => a.date.localeCompare(b.date))[0];
  const kurse = new Set(open.map((d) => d.courseId)).size;
  const in4 = deadlines.filter((d) => daysFromToday(d.date) >= 0 && daysFromToday(d.date) < 28);
  const openIn4 = in4.filter((d) => d.kind === "abgabe" && !done.includes(d.id)).length;
  const examsIn4 = in4.filter((d) => d.kind === "klausur").length;

  const newFiles = list.flatMap((c) =>
    c.folders.flatMap((f) => f.files.filter((x) => x.isNew || x.changeNote).map((file) => ({ file, course: c }))),
  );
  const withDigest = list.filter((c) => digests[c.id]);

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">
            {range === "week" ? "Nächste 7 Tage" : "Nächste 4 Wochen"}
          </h1>
          <p className="mt-1 text-muted">
            {range === "month" ? (
              `${openIn4} offene ${openIn4 === 1 ? "Abgabe" : "Abgaben"}${examsIn4 > 0 ? `, ${examsIn4} ${examsIn4 === 1 ? "Klausur" : "Klausuren"}` : ""}.`
            ) : (
              <>
                {open.length === 0
                  ? "Alles erledigt. Keine offenen Abgaben in den nächsten 7 Tagen."
                  : `${open.length} offene ${open.length === 1 ? "Abgabe" : "Abgaben"} in ${kurse} ${kurse === 1 ? "Kurs" : "Kursen"}.`}
                {first && ` Zuerst fällig: ${first.title.replace(/ abgeben$/, "")} am ${LONG[new Date(parseDay(first.date)).getUTCDay()]}.`}
              </>
            )}
          </p>
        </div>
        <div role="tablist" aria-label="Zeitraum" className="inline-flex rounded-[9px] bg-sunken p-[3px]">
          {(["week", "month"] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`h-7 rounded-[7px] px-3.5 transition-colors ${range === r ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-text"}`}
            >
              {r === "week" ? "7 Tage" : "4 Wochen"}
            </button>
          ))}
        </div>
      </header>

      {range === "month" && <MonthView deadlines={deadlines} done={done} onOpen={onOpen} />}

      {/* Tage ohne Termine werden schmal, Tage mit Terminen teilen sich den Platz. */}
      {range === "week" && (
      <div
        className="mt-6 grid gap-1.5 transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: days.map((d) => (d.wide ? "minmax(0, 1fr)" : "44px")).join(" ") }}
        role="list"
        aria-label="Die nächsten 7 Tage"
      >
        {days.map((day) => (
          <div key={day.iso} role="listitem" className="flex min-w-0 flex-col gap-1.5" aria-label={`${LONG[day.wd]}, ${day.num}.`}>
            <DayHead day={day} />
            <div
              className={`flex min-h-[150px] flex-col gap-1.5 rounded-[10px] p-1.5 ${day.wide ? "bg-surface" : "bg-sunken"} ${
                day.today && day.wide ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""
              }`}
            >
              {day.items.map((d) => (
                <DeadlineBlock
                  key={d.id}
                  d={d}
                  done={done.includes(d.id)}
                  onToggle={() => onToggle(d.id)}
                  onOpen={() => onOpen(d.courseId)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="neu-titel">
          <h2 id="neu-titel" className="mb-2.5 text-[17px] font-bold">
            Neu in deinen Kursen
          </h2>
          {newFiles.length === 0 ? (
            <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">Seit dem letzten Sync ist nichts Neues dazugekommen.</p>
          ) : (
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {newFiles.map(({ file, course }) => (
                <FileRow key={file.id} file={file} sub={nameOf(course)} color={colorOf(course)} compact />
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
                  <strong className="font-semibold">{nameOf(c)}:</strong> {digests[c.id]}
                </span>
              </p>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function MonthView({ deadlines, done, onOpen }: { deadlines: Deadline[]; done: string[]; onOpen: (id: string) => void }) {
  const wdToday = new Date(todayMs).getUTCDay();
  const start = todayMs - ((wdToday + 6) % 7) * DAY_MS; // Montag dieser Woche
  const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
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
      items: deadlines.filter((x) => x.date === iso),
    };
  });

  return (
    <div className="mt-6">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 px-1 text-[12px] text-muted" aria-hidden>
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Die nächsten 4 Wochen">
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
            {!cell.past &&
              cell.items.slice(0, 3).map((d) => {
                const course = courseById(d.courseId);
                if (!course) return null;
                const c = colorOf(course);
                const isDone = d.kind === "abgabe" && done.includes(d.id);
                const exam = d.kind === "klausur";
                const label = exam && d.title === "Klausur" ? `Klausur ${shortOf(course)}` : d.title.replace(/ abgeben$/, "");
                return (
                  <button
                    key={d.id}
                    onClick={() => onOpen(d.courseId)}
                    title={`${d.title}, ${nameOf(course)}, ${d.time}`}
                    className={`truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] font-semibold ${isDone ? "line-through" : ""}`}
                    style={
                      isDone
                        ? { background: "var(--sunken)", color: "var(--muted)" }
                        : exam
                          ? { background: tone(c), color: "var(--on-solid)" }
                          : { background: tone(c, "soft"), color: tone(c, "ink") }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            {cell.items.length > 3 && <span className="px-1 text-[11px] text-muted">+{cell.items.length - 3} weitere</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayHead({ day }: { day: { num: number; wd: number; wide: boolean; today: boolean } }) {
  if (!day.wide) {
    return (
      <div className="flex h-7 flex-col items-center justify-center leading-none">
        {day.today ? (
          <span className="flex size-7 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-on-accent">
            {day.num}
          </span>
        ) : (
          <>
            <span className="text-[13px] font-bold">{day.num}</span>
            <span className="mt-0.5 text-[11px] text-muted">{SHORT[day.wd]}</span>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-7 items-center gap-1.5 px-1">
      {day.today ? (
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
  );
}

function CheckButton({ done, onClick, label, onSolid }: { done: boolean; onClick: () => void; label: string; onSolid?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `${label}: wieder offen` : `${label}: als erledigt markieren`}
      title={done ? "Wieder offen" : "Erledigt"}
      className={`flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors ${
        done
          ? "bg-accent text-on-accent"
          : onSolid
            ? "border-2 border-[var(--on-solid)] opacity-90 hover:bg-white/20"
            : "border-2 border-current bg-surface hover:bg-hover"
      }`}
    >
      {done && <Check size={12} strokeWidth={3.2} aria-hidden />}
    </button>
  );
}

function DeadlineBlock({ d, done, onToggle, onOpen }: { d: Deadline; done: boolean; onToggle: () => void; onOpen: () => void }) {
  const course = courseById(d.courseId);
  if (!course) return null;
  const c = colorOf(course);
  const exam = d.kind === "klausur";
  const checkable = d.kind === "abgabe"; // Termine und Klausuren hakt man nicht ab
  const isDone = checkable && done;
  const solid = isUrgent(d) && !isDone;
  const style = isDone
    ? { background: "var(--sunken)", color: "var(--muted)" }
    : exam
      ? { background: "var(--surface)", boxShadow: `inset 0 0 0 2.5px ${tone(c)}` }
      : solid
        ? { background: tone(c), color: "var(--on-solid)" }
        : { background: tone(c, "soft") };
  const title = exam && d.title === "Klausur" ? shortOf(course) : d.title.replace(/ abgeben$/, "");

  return (
    <div className="flex items-start gap-1.5 rounded-[7px] py-1.5 pl-2 pr-1.5 transition-colors" style={style}>
      <button
        onClick={onOpen}
        title={d.source ? `${d.kind === "klausur" ? "Ort" : "Gefunden in"}: ${d.source}` : `${nameOf(course)} öffnen`}
        className="min-w-0 flex-1 text-left"
      >
        {exam && (
          <span className="mb-1 inline-block rounded-full px-1.5 text-[11px] font-bold leading-[17px]" style={{ background: tone(c), color: "var(--on-solid)" }}>
            Klausur
          </span>
        )}
        <span
          className="block truncate text-[12px] font-semibold"
          style={isDone || solid ? undefined : { color: tone(c, "ink") }}
        >
          {isDone ? "erledigt" : d.time}
        </span>
        <span className={`block text-[13px] font-semibold leading-snug ${isDone ? "line-through" : ""}`}>{title}</span>
        <span className={`block truncate text-[12px] ${solid ? "opacity-85" : isDone ? "" : "text-muted"}`}>
          {exam && d.source ? d.source : shortOf(course)}
        </span>
      </button>
      {checkable && (
        <span style={isDone || solid ? undefined : { color: tone(c) }}>
          <CheckButton done={isDone} onClick={onToggle} label={d.title} onSolid={solid} />
        </span>
      )}
    </div>
  );
}

// --- Suche ------------------------------------------------------------------

type Filter = "alles" | "abgaben" | "dateien" | "kurse";

function SearchView({
  query,
  list,
  deadlines,
  done,
  onOpen,
}: {
  query: string;
  list: Course[];
  deadlines: Deadline[];
  done: string[];
  onOpen: (v: View) => void;
}) {
  const [filter, setFilter] = useState<Filter>("alles");
  const q = query.toLowerCase();
  const hit = (s: string) => s.toLowerCase().includes(q);

  const foundCourses = list.filter((c) => hit(nameOf(c)) || (c.short && hit(c.short)));
  const foundDeadlines = deadlines.filter((d) => {
    const c = courseById(d.courseId);
    return hit(d.title) || (c && hit(nameOf(c)));
  });
  const foundFiles = list.flatMap((c) =>
    c.folders.flatMap((f) => f.files.filter((x) => hit(x.name)).map((file) => ({ file, course: c, folder: f.name }))),
  );
  const total = foundCourses.length + foundDeadlines.length + foundFiles.length;

  const chips: { id: Filter; label: string; n: number }[] = [
    { id: "alles", label: "Alles", n: total },
    { id: "abgaben", label: "Abgaben", n: foundDeadlines.length },
    { id: "dateien", label: "Dateien", n: foundFiles.length },
    { id: "kurse", label: "Kurse", n: foundCourses.length },
  ];
  const show = (f: Filter) => filter === "alles" || filter === f;

  return (
    <>
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">
          {total === 0 ? "Nichts gefunden" : `${total} ${total === 1 ? "Treffer" : "Treffer"}`}
        </h1>
        <p className="mt-1 text-muted">
          {total === 0 ? `Für „${query}“ gibt es keine Datei, Abgabe oder Kurs.` : `für „${query}“`}
        </p>
      </header>

      {total > 0 && (
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Treffer filtern">
          {chips.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setFilter(ch.id)}
              aria-pressed={filter === ch.id}
              disabled={ch.n === 0}
              className={`h-8 rounded-full px-3.5 font-medium transition-colors disabled:opacity-40 ${
                filter === ch.id ? "bg-accent text-on-accent" : "bg-surface hover:bg-hover"
              }`}
            >
              {ch.label} <span className="opacity-60">{ch.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {show("abgaben") && foundDeadlines.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Abgaben</h2>
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {foundDeadlines.map((d) => {
                const c = courseById(d.courseId)!;
                const wd = new Date(parseDay(d.date)).getUTCDay();
                const isDone = done.includes(d.id);
                return (
                  <li key={d.id}>
                    <button onClick={() => onOpen(c.id)} className="flex min-h-[46px] w-full items-center gap-3 rounded-[7px] px-2.5 py-1.5 text-left hover:bg-hover">
                      <Swatch color={colorOf(c)} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-medium ${isDone ? "text-muted line-through" : ""}`}>
                          <Highlight text={d.title} q={q} />
                        </span>
                        <span className="block truncate text-[12px] text-muted">{nameOf(c)}</span>
                      </span>
                      <span className="text-[12px] text-muted">{isDone ? "erledigt" : `${LONG[wd]}, ${d.time}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {show("dateien") && foundFiles.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Dateien</h2>
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {foundFiles.map(({ file, course, folder }) => (
                <FileRow key={file.id} file={file} sub={`${nameOf(course)}, ${folder}`} color={colorOf(course)} highlight={q} />
              ))}
            </ul>
          </section>
        )}
        {show("kurse") && foundCourses.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Kurse</h2>
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {foundCourses.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onOpen(c.id)} className="flex min-h-[46px] w-full items-center gap-3 rounded-[7px] px-2.5 py-1.5 text-left hover:bg-hover">
                    <Swatch color={colorOf(c)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        <Highlight text={nameOf(c)} q={q} />
                      </span>
                      <span className="block truncate text-[12px] text-muted">{c.lecturer}</span>
                    </span>
                    <span className="text-[12px] text-muted">{countFiles(c)} Dateien</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Highlight({ text, q }: { text: string; q?: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-[var(--c-ochre-soft)] px-px font-semibold text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// --- Neu ------------------------------------------------------------------

function NewView({ list }: { list: Course[] }) {
  const items = list.flatMap((c) =>
    c.folders.flatMap((f) =>
      f.files.filter((x) => x.isNew || x.changeNote).map((file) => ({ file, course: c, where: `${nameOf(c)}, ${f.name}` })),
    ),
  );
  return (
    <>
      <header>
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

function CourseView({
  course,
  deadlines,
  done,
  onToggle,
}: {
  course: Course;
  deadlines: Deadline[];
  done: string[];
  onToggle: (id: string) => void;
}) {
  const [closed, setClosed] = useState<string[]>([]);
  const toggle = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const c = colorOf(course);
  const n = countFiles(course);
  const upcoming = deadlines.filter((d) => daysFromToday(d.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-[30px] font-bold leading-tight tracking-[-0.02em]">
            <Swatch color={c} size={14} />
            <span className="truncate">{nameOf(course)}</span>
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
                const isDone = done.includes(d.id);
                const solid = isUrgent(d) && !isDone;
                const style = isDone
                  ? { background: "var(--sunken)", color: "var(--muted)" }
                  : d.kind === "klausur"
                    ? { background: "var(--surface)", boxShadow: `inset 0 0 0 2.5px ${tone(c)}` }
                    : solid
                      ? { background: tone(c), color: "var(--on-solid)" }
                      : { background: tone(c, "soft") };
                return (
                  <li key={d.id} className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 transition-colors" style={style}>
                    <span className="w-8 text-center">
                      <span className="block text-[11px] font-semibold opacity-80">{SHORT[wd]}</span>
                      <span className="block text-[17px] font-bold leading-none">{Number(d.date.slice(8))}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold ${isDone ? "line-through" : ""}`}>{d.title}</span>
                      <span className="block text-[12px] opacity-80">{isDone ? "erledigt" : d.time}</span>
                    </span>
                    {d.kind === "abgabe" && (
                      <span style={isDone || solid ? undefined : { color: tone(c) }}>
                        <CheckButton done={isDone} onClick={() => onToggle(d.id)} label={d.title} onSolid={solid} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="mt-7 flex flex-col gap-5">
        {course.folders.map((f) => {
          const isOpen = !closed.includes(f.id);
          return (
            <section key={f.id}>
              <button
                onClick={() => toggle(f.id)}
                aria-expanded={isOpen}
                className="-ml-1.5 mb-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[15px] font-bold hover:bg-hover"
              >
                {isOpen ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                {f.name}
                <span className="ml-1 text-[13px] font-normal text-muted">{f.files.length}</span>
              </button>
              {isOpen && (
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
  highlight,
}: {
  file: CourseFile;
  sub?: string;
  color?: ReturnType<typeof colorOf>;
  compact?: boolean;
  highlight?: string;
}) {
  const changed = Boolean(file.changeNote);
  return (
    <li className="group flex min-h-[46px] items-center gap-3 rounded-[7px] px-2.5 py-1.5 hover:bg-hover focus-within:bg-hover">
      {color ? <Swatch color={color} /> : <FileIcon kind={file.kind} />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <Highlight text={file.name} q={highlight} />
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
