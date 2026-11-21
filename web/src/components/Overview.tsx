"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  CalendarPlus,
  ChartPie,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Sunrise,
  Inbox,
  Library,
  LogIn,
  Mail,
  MapPin,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sun,
  UtensilsCrossed,
  CloudOff,
  WifiOff,
  X,
} from "lucide-react";
import { Button, Notice, Spinner, Swatch, colorOf, examLabel, examPart, inDays, nameOf, shortOf, tone } from "./ui";
import { CheckButton, FileRow, Highlight, displayName } from "./files";
import { CoursesView } from "./CoursesView";
import { ModuleView } from "./ModuleView";
import { openEvent, openNewEvent } from "./EventDialog";
import { MensaView } from "./MensaView";
import { StudyHub, useStudyDue } from "./StudyHub";
import { ProgressView } from "./ProgressView";
import { reducedMotion } from "./motion";
import { MailBadge, cancelledStyle } from "./MailBadge";
import { useEventMails, type EventMail } from "@/lib/event-mail";
import type { WeatherDay } from "@/lib/weather";
import { Welcome } from "./Welcome";
import { TodayView, DayWeather, useWeatherDays } from "./TodayView";
import { matches, searchTerms } from "@/lib/search";
import { REMIND_DAYS, useExamRegistered } from "@/lib/exam-reg";
import { MailView } from "./MailView";
import { VpnDialogHost, VpnLine, openVpnDialog } from "./VpnPanel";
import { GoogleEventHost, openGoogleEvent } from "./GoogleEventDialog";
import { CalendarView } from "./CalendarView";
import { PlacesView } from "./PlacesView";
import { placeLabel } from "@/lib/rooms";
import { CalendarChip, ClashTag, GoogleBlock, abbrTitle, mergeTwins, overlapRows, sharedZones, startMinutes, withCourse, type DayEntry, type TimedEntry } from "./calendar-bits";
import { Accounts } from "./Accounts";
import { Settings } from "./Settings";
import { ImportPanel, jobProgress, useJob, useTick, type Job } from "./ImportJob";
import { applyTheme, getTheme, type Theme } from "./theme";
import { UpdateMenuItem } from "./UpdateNotice";
import type { Problem } from "./AppShell";
import { countFiles, countNew, type Course, type Deadline } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { initMail, setCalendar, useMail } from "@/lib/mail-data";
import { useRoomChanged } from "@/lib/room-changes";
import { appStore, etaLabel, realCourses, useApp, useCommand } from "@/lib/app-store";

const FAIL_ID = "rechnernetze";
const DAY_MS = 86_400_000;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Titel ohne „Submit “ vorne, für enge Stellen
const bare = (t: string) => t.replace(/^Submit /, "");

type View = "week" | "calendar" | "places" | "new" | "courses" | "mail" | "mensa" | "study" | "progress" | string; // string = Modul-Id

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
    (m) => m.folder === "inbox" && m.unread && !mailState.snoozed[m.id] && mailState.accounts.some((a) => a.id === m.accountId && a.connected),
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

  const studyDue = useStudyDue();
  // „Open in Study“ / „New study sheet“ auf der Kursseite öffnet den Study-Tab
  useEffect(() => {
    const go = () => {
      setQuery("");
      setView("study");
    };
    const goProgress = () => {
      setQuery("");
      setView("progress");
    };
    const goMail = () => {
      setQuery("");
      setView("mail");
    };
    window.addEventListener("studi:open-study", go);
    window.addEventListener("studi:open-progress", goProgress);
    window.addEventListener("studi:open-mail", goMail);
    return () => {
      window.removeEventListener("studi:open-study", go);
      window.removeEventListener("studi:open-progress", goProgress);
      window.removeEventListener("studi:open-mail", goMail);
    };
  }, []);

  const course = list.find((c) => c.id === view);
  const newCount = list.reduce((n, c) => n + countNew(c) + c.folders.reduce((m, f) => m + f.files.filter((x) => x.changeNote && !x.isNew).length, 0), 0);
  const modules = realCourses(list);
  // Raum per Mail nur für einen Tag geändert? Dann gilt der neue Raum an diesem Tag (lib/room-changes.ts)
  const mine = useRoomChanged(app.deadlines.filter((d) => courseIds.includes(d.courseId)));
  const searching = query.trim().length > 0;

  // Seitenleiste: welcher Eintrag ist markiert? Die dunkle Markierung gleitet vom alten zum neuen Eintrag.
  const activeNav = view === "mail" ? "mail" : searching ? null : course ? "courses" : view;
  const navRef = useRef<HTMLElement>(null);
  const prevNav = useRef<string | null>(activeNav);
  useLayoutEffect(() => {
    const prev = prevNav.current;
    prevNav.current = activeNav;
    const nav = navRef.current;
    if (!nav || !activeNav || !prev || prev === activeNav || reducedMotion()) return;
    const to = nav.querySelector<HTMLElement>(`[data-nav="${activeNav}"] > .nav-pill`);
    const from = nav.querySelector<HTMLElement>(`[data-nav="${prev}"] > .nav-pill`);
    if (!to || !from) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    if (!a.height || !b.height || from.closest('[data-open="false"]')) return;
    to.animate([{ transform: `translateY(${a.top - b.top}px) scaleY(${a.height / b.height})` }, { transform: "none" }], {
      duration: 300,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  }, [activeNav]);

  return (
    <div className="flex h-full bg-bg">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="drag h-[44px] shrink-0" />
        <ProfileMenu user={user} onEditCourses={onEditCourses} onLogout={onLogout} onSettings={() => setSettingsOpen(true)} onAccounts={() => setAccountsOpen(true)} />
        <nav ref={navRef} className="scroll flex-1 px-3 pb-3 pt-3" aria-label="Navigation">
          <div className="flex flex-col gap-0.5">
            <NavItem id="week" active={activeNav === "week"} onClick={() => open("week")} icon={<Sunrise size={15} aria-hidden />}>
              Today
            </NavItem>
            <NavItem id="calendar" active={activeNav === "calendar"} onClick={() => open("calendar")} icon={<CalendarRange size={15} aria-hidden />}>
              Calendar
            </NavItem>
            <NavItem id="new" active={activeNav === "new"} onClick={() => open("new")} icon={<Inbox size={15} aria-hidden />} count={newCount} countHint={`${newCount} new ${newCount === 1 ? "file" : "files"} you haven’t opened`}>
              New
            </NavItem>
            <NavItem
              id="courses"
              active={activeNav === "courses"}
              onClick={() => open("courses")}
              icon={<Library size={15} aria-hidden />}
              count={modules.length}
              countHint={`${modules.length} ${modules.length === 1 ? "course" : "courses"}`}
              warn={failedIds.length > 0}
            >
              Courses
            </NavItem>
            <NavItem id="mail" active={activeNav === "mail"} onClick={() => open("mail")} icon={<Mail size={15} aria-hidden />} count={mailUnread} countHint={`${mailUnread} unread`}>
              Mail
            </NavItem>
          </div>
          <NavGroup id="learn" label="Learn" holdsActive={activeNav === "study" || activeNav === "progress"} count={studyDue} countHint={`${studyDue} ${studyDue === 1 ? "card" : "cards"} to learn today`}>
            <NavItem id="study" active={activeNav === "study"} onClick={() => open("study")} icon={<GraduationCap size={15} aria-hidden />} count={studyDue} countHint={`${studyDue} ${studyDue === 1 ? "card" : "cards"} to learn today`}>
              Study
            </NavItem>
            <NavItem id="progress" active={activeNav === "progress"} onClick={() => open("progress")} icon={<ChartPie size={15} aria-hidden />}>
              Progress
            </NavItem>
          </NavGroup>
          <NavGroup id="campus" label="Campus" holdsActive={activeNav === "places" || activeNav === "mensa"}>
            <NavItem id="places" active={activeNav === "places"} onClick={() => open("places")} icon={<MapPin size={15} aria-hidden />}>
              Places
            </NavItem>
            <NavItem id="mensa" active={activeNav === "mensa"} onClick={() => open("mensa")} icon={<UtensilsCrossed size={15} aria-hidden />}>
              Mensa
            </NavItem>
          </NavGroup>
        </nav>
        <VpnLine />
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
          <div key={searching ? "search" : view} className="view-in mx-auto max-w-[1080px] px-10 pb-12">
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
                {view === "week" && <TodayView deadlines={mine} done={done} onOpen={open} />}
                {view === "week" && <WeekView list={list} deadlines={mine} done={done} onToggle={toggleDone} onOpen={open} />}
                {view === "calendar" && <CalendarView deadlines={mine} done={done} onToggle={toggleDone} onOpenCourse={open} />}
                {view === "places" && <PlacesView />}
                {view === "new" && <NewView list={list} onOpen={open} />}
                {view === "courses" && <CoursesView onOpen={open} onEditCourses={onEditCourses} />}
                {view === "mensa" && <MensaView />}
                {view === "study" && <StudyHub />}
                {view === "progress" && <ProgressView onOpenCourse={open} />}
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
      <VpnDialogHost />
      <GoogleEventHost />
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
          <span className="block truncate font-bold leading-tight">Ordo</span>
          <span className="block truncate text-[12px] text-muted">{user}, Uni Cologne</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          style={{ ["--menu-origin" as string]: "top center" }}
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

// Gruppen in der Seitenleiste (Learn, Campus): einklappbar, gemerkt im Browser-Speicher
const NAV_GROUPS_KEY = "studi.navClosed";
const navListeners = new Set<() => void>();
function readClosed(): string {
  try {
    return localStorage.getItem(NAV_GROUPS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function toggleGroup(id: string) {
  let list: string[] = [];
  try {
    list = JSON.parse(readClosed());
  } catch {
    list = [];
  }
  list = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  try {
    localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(list));
  } catch {
    // Speicher gesperrt: bleibt bis zum Neustart so
  }
  navListeners.forEach((f) => f());
}

function NavGroup({
  id,
  label,
  holdsActive,
  count = 0,
  countHint,
  children,
}: {
  id: string;
  label: string;
  holdsActive: boolean; // der markierte Eintrag liegt in dieser Gruppe
  count?: number;
  countHint?: string;
  children: React.ReactNode;
}) {
  const closedRaw = useSyncExternalStore(
    (f) => {
      navListeners.add(f);
      return () => navListeners.delete(f);
    },
    readClosed,
    () => "[]",
  );
  const open = !closedRaw.includes(`"${id}"`);
  return (
    <div className="mt-3">
      <button
        onClick={() => toggleGroup(id)}
        aria-expanded={open}
        className="group flex h-7 w-full items-center gap-1.5 rounded-md px-2.5 text-left text-[12px] font-semibold text-muted transition-colors hover:text-text"
      >
        <span className="flex-1">{label}</span>
        {!open && holdsActive && <span className="size-1.5 rounded-full bg-accent" aria-label="Current page is in this group" />}
        {!open && count > 0 && (
          <span className="tabular-nums" title={countHint} aria-label={countHint}>
            {count}
          </span>
        )}
        <ChevronRight size={13} className={`transition-[transform,opacity] duration-200 ${open ? "rotate-90 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : ""}`} aria-hidden />
      </button>
      <div className="expand" data-open={open} inert={!open}>
        <div className="flex flex-col gap-0.5 pt-0.5">{children}</div>
      </div>
    </div>
  );
}

function NavItem({
  id,
  active,
  onClick,
  icon,
  count = 0,
  countHint,
  warn,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  count?: number;
  countHint?: string; // was die Zahl zählt („13 cards to review today“), als Tooltip und für VoiceOver
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      data-nav={id}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left leading-snug transition-colors duration-200 ${
        active ? "font-semibold text-on-accent" : "hover:bg-hover"
      }`}
    >
      <span className="nav-pill origin-top" aria-hidden />
      <span className="relative flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="relative line-clamp-2 min-w-0 flex-1">{children}</span>
      {warn ? (
        <AlertTriangle size={13} className={`relative ${active ? "" : "text-danger"}`} aria-label="Problem getting new files" />
      ) : (
        count > 0 && (
          <span key={count} className={`bump relative text-[12px] tabular-nums ${active ? "opacity-80" : "text-muted"}`} title={countHint} aria-label={countHint}>
            {count}
          </span>
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
  const iliasDown = useApp().iliasDown;
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
    icon = iliasDown ? <CloudOff size={13} className="text-warn" aria-hidden /> : <WifiOff size={13} className="text-warn" aria-hidden />;
    label = iliasDown ? "ILIAS not responding" : "Offline";
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
  const iliasDown = useApp().iliasDown;
  if (problem === "offline")
    return (
      <div className="mb-5">
        <Notice
          tone="warn"
          icon={iliasDown ? <CloudOff size={16} aria-hidden /> : <WifiOff size={16} aria-hidden />}
          action={
            <span className="flex shrink-0 gap-2">
              <Button onClick={openVpnDialog}>Uni VPN</Button>
              <Button onClick={onRetry}>Try again</Button>
            </span>
          }
        >
          {iliasDown
            ? `ILIAS isn’t responding right now. Your internet works, so it’s on ILIAS’s side. You are seeing the files from ${lastSync}.`
            : `No connection to ILIAS. You are seeing the files from ${lastSync}.`}
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
  const wx = useWeatherDays();
  const notes = useEventMails(deadlines);
  const days = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(todayMs() + i * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    const items = visible.filter((x) => x.date === iso);
    const events = googleEvents.filter((x) => x.date === iso);
    // ILIAS und Google stehen in einer Reihenfolge nach Uhrzeit (ILIAS bei gleicher Zeit zuerst)
    const entries = mergeTwins(
      [
        ...items.map((d): DayEntry => ({ key: d.id, at: startMinutes(d.time), d, ev: null })),
        ...events.map((ev): DayEntry => ({ key: `g-${ev.id}`, at: startMinutes(ev.time), d: null, ev })),
      ].sort((a, b) => a.at - b.at),
    );
    // Termine, die sich überschneiden, stehen nebeneinander (Variante P1)
    const rows = overlapRows(entries);
    return { iso, num: d.getUTCDate(), wd: d.getUTCDay(), items, events, rows, wide: entries.length > 0, today: i === 0, wx: wx.get(iso) };
  });

  const open = deadlines.filter(
    (d) => d.kind === "abgabe" && !done.includes(d.id) && daysFromToday(d.date) >= 0 && daysFromToday(d.date) < 4,
  );
  const first = [...open].sort((a, b) => a.date.localeCompare(b.date))[0];
  const kurse = new Set(open.map((d) => d.courseId)).size;
  // Klausur-Countdown auf der Startseite: nächste Klausur in allen Kursen
  const nextExam = deadlines
    .filter((d) => d.kind === "klausur" && daysFromToday(d.date) >= 0 && courseById(d.courseId))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  // Erinnerung an die Prüfungsanmeldung in KLIPS (Details und „I’m registered“ im Termin-Dialog)
  const registered = useExamRegistered();
  const askRegistered = nextExam && !registered.includes(nextExam.id) && daysFromToday(nextExam.date) <= REMIND_DAYS;

  const newFiles = list.flatMap((c) =>
    c.folders.flatMap((f) => f.files.filter((x) => x.isNew || x.changeNote).map((file) => ({ file, course: c }))),
  );
  const digests = digestsNow();
  const withDigest = list.filter((c) => digests[c.id]);

  return (
    <>
      <header className="mt-9 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em]">Next 4 days</h2>
          <p className="mt-1 text-[13px] text-muted">
            {
              <>
                {open.length === 0 && deadlines.length === 0 && appStore.get().job?.kind === "import"
                  ? "Your deadlines are on their way…"
                  : open.length === 0
                  ? "All done. No open deadlines in the next 4 days."
                  : `${open.length} open ${open.length === 1 ? "deadline" : "deadlines"} in ${kurse} ${kurse === 1 ? "course" : "courses"}.`}
                {first && ` Next up: ${first.kind === "klausur" ? examLabel(first.title, courseById(first.courseId) ?? { name: "" }) : bare(first.title)} ${daysFromToday(first.date) === 0 ? "today" : daysFromToday(first.date) === 1 ? "tomorrow" : `on ${LONG[new Date(parseDay(first.date)).getUTCDay()]}`}.`}
                {nextExam && ` Next exam: ${nameOf(courseById(nextExam.courseId)!)} ${inDays(daysFromToday(nextExam.date))}.`}
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
            }
          </p>
        </div>
        <Button onClick={() => onOpen("calendar")}>
          <CalendarDays size={14} aria-hidden /> Open calendar
        </Button>
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

      {/* Tage ohne Termine werden schmal, Tage mit Terminen teilen sich den Platz. */}
      <div
        className="mt-6 grid gap-1.5 transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: days.map((d) => (d.wide ? "minmax(0, 1fr)" : "44px")).join(" ") }}
        role="list"
        aria-label="The next 4 days"
      >
        {days.map((day) => (
          <div key={day.iso} role="listitem" className="flex min-w-0 flex-col gap-1.5" aria-label={`${LONG[day.wd]}, ${day.num}.`}>
            <DayHead day={day} />
            <div
              className={`flex min-h-[150px] flex-col gap-1.5 rounded-[10px] p-1.5 ${day.wide ? "bg-surface" : "bg-sunken"} ${
                day.today && day.wide ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""
              }`}
            >
              {day.rows.map((row) =>
                row.kind === "group" ? (
                  <OverlapGroup key={row.key} items={row.items} onOpen={onOpen} notes={notes} />
                ) : row.e.d ? (
                  <DeadlineBlock
                    key={row.e.key}
                    d={row.e.d}
                    done={done.includes(row.e.d.id)}
                    onToggle={() => onToggle(row.e.d!.id)}
                    onOpen={() => openEvent(row.e.d!, { onOpenCourse: () => onOpen(row.e.d!.courseId) })}
                    alsoGoogle={row.e.alsoGoogle}
                    mails={notes.get(row.e.d.id) ?? []}
                  />
                ) : (
                  <GoogleBlock key={row.e.key} ev={row.e.ev!} />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      {visible.length === 0 && googleEvents.length === 0 && (
        <p className="mt-3 rounded-[10px] bg-surface px-4 py-3.5 text-muted">
          Nothing planned for the next 4 days. Deadlines from ILIAS show up here by themselves. To see your lectures too, add your timetable in
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

function DayHead({ day }: { day: { num: number; wd: number; wide: boolean; today: boolean; wx?: WeatherDay } }) {
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
      <DayWeather day={day.wx} />
    </div>
  );
}

/**
 * Termine, die sich überschneiden (Variante P1): nebeneinander, so weit nach unten versetzt, wie sie später
 * beginnen; die gemeinsame Zeit ist schraffiert. Zu: Farbe, Startzeit, Kürzel. Maus drüber: dieser wird breit.
 */
function OverlapGroup({ items, onOpen, notes }: { items: TimedEntry[]; onOpen: (id: string) => void; notes: Map<string, EventMail[]> }) {
  const [active, setActive] = useState<string | null>(null);
  const min = Math.min(...items.map((i) => i.start));
  const max = Math.max(...items.map((i) => i.end));
  const scale = Math.min(1.3, Math.max(0.85, 170 / (max - min))); // px pro Minute
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const stripes = `repeating-linear-gradient(135deg, ${tone("ochre", "soft")} 0 5px, transparent 5px 10px)`;

  return (
    <div className="relative" style={{ height: (max - min) * scale }} onMouseLeave={() => setActive(null)} role="group" aria-label="Events at the same time">
      {sharedZones(items).map(([a, b]) => (
        <span key={a} aria-hidden className="absolute inset-x-0 rounded-[6px]" style={{ top: (a - min) * scale, height: (b - a) * scale, background: stripes }} />
      ))}
      <div className="relative flex h-full gap-1">
        {items.map((it) => {
          const open = active === it.key;
          const squeezed = active !== null && !open;
          const style = { top: (it.start - min) * scale, height: Math.max(26, (it.end - it.start) * scale - 2) };
          const course = it.d ? courseById(it.d.courseId) : undefined;
          const c = it.d && course ? (it.d.color ?? colorOf(course)) : null;
          const gColor = it.ev?.color ?? "var(--muted)";
          const title = it.d ? (it.d.kind === "klausur" && course ? examLabel(it.d.title, course) : course ? withCourse(bare(it.d.title), course) : bare(it.d.title)) : it.ev!.title;
          const sub = it.d ? (placeLabel(it.d.location) || (course ? shortOf(course) : "")) : placeLabel(it.ev!.location);
          const body = squeezed ? (
            // Schmaler Nachbar eines aufgeklappten Termins: Titel senkrecht lesbar statt leerer Kasten
            <span aria-hidden className="block h-full overflow-hidden whitespace-nowrap text-[11px] font-semibold text-ellipsis" style={{ writingMode: "vertical-rl" }}>
              {title}
            </span>
          ) : open ? (
            <span key="open" className="answer-in block">
              <span className="block truncate text-[11px] font-semibold" style={c ? { color: tone(c, "ink") } : undefined}>
                {hhmm(it.start)}–{hhmm(it.end)}
                {it.ev && <span className="ml-1 font-bold" style={{ color: "#4285f4" }}>G</span>}
              </span>
              <span
                className="block break-words text-[13px] font-semibold leading-[17px]"
                style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: Math.max(1, Math.floor((style.height - 24) / 17)), overflow: "hidden" }}
              >
                {title}
              </span>
              {sub && style.height - 24 >= 34 && <span className="block truncate text-[12px] text-muted">{sub}</span>}
            </span>
          ) : (
            <span key="closed" className="answer-in block">
              <span className="block text-[11px] font-bold tabular-nums" style={c ? { color: tone(c, "ink") } : undefined}>
                {hhmm(it.start)}
              </span>
              <span className="block truncate text-[12px] font-semibold leading-tight">{abbrTitle(title, 10)}</span>
            </span>
          );
          const common = {
            onMouseEnter: () => setActive(it.key),
            onFocus: () => setActive(it.key),
            onBlur: () => setActive(null),
            "aria-label": `${title}, ${hhmm(it.start)}–${hhmm(it.end)}`,
            className: "hit absolute inset-x-0 overflow-hidden rounded-[7px] px-1.5 py-1 text-left",
          };
          return (
            <div key={it.key} className="relative min-w-0 basis-0" style={{ flexGrow: open ? 5 : 1, transition: "flex-grow 200ms var(--ease-in-out)" }}>
              {it.d && (notes.get(it.d.id)?.length ?? 0) > 0 && (
                <span className="absolute z-20" style={{ top: style.top - 7, right: -5 }}>
                  <MailBadge mails={notes.get(it.d.id)!} small />
                </span>
              )}
              {it.d ? (
                <button
                  {...common}
                  onClick={() => openEvent(it.d!, { onOpenCourse: () => onOpen(it.d!.courseId) })}
                  style={{ ...style, background: c ? tone(c, "soft") : "var(--sunken)" }}
                >
                  {body}
                </button>
              ) : (
                <button
                  {...common}
                  onClick={() => openGoogleEvent(it.ev!)}
                  style={{ ...style, border: `1.5px dashed ${gColor}`, background: `color-mix(in srgb, ${gColor} 14%, var(--surface))` }}
                >
                  {body}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeadlineBlock({
  d,
  done,
  onToggle,
  onOpen,
  clash = null,
  alsoGoogle = false,
  mails = [],
}: {
  d: Deadline;
  done: boolean;
  onToggle: () => void;
  onOpen: () => void;
  clash?: string | null;
  alsoGoogle?: boolean;
  mails?: EventMail[];
}) {
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
  // Klausur: Schild „Exam“ steht schon drüber, also „BWL · 1st date“; der Kurs steht dann im Titel, darunter nur der Raum
  const examBits = exam ? examPart(d.title) : null;
  const title = examBits ? `${shortOf(course)}${examBits.rest ? ` · ${examBits.rest}` : ""}` : withCourse(bare(d.title), course);
  // „Lecture“ allein sagt nicht, welcher Kurs: der Kurzname steht im Titel, darunter der Raum
  const place = placeLabel(d.location);
  const below = exam && place ? place : examBits ? null : title !== bare(d.title) ? place || null : shortOf(course);
  const cancelled = mails.some((m) => m.kind === "cancelled");

  return (
    <div className="hit relative flex items-start gap-1.5 rounded-[7px] py-1.5 pl-2 pr-1.5" style={cancelled && !isDone ? cancelledStyle(tone(c), tone(c, "soft")) : style}>
      {mails.length > 0 && <MailBadge mails={mails} className="absolute -right-1.5 -top-2" />}
      <button
        onClick={onOpen}
        aria-label={[`${d.title}, ${nameOf(course)}`, d.location ? `Room: ${placeLabel(d.location)}` : d.source, cancelled ? "cancelled according to a mail" : null].filter(Boolean).join(" · ")}
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
          {alsoGoogle && !isDone && (
            <span className="ml-1 font-bold" style={{ color: "#4285f4" }} title="Also in your Google Calendar">
              +G
            </span>
          )}
        </span>
        <span className={`block text-[13px] font-semibold leading-snug ${isDone || cancelled ? "line-through" : ""}`}>{title}</span>
        {below && <span className={`block truncate text-[12px] ${solid ? "opacity-85" : isDone ? "" : "text-muted"}`}>{below}</span>}
        {clash && !isDone && <ClashTag other={clash} />}
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
