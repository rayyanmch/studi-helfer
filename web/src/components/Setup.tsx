"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, ExternalLink, RotateCw } from "lucide-react";
import { Button, Notice, Spinner, Stage, colorOf, folderPlace, nameOf, tone } from "./ui";
import type { Course } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";

type Tab = "current" | "past";

// ILIAS-Magazin (Kurssuche). ILIAS listet in „Meine Kurse“ nur Kurse, denen man beigetreten ist.
const ILIAS_COURSES = "https://www.ilias.uni-koeln.de/ilias/goto.php?target=root_1&client_id=uk";

export function Setup({
  selected,
  onChange,
  onStart,
  onCancel,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  onStart: (videos: boolean) => Promise<string | null>;
  onCancel?: () => void; // „Back“, wenn schon eingerichtet (Kurse ändern)
}) {
  const app = useApp();
  const [tab, setTab] = useState<Tab>("current");
  const [videos, setVideos] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // In der Mac-App: Kurse live von ILIAS holen
  useEffect(() => {
    if (app.mode === "desktop" && app.setupStatus === "idle") void store.loadSetupCourses();
  }, [app.mode, app.setupStatus]);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    const err = await onStart(videos);
    setStarting(false);
    if (err) setStartError(err);
  };

  const courses = app.setupCourses;
  const loading = app.mode === "desktop" && (app.setupStatus === "loading" || app.setupStatus === "idle");
  const current = courses.filter((c) => c.semester !== "past");
  const past = courses.filter((c) => c.semester === "past");
  const list = tab === "current" ? current : past;
  const n = selected.length;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allOn = list.every((c) => selected.includes(c.id));
  const toggleAll = () =>
    onChange(allOn ? selected.filter((id) => !list.some((c) => c.id === id)) : [...new Set([...selected, ...list.map((c) => c.id)])]);

  return (
    <Stage width={680}>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">What should go on your Mac?</h1>
      <p className="mt-1.5 text-muted">Pick the courses you need. You can change this later.</p>

      {loading && (
        <p className="mt-8 flex items-center gap-2.5 rounded-[12px] bg-surface px-4 py-5 text-muted" aria-live="polite">
          <Spinner /> Looking up your courses on ILIAS… <span className="text-[12px]">(up to a minute the first time)</span>
        </p>
      )}
      {app.setupStatus === "error" && (
        <div className="mt-8">
          <Notice tone="danger" icon={<AlertCircle size={16} aria-hidden />} action={<Button onClick={() => void store.loadSetupCourses()}>Try again</Button>}>
            {app.setupError ?? "Could not load your courses."}
          </Notice>
        </div>
      )}
      {!loading && app.setupStatus !== "error" && (
      <>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Semester" className="inline-flex rounded-[9px] bg-sunken p-[3px]">
          <TabButton active={tab === "current"} onClick={() => setTab("current")}>
            This semester
          </TabButton>
          <TabButton active={tab === "past"} onClick={() => setTab("past")}>
            Earlier <span className="opacity-60">{past.length}</span>
          </TabButton>
        </div>
        {list.length > 0 && (
          <button onClick={toggleAll} className="rounded-md px-2 py-1 font-semibold text-[var(--focus)] hover:bg-hover">
            {allOn ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <NoCourses
          past={tab === "past"}
          hasPast={past.length > 0}
          onShowPast={() => setTab("past")}
          desktop={app.mode === "desktop"}
        />
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label="Courses">
            {list.map((c) => (
              <li key={c.id}>
                <CourseTile course={c} on={selected.includes(c.id)} onToggle={() => toggle(c.id)} />
              </li>
            ))}
          </ul>
          {tab === "current" && (
            <p className="mt-2.5 text-[12px] text-muted">
              Missing a course? ILIAS only lists courses you have joined.{" "}
              <a href={ILIAS_COURSES} target="_blank" rel="noreferrer" className="rounded font-semibold text-[var(--focus)] hover:underline">
                Join it in ILIAS
              </a>
              {app.mode === "desktop" && (
                <>
                  , then{" "}
                  <button onClick={() => void store.loadSetupCourses()} className="rounded font-semibold text-[var(--focus)] hover:underline">
                    look again
                  </button>
                </>
              )}
              .
            </p>
          )}
        </>
      )}

      <label className="mt-5 flex cursor-default items-center gap-3 rounded-[12px] bg-surface px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Include videos</span>
          <span className="block text-[12px] text-muted">Lecture recordings take up a lot of space.</span>
        </span>
        <input type="checkbox" role="switch" checked={videos} onChange={(e) => setVideos(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden
          className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] ${
            videos ? "bg-accent" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-[2px] size-[18px] rounded-full bg-white shadow-sm transition-[left] duration-200 ${videos ? "left-[18px]" : "left-[2px]"}`}
          />
        </span>
      </label>

      {startError && (
        <p role="alert" className="mt-5 flex items-center gap-1.5 text-[13px] font-medium text-danger">
          <AlertCircle size={14} aria-hidden /> {startError}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span className="flex-1 text-[12px] text-muted">
          <span title={app.targetDir}>Saving to {folderPlace(app.targetDir)}</span>{" "}
          <button onClick={() => void store.chooseFolder()} className="rounded font-semibold text-[var(--focus)] hover:underline">
            change
          </button>
        </span>
        {onCancel && (
          <button onClick={onCancel} className="h-10 rounded-[10px] px-4 font-semibold hover:bg-hover">
            Back
          </button>
        )}
        <button
          onClick={() => void start()}
          disabled={n === 0 || starting}
          className="no-drag flex h-10 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-35"
        >
          {starting ? (
            <>
              <Spinner /> Saving…
            </>
          ) : n === 0 ? (
            "Pick at least one course"
          ) : onCancel ? (
            `Save, ${n} ${n === 1 ? "course" : "courses"}`
          ) : (
            `Get ${n} ${n === 1 ? "course" : "courses"}`
          )}
        </button>
      </div>
      </>
      )}
    </Stage>
  );
}

// Leere Liste: Erstis sind in den ersten Tagen oft noch keinem ILIAS-Kurs beigetreten. Statt einer leeren
// Seite mit grauem Knopf sagen, was zu tun ist, und erneut nachsehen lassen.
function NoCourses({ past, hasPast, onShowPast, desktop }: { past: boolean; hasPast: boolean; onShowPast: () => void; desktop: boolean }) {
  if (past) {
    return <p className="mt-3 rounded-[12px] bg-surface px-4 py-5 text-muted">No courses from earlier semesters.</p>;
  }
  return (
    <div className="mt-3 rounded-[12px] bg-surface px-5 py-5">
      <p className="font-semibold">No courses for this semester yet</p>
      <p className="mt-1 text-[13px] text-muted">
        ILIAS only lists courses you have joined. Find each of your courses in ILIAS and click “Join”. Then come back here and look again.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={ILIAS_COURSES}
          target="_blank"
          rel="noreferrer"
          className="no-drag inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-on-accent hover:opacity-90"
        >
          <ExternalLink size={14} aria-hidden /> Find courses in ILIAS
        </a>
        {desktop && (
          <Button onClick={() => void store.loadSetupCourses()}>
            <RotateCw size={13} aria-hidden /> Look again
          </Button>
        )}
        {hasPast && (
          <button onClick={onShowPast} className="rounded-md px-2 py-1 text-[13px] font-semibold text-[var(--focus)] hover:bg-hover">
            Show earlier courses
          </button>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-7 rounded-[7px] px-3.5 transition-colors ${active ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-text"}`}
    >
      {children}
    </button>
  );
}

// Variante K2: ausgewählte Kachel ist zart in der Kursfarbe gefärbt, Haken im Kreis.
function CourseTile({ course, on, onToggle }: { course: Course; on: boolean; onToggle: () => void }) {
  const c = colorOf(course);
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      className="relative flex min-h-[88px] w-full flex-col justify-center rounded-[12px] py-3.5 pl-4 pr-11 text-left transition-colors duration-150 hover:brightness-[0.985]"
      style={{ background: on ? tone(c, "soft") : "var(--surface)" }}
    >
      <span className="block font-semibold leading-snug">{nameOf(course)}</span>
      <span className="mt-1 block text-[12px]" style={{ color: on ? tone(c, "ink") : "var(--muted)" }}>
        {course.note ?? `${course.lecturer}, ${course.total} files`}
      </span>
      <span
        aria-hidden
        className="absolute right-3.5 top-3.5 flex size-5 items-center justify-center rounded-full transition-colors"
        style={on ? { background: tone(c), color: "var(--on-solid)" } : { boxShadow: `inset 0 0 0 2px ${tone(c)}` }}
      >
        {on && <Check size={11} strokeWidth={3.4} />}
      </span>
    </button>
  );
}
