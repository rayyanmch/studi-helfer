"use client";

// Termin-Dialog: eigene Termine anlegen und bearbeiten (Kurs, Farbe, Art, Uhrzeit, Ort, Notiz, Wiederholung),
// erkannte Termine ansehen, ausblenden oder als eigenen Termin übernehmen und ändern.
// Einmal in der AppShell eingehängt (<EventDialogHost />); öffnen von überall mit openEvent(deadline) oder
// openNewEvent({ date, start, moduleId }).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, Clock, EyeOff, MapPin, Pencil, Repeat, Trash2, X } from "lucide-react";
import { Button, Swatch, colorOf, nameOf, tone } from "./ui";
import * as store from "@/lib/app-store";
import { COURSE_COLORS, realCourses, useApp } from "@/lib/app-store";
import type { CourseColor, CustomEvent, Deadline } from "@/lib/mock-data";
import { lecturePeriod, newEventId, occurrences, parseIso, parseTimeLabel, timeLabel, weekdayOf } from "@/lib/recurrence";

// --- Steuerung (kleiner eigener Speicher, damit jede Ansicht den Dialog öffnen kann) -------------------

type DialogState =
  | { mode: "closed" }
  | { mode: "edit"; draft: CustomEvent; isNew: boolean; day?: string; replaces?: string }
  | { mode: "details"; deadline: Deadline; onOpenCourse?: () => void };

let dialog: DialogState = { mode: "closed" };
const listeners = new Set<() => void>();
function setDialog(next: DialogState) {
  dialog = next;
  for (const l of listeners) l();
}

function blank(prefill: Partial<CustomEvent>): CustomEvent {
  const today = store.appStore.get().today || store.localIso();
  return {
    id: newEventId(),
    title: "",
    moduleId: null,
    color: null,
    kind: "termin",
    date: today,
    start: "10:00",
    end: "11:30",
    location: "",
    notes: "",
    repeat: "none",
    weekdays: [],
    until: null,
    skipHolidays: true,
    exceptions: [],
    ...prefill,
  };
}

/** Neuen eigenen Termin anlegen, z. B. openNewEvent({ moduleId: "mod-…", date: "2026-11-26" }). */
export function openNewEvent(prefill: Partial<CustomEvent> = {}) {
  setDialog({ mode: "edit", draft: blank(prefill), isNew: true });
}

/** Termin öffnen: eigener → bearbeiten, erkannter → Details mit „Edit“, „Hide“, „Open course“. */
export function openEvent(d: Deadline, opts: { onOpenCourse?: () => void } = {}) {
  if (d.customId) {
    const ev = store.appStore.get().customEvents.find((e) => e.id === d.customId);
    if (ev) return setDialog({ mode: "edit", draft: { ...ev }, isNew: false, day: d.date });
  }
  setDialog({ mode: "details", deadline: d, onOpenCourse: opts.onOpenCourse });
}

function close() {
  setDialog({ mode: "closed" });
}

/** Erkannten Termin als eigenen übernehmen (Serie → wöchentlich ab diesem Tag). */
function fromDeadline(d: Deadline): CustomEvent {
  const { start, end } = parseTimeLabel(d.time);
  const series = Boolean(d.seriesId);
  return blank({
    title: d.title,
    moduleId: d.courseId === "other" ? null : d.courseId,
    kind: d.kind,
    date: d.date,
    start,
    end,
    location: d.location ?? "",
    repeat: series ? "weekly" : "none",
    weekdays: series ? [weekdayOf(d.date)] : [],
  });
}

// --- Host ---------------------------------------------------------------------------------------

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function EventDialogHost() {
  const state = useSyncExternalStore(subscribe, () => dialog, () => dialog);
  if (state.mode === "closed") return null;
  return (
    <Modal label={state.mode === "edit" ? (state.isNew ? "New event" : "Edit event") : "Event"}>
      {state.mode === "edit" ? <Editor key={state.draft.id} state={state} /> : <Details deadline={state.deadline} onOpenCourse={state.onOpenCourse} />}
    </Modal>
  );
}

function Modal({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[7vh] sm:p-6 sm:pt-[7vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="scroll max-h-[86vh] w-[520px] max-w-full rounded-[14px] bg-bg shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)] outline-none"
      >
        {children}
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-bg px-5 pb-2 pt-4">
      <h2 className="text-[18px] font-bold">{title}</h2>
      <button onClick={close} aria-label="Close" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover">
        <X size={16} aria-hidden />
      </button>
    </header>
  );
}

const fmtDay = (iso: string) => parseIso(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const fmtShort = (iso: string) => parseIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WD_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const KIND_LABEL: Record<Deadline["kind"], string> = { termin: "Class or event", abgabe: "Deadline", klausur: "Exam" };

// --- Erkannter Termin: Details --------------------------------------------------------------------

function Details({ deadline: d, onOpenCourse }: { deadline: Deadline; onOpenCourse?: () => void }) {
  const app = useApp();
  const course = app.courses.find((c) => c.id === d.courseId);
  const color = d.color ?? (course ? colorOf(course) : "indigo");
  const where = d.location ?? (d.source && !d.source.startsWith("From ") ? d.source : undefined);
  const from = d.source?.startsWith("From ") ? d.source : undefined;
  return (
    <>
      <Header title={KIND_LABEL[d.kind]} />
      <div className="px-5 pb-5">
        <div className="rounded-[12px] bg-surface p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <Swatch color={color} /> {course ? nameOf(course) : "No course"}
          </p>
          <p className="mt-1 text-[17px] font-bold leading-snug">{d.title}</p>
          <p className="mt-2 flex items-center gap-2 text-[13px]">
            <CalendarDays size={14} className="text-muted" aria-hidden /> {fmtDay(d.date)}
            <Clock size={14} className="ml-2 text-muted" aria-hidden /> {d.time}
          </p>
          {where && (
            <p className="mt-1 flex items-center gap-2 text-[13px]">
              <MapPin size={14} className="text-muted" aria-hidden /> {where}
            </p>
          )}
          {d.seriesId && (
            <p className="mt-1 flex items-center gap-2 text-[13px]">
              <Repeat size={14} className="text-muted" aria-hidden /> Every week
            </p>
          )}
          <p className="mt-3 text-[12px] text-muted">
            Found automatically{from ? ` · ${from}` : ""}. Edit it to fix the time or room, or hide it if it is wrong.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => setDialog({ mode: "edit", draft: fromDeadline(d), isNew: true, replaces: d.seriesId ?? d.id })}
          >
            <Pencil size={13} aria-hidden /> Edit
          </Button>
          {d.seriesId ? (
            <>
              <Button
                onClick={() => {
                  void store.hideEvent(d.id);
                  close();
                }}
              >
                <EyeOff size={13} aria-hidden /> Hide this one
              </Button>
              <Button
                onClick={() => {
                  void store.hideEvent(d.seriesId!);
                  close();
                }}
              >
                Hide every week
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                void store.hideEvent(d.id);
                close();
              }}
            >
              <EyeOff size={13} aria-hidden /> Hide
            </Button>
          )}
          {onOpenCourse && course && (
            <Button
              variant="plain"
              className="ml-auto"
              onClick={() => {
                close();
                onOpenCourse();
              }}
            >
              Open {nameOf(course)}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

// --- Eigener Termin: Formular ---------------------------------------------------------------------

// Grundstil ohne Breite: volle Breite (wide) oder so breit wie der Inhalt (narrow, Datum/Uhrzeit)
const base = "h-9 rounded-lg bg-surface px-3 shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--focus)] disabled:opacity-50";
const field = `${base} w-full`;
const narrow = `${base} w-auto shrink-0`;

function Editor({ state }: { state: Extract<DialogState, { mode: "edit" }> }) {
  const app = useApp();
  const [ev, setEv] = useState<CustomEvent>(state.draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const courses = realCourses(app.courses);
  const course = courses.find((c) => c.id === ev.moduleId);
  const color: CourseColor = ev.color ?? (course ? colorOf(course) : "indigo");
  const repeating = ev.repeat !== "none";
  const weekly = ev.repeat === "weekly" || ev.repeat === "biweekly";
  const allDay = ev.start === null;
  const today = parseIso(app.today || store.localIso());
  const semesterEnd = lecturePeriod(parseIso(ev.date) > today ? parseIso(ev.date) : today).end;
  const count = repeating ? occurrences(ev, ev.date, ev.until ?? semesterEnd, today).length : 1;
  const up = (patch: Partial<CustomEvent>) => setEv((e) => ({ ...e, ...patch }));

  const summary = (() => {
    const t = timeLabel(ev);
    if (!repeating) return `${fmtDay(ev.date)}, ${t}`;
    const days = (ev.weekdays.length ? [...ev.weekdays].sort() : [weekdayOf(ev.date)]).map((d) => WD_LONG[d]).join(" and ");
    const every =
      ev.repeat === "daily" ? "Every day" : ev.repeat === "monthly" ? `Every month on the ${parseIso(ev.date).getDate()}.` : `${ev.repeat === "biweekly" ? "Every other" : "Every"} ${days}`;
    return `${every}, ${t}, until ${fmtShort(ev.until ?? semesterEnd)} · ${count} ${count === 1 ? "date" : "dates"}`;
  })();

  const save = async () => {
    if (!ev.title.trim()) return setError("Give the event a name.");
    if (ev.start && ev.end && ev.end <= ev.start) return setError("The end time must be after the start time.");
    if (ev.until && ev.until < ev.date) return setError("The last day must be after the first day.");
    setBusy(true);
    const res = await store.saveEvent({ ...ev, title: ev.title.trim(), end: ev.kind === "abgabe" ? null : ev.end });
    if (res.ok && state.replaces) await store.hideEvent(state.replaces);
    setBusy(false);
    if (!res.ok) return setError(res.message ?? "Could not save.");
    close();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Header title={state.isNew ? (state.replaces ? "Edit event" : "New event") : "Edit event"} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <input
          value={ev.title}
          onChange={(e) => up({ title: e.target.value })}
          placeholder="Name, e.g. Tutorial group 05"
          aria-label="Name"
          autoFocus={state.isNew}
          maxLength={80}
          className={`${field} h-10 text-[15px] font-semibold`}
        />

        <Row label="Course">
          <div className="flex items-center gap-2">
            <Swatch color={color} />
            <select value={ev.moduleId ?? ""} onChange={(e) => up({ moduleId: e.target.value || null })} aria-label="Course" className={field}>
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {nameOf(c)}
                </option>
              ))}
            </select>
          </div>
        </Row>

        <Row label="Type">
          <div className="flex rounded-lg bg-sunken p-0.5" role="radiogroup" aria-label="Type">
            {(["termin", "abgabe", "klausur"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={ev.kind === k}
                onClick={() => up({ kind: k, ...(k === "abgabe" && ev.start ? { end: null } : {}) })}
                className={`h-8 flex-1 rounded-md px-2 text-[13px] font-semibold ${ev.kind === k ? "bg-surface shadow-sm" : "text-muted hover:text-[var(--text)]"}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Row>

        <Row label="When">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={ev.date}
              onChange={(e) => e.target.value && up({ date: e.target.value, weekdays: weekly && ev.weekdays.length <= 1 ? [weekdayOf(e.target.value)] : ev.weekdays })}
              aria-label="Date"
              className={`${narrow}`}
            />
            {!allDay && (
              <>
                <input type="time" value={ev.start ?? ""} onChange={(e) => e.target.value && up({ start: e.target.value })} aria-label={ev.kind === "abgabe" ? "Due at" : "Start"} className={`${narrow}`} />
                {ev.kind !== "abgabe" && (
                  <>
                    <span className="text-muted">to</span>
                    <input type="time" value={ev.end ?? ""} onChange={(e) => up({ end: e.target.value || null })} aria-label="End" className={`${narrow}`} />
                  </>
                )}
              </>
            )}
            <label className="ml-1 inline-flex items-center gap-1.5 text-[13px] text-muted">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => up(e.target.checked ? { start: null, end: null } : { start: "10:00", end: ev.kind === "abgabe" ? null : "11:30" })}
                className="accent-[var(--accent)]"
              />
              All day
            </label>
          </div>
        </Row>

        <Row label="Repeat">
          <select
            value={ev.repeat}
            onChange={(e) => {
              const repeat = e.target.value as CustomEvent["repeat"];
              up({ repeat, weekdays: repeat === "weekly" || repeat === "biweekly" ? (ev.weekdays.length ? ev.weekdays : [weekdayOf(ev.date)]) : [] });
            }}
            aria-label="Repeat"
            className={field}
          >
            <option value="none">Does not repeat</option>
            <option value="weekly">Every week</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="daily">Every day</option>
            <option value="monthly">Every month</option>
          </select>
        </Row>

        {weekly && (
          <Row label="On">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Weekdays">
              {WD.map((name, i) => {
                const on = ev.weekdays.includes(i);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? ev.weekdays.filter((d) => d !== i) : [...ev.weekdays, i];
                      if (next.length) up({ weekdays: next });
                    }}
                    className="h-8 w-11 rounded-md text-[12.5px] font-semibold"
                    style={on ? { background: tone(color), color: "var(--on-solid)" } : { boxShadow: "inset 0 0 0 1px var(--line)", background: "var(--surface)" }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </Row>
        )}

        {repeating && (
          <Row label="Until">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={ev.until ? "date" : "semester"}
                onChange={(e) => up({ until: e.target.value === "date" ? (ev.until ?? semesterEnd) : null })}
                aria-label="Until"
                className={`${narrow}`}
              >
                <option value="semester">End of lecture period ({fmtShort(semesterEnd)})</option>
                <option value="date">A date</option>
              </select>
              {ev.until && <input type="date" value={ev.until} min={ev.date} onChange={(e) => e.target.value && up({ until: e.target.value })} aria-label="Last day" className={`${narrow}`} />}
              <label className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                <input type="checkbox" checked={ev.skipHolidays} onChange={(e) => up({ skipHolidays: e.target.checked })} className="accent-[var(--accent)]" />
                Skip holidays and breaks
              </label>
            </div>
          </Row>
        )}

        <p className="-mt-1 rounded-lg bg-surface px-3 py-2 text-[13px]">
          <span className="font-semibold">{summary}</span>
          {ev.exceptions.length > 0 && (
            <button type="button" onClick={() => up({ exceptions: [] })} className="ml-2 text-[12px] font-semibold text-[var(--focus)] hover:underline">
              Bring back {ev.exceptions.length} skipped {ev.exceptions.length === 1 ? "day" : "days"}
            </button>
          )}
        </p>

        <Row label="Where">
          <input value={ev.location} onChange={(e) => up({ location: e.target.value })} placeholder="Room or link" aria-label="Where" maxLength={120} className={field} />
        </Row>

        <Row label="Color">
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Color">
            <button
              type="button"
              role="radio"
              aria-checked={ev.color === null}
              onClick={() => up({ color: null })}
              className={`h-7 rounded-full px-2.5 text-[12px] font-semibold ${ev.color === null ? "bg-accent text-on-accent" : "bg-surface shadow-[inset_0_0_0_1px_var(--line)]"}`}
            >
              {course ? "Course color" : "Default"}
            </button>
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ev.color === c}
                aria-label={c}
                onClick={() => up({ color: c })}
                className="size-7 rounded-full"
                style={{ background: tone(c), boxShadow: ev.color === c ? `0 0 0 2px var(--bg), 0 0 0 4px ${tone(c)}` : undefined }}
              />
            ))}
          </div>
        </Row>

        <Row label="Notes">
          <textarea value={ev.notes} onChange={(e) => up({ notes: e.target.value })} rows={2} maxLength={1000} aria-label="Notes" className={`${field} h-auto resize-none py-2`} />
        </Row>

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 bg-bg px-5 pb-4 pt-3">
          {!state.isNew &&
            (askDelete && repeating && state.day ? (
              <>
                <Button
                  type="button"
                  className="text-danger"
                  onClick={() => {
                    void store.skipOccurrence(ev.id, state.day!);
                    close();
                  }}
                >
                  Only {fmtShort(state.day)}
                </Button>
                <Button
                  type="button"
                  className="text-danger"
                  onClick={() => {
                    void store.deleteEvent(ev.id);
                    close();
                  }}
                >
                  All dates
                </Button>
              </>
            ) : (
              <Button
                type="button"
                className="text-danger"
                onClick={() => {
                  if (repeating && state.day) setAskDelete(true);
                  else {
                    void store.deleteEvent(ev.id);
                    close();
                  }
                }}
              >
                <Trash2 size={13} aria-hidden /> Delete
              </Button>
            ))}
          <span className="ml-auto" />
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {state.isNew ? "Add" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[72px_1fr] sm:items-center sm:gap-3">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
