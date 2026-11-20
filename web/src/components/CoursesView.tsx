"use client";

// „Courses“: alle Module als Kacheln. Ein Klick öffnet die Modulseite.

import { AlertTriangle, FolderOpen, Settings2 } from "lucide-react";
import { Button, Swatch, colorOf, tone } from "./ui";
import type { Course, Deadline } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { realCourses, useApp } from "@/lib/app-store";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(iso: string, today: string) {
  const diff = Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return WD[new Date(`${iso}T12:00:00`).getDay()];
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CoursesView({ onOpen, onEditCourses }: { onOpen: (id: string) => void; onEditCourses: () => void }) {
  const app = useApp();
  const courses = realCourses(app.courses);
  const current = courses.filter((c) => c.semester !== "past");
  const past = courses.filter((c) => c.semester === "past");

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Courses</h1>
          <p className="mt-1 text-muted">
            {courses.length === 0
              ? "No courses yet."
              : `${current.length} ${current.length === 1 ? "course" : "courses"} this semester${past.length ? `, ${past.length} earlier` : ""}.`}
          </p>
        </div>
        <div className="flex gap-2">
          {app.mode === "desktop" && app.targetPath && (
            <Button onClick={() => store.revealFile(app.targetPath ?? undefined)}>
              <FolderOpen size={14} aria-hidden /> Open {app.targetDir}
            </Button>
          )}
          <Button onClick={onEditCourses}>
            <Settings2 size={14} aria-hidden /> Change courses
          </Button>
        </div>
      </header>

      {courses.length === 0 && (
        <p className="mt-6 rounded-[10px] bg-surface px-4 py-5 text-muted">
          Pick your courses to get started. <button onClick={onEditCourses} className="font-semibold text-[var(--focus)] hover:underline">Choose courses</button>
        </p>
      )}

      <Grid list={current} deadlines={app.deadlines} done={app.done} today={app.today} failed={app.failedCourseIds} onOpen={onOpen} />
      {past.length > 0 && (
        <>
          <h2 className="mb-2.5 mt-9 text-[17px] font-bold">Earlier semesters</h2>
          <Grid list={past} deadlines={app.deadlines} done={app.done} today={app.today} failed={app.failedCourseIds} onOpen={onOpen} />
        </>
      )}
    </>
  );
}

function Grid(props: {
  list: Course[];
  deadlines: Deadline[];
  done: string[];
  today: string;
  failed: string[];
  onOpen: (id: string) => void;
}) {
  if (props.list.length === 0) return null;
  return (
    <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Courses">
      {props.list.map((c) => (
        <li key={c.id}>
          <CourseCard course={c} {...props} />
        </li>
      ))}
    </ul>
  );
}

function CourseCard({
  course,
  deadlines,
  done,
  today,
  failed,
  onOpen,
}: {
  course: Course;
  deadlines: Deadline[];
  done: string[];
  today: string;
  failed: string[];
  onOpen: (id: string) => void;
}) {
  const color = colorOf(course);
  const files = course.folders.flatMap((f) => f.files);
  const fresh = files.filter((f) => f.isNew || f.changeNote).length;
  const next = deadlines
    .filter((d) => d.courseId === course.id && d.kind !== "termin" && d.date >= today && !done.includes(d.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
  const urgent = next && next.kind === "abgabe" && Math.round((Date.parse(next.date) - Date.parse(today)) / 86_400_000) <= 3;
  const showFull = course.fullName && course.fullName !== course.name;

  return (
    <button
      onClick={() => onOpen(course.id)}
      className="group relative flex h-full min-h-[150px] w-full flex-col overflow-hidden rounded-[12px] bg-surface p-4 pl-5 text-left transition-shadow hover:shadow-[0_0_0_1px_var(--line),0_6px_18px_rgba(0,0,0,0.07)]"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ background: tone(color) }} />
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold leading-snug">{course.name}</span>
          {showFull && <span className="mt-0.5 block truncate text-[12px] text-muted">{course.fullName}</span>}
        </span>
        {failed.includes(course.id) && <AlertTriangle size={15} className="mt-1 shrink-0 text-danger" aria-label="Last update failed" />}
      </span>
      {course.parts && course.parts.length > 1 && (
        <span className="mt-2 flex flex-wrap gap-1">
          {course.parts.map((p) => (
            <span key={p.id} className="rounded-full px-2 py-px text-[11px] font-medium" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
              {p.label}
            </span>
          ))}
        </span>
      )}
      <span className="mt-auto pt-4">
        {next ? (
          <span
            className={`mb-1.5 block truncate text-[13px] font-semibold ${urgent ? "text-danger" : ""}`}
            title={`${next.title}, ${next.time}`}
          >
            {next.kind === "klausur" ? "Exam" : "Next"}: {next.title.replace(/^Submit /, "")} · {dayLabel(next.date, today)}
          </span>
        ) : (
          <span className="mb-1.5 block text-[13px] text-muted">No upcoming deadlines</span>
        )}
        <span className="flex items-center gap-2 text-[12px] text-muted">
          <Swatch color={color} size={8} />
          {files.length} {files.length === 1 ? "file" : "files"}
          {fresh > 0 && <span className="font-semibold text-ok">· {fresh} new</span>}
        </span>
      </span>
    </button>
  );
}
