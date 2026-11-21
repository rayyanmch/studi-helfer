"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  Inbox,
  Library,
  LogIn,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sun,
  UtensilsCrossed,
  WifiOff,
  X,
} from "lucide-react";
import { Button, Notice, Spinner, Swatch, colorOf, inDays, nameOf, shortOf, tone } from "./ui";
import { CheckButton, FileRow, Highlight, displayName } from "./files";
import { CoursesView } from "./CoursesView";
import { ModuleView } from "./ModuleView";
import { openEvent, openNewEvent } from "./EventDialog";
import { MensaView } from "./MensaView";
import { Welcome } from "./Welcome";
import { matches, searchTerms } from "@/lib/search";
import { MailView } from "./MailView";
import { Accounts } from "./Accounts";
import { Settings } from "./Settings";
import { ImportPanel, jobProgress, useJob, useTick, type Job } from "./ImportJob";
import { applyTheme, getTheme, type Theme } from "./theme";
import { UpdateMenuItem } from "./UpdateNotice";
import type { Problem } from "./AppShell";
import { countFiles, countNew, type Course, type Deadline } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { initMail, setCalendar, useMail, type GoogleEvent } from "@/lib/mail-data";
import { appStore, etaLabel, realCourses, useApp, useCommand } from "@/lib/app-store";

const FAIL_ID = "rechnernetze";
const DAY_MS = 86_400_000;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Titel ohne „Submit “ vorne, für enge Stellen
const bare = (t: string) => t.replace(/^Submit /, "");

type View = "week" | "new" | "courses" | "mail" | "mensa" | string; // string = Modul-Id

function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Daten kommen aus app-store.ts (Browser: Beispieldaten, Mac-App: echte Daten).
const todayMs = () => parseDay(appStore.get().today);
const daysFromToday = (iso: string) => Math.round((parseDay(iso) - todayMs()) / DAY_MS);
const isUrgent = (d: Deadline) => d.kind === "abgabe" && daysFromToday(d.date) <= 3;
const courseById = (id: string) => appStore.get().courses.find((c) => c.id === id);
const digestsNow = () => appStore.get().digests;

export function Overview({
  courseIds,
  problem,
  onProblem,
  onRelogin,
  user,
  onEditCourses,
  importRun = 0,
  failImport = false,
  onLogout,
}: {
  courseIds: string[];
  problem: Problem;
  onProblem: (p: Problem) => void;
  onRelogin: () => void;
  onLogout: () => void;
  user: string;
  onEditCourses: () => void;
  importRun?: number; // zählt hoch, wenn ein erster Import starten soll
  failImport?: boolean;
}) {
  const app = useApp();
  const desktop = app.mode === "desktop";
  const list = app.courses.filter((c) => courseIds.includes(c.id));
  const [view, setView] = useState<View>("week");
  const [demoLastSync, setLastSync] = useState(app.lastSync);
  const lastSync = desktop ? app.lastSync : demoLastSync;
  const [demoDone, setDone] = useState<string[]>([]);
  const done = desktop ? app.done : demoDone;
  const failedIds = desktop ? app.failedCourseIds : problem === "courseFailed" ? [FAIL_ID] : [];
  const [query, setQuery] = useState("");
  const [closedRun, setClosedRun] = useState(0); // Import-Lauf, dessen Fenster geschlossen wurde
  const searchRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const mailState = useMail();
  useEffect(() => initMail(!desktop), [desktop]); // Beispiel-Postfächer nur in der Browser-Vorschau
  const mailUnread = mailState.messages.filter(
    (m) => m.folder === "inbox" && m.unread && mailState.accounts.some((a) => a.id === m.accountId && a.connected),
  ).length;

  const { job, start, stop, dismiss, retry } = useJob((finished) => {
    if (finished.rows.some((r) => r.status === "failed")) return;
    if (problem === "courseFailed" || problem === "offline") onProblem("none");
    const now = new Date();
    setLastSync(`today, ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  });

  // Erster Import: startet, sobald AppShell importRun hochzählt (Übersicht ist sofort benutzbar)
  useEffect(() => {
    if (importRun > 0) {
      start("import", app.courses.filter((c) => courseIds.includes(c.id)), failImport);
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

  // Befehle aus dem App-Menü (⌘1–3, ⌘R, ⌘F, ⌘,)
  const onCommand = useCallback(
    (cmd: string) => {
      if (cmd === "week" || cmd === "new" || cmd === "courses") {
        setQuery("");
        setView(cmd);
      } else if (cmd === "search") {
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (cmd === "settings") setSettingsOpen(true);
      else if (cmd === "sync") sync();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncing, problem],
  );
  useCommand(onCommand);

  const toggleDone = (id: string) =>
    desktop ? void store.toggleDone(id) : setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const open = (v: View) => {
    setQuery("");
    setView(v);
  };

  const course = list.find((c) => c.id === view);
  const newCount = list.reduce((n, c) => n + countNew(c) + c.folders.reduce((m, f) => m + f.files.filter((x) => x.changeNote && !x.isNew).length, 0), 0);
  const modules = realCourses(list);
  const mine = app.deadlines.filter((d) => courseIds.includes(d.courseId));
  const searching = query.trim().length > 0;

  return (
    <div className="flex h-full bg-bg">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="drag h-[44px] shrink-0" />
        <ProfileMenu user={user} onEditCourses={onEditCourses} onLogout={onLogout} onSettings={() => setSettingsOpen(true)} onAccounts={() => setAccountsOpen(true)} />
        <nav className="scroll flex-1 px-3 pb-3 pt-3" aria-label="Navigation">
          <div className="flex flex-col gap-0.5">
            <NavItem active={!searching && view === "week"} onClick={() => open("week")} icon={<CalendarDays size={15} aria-hidden />}>
              Next 7 days
            </NavItem>
            <NavItem active={!searching && view === "new"} onClick={() => open("new")} icon={<Inbox size={15} aria-hidden />} count={newCount}>
              New
            </NavItem>
            <NavItem
              active={!searching && (view === "courses" || Boolean(course))}
              onClick={() => open("courses")}
              icon={<Library size={15} aria-hidden />}
              count={modules.length}
              warn={failedIds.length > 0}
            >
              Courses
            </NavItem>
            <NavItem active={view === "mail"} onClick={() => open("mail")} icon={<Mail size={15} aria-hidden />} count={mailUnread}>
              Mail
            </NavItem>
            <NavItem active={!searching && view === "mensa"} onClick={() => open("mensa")} icon={<UtensilsCrossed size={15} aria-hidden />}>
              Mensa
            </NavItem>
          </div>
        </nav>
        <SyncStatus problem={problem} job={job} lastSync={lastSync} failed={failedIds.length} onSync={sync} onStop={stop} />
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
        {view === "mail" && !searching ? (
          <div className="min-h-0 flex-1">
            <MailView onOpenAccounts={() => setAccountsOpen(true)} />
          </div>
        ) : (
          <>
        <header className="drag flex h-[52px] shrink-0 items-center justify-end gap-3 px-6">
          <label className="no-drag flex h-8 w-[260px] items-center gap-2 rounded-lg bg-surface px-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
            <Search size={14} className="shrink-0 text-muted" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search"
              aria-label="Search files, deadlines and courses"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted focus-visible:outline-none"
            />
            {searching ? (
              <button
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
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
            <Banners
              problem={problem}
              onRetry={sync}
              onRelogin={onRelogin}
              courseId={course?.id}
              failedIds={failedIds}
              lastSync={lastSync}
            />
            {searching ? (
              <SearchView query={query.trim()} list={list} deadlines={mine} done={done} onOpen={open} />
            ) : (
              <>
                {view === "week" && <Welcome onMensa={() => open("mensa")} />}
                {view === "week" && <WeekView list={list} deadlines={mine} done={done} onToggle={toggleDone} onOpen={open} />}
                {view === "new" && <NewView list={list} onOpen={open} />}
                {view === "courses" && <CoursesView onOpen={open} onEditCourses={onEditCourses} />}
                {view === "mensa" && <MensaView />}
                {course && (
                  <ModuleView
                    key={course.id}
                    course={course}
                    deadlines={mine.filter((d) => d.courseId === course.id)}
                    done={done}
                    onToggle={toggleDone}
                    onBack={() => open("courses")}
                  />
                )}
              </>
            )}
          </div>
        </div>
          </>
        )}
      </main>
      {accountsOpen && <Accounts onClose={() => setAccountsOpen(false)} />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onEditCourses={onEditCourses} onLogout={onLogout} />}
    </div>
  );
}

// --- Seitenleiste -----------------------------------------------------------

function ProfileMenu({
  user,
  onEditCourses,
  onLogout,
  onSettings,
  onAccounts,
}: {
  user: string;
  onEditCourses: () => void;
  onLogout: () => void;
  onSettings: () => void;
  onAccounts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const chooseTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
  };
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
          <span className="block truncate text-[12px] text-muted">{user}, Uni Cologne</span>
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
            Change courses
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onAccounts();
            }}
          >
            Accounts
          </button>
          <button
            role="menuitem"
            className={`${item} justify-between`}
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
          >
            Settings… <kbd className="font-sans text-[12px] text-muted">⌘,</kbd>
          </button>
          <div className="my-1 h-px bg-line" />
          <p className="px-2.5 pb-1 pt-1.5 text-[12px] text-muted">Appearance</p>
          <div role="radiogroup" aria-label="Appearance" className="mx-1 mb-1 grid grid-cols-3 gap-0.5 rounded-lg bg-bg p-[3px]">
            {(
              [
                ["system", "Auto", Monitor],
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
              ] as const
            ).map(([t, label, Icon]) => (
              <button
                key={t}
                role="radio"
                aria-checked={theme === t}
                onClick={() => chooseTheme(t)}
                title={t === "system" ? "Same as your Mac" : undefined}
                className={`flex h-7 items-center justify-center gap-1 rounded-md text-[12px] transition-colors ${
                  theme === t ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-text"
                }`}
              >
                <Icon size={12} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <UpdateMenuItem className={item} onDone={() => setOpen(false)} />
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            className={`${item} text-danger`}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Sign out
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
        <AlertTriangle size={13} className={active ? "" : "text-danger"} aria-label="Problem getting new files" />
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
  failed,
  onSync,
  onStop,
}: {
  problem: Problem;
  job: Job | null;
  lastSync: string;
  failed: number;
  onSync: () => void;
  onStop: () => void;
}) {
  // Variante D2: während des Holens Balken, Restzeit („About 2 min left“) und Stopp
  useTick(Boolean(job?.running));
  if (job?.running) {
    const { n, done, cur, frac } = jobProgress(job);
    const eta = etaLabel(appStore.get().job);
    return (
      <div className="p-3">
        <div className="rounded-[10px] bg-bg px-3 py-2.5" aria-live="polite">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Spinner size={12} />
            {job.kind === "import" ? "Getting your courses…" : "Getting new files…"}
          </p>
          <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out" style={{ width: `${frac * 100}%` }} />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted" title={cur ? `Now: ${cur.name}` : undefined}>
              {eta ?? `${done} of ${n}${cur ? `, now ${cur.name}` : ""}`}
            </span>
            <button
              onClick={onStop}
              className="rounded-md bg-danger-soft px-2 py-0.5 text-[12px] font-semibold text-danger transition-opacity hover:opacity-80"
            >
              Stop
            </button>
          </div>
        </div>
      </div>
    );
  }

  let icon = <span className="size-2 rounded-full bg-ok" aria-hidden />;
  let label = "Checked for new files";
  let text = lastSync;
  if (job?.stopped) {
    icon = <span className="size-2 rounded-full bg-warn" aria-hidden />;
    label = "Stopped early";
    text = `As of ${lastSync}`;
  } else if (problem === "offline") {
    icon = <WifiOff size={13} className="text-warn" aria-hidden />;
    label = "Offline";
    text = `As of ${lastSync}`;
  } else if (problem === "loginExpired") {
    icon = <LogIn size={13} className="text-warn" aria-hidden />;
    label = "Signed out";
    text = "Please sign in again";
  } else if (problem === "courseFailed") {
    icon = <AlertTriangle size={13} className="text-danger" aria-hidden />;
    label = `${failed || 1} ${failed > 1 ? "courses" : "course"} not updated`;
    text = `Others: ${lastSync}`;
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
          aria-label="Get new files now"
          title="Get new files now"
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
  failedIds,
  lastSync,
}: {
  problem: Problem;
  onRetry: () => void;
  onRelogin: () => void;
  courseId?: string;
  failedIds: string[];
  lastSync: string;
}) {
  if (problem === "offline")
    return (
      <div className="mb-5">
        <Notice tone="warn" icon={<WifiOff size={16} aria-hidden />} action={<Button onClick={onRetry}>Try again</Button>}>
          No connection to ILIAS. You are seeing the files from {lastSync}.
        </Notice>
      </div>
    );
  if (problem === "loginExpired")
    return (
      <div className="mb-5">
        <Notice tone="warn" icon={<LogIn size={16} aria-hidden />} action={<Button onClick={onRelogin}>Sign in again</Button>}>
          You were signed out of ILIAS. Your files are safe.
        </Notice>
      </div>
    );
  if (problem === "courseFailed" && failedIds.length > 0 && (!courseId || failedIds.includes(courseId))) {
    const names = failedIds.map((id) => courseById(id)).filter((c): c is Course => Boolean(c)).map(nameOf);
    const who = names.length === 0 ? "One course" : names.length === 1 ? names[0] : `${names.length} courses`;
    return (
      <div className="mb-5">
        <Notice tone="danger" icon={<AlertTriangle size={16} aria-hidden />} action={<Button onClick={onRetry}>Try again</Button>}>
          {who} could not be updated. All other courses are up to date.
        </Notice>
      </div>
    );
  }
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
  // Vorlesungen/Übungstermine (kind "termin") im Wochenstreifen ein-/ausblenden; gemerkt pro Mac
  const [showClasses, setShowClasses] = useState(() => {
    try {
      return localStorage.getItem("studi.showClasses") !== "0";
    } catch {
      return true;
    }
  });
  const toggleClasses = () =>
    setShowClasses((v) => {
      try {
        localStorage.setItem("studi.showClasses", v ? "0" : "1");
      } catch {
        // egal
      }
      return !v;
    });
  const hasClasses = deadlines.some((d) => d.kind === "termin");
  // Kalender an/aus (Variante B1): ILIAS-Fristen und Google Kalender, Standard beide an
  const mail = useMail();
  const googleConnected = mail.accounts.some((a) => a.id === "gmail" && a.connected);
  const showIlias = mail.calendars.ilias || !googleConnected; // ohne Google gibt es nichts umzuschalten
  const googleEvents = googleConnected && mail.calendars.google ? mail.events : [];
  const classesFiltered = showClasses ? deadlines : deadlines.filter((d) => d.kind !== "termin");
  const visible = showIlias ? classesFiltered : [];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayMs() + i * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    const items = visible.filter((x) => x.date === iso);
    const events = googleEvents.filter((x) => x.date === iso);
    return { iso, num: d.getUTCDate(), wd: d.getUTCDay(), items, events, wide: items.length + events.length > 0, today: i === 0 };
  });

  const open = deadlines.filter(
    (d) => d.kind === "abgabe" && !done.includes(d.id) && daysFromToday(d.date) >= 0 && daysFromToday(d.date) < 7,
  );
  const first = [...open].sort((a, b) => a.date.localeCompare(b.date))[0];
  const kurse = new Set(open.map((d) => d.courseId)).size;
  // Klausur-Countdown auf der Startseite: nächste Klausur in allen Kursen
  const nextExam = deadlines
    .filter((d) => d.kind === "klausur" && daysFromToday(d.date) >= 0 && courseById(d.courseId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const in4 = deadlines.filter((d) => daysFromToday(d.date) >= 0 && daysFromToday(d.date) < 28);
  const openIn4 = in4.filter((d) => d.kind === "abgabe" && !done.includes(d.id)).length;
  const examsIn4 = in4.filter((d) => d.kind === "klausur").length;

  const newFiles = list.flatMap((c) =>
    c.folders.flatMap((f) => f.files.filter((x) => x.isNew || x.changeNote).map((file) => ({ file, course: c }))),
  );
  const digests = digestsNow();
  const withDigest = list.filter((c) => digests[c.id]);

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">
            {range === "week" ? "Next 7 days" : "Next 4 weeks"}
          </h1>
          <p className="mt-1 text-muted">
            {range === "month" ? (
              `${openIn4} open ${openIn4 === 1 ? "deadline" : "deadlines"}${examsIn4 > 0 ? `, ${examsIn4} ${examsIn4 === 1 ? "exam" : "exams"}` : ""}.`
            ) : (
              <>
                {open.length === 0 && deadlines.length === 0 && appStore.get().job?.kind === "import"
                  ? "Your deadlines are on their way…"
                  : open.length === 0
                  ? "All done. No open deadlines in the next 7 days."
                  : `${open.length} open ${open.length === 1 ? "deadline" : "deadlines"} in ${kurse} ${kurse === 1 ? "course" : "courses"}.`}
                {first && ` Next up: ${bare(first.title)} on ${LONG[new Date(parseDay(first.date)).getUTCDay()]}.`}
                {nextExam && ` Next exam: ${shortOf(courseById(nextExam.courseId)!)} ${inDays(daysFromToday(nextExam.date))}.`}
              </>
            )}
          </p>
        </div>
        <div role="tablist" aria-label="Time range" className="inline-flex rounded-[9px] bg-sunken p-[3px]">
          {(["week", "month"] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`h-7 rounded-[7px] px-3.5 transition-colors ${range === r ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-text"}`}
            >
              {r === "week" ? "7 days" : "4 weeks"}
            </button>
          ))}
        </div>
      </header>

      {googleConnected && (
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Calendars">
          <CalendarChip on={mail.calendars.ilias} onChange={(on) => setCalendar("ilias", on)} dashed={false}>
            ILIAS deadlines
          </CalendarChip>
          <CalendarChip on={mail.calendars.google} onChange={(on) => setCalendar("google", on)} dashed>
            Google Calendar
          </CalendarChip>
          <span className="text-[12px] text-muted">Dashed = from Google Calendar</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {hasClasses && (
          <label className="inline-flex cursor-default items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={showClasses} onChange={toggleClasses} className="accent-[var(--accent)]" />
            Show classes and events
          </label>
        )}
        {visible.length > 0 && <span className="text-[12px] text-muted">Click an entry to see details, change or hide it.</span>}
        <Button variant="plain" className="-my-1 ml-auto" onClick={() => openNewEvent()}>
          <CalendarPlus size={14} aria-hidden /> Add event
        </Button>
      </div>

      {range === "month" && <MonthView deadlines={visible} events={googleEvents} done={done} onOpen={onOpen} />}

      {/* Tage ohne Termine werden schmal, Tage mit Terminen teilen sich den Platz. */}
      {range === "week" && (
      <div
        className="mt-6 grid gap-1.5 transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: days.map((d) => (d.wide ? "minmax(0, 1fr)" : "44px")).join(" ") }}
        role="list"
        aria-label="The next 7 days"
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
                  onOpen={() => openEvent(d, { onOpenCourse: () => onOpen(d.courseId) })}
                />
              ))}
              {day.events.map((ev) => (
                <GoogleBlock key={ev.id} ev={ev} />
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
      {range === "week" && visible.length === 0 && googleEvents.length === 0 && (
        <p className="mt-3 rounded-[10px] bg-surface px-4 py-3.5 text-muted">
          Nothing planned for the next 7 days. Deadlines from ILIAS show up here by themselves. To see your lectures too, add your timetable in
          Settings, or use “Add event” above.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="neu-titel">
          <h2 id="neu-titel" className="mb-2.5 text-[17px] font-bold">
            New in your courses
          </h2>
          {newFiles.length === 0 ? (
            <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">Nothing new since the last check. New files from ILIAS show up here.</p>
          ) : (
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {newFiles.map(({ file, course }) => (
                <FileRow key={file.id} file={file} sub={nameOf(course)} courseId={course.id} compact />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="kurz-titel">
          <h2 id="kurz-titel" className="mb-2.5 text-[17px] font-bold">
            In short
          </h2>
          <div className="flex flex-col gap-3.5">
            {withDigest.length === 0 && (
              <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">
                Nothing to sum up yet. Once your files and deadlines are in, you get one line per course here.
              </p>
            )}
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

function MonthView({ deadlines, events, done, onOpen }: { deadlines: Deadline[]; events: GoogleEvent[]; done: string[]; onOpen: (id: string) => void }) {
  const wdToday = new Date(todayMs()).getUTCDay();
  const start = todayMs() - ((wdToday + 6) % 7) * DAY_MS; // Montag dieser Woche
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
      items: deadlines.filter((x) => x.date === iso),
      events: events.filter((x) => x.date === iso),
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
            {!cell.past &&
              cell.items.slice(0, 3).map((d) => {
                const course = courseById(d.courseId);
                if (!course) return null;
                const c = d.color ?? colorOf(course);
                const isDone = d.kind === "abgabe" && done.includes(d.id);
                const exam = d.kind === "klausur";
                const plain = bare(d.title);
                // „Lecture“, „Exercise · Group 3“ … sagen allein nicht, welcher Kurs: Kurzname davor (nicht nur Farbe)
                const label =
                  exam && d.title === "Exam" ? `Exam ${shortOf(course)}` : /^(lecture|exercise|tutorial|seminar|lab|class)\b/i.test(plain) ? `${shortOf(course)} ${plain}` : plain;
                return (
                  <button
                    key={d.id}
                    onClick={() => openEvent(d, { onOpenCourse: () => onOpen(d.courseId) })}
                    title={`${d.title}, ${nameOf(course)}, ${d.time}`}
                    aria-label={`${d.title}, ${nameOf(course)}, ${d.time}`}
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
            {!cell.past &&
              cell.events.slice(0, Math.max(0, 3 - cell.items.length)).map((ev) => (
                <span
                  key={ev.id}
                  title={`${ev.title}, ${ev.time}`}
                  className="truncate rounded-[5px] px-1.5 py-0.5 text-left text-[11px] font-semibold text-muted shadow-[inset_0_0_0_1.5px_var(--line)] [border-style:dashed]"
                  style={{ border: "1.5px dashed var(--muted)", boxShadow: "none" }}
                >
                  {ev.title}
                </span>
              ))}
            {cell.items.length > 3 && <span className="px-1 text-[11px] text-muted">+{cell.items.length - 3} more</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Schalter für einen Kalender (Haken in der Kapsel). „dashed“ zeigt, wie dessen Termine aussehen.
function CalendarChip({ on, onChange, dashed, children }: { on: boolean; onChange: (on: boolean) => void; dashed: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`flex h-8 items-center gap-2 rounded-full pl-2 pr-3.5 font-semibold transition-colors ${on ? "bg-accent text-on-accent" : "bg-surface text-muted shadow-[inset_0_0_0_1.5px_var(--line)] hover:bg-hover"}`}
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

// Termin aus dem Google Kalender: gestrichelter Rand, kein Kreis (Termine hakt man nicht ab).
function GoogleBlock({ ev }: { ev: GoogleEvent }) {
  return (
    <div className="rounded-[7px] px-2 py-1.5" style={{ border: "1.5px dashed var(--muted)" }}>
      <span className="block truncate text-[12px] font-semibold text-muted">{ev.time}</span>
      <span className="block text-[13px] font-semibold leading-snug">{ev.title}</span>
      {ev.location && <span className="block truncate text-[12px] text-muted">{ev.location}</span>}
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
          <span className="font-semibold">Today</span>
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

function DeadlineBlock({ d, done, onToggle, onOpen }: { d: Deadline; done: boolean; onToggle: () => void; onOpen: () => void }) {
  const course = courseById(d.courseId);
  if (!course) return null;
  const c = d.color ?? colorOf(course);
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
  const title = exam && d.title === "Exam" ? shortOf(course) : bare(d.title);

  return (
    <div className="flex items-start gap-1.5 rounded-[7px] py-1.5 pl-2 pr-1.5 transition-colors" style={style}>
      <button
        onClick={onOpen}
        title={[`${d.title}, ${nameOf(course)}`, d.location ? `Room: ${d.location}` : d.source].filter(Boolean).join(" · ")}
        className="min-w-0 flex-1 text-left"
      >
        {exam && (
          <span className="mb-1 inline-block rounded-full px-1.5 text-[11px] font-bold leading-[17px]" style={{ background: tone(c), color: "var(--on-solid)" }}>
            Exam
          </span>
        )}
        <span
          className="block truncate text-[12px] font-semibold"
          style={isDone || solid ? undefined : { color: tone(c, "ink") }}
        >
          {isDone ? "done" : d.time}
        </span>
        <span className={`block text-[13px] font-semibold leading-snug ${isDone ? "line-through" : ""}`}>{title}</span>
        <span className={`block truncate text-[12px] ${solid ? "opacity-85" : isDone ? "" : "text-muted"}`}>
          {exam && d.location ? d.location : shortOf(course)}
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
  // Versteht auch deutsche Wörter („Klausur“ findet Exams, „Folien“ findet Lecture slides), siehe lib/search.ts
  const terms = searchTerms(query);
  const q = query; // zum Hervorheben der Fundstelle
  const hit = (...s: (string | undefined)[]) => matches(terms, ...s);

  const foundCourses = realCourses(list).filter((c) => hit(nameOf(c)) || (c.short && hit(c.short)) || (c.fullName && hit(c.fullName)));
  // Wiederkehrende Termine (Vorlesung jede Woche) nur einmal zeigen, mit dem nächsten Datum; vergangene Termine weglassen.
  const seriesKey = (d: Deadline) =>
    d.seriesId ?? (d.kind === "termin" ? `${d.courseId}|${d.title}|${d.time}|${new Date(parseDay(d.date)).getUTCDay()}` : d.id);
  const repeats = new Map<string, number>();
  const foundDeadlines = deadlines
    .filter((d) => {
      if (d.kind === "termin" && daysFromToday(d.date) < 0) return false;
      const c = courseById(d.courseId);
      const kindWords = d.kind === "klausur" ? "exam" : d.kind === "abgabe" ? "deadline submission" : undefined;
      return hit(d.title, kindWords) || (c ? hit(nameOf(c), c.fullName) : false);
    })
    .sort((x, y) => x.date.localeCompare(y.date))
    .filter((d) => {
      const k = seriesKey(d);
      repeats.set(k, (repeats.get(k) ?? 0) + 1);
      return repeats.get(k) === 1;
    });
  const foundFiles = list.flatMap((c) =>
    c.folders.flatMap((f) => f.files.filter((x) => hit(x.name, displayName(x.name), f.name, f.category)).map((file) => ({ file, course: c, folder: f.name }))),
  );
  const total = foundCourses.length + foundDeadlines.length + foundFiles.length;

  const chips: { id: Filter; label: string; n: number }[] = [
    { id: "alles", label: "All", n: total },
    { id: "abgaben", label: "Deadlines", n: foundDeadlines.length },
    { id: "dateien", label: "Files", n: foundFiles.length },
    { id: "kurse", label: "Courses", n: foundCourses.length },
  ];
  const show = (f: Filter) => filter === "alles" || filter === f;

  return (
    <>
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">
          {total === 0 ? "No results" : `${total} ${total === 1 ? "result" : "results"}`}
        </h1>
        <p className="mt-1 text-muted">
          {total === 0
            ? `No file, deadline or course matches “${query}”. Try a shorter word or a course name.`
            : `for “${query}”`}
        </p>
      </header>

      {total > 0 && (
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter results">
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
            <h2 className="mb-2 text-[15px] font-bold">Deadlines</h2>
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
                        <span className="block truncate text-[12px] text-muted">
                          {nameOf(c)}
                          {(repeats.get(seriesKey(d)) ?? 0) > 1 ? " · repeats" : ""}
                        </span>
                      </span>
                      <span className="text-[12px] text-muted">
                        {isDone
                          ? "done"
                          : `${
                              daysFromToday(d.date) >= 0 && daysFromToday(d.date) < 7
                                ? LONG[wd]
                                : new Date(parseDay(d.date)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
                            }, ${d.time}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {show("dateien") && foundFiles.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Files</h2>
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {foundFiles.map(({ file, course, folder }) => (
                <FileRow key={file.id} file={file} sub={[nameOf(course), file.part, folder].filter(Boolean).join(" · ")} courseId={course.id} highlight={q} />
              ))}
            </ul>
          </section>
        )}
        {show("kurse") && foundCourses.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Courses</h2>
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
                    <span className="text-[12px] text-muted">{countFiles(c)} files</span>
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

// --- Neu ------------------------------------------------------------------

function NewView({ list, onOpen }: { list: Course[]; onOpen: (id: string) => void }) {
  const desktop = appStore.get().mode === "desktop";
  const groups = realCourses(list)
    .map((c) => ({
      course: c,
      files: c.folders
        .flatMap((f) => f.files)
        .filter((x) => x.isNew || x.changeNote)
        .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0)),
    }))
    .filter((g) => g.files.length > 0);
  const all = groups.flatMap((g) => g.files.map((f) => f.id));
  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">New</h1>
          <p className="mt-1 text-muted">
            {all.length === 0
              ? "You are all caught up."
              : `${all.length} new or updated ${all.length === 1 ? "file" : "files"} you have not opened yet.`}
          </p>
        </div>
        {desktop && all.length > 0 && <Button onClick={() => void store.markSeen(all)}>Mark all as seen</Button>}
      </header>
      {groups.length === 0 ? (
        <p className="mt-6 rounded-[10px] bg-surface px-4 py-5 text-muted">
          Nothing new. New files from ILIAS show up here until you open them.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {groups.map(({ course, files }) => (
            <section key={course.id}>
              <div className="mb-1.5 flex items-center gap-2">
                <Swatch color={colorOf(course)} />
                <button onClick={() => onOpen(course.id)} className="rounded text-[15px] font-bold hover:underline">
                  {course.name}
                </button>
                <span className="text-[13px] text-muted">{files.length}</span>
                {desktop && (
                  <button
                    onClick={() => void store.markSeen(files.map((f) => f.id))}
                    className="ml-auto rounded px-1 text-[12px] font-semibold text-muted hover:text-text"
                  >
                    Mark as seen
                  </button>
                )}
              </div>
              <ul className="rounded-[10px] bg-surface px-1.5 py-1">
                {files.map((file) => (
                  <FileRow key={file.id} file={file} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
