"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Stage, colorOf, nameOf, tone } from "./ui";
import { courses, TARGET_FOLDER, type Course } from "@/lib/mock-data";

type Tab = "current" | "past";

export function Setup({
  selected,
  onChange,
  onStart,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  onStart: () => void;
}) {
  const [tab, setTab] = useState<Tab>("current");
  const [videos, setVideos] = useState(false);

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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Semester" className="inline-flex rounded-[9px] bg-sunken p-[3px]">
          <TabButton active={tab === "current"} onClick={() => setTab("current")}>
            This semester
          </TabButton>
          <TabButton active={tab === "past"} onClick={() => setTab("past")}>
            Earlier <span className="opacity-60">{past.length}</span>
          </TabButton>
        </div>
        <button onClick={toggleAll} className="rounded-md px-2 py-1 font-semibold text-[var(--focus)] hover:bg-hover">
          {allOn ? "Deselect all" : "Select all"}
        </button>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label="Courses">
        {list.map((c) => (
          <li key={c.id}>
            <CourseTile course={c} on={selected.includes(c.id)} onToggle={() => toggle(c.id)} />
          </li>
        ))}
      </ul>

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

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span className="flex-1 text-[12px] text-muted">
          Saving to {TARGET_FOLDER}{" "}
          <button className="rounded font-semibold text-[var(--focus)] hover:underline">change</button>
        </span>
        <button
          onClick={onStart}
          disabled={n === 0}
          className="no-drag flex h-10 items-center rounded-[10px] bg-accent px-5 text-[14px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-35"
        >
          {n === 0 ? "Pick at least one course" : `Get ${n} ${n === 1 ? "course" : "courses"}`}
        </button>
      </div>
    </Stage>
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
        {course.lecturer}, {course.total} files
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
