"use client";

// Tab „Progress“: Wie viel Stoff jedes Modul diese Woche vorsieht (Anteil + Stunden), die Wochen bis zur Klausur mit
// eigener Einstufung je Woche (Viertel-Kreise, „Harvey balls“) und ein Plan für diese Woche. Rechnung in lib/progress.ts.
// Verbindungen zum Study-Tab: Karten einer Woche lernen, Einseiter erstellen/öffnen, Karten zählen als Fortschritt,
// „Done“ setzt „Mark reviewed“ auf der Kursseite.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, CalendarPlus, ChevronDown, FileText, Flag, GraduationCap, Minus, NotebookPen, Plus } from "lucide-react";
import { Button, Swatch, colorOf, tone } from "./ui";
import { openNewEvent } from "./EventDialog";
import type { CourseColor } from "@/lib/mock-data";
import type { DocType } from "@/lib/doctype";
import { isStudyDoc } from "@/lib/doctype";
import { subjectOf, useMathMode } from "@/lib/subject";
import { fileKey, openSheet, openStudy, quickSheet, STUDY_FILE, studyFiles, useStudy } from "@/lib/study";
import {
  DEFAULT_ECTS,
  ECTS_CHOICES,
  LEVELS,
  type ModulePlan,
  type ProgressModel,
  type Status,
  type Step,
  type WeekLoad,
  type WeekPlan,
  applyLevels,
  hoursLabel,
  hoursShort,
  setModuleEcts,
  setStudyHours,
  setWeekLevel,
  useProgress,
} from "@/lib/progress";

type Anchor = { rect: DOMRect; el: HTMLElement };
type Pop =
  | { kind: "week"; moduleId: string; weekKey: string; anchor: Anchor }
  | { kind: "ects"; moduleId: string; anchor: Anchor }
  | { kind: "hours"; anchor: Anchor };

const anchorOf = (e: { currentTarget: HTMLElement }): Anchor => ({ rect: e.currentTarget.getBoundingClientRect(), el: e.currentTarget });

export function ProgressView({ onOpenCourse }: { onOpenCourse: (id: string) => void }) {
  const model = useProgress();
  const [pop, setPop] = useState<Pop | null>(null);
  const close = () => {
    pop?.anchor.el.focus();
    setPop(null);
  };
  const byId = new Map(model.modules.map((m) => [m.course.id, m]));
  const popModule = pop && pop.kind !== "hours" ? byId.get(pop.moduleId) : undefined;
  const popWeek = pop?.kind === "week" ? popModule?.weeks.find((w) => w.key === pop.weekKey) : undefined;

  if (!model.modules.length)
    return (
      <>
        <Header model={model} onHours={() => {}} />
        <div className="rounded-[14px] bg-surface px-5 py-6">
          <h2 className="text-[15px] font-bold">No course files yet</h2>
          <p className="mt-1 text-[13px] text-muted">As soon as your courses have lecture slides, this page shows how much each course asks of you every week and whether you’re on track for the exams.</p>
        </div>
      </>
    );

  const openWeek = (m: ModulePlan, w: WeekPlan, anchor: Anchor) => setPop({ kind: "week", moduleId: m.course.id, weekKey: w.key, anchor });

  return (
    <div className="flex flex-col gap-6">
      <Header model={model} onHours={(a) => setPop({ kind: "hours", anchor: a })} />
      {!model.anyRated && <FirstRun model={model} />}
      <ThisWeek model={model} onWeek={openWeek} onEcts={(m, a) => setPop({ kind: "ects", moduleId: m.course.id, anchor: a })} />
      <Track model={model} onWeek={openWeek} />
      <Plan model={model} onWeek={openWeek} />
      <HowItWorks />

      {pop?.kind === "week" && popModule && popWeek && (
        <Popover anchor={pop.anchor} onClose={close} label={`${popModule.course.name}, week ${popWeek.n}`} width={340}>
          <WeekDetails module={popModule} week={popWeek} onOpenCourse={() => onOpenCourse(popModule.course.id)} onDone={close} />
        </Popover>
      )}
      {pop?.kind === "ects" && popModule && (
        <Popover anchor={pop.anchor} onClose={close} label={`Credits for ${popModule.course.name}`} width={300}>
          <EctsPicker module={popModule} onDone={close} />
        </Popover>
      )}
      {pop?.kind === "hours" && (
        <Popover anchor={pop.anchor} onClose={close} label="Your study time per week" width={300}>
          <HoursPicker hours={model.hours} />
        </Popover>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Kopf

function Header({ model, onHours }: { model: ProgressModel; onHours: (a: Anchor) => void }) {
  const rated = model.modules.filter((m) => m.status !== "none");
  const good = rated.filter((m) => m.status === "ontrack" || m.status === "ahead").length;
  const inLectures = model.currentWeek <= model.lastWeek;
  const nextExam = [...model.modules].filter((m) => !m.exam.assumed && m.exam.days >= 0).sort((a, b) => a.exam.days - b.exam.days)[0];
  const n = model.modules.length;
  const parts = [
    inLectures ? `Week ${model.currentWeek} of ${model.lastWeek} · ${model.range}` : "Lectures are over",
    !n
      ? null
      : !rated.length
        ? "Rate your weeks to see where you stand"
        : rated.length < n
          ? `${good} of ${rated.length} rated ${rated.length === 1 ? "course" : "courses"} on track`
          : `On track in ${good} of ${n} courses`,
    nextExam ? `First exam: ${nextExam.course.name} in ${nextExam.exam.days} days` : null,
  ].filter(Boolean);
  return (
    <header className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Progress</h1>
        <p className="mt-1 text-muted">{parts.join(" · ")}</p>
      </div>
      {model.modules.length > 0 && (
        <button
          onClick={(e) => onHours(anchorOf(e))}
          aria-haspopup="dialog"
          className="press no-drag inline-flex h-9 items-center gap-2 rounded-[10px] bg-surface px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover"
          title="Your own study time per week, without lectures and tutorials"
        >
          <span className="text-muted">Your time</span>
          <strong className="font-semibold tabular-nums">{model.hours} h a week</strong>
          <ChevronDown size={14} className="text-muted" aria-hidden />
        </button>
      )}
    </header>
  );
}

function FirstRun({ model }: { model: ProgressModel }) {
  const past = Math.max(0, Math.min(model.lastWeek, model.currentWeek - 1));
  return (
    <section aria-label="Getting started" className="flex flex-wrap items-center gap-5 rounded-[14px] bg-surface p-5">
      <div className="flex shrink-0 items-center gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((v) => (
          <Harvey key={v} value={v / 4} color="blue" size={22} />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-bold">Tell the app how far you are</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {past > 0
            ? `Click the circles for weeks 1–${past} below and pick how much you’ve worked through. It takes a minute, and from then on you see right away if a course slips.`
            : "Click a week’s circle whenever you’ve worked on it. From then on you see right away if a course slips."}{" "}
          Cards you learn in Study count too.
        </p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Diese Woche: Anteil je Modul

function ThisWeek({ model, onWeek, onEcts }: { model: ProgressModel; onWeek: (m: ModulePlan, w: WeekPlan, a: Anchor) => void; onEcts: (m: ModulePlan, a: Anchor) => void }) {
  const lectures = model.currentWeek <= model.lastWeek;
  // In der Prüfungszeit: Aufteilung nach dem, was bis zu den Klausuren noch offen ist
  const rows = model.modules.map((m) => {
    const w = m.thisWeek;
    const share = lectures ? (w?.share ?? 0) : m.remaining / Math.max(0.01, model.modules.reduce((a, x) => a + x.remaining, 0));
    return { m, w, share, hours: model.hours * share };
  });
  const sorted = [...rows].sort((a, b) => b.share - a.share);
  const pct = roundShares(rows.map((r) => r.share));
  const guessed = model.guessedEcts;

  return (
    <section aria-label="This week" className="rounded-[14px] bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex-1 text-[17px] font-bold">{lectures ? "This week" : "Until your exams"}</h2>
        <span className="text-[12px] text-muted">
          {lectures ? `How your ${model.hours} hours should split, by credits and the actual material` : "Split by what’s still open in each course"}
        </span>
      </div>

      {/* Anteile als ein Balken */}
      <div className="mt-3 flex h-10 gap-[3px] overflow-hidden rounded-[10px]" role="img" aria-label={rows.map((r, i) => `${r.m.course.name} ${pct[i]}%`).join(", ")}>
        {rows
          .map((r, i) => ({ ...r, p: pct[i] }))
          .filter((r) => r.share > 0)
          .map((r) => {
            const color = colorOf(r.m.course);
            return (
              <div
                key={r.m.course.id}
                className="flex min-w-[6px] items-center overflow-hidden px-2.5 text-[13px] font-semibold transition-[flex-grow] duration-500 ease-[var(--ease-out)]"
                style={{ flexGrow: r.share, flexBasis: 0, background: tone(color), color: "var(--on-solid)" }}
                title={`${r.m.course.name}: ${r.p}% · about ${hoursLabel(r.hours)}`}
              >
                {r.share >= 0.08 && (
                  <span className="truncate">
                    {r.m.course.name} <span className="font-medium opacity-85">{r.p}%</span>
                  </span>
                )}
              </div>
            );
          })}
      </div>

      <ul className="mt-3">
        {sorted.map((r) => (
          <ShareRow key={r.m.course.id} module={r.m} week={r.w} pct={pct[rows.indexOf(r)]} hours={r.hours} onWeek={onWeek} onEcts={onEcts} />
        ))}
      </ul>

      {guessed.length > 0 && (
        <p className="mt-3 rounded-[10px] bg-sunken px-3 py-2 text-[12px] text-muted">
          Credits not found in the course files for{" "}
          {guessed.map((m, i) => (
            <span key={m.course.id}>
              {i > 0 && (i === guessed.length - 1 ? " and " : ", ")}
              <button onClick={(e) => onEcts(m, anchorOf(e))} className="font-semibold text-text underline decoration-dotted underline-offset-2 hover:decoration-solid">
                {m.course.name}
              </button>
            </span>
          ))}
          , so {guessed.length === 1 ? "it counts" : "they count"} as {DEFAULT_ECTS} ECTS. Click to set the real value (KLIPS or the module handbook has it), it decides the split.
        </p>
      )}
    </section>
  );
}

/** Prozente, die zusammen genau 100 ergeben (größte Reste bekommen den Rest). */
function roundShares(shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  const raw = shares.map((s) => (s / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest);
  for (const o of order) {
    if (left <= 0) break;
    if (shares[o.i] > 0) {
      out[o.i] += 1;
      left -= 1;
    }
  }
  return out;
}

function ShareRow({
  module: m,
  week: w,
  pct,
  hours,
  onWeek,
  onEcts,
}: {
  module: ModulePlan;
  week: WeekPlan | null;
  pct: number;
  hours: number;
  onWeek: (m: ModulePlan, w: WeekPlan, a: Anchor) => void;
  onEcts: (m: ModulePlan, a: Anchor) => void;
}) {
  const color = colorOf(m.course);
  const heavyTag =
    w && !w.estimated && w.load
      ? w.heavy >= 1.3
        ? { text: "heavier than usual", strong: true }
        : w.heavy <= 0.7
          ? { text: "lighter than usual", strong: false }
          : null
      : null;
  return (
    <li className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-0">
      <Swatch color={color} size={10} />
      <div className="flex w-[190px] shrink-0 items-center gap-2">
        <span className="truncate text-[14px] font-semibold" title={m.course.fullName ?? m.course.name}>
          {m.course.name}
        </span>
        <EctsChip module={m} onClick={(a) => onEcts(m, a)} />
      </div>
      <div className="min-w-0 flex-1 text-[12px]">
        {w ? (
          <>
            <p className="truncate text-[13px]">
              <span className="font-medium">Week {w.n}</span>
              {w.title && <span className="text-muted"> · {w.title}</span>}
            </p>
            <p className="truncate text-muted">
              {w.load && w.load.minutes > 0 ? partsText(w.load) : "Files for this week aren’t up yet, counted as an average week"}
              {heavyTag && (
                <span className="font-semibold" style={heavyTag.strong ? { color: tone(color, "ink") } : undefined}>
                  {" "}
                  · {heavyTag.text}
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="text-muted">
            {hoursShort(m.remaining)} left until the exam · {m.exam.assumed ? "date not known yet" : fmtDate(m.exam.date)}
          </p>
        )}
      </div>
      <div className="w-[56px] shrink-0 text-right text-[17px] font-bold tabular-nums" style={{ color: tone(color, "ink") }}>
        {pct}%
      </div>
      <div className="w-[64px] shrink-0 text-right text-[12px] tabular-nums text-muted" title={`About ${hoursLabel(hours)} of your study time this week`}>
        ≈ {hoursShort(hours)}
      </div>
      {w ? (
        <BallButton module={m} week={w} size={24} onClick={(a) => onWeek(m, w, a)} />
      ) : (
        <span className="size-[30px] shrink-0" />
      )}
    </li>
  );
}

function EctsChip({ module: m, onClick }: { module: ModulePlan; onClick: (a: Anchor) => void }) {
  const color = colorOf(m.course);
  const guess = m.ectsFrom === "guess";
  return (
    <button
      onClick={(e) => onClick(anchorOf(e))}
      aria-haspopup="dialog"
      className="press shrink-0 rounded-full px-2 py-px text-[11px] font-semibold tabular-nums"
      style={
        guess
          ? { color: "var(--muted)", boxShadow: "inset 0 0 0 1px var(--line)", outline: "1px dashed transparent" }
          : { background: tone(color, "soft"), color: tone(color, "ink") }
      }
      title={guess ? "Guessed. Click to set the real credits" : m.ectsFrom === "slides" ? `From the course files: ${m.ectsEvidence}` : "Set by you"}
    >
      {fmtEcts(m.ects)} ECTS{guess ? "?" : ""}
    </button>
  );
}

const fmtEcts = (n: number) => String(n).replace(".", ",").replace(",0", "");

// ------------------------------------------------------------------ Bis zur Klausur: Wochen je Modul

const STATUS: Record<Status, { label: string; fg: string; bg: string }> = {
  none: { label: "Not rated yet", fg: "var(--muted)", bg: "var(--sunken)" },
  ahead: { label: "Ahead", fg: "color-mix(in srgb, var(--ok) 82%, var(--text))", bg: "color-mix(in srgb, var(--ok) 14%, transparent)" },
  ontrack: { label: "On track", fg: "color-mix(in srgb, var(--ok) 82%, var(--text))", bg: "color-mix(in srgb, var(--ok) 14%, transparent)" },
  slightly: { label: "A bit behind", fg: "var(--warn)", bg: "var(--warn-soft)" },
  behind: { label: "Behind", fg: "var(--danger)", bg: "var(--danger-soft)" },
};

function Track({ model, onWeek }: { model: ProgressModel; onWeek: (m: ModulePlan, w: WeekPlan, a: Anchor) => void }) {
  return (
    <section aria-label="Until the exams" className="rounded-[14px] bg-surface p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold">Week by week until the exams</h2>
          <p className="text-[12px] text-muted">Click a week and say how far you are. Bigger bars under a week mean more material.</p>
        </div>
        <Legend />
      </div>
      <ul className="mt-2">
        {model.modules.map((m) => (
          <TrackRow key={m.course.id} model={model} module={m} onWeek={onWeek} />
        ))}
      </ul>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" aria-hidden>
      {LEVELS.map((l) => (
        <span key={l.value} className="inline-flex items-center gap-1">
          <Harvey value={l.value / 4} color="blue" size={13} neutral />
          {l.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <Harvey value={0.5} color="blue" size={13} neutral auto />
        from your cards
      </span>
    </div>
  );
}

function TrackRow({ model, module: m, onWeek }: { model: ProgressModel; module: ModulePlan; onWeek: (m: ModulePlan, w: WeekPlan, a: Anchor) => void }) {
  const color = colorOf(m.course);
  const s = STATUS[m.status];
  const past = m.weeks.filter((w) => w.past && w.hours > 0);
  const unratedWeeks = m.weeks.filter((w) => m.unrated.includes(w.n));
  const maxHours = Math.max(0.01, ...m.weeks.map((w) => w.hours));
  const [undo, setUndo] = useState<{ prev: { key: string; level: number | null; reviewed: boolean }[] } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);
  const ratio = m.due ? m.done / m.due : 1;
  const needMore = m.status !== "none" && !m.unrated.length && m.needPerWeek > m.planPerWeek * 1.15 && m.exam.days > 0;
  const lastPast = past.length ? past[past.length - 1].n : 0;

  const markPastDone = () => {
    const list = m.status === "none" ? past : unratedWeeks;
    const prev = list.map((w) => ({ key: w.key, level: w.level, reviewed: w.reviewed }));
    applyLevels(m.course.id, list.map((w) => ({ key: w.key, level: 4, reviewed: true })));
    setUndo({ prev });
  };

  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line-soft py-3.5 last:border-0">
      <div className="w-[160px] shrink-0">
        <p className="flex items-center gap-2">
          <Swatch color={color} size={10} />
          <span className="truncate text-[14px] font-semibold">{m.course.name}</span>
        </p>
        <span className="mt-1 inline-block rounded-full px-2 py-px text-[11px] font-bold" style={{ color: s.fg, background: s.bg }}>
          {s.label}
        </span>
      </div>

      {/* Zeitstrahl: Vorlesungswochen, Weihnachtspause, Vorbereitung, Klausur */}
      <div className="flex min-w-[360px] flex-1 items-start">
        <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: `repeat(${model.lastWeek}, minmax(0, 1fr))` }}>
          {m.weeks.map((w) => (
            <div key={w.key} className={`flex flex-col items-center ${model.breakAfter === w.n - 1 ? "ml-2 border-l border-dashed border-line pl-1" : ""}`} title={model.breakAfter === w.n - 1 ? "After the Christmas break" : undefined}>
              {w.past && w.hours === 0 && !w.week ? (
                <span className="grid h-[30px] place-items-center text-[11px] text-muted" title={`Week ${w.n}: no files, probably no lecture`}>
                  –
                </span>
              ) : (
                <BallButton module={m} week={w} size={20} onClick={(a) => onWeek(m, w, a)} />
              )}
              <span className="mt-0.5 block h-[3px] rounded-full" style={{ width: `${Math.max(12, Math.round((w.hours / maxHours) * 100))}%`, background: tone(color), opacity: w.past || w.current ? 0.55 : 0.22 }} aria-hidden />
              <span className={`mt-0.5 text-[10px] tabular-nums ${w.current ? "font-bold text-text" : "text-muted"}`}>{w.n}</span>
            </div>
          ))}
        </div>
        <div className="ml-2 flex w-[70px] shrink-0 flex-col items-center" title={`Exam prep: about ${hoursLabel(m.prepHours)} after the last lecture`}>
          <span
            className="mt-[5px] block h-[20px] w-full rounded-full"
            style={{ background: `repeating-linear-gradient(135deg, ${tone(color, "soft")} 0 5px, transparent 5px 9px)`, boxShadow: `inset 0 0 0 1px ${tone(color)}` }}
            aria-hidden
          />
          <span className="mt-[7px] inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: m.exam.assumed ? "var(--muted)" : tone(color, "ink") }}>
            <Flag size={10} aria-hidden /> {m.exam.assumed ? "Exam?" : fmtDate(m.exam.date)}
          </span>
        </div>
      </div>

      <div className="w-[170px] shrink-0 text-[12px]">
        {undo ? (
          <p>
            Weeks marked done.{" "}
            <button
              onClick={() => {
                applyLevels(m.course.id, undo.prev);
                setUndo(null);
              }}
              className="font-semibold underline underline-offset-2"
            >
              Undo
            </button>
          </p>
        ) : m.status === "none" ? (
          past.length ? (
            <p className="text-muted">
              Rate weeks 1–{lastPast}, or{" "}
              <button onClick={markPastDone} className="font-semibold text-text underline decoration-dotted underline-offset-2 hover:decoration-solid">
                mark all done
              </button>
            </p>
          ) : (
            <p className="text-muted">Nothing to rate yet</p>
          )
        ) : m.unrated.length ? (
          <>
            <p className="font-semibold">{m.behind >= 0.25 ? `≈ ${hoursShort(m.behind)} to catch up` : "Rated weeks are done"}</p>
            <p className="text-muted">
              {m.unrated.length === 1 ? "Week" : "Weeks"} {m.unrated.join(", ")} not rated ·{" "}
              <button onClick={markPastDone} className="font-semibold text-text underline decoration-dotted underline-offset-2 hover:decoration-solid">
                done
              </button>
            </p>
          </>
        ) : m.behind >= 0.25 ? (
          <>
            <p className="font-semibold">≈ {hoursShort(m.behind)} to catch up</p>
            <Meter value={ratio} color={s.fg} />
          </>
        ) : (
          <>
            <p className="font-semibold">{past.length ? `Weeks 1–${lastPast} done` : "All set so far"}</p>
            <Meter value={ratio} color={s.fg} />
          </>
        )}
        <p className="mt-1 text-muted">
          {m.exam.assumed ? (
            <button
              onClick={() => openNewEvent({ title: "Exam", moduleId: m.course.id, kind: "klausur", date: m.exam.date, start: "09:00", end: "11:00" })}
              className="inline-flex items-center gap-1 hover:text-text hover:underline"
            >
              <CalendarPlus size={11} aria-hidden /> Add the exam date
            </button>
          ) : m.exam.days >= 0 ? (
            `Exam ${fmtDate(m.exam.date)}, in ${m.exam.days} days`
          ) : (
            `Exam was ${fmtDate(m.exam.date)}`
          )}
        </p>
        {needMore && (
          <p className="mt-0.5" style={{ color: "var(--warn)" }} title={`Plan: about ${hoursShort(m.planPerWeek)} a week`}>
            Needs {hoursShort(m.needPerWeek)} a week until then
          </p>
        )}
      </div>
    </li>
  );
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(3, Math.min(100, Math.round(value * 100)))}%`, background: color }} />
    </span>
  );
}

// ------------------------------------------------------------------ Plan für diese Woche

function Plan({ model, onWeek }: { model: ProgressModel; onWeek: (m: ModulePlan, w: WeekPlan, a: Anchor) => void }) {
  const [all, setAll] = useState(false);
  const steps = model.steps;
  if (!steps.length && model.currentWeek > model.lastWeek) return null;
  const total = steps.reduce((a, s) => a + s.left, 0);
  const shown = all ? steps : steps.slice(0, 7);
  const firstOver = shown.findIndex((s) => !s.fits);
  return (
    <section aria-label="Plan for this week" className="rounded-[14px] bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex-1 text-[17px] font-bold">Plan for this week</h2>
        {steps.length > 0 && (
          <span className="text-[12px] text-muted">
            {total <= model.hours + 0.25
              ? `${hoursShort(total)} open, fits into your ${model.hours} hours`
              : `${hoursShort(total)} open, ${hoursShort(total - model.hours)} more than your ${model.hours} hours`}
          </span>
        )}
      </div>
      {steps.length ? (
        <ol className="mt-2">
          {shown.map((s, i) => (
            <PlanItem key={`${s.module.course.id}|${s.week.key}`} step={s} divider={i === firstOver && i > 0 ? `Beyond your ${model.hours} hours` : null} onWeek={onWeek} />
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-[13px] text-muted">Nothing open for this week. Nice work. Practice cards in Study or work ahead on next week.</p>
      )}
      {steps.length > 7 && (
        <button onClick={() => setAll(!all)} className="mt-2 rounded-md px-1 text-[13px] text-muted hover:text-text">
          {all ? "Show less" : `Show ${steps.length - 7} more`}
        </button>
      )}
    </section>
  );
}

function PlanItem({ step: s, divider, onWeek }: { step: Step; divider: string | null; onWeek: (m: ModulePlan, w: WeekPlan, a: Anchor) => void }) {
  const m = s.module;
  const w = s.week;
  const color = colorOf(m.course);
  return (
    <>
      {divider && (
        <li className="mt-1 flex items-center gap-2 py-1.5 text-[11px] font-semibold text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" /> {divider} <span className="h-px flex-1 bg-line" />
        </li>
      )}
      <li className={`flex flex-wrap items-center gap-3 border-b border-line-soft py-2 last:border-0 ${s.fits ? "" : "opacity-70"}`}>
        <BallButton module={m} week={w} size={22} onClick={(a) => onWeek(m, w, a)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px]">
            <strong className="font-semibold">{m.course.name}</strong>
            <span> · Week {w.n}</span>
            {w.title && <span className="text-muted"> · {w.title}</span>}
          </p>
          <p className="truncate text-[12px] text-muted">
            {s.kind === "catchup" ? (
              <span className="font-semibold" style={{ color: "var(--warn)" }}>
                {w.source === "none" ? "Not rated, catch up?" : "Catch up"}
              </span>
            ) : (
              <span className="font-semibold" style={{ color: tone(color, "ink") }}>
                This week
              </span>
            )}
            {w.load && w.load.minutes > 0 ? ` · ${partsText(w.load)}` : " · files not up yet"}
            {w.progress > 0 && ` · ${LEVELS[Math.round(w.progress * 4)].label.toLowerCase()} so far`}
          </p>
        </div>
        <span className="w-[64px] text-right text-[13px] font-semibold tabular-nums">≈ {hoursShort(s.left)}</span>
        <StudyActions module={m} week={w} compact />
      </li>
    </>
  );
}

// ------------------------------------------------------------------ Woche einstufen (Popover)

function WeekDetails({ module: m, week: w, onOpenCourse, onDone }: { module: ModulePlan; week: WeekPlan; onOpenCourse: () => void; onDone: () => void }) {
  const color = colorOf(m.course);
  const shown = w.level ?? (w.source === "reviewed" ? 4 : null);
  const autoLevel = Math.round(w.auto * 4);
  const pick = (v: number) => setWeekLevel(m.course.id, w.key, v);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-4]$/.test(e.key) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        pick(Number(e.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="p-4">
      <p className="flex items-center gap-1.5 text-[12px] text-muted">
        <Swatch color={color} size={8} /> {m.course.name} · {w.range}
        {w.current && (
          <span className="ml-1 rounded-full px-1.5 text-[10px] font-bold" style={{ background: tone(color), color: "var(--on-solid)" }}>
            This week
          </span>
        )}
      </p>
      <h3 className="mt-0.5 text-[15px] font-bold leading-snug">
        Week {w.n}
        {w.title && <span style={{ color: tone(color, "ink") }}> · {w.title}</span>}
      </h3>
      <p className="mt-0.5 text-[12px] text-muted">
        {w.load && w.load.minutes > 0 ? partsText(w.load) : w.past ? "No files for this week" : "Files aren’t up yet"}
        {w.hours > 0 && ` · about ${hoursLabel(w.hours)} of your time`}
      </p>

      <div role="radiogroup" aria-label="How far are you with this week?" className="mt-3 grid grid-cols-5 gap-1">
        {LEVELS.map((l) => {
          const on = shown === l.value;
          return (
            <button
              key={l.value}
              role="radio"
              aria-checked={on}
              data-autofocus={on || (shown == null && l.value === 0) ? "" : undefined}
              onClick={() => pick(l.value)}
              title={`${l.hint} (key ${l.value})`}
              className="press flex flex-col items-center gap-1 rounded-[9px] px-1 py-2 text-[11px] font-medium hover:bg-hover"
              style={on ? { background: tone(color, "soft"), color: tone(color, "ink"), boxShadow: `inset 0 0 0 1.5px ${tone(color)}` } : undefined}
            >
              <Harvey value={l.value / 4} color={color} size={22} />
              {l.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 min-h-[16px] text-[12px] text-muted">
        {w.level != null ? (
          <>
            {LEVELS[w.level].hint}.{" "}
            <button onClick={() => setWeekLevel(m.course.id, w.key, null)} className="underline underline-offset-2 hover:text-text">
              Clear
            </button>
          </>
        ) : w.source === "reviewed" ? (
          "Marked as reviewed on the course page."
        ) : w.source === "cards" ? (
          <>
            Not rated. Your cards say <strong className="font-semibold text-text">{LEVELS[autoLevel].label.toLowerCase()}</strong>.
          </>
        ) : (
          "Not rated yet. Keys 0–4 work too."
        )}
      </p>

      <div className="mt-3 border-t border-line-soft pt-3">
        <p className="text-[12px] text-muted">
          {w.cards.total ? (
            <>
              <strong className="font-semibold text-text">{w.cards.seen}</strong> of {w.cards.total} cards seen, <strong className="font-semibold text-text">{w.cards.learned}</strong> learned well
            </>
          ) : w.week ? (
            "No flashcards for this week yet. Prepare the files in Study to get some."
          ) : (
            "Nothing to study for this week yet."
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StudyActions module={m} week={w} onAction={onDone} />
          <Button variant="plain" className="h-8" onClick={onOpenCourse}>
            Open course <ArrowRight size={13} aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** „Learn“ (Karten der Woche im Study-Tab) und Einseiter (erstellen bzw. öffnen). */
function StudyActions({ module: m, week: w, compact = false, onAction }: { module: ModulePlan; week: WeekPlan; compact?: boolean; onAction?: () => void }) {
  const study = useStudy();
  const mathMode = useMathMode(m.course, studyFiles(m.course).map((f) => study.files[fileKey(f)]));
  const [error, setError] = useState<string | null>(null);
  const docs = w.week ? w.week.files.filter((x) => STUDY_FILE.test(x.file.name) && isStudyDoc(x.type)) : [];
  const open = w.cards.total - w.cards.learned;
  return (
    <>
      {w.cards.total > 0 && (
        <Button
          variant={compact ? "secondary" : "primary"}
          className="h-8"
          onClick={() => {
            onAction?.();
            openStudy({ screen: "week", moduleId: m.course.id, weekKey: w.key });
          }}
          title="Learn this week’s flashcards in Study"
        >
          <GraduationCap size={13} aria-hidden /> {compact ? "Learn" : open ? `Learn ${open} cards` : "Practice cards"}
        </Button>
      )}
      {w.sheet ? (
        <Button
          variant="plain"
          className="h-8"
          onClick={async () => {
            const msg = await openSheet(w.sheet!.id);
            setError(msg);
          }}
          title={`Open “${w.sheet.title}”`}
        >
          <FileText size={13} aria-hidden /> {compact ? "Sheet" : "Open one-pager"}
        </Button>
      ) : (
        docs.length > 0 &&
        !compact && (
          <Button
            variant="plain"
            className="h-8"
            disabled={study.available === false || study.sheetRun.running}
            onClick={async () => {
              setError(null);
              const res = await quickSheet(m.course, [w.week!], { kind: "week", math: mathMode.math, subject: subjectOf(m.course, mathMode.math) });
              if (res.error) setError(res.error);
            }}
            title="The essentials of this week on one page (PDF, about a minute)"
          >
            <NotebookPen size={13} aria-hidden /> {study.sheetRun.running ? "Writing…" : "Make one-pager"}
          </Button>
        )
      )}
      {error && <span className="basis-full text-[12px] text-[var(--danger)]">{error}</span>}
    </>
  );
}

// ------------------------------------------------------------------ Leistungspunkte und Lernzeit

function EctsPicker({ module: m, onDone }: { module: ModulePlan; onDone: () => void }) {
  const color = colorOf(m.course);
  const found = m.course.credits;
  return (
    <div className="p-4">
      <h3 className="text-[15px] font-bold">Credits for {m.course.name}</h3>
      <p className="mt-0.5 text-[12px] text-muted">
        {found
          ? `The course files say ${fmtEcts(found.value)} ECTS (“${found.evidence}” in ${found.source}).`
          : "Not found in the course files. KLIPS or the module handbook lists them."}
      </p>
      <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="ECTS">
        {ECTS_CHOICES.map((v) => {
          const on = m.ects === v && m.ectsFrom !== "guess";
          return (
            <button
              key={v}
              role="radio"
              aria-checked={on}
              data-autofocus={on ? "" : undefined}
              onClick={() => {
                setModuleEcts(m.course.id, found && found.value === v ? null : v);
                onDone();
              }}
              className="press h-8 rounded-[8px] text-[13px] font-semibold tabular-nums hover:bg-hover"
              style={on ? { background: tone(color), color: "var(--on-solid)" } : { boxShadow: "inset 0 0 0 1px var(--line)" }}
            >
              {fmtEcts(v)}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-muted">More credits means more of your weekly time. A 12-ECTS course gets about twice the time of a 6-ECTS one.</p>
      {m.ectsFrom === "you" && (
        <button onClick={() => (setModuleEcts(m.course.id, null), onDone())} className="mt-2 text-[12px] font-semibold underline underline-offset-2">
          {found ? `Back to ${fmtEcts(found.value)} from the files` : "Back to unknown"}
        </button>
      )}
    </div>
  );
}

function HoursPicker({ hours }: { hours: number }) {
  return (
    <div className="p-4">
      <h3 className="text-[15px] font-bold">Your study time per week</h3>
      <p className="mt-0.5 text-[12px] text-muted">Time for reviewing, sheets and reading, without lectures and tutorials. The plan splits it across your courses.</p>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => setStudyHours(hours - 1)} aria-label="One hour less" className="press grid size-9 place-items-center rounded-[9px] shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover">
          <Minus size={15} aria-hidden />
        </button>
        <span className="flex-1 text-center text-[22px] font-bold tabular-nums" aria-live="polite">
          {hours} h
        </span>
        <button onClick={() => setStudyHours(hours + 1)} aria-label="One hour more" className="press grid size-9 place-items-center rounded-[9px] shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover">
          <Plus size={15} aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[8, 10, 15, 20, 25, 30].map((h) => (
          <button
            key={h}
            onClick={() => setStudyHours(h)}
            data-autofocus={h === hours ? "" : undefined}
            className="press h-7 rounded-full px-2.5 text-[12px] font-semibold tabular-nums"
            style={h === hours ? { background: "var(--accent)", color: "var(--on-accent)" } : { boxShadow: "inset 0 0 0 1px var(--line)" }}
          >
            {h} h
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">By the ECTS rule a full semester means about 40 hours a week including lectures. Most first-year students manage 10–20 hours on their own.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Erklärung

function HowItWorks() {
  return (
    <details className="group rounded-[12px] bg-surface px-5 py-3 text-[13px]">
      <summary className="flex cursor-default list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronDown size={15} className="text-muted transition-transform group-open:rotate-180" aria-hidden /> How the estimate works
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-muted">
        <li>
          <strong className="font-semibold text-text">Material, not file count.</strong> Every file of a week counts by its pages and kind: slides about 2.5 minutes a page, lecture notes 4,
          readings 5, exercise sheets about 25 minutes per task. Math is slower, formulas add a little. Page and task counts come from Study; files it hasn’t read yet count with typical sizes.
        </li>
        <li>
          <strong className="font-semibold text-text">The split.</strong> Half follows the credits (a 12-ECTS course gets twice the share of a 6-ECTS one, more in heavy weeks, less in light ones),
          half follows how much material each course actually has this week.
        </li>
        <li>
          <strong className="font-semibold text-text">On track.</strong> Past weeks count by their material. 90% done or more is on track. Without your rating, cards learned in Study count, up to
          “Almost”. “Done” also ticks “Mark reviewed” on the course page.
        </li>
        <li>
          <strong className="font-semibold text-text">Exams.</strong> About a quarter of each course’s time is planned for exam prep after the last lecture. Exams without a date count as 10 days after
          lectures end until you add one.
        </li>
      </ul>
    </details>
  );
}

// ------------------------------------------------------------------ Bausteine

/** Kreis mit Viertel-Füllung (Harvey ball). auto = Schätzung aus den Karten (heller, gestrichelt). */
function Harvey({ value, color, size = 20, auto = false, dim = false, neutral = false }: { value: number; color: CourseColor; size?: number; auto?: boolean; dim?: boolean; neutral?: boolean }) {
  const c = size / 2;
  const r = c - 1;
  const ir = r - 2.25; // Füllung etwas kleiner als der Ring
  const q = Math.max(0, Math.min(1, Math.round(value * 4) / 4));
  const ink = neutral ? "var(--muted)" : tone(color);
  const a = q * 2 * Math.PI;
  const x = c + ir * Math.sin(a);
  const y = c - ir * Math.cos(a);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={c} cy={c} r={r} fill="var(--surface)" stroke={ink} strokeWidth={1.5} strokeDasharray={auto ? "2.2 1.8" : undefined} opacity={dim ? 0.4 : 1} />
      {q >= 1 ? (
        <circle cx={c} cy={c} r={ir} fill={ink} opacity={auto ? 0.5 : 1} />
      ) : q > 0 ? (
        <path d={`M ${c} ${c} L ${c} ${c - ir} A ${ir} ${ir} 0 ${q > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} fill={ink} opacity={auto ? 0.5 : 1} />
      ) : null}
    </svg>
  );
}

/** Kreis einer Woche als Knopf: Einstufung, sonst Schätzung aus den Karten; diese Woche mit Ring. */
function BallButton({ module: m, week: w, size, onClick }: { module: ModulePlan; week: WeekPlan; size: number; onClick: (a: Anchor) => void }) {
  const color = colorOf(m.course);
  const value = w.progress;
  const label = w.level != null ? LEVELS[w.level].label : w.source === "reviewed" ? "Done" : w.source === "cards" ? `${LEVELS[Math.round(w.auto * 4)].label}, from your cards` : "Not rated";
  return (
    <button
      onClick={(e) => onClick(anchorOf(e))}
      aria-haspopup="dialog"
      aria-label={`${m.course.name}, week ${w.n}: ${label}. Change`}
      title={`Week ${w.n}${w.title ? ` · ${w.title}` : ""}: ${label}`}
      className="press grid shrink-0 place-items-center rounded-full p-[3px] hover:bg-hover"
      style={w.current ? { boxShadow: `0 0 0 1.5px ${tone(color, "ink")}` } : undefined}
    >
      <Harvey value={value} color={color} size={size} auto={w.source === "cards"} dim={!w.past && !w.current && value === 0} />
    </button>
  );
}

function Popover({ anchor, onClose, label, width, children }: { anchor: Anchor; onClose: () => void; label: string; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Position am Knopf (unten, sonst oben), ohne über den Rand zu laufen; Fokus auf die gewählte Option
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.rect;
    const h = el.offsetHeight;
    const below = a.bottom + 8 + h <= window.innerHeight - 8;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, a.left + a.width / 2 - width / 2));
    el.style.left = `${left}px`;
    el.style.top = `${below ? a.bottom + 8 : Math.max(8, a.top - 8 - h)}px`;
    el.style.setProperty("--menu-origin", `${Math.round(a.left + a.width / 2 - left)}px ${below ? "0" : "100%"}`);
    el.style.visibility = "visible";
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("button"))?.focus();
  }, [anchor, width]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.el.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className="popover fixed z-50 rounded-[12px] bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.18),0_0_0_1px_var(--line)]"
      style={{ width, visibility: "hidden", top: 0, left: 0 }}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ Texte

const PART: Partial<Record<DocType, [string, string]>> = {
  lecture: ["lecture", "lectures"],
  notes: ["lecture notes", "lecture notes"],
  reading: ["reading", "readings"],
  selfstudy: ["self-study unit", "self-study units"],
  sheet: ["exercise sheet", "exercise sheets"],
  exslides: ["exercise slides", "exercise slides"],
  tutorial: ["tutorial", "tutorials"],
  solution: ["solution", "solutions"],
  video: ["recording", "recordings"],
  other: ["file", "files"],
};

/** „2 lectures (58 p.), reading (12 p.), exercise sheet“ */
function partsText(load: WeekLoad): string {
  const merged = new Map<DocType, { count: number; pages: number }>();
  for (const p of load.parts) {
    const cur = merged.get(p.type) ?? { count: 0, pages: 0 };
    merged.set(p.type, { count: cur.count + p.count, pages: cur.pages + p.pages });
  }
  return [...merged.entries()]
    .filter(([t]) => PART[t])
    .map(([t, p]) => {
      const [one, many] = PART[t]!;
      const name = p.count > 1 ? `${p.count} ${many}` : one;
      return p.pages && t !== "sheet" && t !== "solution" ? `${name} (${p.pages} p.)` : name;
    })
    .join(", ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
