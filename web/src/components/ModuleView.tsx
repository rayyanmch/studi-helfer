"use client";

// Modulseite: alles zu einem Modul (Vorlesung + Übung + Übungsgruppe) auf einen Blick.
// Oben: Name (umbenennbar), Farbe, Teile, Aktionen. Dann „Coming up“ (Fristen + Wochenplan).
// Dann Dateien nach Art („Lecture slides“, „Exercises“ …) mit Filter, Suche und Sortierung.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, FolderOpen, Pencil, RotateCcw, Search, X } from "lucide-react";
import { Button, Swatch, colorOf, tone } from "./ui";
import { CheckButton, FileRow, displayName } from "./files";
import type { Course, CourseColor, CourseFile, Deadline } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { COURSE_COLORS, useApp } from "@/lib/app-store";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RECENT_DAYS = 14;

function parseDay(iso: string) {
  return Date.parse(`${iso}T12:00:00`);
}

export function ModuleView({
  course,
  deadlines,
  done,
  onToggle,
  onBack,
}: {
  course: Course;
  deadlines: Deadline[];
  done: string[];
  onToggle: (id: string) => void;
  onBack: () => void;
}) {
  const app = useApp();
  const desktop = app.mode === "desktop";
  const color = colorOf(course);
  const files = course.folders.flatMap((f) => f.files);
  const fresh = files.filter((f) => f.isNew || f.changeNote);

  return (
    <>
      <button onClick={onBack} className="-ml-2 mb-3 flex items-center gap-0.5 rounded-md px-2 py-1 text-[13px] font-semibold text-muted hover:bg-hover hover:text-text">
        <ChevronLeft size={15} aria-hidden /> Courses
      </button>

      <header className="flex flex-wrap items-start gap-4">
        <ColorPicker course={course} color={color} disabled={!desktop} />
        <div className="min-w-0 flex-1">
          <Title course={course} editable={desktop} />
          <p className="mt-1 text-muted">
            {[course.fullName && course.fullName !== course.name ? course.fullName : null, `${files.length} ${files.length === 1 ? "file" : "files"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {course.parts && course.parts.length > 1 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {course.parts.map((p) => (
                <span key={p.id} className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
                  {p.label}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {course.iliasUrl && (
            <Button onClick={() => store.openIlias(course.iliasUrl)}>
              <ExternalLink size={14} aria-hidden /> Open in ILIAS
            </Button>
          )}
          <Button onClick={() => store.revealFile(course.folder)}>
            <FolderOpen size={14} aria-hidden /> Show in Finder
          </Button>
        </div>
      </header>

      <ComingUp course={course} deadlines={deadlines} done={done} onToggle={onToggle} today={app.today} />

      <Files course={course} files={files} freshIds={fresh.map((f) => f.id)} />
    </>
  );
}

// --- Name und Farbe ---------------------------------------------------------

function Title({ course, editable }: { course: Course; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(course.name);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const save = async (name: string) => {
    setEditing(false);
    if (name.trim() === course.name) return;
    const res = await store.renameModule(course.id, name);
    if (!res.ok) setError(res.message ?? "Could not rename.");
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(value);
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          onBlur={() => void save(value)}
          maxLength={40}
          aria-label="Course name"
          placeholder={course.fullName ?? "Course name"}
          className="min-w-0 flex-1 rounded-[8px] bg-surface px-2 py-0.5 text-[30px] font-bold leading-tight tracking-[-0.02em] outline-none shadow-[inset_0_0_0_2px_var(--focus)]"
        />
        <button type="submit" aria-label="Save name" className="flex size-8 items-center justify-center rounded-md bg-accent text-on-accent">
          <Check size={16} aria-hidden />
        </button>
      </form>
    );
  }
  return (
    <div className="group flex items-center gap-2">
      <h1 className="min-w-0 truncate text-[30px] font-bold leading-tight tracking-[-0.02em]" onDoubleClick={() => editable && setEditing(true)}>
        {course.name}
      </h1>
      {editable && (
        <>
          <button
            onClick={() => {
              setValue(course.name);
              setEditing(true);
            }}
            aria-label="Rename course"
            title="Rename (the folder on your Mac is renamed too)"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-hover group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Pencil size={14} aria-hidden />
          </button>
          {course.renamed && (
            <button
              onClick={() => void save("")}
              title="Use the automatic name"
              className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-muted opacity-0 transition-opacity hover:bg-hover group-hover:opacity-100"
            >
              <RotateCcw size={12} aria-hidden /> Reset
            </button>
          )}
        </>
      )}
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}

function ColorPicker({ course, color, disabled }: { course: Course; color: CourseColor; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative mt-2">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-label="Course color"
        title={disabled ? undefined : "Change color"}
        className="flex size-6 items-center justify-center rounded-md hover:bg-hover"
      >
        <Swatch color={color} size={16} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 rounded-[10px] bg-surface p-2 shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,0.14)]">
          <div className="grid grid-cols-4 gap-1.5">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  void store.setModuleColor(course.id, c);
                  setOpen(false);
                }}
                aria-label={c}
                className="flex size-7 items-center justify-center rounded-md hover:bg-hover"
              >
                <span className="flex size-5 items-center justify-center rounded-full" style={{ background: tone(c) }}>
                  {c === color && <Check size={11} strokeWidth={3.4} className="text-[var(--on-solid)]" aria-hidden />}
                </span>
              </button>
            ))}
          </div>
          {course.color && (
            <button
              onClick={() => {
                void store.setModuleColor(course.id, null);
                setOpen(false);
              }}
              className="mt-1.5 w-full rounded-md px-2 py-1 text-left text-[12px] text-muted hover:bg-hover"
            >
              Automatic color
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Coming up: Fristen und Wochenplan --------------------------------------

function ComingUp({
  course,
  deadlines,
  done,
  onToggle,
  today,
}: {
  course: Course;
  deadlines: Deadline[];
  done: string[];
  onToggle: (id: string) => void;
  today: string;
}) {
  const [all, setAll] = useState(false);
  const color = colorOf(course);
  const future = deadlines.filter((d) => d.date >= today);
  const due = future.filter((d) => d.kind !== "termin").sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const events = future.filter((d) => d.kind === "termin");

  // Wiederkehrende Termine (Vorlesung jeden Donnerstag …) zu einer Zeile zusammenfassen
  const schedule = (() => {
    const groups = new Map<string, Deadline[]>();
    for (const e of events) {
      const wd = new Date(parseDay(e.date)).getDay();
      const key = `${wd}|${e.time}|${e.title}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    const weekly = [...groups.values()].filter((g) => g.length >= 2);
    const single = [...groups.values()].filter((g) => g.length < 2).flat();
    weekly.sort((a, b) => ((new Date(parseDay(a[0].date)).getDay() + 6) % 7) - ((new Date(parseDay(b[0].date)).getDay() + 6) % 7) || a[0].time.localeCompare(b[0].time));
    return { weekly, single: single.sort((a, b) => a.date.localeCompare(b.date)) };
  })();

  if (due.length === 0 && events.length === 0) return null;
  const both = due.length > 0 && events.length > 0;
  // Nur Fristen (keine Termine): volle Breite in zwei Spalten statt einer halben Seite
  const limit = both ? 4 : 6;
  const shown = all ? due : due.slice(0, limit);

  return (
    <section className={`mt-7 grid grid-cols-1 gap-x-6 gap-y-3 ${both ? "lg:grid-cols-2" : ""}`} aria-label="Coming up">
      {due.length > 0 && (
        <div>
          <h2 className="mb-2 text-[15px] font-bold">Deadlines & exams</h2>
          <ul className={`grid grid-cols-1 gap-1.5 ${both ? "" : "lg:grid-cols-2"}`}>
            {shown.map((d) => {
              const isDone = done.includes(d.id);
              const days = Math.round((parseDay(d.date) - parseDay(today)) / 86_400_000);
              const urgent = d.kind === "abgabe" && days <= 3 && !isDone;
              const exam = d.kind === "klausur";
              const style = isDone
                ? { background: "var(--sunken)", color: "var(--muted)" }
                : exam
                  ? { background: "var(--surface)", boxShadow: `inset 0 0 0 2.5px ${tone(color)}` }
                  : urgent
                    ? { background: tone(color), color: "var(--on-solid)" }
                    : { background: tone(color, "soft") };
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5" style={style}>
                  <span className="w-9 shrink-0 text-center">
                    <span className="block text-[11px] font-semibold opacity-80">{WD[new Date(parseDay(d.date)).getDay()]}</span>
                    <span className="block text-[17px] font-bold leading-none">{Number(d.date.slice(8))}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-semibold ${isDone ? "line-through" : ""}`}>
                      {exam && <span className="mr-1.5 rounded-full px-1.5 text-[11px] font-bold" style={{ background: tone(color), color: "var(--on-solid)" }}>Exam</span>}
                      {d.title}
                    </span>
                    <span className="block truncate text-[12px] opacity-80">
                      {isDone ? "done" : [days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`, d.time, d.source].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {d.kind === "abgabe" && (
                    <span style={isDone || urgent ? undefined : { color: tone(color) }}>
                      <CheckButton done={isDone} onClick={() => onToggle(d.id)} label={d.title} onSolid={urgent} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {due.length > limit && (
            <button onClick={() => setAll((v) => !v)} className="mt-1.5 rounded px-1 text-[13px] font-semibold text-[var(--focus)] hover:underline">
              {all ? "Show fewer" : `Show all ${due.length}`}
            </button>
          )}
        </div>
      )}
      {events.length > 0 && (
        <div>
          <h2 className="mb-2 text-[15px] font-bold">Classes & events</h2>
          <ul className={`grid grid-cols-1 gap-1.5 ${both ? "" : "lg:grid-cols-2"}`}>
            {schedule.weekly.map((g) => {
              const first = g[0];
              const last = g[g.length - 1];
              return (
                <li key={`${first.date}${first.time}${first.title}`} className="flex items-center gap-3 rounded-[10px] bg-surface px-3.5 py-2.5">
                  <span className="w-9 shrink-0 text-center text-[13px] font-bold">{WD[new Date(parseDay(first.date)).getDay()]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{first.title}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[first.time, "weekly", `next ${new Date(parseDay(first.date)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, `until ${new Date(parseDay(last.date)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, first.source]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              );
            })}
            {schedule.single.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-[10px] bg-surface px-3.5 py-2.5">
                <span className="w-9 shrink-0 text-center">
                  <span className="block text-[11px] font-semibold text-muted">{WD[new Date(parseDay(e.date)).getDay()]}</span>
                  <span className="block text-[17px] font-bold leading-none">{Number(e.date.slice(8))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.title}</span>
                  <span className="block truncate text-[12px] text-muted">{[e.time, e.source].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// --- Dateien ------------------------------------------------------------------

type Sort = "name" | "newest";

function Files({ course, files, freshIds }: { course: Course; files: CourseFile[]; freshIds: string[] }) {
  const app = useApp();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [closed, setClosed] = useState<string[]>([]);
  const q = query.trim().toLowerCase();

  // „heute“ aus dem Store statt Date.now(): Rendern bleibt rein
  const since = Date.parse(`${app.today}T00:00:00`) - RECENT_DAYS * 86_400_000;
  const recent = files
    .filter((f) => (f.modifiedAt ?? 0) >= since)
    .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0))
    .slice(0, 6);

  const sortFiles = (list: CourseFile[]) =>
    sort === "newest" ? [...list].sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0)) : list;

  if (files.length === 0) {
    return (
      <p className="mt-8 rounded-[10px] bg-surface px-4 py-5 text-muted">
        {app.job?.running ? "Files are on their way…" : "No files yet. They appear here after the next update."}
      </p>
    );
  }

  const matches = q
    ? files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          displayName(f.name).toLowerCase().includes(q) ||
          (f.where ?? "").toLowerCase().includes(q) ||
          (f.part ?? "").toLowerCase().includes(q),
      )
    : [];
  const folders = course.folders.filter((f) => filter === "all" || f.id === filter);

  return (
    <section className="mt-8" aria-label="Files">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show files" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="opacity-60">{files.length}</span>
          </Chip>
          {course.folders.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.name} <span className="opacity-60">{f.files.length}</span>
            </Chip>
          ))}
        </div>
        <label className="flex h-8 w-[200px] items-center gap-2 rounded-lg bg-surface px-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
          <Search size={13} className="shrink-0 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder={`Search in ${course.name}`}
            aria-label={`Search files in ${course.name}`}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear" className="text-muted">
              <X size={12} aria-hidden />
            </button>
          )}
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort files"
          className="h-8 rounded-lg bg-surface px-2 text-[13px] shadow-[inset_0_0_0_1px_var(--line)] outline-none"
        >
          <option value="name">By number</option>
          <option value="newest">Newest first</option>
        </select>
      </div>

      {q ? (
        <div className="mt-4">
          {matches.length === 0 ? (
            <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">No file in {course.name} matches “{query}”.</p>
          ) : (
            <ul className="rounded-[10px] bg-surface px-1.5 py-1">
              {sortFiles(matches).map((f) => (
                <FileRow key={f.id} file={f} highlight={q} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          {filter === "all" && freshIds.length > 0 && app.mode === "desktop" && (
            <div className="flex items-center justify-between rounded-[10px] bg-[var(--c-green-soft)] px-4 py-2.5 text-[13px]">
              <span>
                <strong className="font-semibold">{freshIds.length} new {freshIds.length === 1 ? "file" : "files"}</strong> since you last looked.
              </span>
              <button onClick={() => void store.markSeen(freshIds)} className="rounded font-semibold text-[var(--focus)] hover:underline">
                Mark all as seen
              </button>
            </div>
          )}
          {filter === "all" && recent.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-[15px] font-bold">Recently added</h3>
              <ul className="rounded-[10px] bg-surface px-1.5 py-1">
                {recent.map((f) => (
                  <FileRow key={`r-${f.id}`} file={f} compact />
                ))}
              </ul>
            </section>
          )}
          {folders.map((f) => {
            const isOpen = !closed.includes(f.id);
            return (
              <section key={f.id}>
                <button
                  onClick={() => setClosed((c) => (c.includes(f.id) ? c.filter((x) => x !== f.id) : [...c, f.id]))}
                  aria-expanded={isOpen}
                  className="-ml-1.5 mb-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[15px] font-bold hover:bg-hover"
                >
                  {isOpen ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                  {f.name}
                  <span className="ml-1 text-[13px] font-normal text-muted">{f.files.length}</span>
                </button>
                {isOpen && (
                  <ul className="rounded-[10px] bg-surface px-1.5 py-1">
                    {sortFiles(f.files).map((x) => (
                      <FileRow key={x.id} file={x} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${active ? "bg-accent text-on-accent" : "bg-surface hover:bg-hover"}`}
    >
      {children}
    </button>
  );
}
