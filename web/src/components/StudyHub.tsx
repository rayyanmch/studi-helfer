"use client";

// Study-Tab (Seitenleiste „Study“): Karteikästen je Modul und ein gemischter Kasten für alles,
// gezielt einzelne Vorlesungen oder Themen lernen, Lernzettel als PDF mit wählbaren Bausteinen.
// Daten aus @/lib/study (Mac-App: desktop/lib/study.js), Abfrage und Zusammenfassungen aus StudyView.tsx.

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Flame,
  FolderOpen,
  GraduationCap,
  Layers,
  MoreHorizontal,
  NotebookPen,
  Shuffle,
  Sigma,
  Trash2,
} from "lucide-react";
import { Button, Spinner, Swatch, colorOf, inDays, shortOf, tone } from "./ui";
import { CountUp, useCountUp, useSlidingThumb } from "./motion";
import { displayName } from "./files";
import { ErrorNotice, NoClaude, Progress, Review, SummaryRow, TYPE_LABEL } from "./StudyView";
import { GlossaryPanel, useGlossary } from "./Glossary";
import { DOC_LABEL, isStudyDoc } from "@/lib/doctype";
import { MathText } from "./MathText";
import { type Subject, SUBJECTS, setMathMode, subjectOf, useMathMode } from "@/lib/subject";
import type { Course, CourseColor, CourseFile } from "@/lib/mock-data";
import { useApp } from "@/lib/app-store";
import {
  type Card,
  type Include,
  type SheetDepth,
  type SheetTone,
  type StudyTarget,
  TONES,
  QUICK_INCLUDE,
  QUICK_INCLUDE_MATH,
  cheatPages,
  materialPages,
  savedTone,
  saveTone,
  studyPages,
  NEW_PER_DAY,
  PRESETS,
  SHEET_SECTIONS,
  MATH_PRESETS,
  MATH_SECTIONS,
  active,
  allCards,
  analyze,
  boxes,
  cardsOf,
  createSheet,
  deleteSheet,
  exportAnki,
  fileKey,
  interleave,
  isDue,
  isNew,
  loadStudy,
  mastery,
  openSheet,
  studyFiles,
  suspendCard,
  takeTarget,
  todaysSet,
  useStudy,
  useWeeks,
  weeksText,
  STUDY_FILE,
  setWeekHidden,
  studyDocs,
  useHiddenWeeks,
  useStudyCourses,
  useTodayCards,
  useReviewedWeeks,
  reviewedWeeksOf,
  setWeekReviewed,
  hiddenWeeksOf,
  minutesFor,
  quickSheet,
  sheetFor,
} from "@/lib/study";
import { type Week, ROLE_LABEL, lectureWeek, semesterStart, weekLabel, weeksOf } from "@/lib/weeks";

/** Anzahl fälliger Karten für die Seitenleiste (lädt den Lernstand einmal beim Start). */
export function useStudyDue() {
  const courses = useStudyCourses();
  const key = courses.flatMap((c) => studyFiles(c).map(fileKey)).join("\n");
  useEffect(() => {
    if (key) void loadStudy(key.split("\n"));
  }, [key]);
  return useTodayCards().length;
}

type Screen =
  | { kind: "home" }
  | { kind: "deck"; moduleId: string } // "all" = alle Module gemischt
  | { kind: "review"; cards: Card[]; rest: Card[]; practice: boolean; title: string; back: Screen }
  | { kind: "new-sheet"; moduleId?: string; weeks?: string[] };


export function StudyHub() {
  const study = useStudy();
  const courses = useStudyCourses();
  useHiddenWeeks(null);
  const pathsKey = courses.flatMap((c) => studyFiles(c).map(fileKey)).join("\n");
  const [screen, setScreen] = useState<Screen>(() => {
    const t = takeTarget();
    return t ? screenFor(t, courses, study) : { kind: "home" };
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStudy(pathsKey ? pathsKey.split("\n") : []);
  }, [pathsKey]);

  // Sprung aus der Kursseite oder dem Progress-Tab, während der Tab schon offen ist
  useEffect(() => {
    const onOpen = () => {
      const t = takeTarget();
      if (t) setScreen(screenFor(t, courses, study));
    };
    window.addEventListener("studi:open-study", onOpen);
    return () => window.removeEventListener("studi:open-study", onOpen);
  }, [courses, study]);

  const cards = allCards(courses, study);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const colorOfCard = (c: Card): CourseColor => {
    const m = c.moduleId ? byId.get(c.moduleId) : undefined;
    return m ? colorOf(m) : "blue";
  };
  const startReview = (pool: Card[], opts: { practice: boolean; size: number; title: string; back: Screen; mixed?: boolean }) => {
    const ordered = opts.mixed ? interleave(pool, Date.now() % 1000) : newLast(pool);
    const size = opts.size || ordered.length;
    setScreen({ kind: "review", cards: ordered.slice(0, size), rest: ordered.slice(size), practice: opts.practice, title: opts.title, back: opts.back });
  };

  if (screen.kind === "review") {
    const mixed = new Set(screen.cards.map((c) => c.moduleId)).size > 1;
    return (
      <div className="pt-2">
        <Review
          key={screen.cards[0]?.id ?? "empty"}
          cards={screen.cards}
          practice={screen.practice}
          title={screen.title}
          colorOfCard={colorOfCard}
          courseOfCard={mixed ? (c) => (c.moduleId ? byId.get(c.moduleId)?.name ?? null : null) : undefined}
          onClose={() => setScreen(screen.back)}
          onMore={
            screen.rest.length
              ? () => setScreen({ ...screen, cards: screen.rest.slice(0, screen.cards.length), rest: screen.rest.slice(screen.cards.length) })
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="stagger flex flex-col gap-6">
      {study.available === false && <NoClaude />}
      {error && <ErrorNotice message={error} onClose={() => setError(null)} />}
      {screen.kind === "home" && (
        <Home
          courses={courses}
          cards={cards}
          onDeck={(moduleId) => setScreen({ kind: "deck", moduleId })}
          onReviewAll={(practice) =>
            startReview(practice ? cards.filter(active) : todaysSet(cards, study.today, study.stats).all, {
              practice,
              size: 20,
              title: practice ? "All courses · practice" : "All courses · today",
              back: { kind: "home" },
              mixed: true,
            })
          }
          onNewSheet={() => setScreen({ kind: "new-sheet" })}
          onError={setError}
        />
      )}
      {screen.kind === "deck" && (
        <Deck
          key={screen.moduleId}
          moduleId={screen.moduleId}
          courses={courses}
          cards={cards}
          onBack={() => setScreen({ kind: "home" })}
          onStart={(pool, opts) => startReview(pool, { ...opts, back: screen })}
          onNewSheet={(moduleId, weeks) => setScreen({ kind: "new-sheet", moduleId, weeks })}
          onError={setError}
        />
      )}
      {screen.kind === "new-sheet" && (
        <NewSheet
          courses={courses}
          initialModule={screen.moduleId}
          initialPicked={(() => {
            // „Study sheet for this week…“: Dateien dieser Woche schon ausgewählt
            const c = courses.find((x) => x.id === screen.moduleId);
            if (!c || !screen.weeks?.length) return [];
            return weeksOf(c, { today: study.today || new Date().toISOString().slice(0, 10) })
              .filter((w) => screen.weeks!.includes(w.key))
              .flatMap((w) => w.files.map((x) => x.file))
              .filter((f) => STUDY_FILE.test(f.name) && !study.unreadable[fileKey(f)])
              .map(fileKey);
          })()}
          onBack={() => setScreen({ kind: "home" })}
          onStarted={() => setScreen({ kind: "home" })}
          onError={setError}
        />
      )}
    </div>
  );
}

/** Sprungziel → Ansicht. „week“ startet gleich die Karten dieser Woche (heute fällige, sonst alle zum Üben). */
function screenFor(t: StudyTarget, courses: Course[], study: ReturnType<typeof useStudy>): Screen {
  if (t.screen === "deck") return { kind: "deck", moduleId: t.moduleId };
  if (t.screen === "new-sheet") return { kind: "new-sheet", moduleId: t.moduleId, weeks: t.weeks };
  const course = courses.find((c) => c.id === t.moduleId);
  if (!course) return { kind: "home" };
  const back: Screen = { kind: "deck", moduleId: course.id };
  const week = weeksOf(course, { today: study.today || new Date().toISOString().slice(0, 10) }).find((w) => w.key === t.weekKey);
  if (!week) return back;
  const keys = new Set(week.files.map((x) => fileKey(x.file)));
  const pool = cardsOf([...keys], study, course.id).filter(active);
  if (!pool.length) return back;
  const todays = todaysSet(allCards(courses, study), study.today, study.stats).all.filter((c) => c.moduleId === course.id && keys.has(c.path));
  const practice = todays.length === 0;
  const ordered = newLast(practice ? pool : todays);
  return {
    kind: "review",
    cards: ordered.slice(0, 20),
    rest: ordered.slice(20),
    practice,
    title: `${course.name} · ${weekLabel(week, false)}${practice ? " · practice" : ""}`,
    back,
  };
}

/** Neue Karten ans Ende, damit Wiederholungen zuerst drankommen. */
function newLast(cards: Card[]) {
  return [...cards.filter((c) => !isNew(c)), ...cards.filter(isNew)];
}

function examIn(courseId: string, deadlines: { courseId: string; kind: string; date: string }[], today: string) {
  const next = deadlines
    .filter((d) => d.courseId === courseId && d.kind === "klausur" && d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  return Math.round((Date.parse(`${next.date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);
}

// --- Übersicht ------------------------------------------------------------------

function Home({
  courses,
  cards,
  onDeck,
  onReviewAll,
  onNewSheet,
  onError,
}: {
  courses: Course[];
  cards: Card[];
  onDeck: (moduleId: string) => void;
  onReviewAll: (practice: boolean) => void;
  onNewSheet: () => void;
  onError: (m: string | null) => void;
}) {
  const app = useApp();
  const study = useStudy();
  const set = todaysSet(cards, study.today, study.stats);
  const due = set.all;
  const dueBy = courses.map((c) => ({ c, n: due.filter((x) => x.moduleId === c.id).length })).filter((x) => x.n > 0);
  const anyCards = cards.length > 0;

  return (
    <>
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Study</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-muted">
          <span>
            {anyCards
              ? due.length
                ? [set.reviews.length ? `${set.reviews.length} to review` : null, set.fresh.length ? `${set.fresh.length} new cards` : null].filter(Boolean).join(" and ") +
                  ` today · about ${minutesFor(due.length)} min`
                : "Nothing left for today"
              : "Flashcards and study sheets from your course files"}
          </span>
        </p>
      </header>

      <Progress color="blue" />
      <SheetRunning />

      <TodayHero courses={courses} cards={cards} due={due} dueBy={dueBy} onReviewAll={onReviewAll} />

      {!anyCards && <HowItWorks />}

      {anyCards && <ThisWeekSheets courses={courses} onError={onError} />}

      <CatchUp courses={courses} onDeck={onDeck} />

      {/* Karteikästen */}
      <section aria-label="Card boxes">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="flex-1 text-[17px] font-bold">Card boxes</h2>
          <span className="text-[12px] text-muted">Open a box to learn single weeks</span>
        </div>
        <ul className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li>
            <BoxTile
              title="All courses"
              subtitle="Everything mixed"
              cards={cards}
              today={study.today}
              colors={courses.map(colorOf)}
              onOpen={() => onDeck("all")}
            />
          </li>
          {courses.map((c) => (
            <li key={c.id}>
              <BoxTile
                title={c.name}
                subtitle={c.fullName && c.fullName !== c.name ? c.fullName : undefined}
                cards={cards.filter((x) => x.moduleId === c.id)}
                today={study.today}
                colors={[colorOf(c)]}
                exam={examIn(c.id, app.deadlines, app.today)}
                files={studyFiles(c).length}
                tag={deckTag(c)}
                onOpen={() => onDeck(c.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Lernzettel */}
      <Sheets courses={courses} onNew={onNewSheet} onError={onError} />

      <p className="text-[12px] text-muted">
        Summaries, cards and study sheets are written by Claude from your course files. They can contain mistakes, so check the page in the file when
        something looks off.
      </p>
    </>
  );
}

/** „Heute“: Kartenstapel (fächert beim Überfahren auf), Tagesring, Start-Knopf, darunter die letzten 7 Tage und die Serie. */
function TodayHero({
  courses,
  cards,
  due,
  dueBy,
  onReviewAll,
}: {
  courses: Course[];
  cards: Card[];
  due: Card[];
  dueBy: { c: Course; n: number }[];
  onReviewAll: (practice: boolean) => void;
}) {
  const study = useStudy();
  const app = useApp();
  const anyCards = cards.length > 0;
  const done = study.stats.today;
  const goal = done + due.length;
  const share = goal ? done / goal : 0;
  const dueShown = useCountUp(Math.min(due.length, 99));
  const fan = (dueBy.length ? dueBy.map((x) => colorOf(x.c)) : courses.map(colorOf)).slice(0, 3);
  while (fan.length < 3) fan.push(fan[fan.length - 1] ?? "blue");
  const week = study.stats.week ?? [0, 0, 0, 0, 0, 0, study.stats.today];
  const max = Math.max(4, ...week);
  const base = Date.parse(`${study.today || app.today}T12:00:00`);
  const dayName = (k: number) => (Number.isNaN(base) ? "" : new Date(base - (6 - k) * 86_400_000).toLocaleDateString("en-US", { weekday: "narrow" }));
  const R = 19;
  const len = 2 * Math.PI * R;
  return (
    <section aria-label="Today" className="fan-host overflow-hidden rounded-[14px] bg-surface">
      <div className="flex flex-wrap items-center gap-5 p-5">
        <div className="deck-fan relative h-[64px] w-[66px] shrink-0" aria-hidden>
          {[0, 1, 2].map((k) => {
            const pose = [
              { r: "-11deg", x: "-7px", y: "3px", rh: "-22deg", xh: "-16px", yh: "6px" },
              { r: "8deg", x: "6px", y: "1px", rh: "17deg", xh: "15px", yh: "3px" },
              { r: "-2deg", x: "0px", y: "0px", rh: "0deg", xh: "0px", yh: "-5px" },
            ][k];
            const front = k === 2;
            return (
              <span
                key={k}
                className="absolute left-[12px] top-[4px] grid h-[56px] w-[42px] place-items-center rounded-[7px]"
                style={
                  {
                    "--r": pose.r,
                    "--x": pose.x,
                    "--y": pose.y,
                    "--rh": pose.rh,
                    "--xh": pose.xh,
                    "--yh": pose.yh,
                    background: front ? "var(--surface)" : tone(fan[k], "soft"),
                    boxShadow: front
                      ? `0 0 0 1px var(--line), 0 3px 8px rgba(0,0,0,0.10), inset 0 3px 0 ${tone(fan[2])}`
                      : `0 0 0 1px color-mix(in srgb, ${tone(fan[k])} 35%, transparent)`,
                  } as React.CSSProperties
                }
              >
                {front &&
                  (due.length ? (
                    <span className="text-[17px] font-bold tabular-nums">{dueShown}</span>
                  ) : (
                    <Check size={18} strokeWidth={3} style={{ color: anyCards ? "var(--ok)" : "var(--muted)" }} />
                  ))}
              </span>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold">{due.length ? "Your review for today" : anyCards ? "All caught up" : "Get your first cards"}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {due.length
              ? `All courses mixed. Up to ${NEW_PER_DAY} new cards a day, so it never piles up.`
              : anyCards
                ? "Nothing is due. Come back tomorrow, or practice anyway."
                : "Pick a course below. Claude reads your slides once and turns them into a summary and flashcards."}
          </p>
          {dueBy.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
              {dueBy.map(({ c, n }) => (
                <span key={c.id} className="inline-flex items-center gap-1.5">
                  <Swatch color={colorOf(c)} size={8} />
                  {c.name} <span className="text-muted">{n}</span>
                </span>
              ))}
            </p>
          )}
        </div>
        {anyCards && goal > 0 && (
          <div className="flex items-center gap-2.5" title={`${done} of ${goal} cards for today done`}>
            <svg viewBox="0 0 48 48" className="size-11 -rotate-90" aria-hidden>
              <circle cx="24" cy="24" r={R} fill="none" stroke="var(--sunken)" strokeWidth="5" />
              {share > 0 && (
                <circle
                  className="ring-fill"
                  cx="24"
                  cy="24"
                  r={R}
                  fill="none"
                  stroke={share >= 1 ? "var(--ok)" : "var(--text)"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={len}
                  strokeDashoffset={len * (1 - share)}
                  style={{ "--ring-len": len, transition: "stroke-dashoffset 600ms var(--ease-out)" } as React.CSSProperties}
                />
              )}
            </svg>
            <span className="text-[12px] leading-tight">
              <strong className="block text-[15px] font-bold tabular-nums">
                <CountUp value={done} />
                <span className="font-semibold text-muted"> / {goal}</span>
              </strong>
              <span className="text-muted">done today</span>
            </span>
          </div>
        )}
        {due.length > 0 ? (
          <Button variant="primary" className="h-10 px-4 text-[14px]" onClick={() => onReviewAll(false)}>
            Start review <span className="opacity-70">{Math.min(due.length, 20)}</span>
          </Button>
        ) : (
          anyCards && (
            <Button className="h-10 px-4 text-[14px]" onClick={() => onReviewAll(true)}>
              Practice anyway
            </Button>
          )
        )}
      </div>
      {anyCards && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-line-soft px-5 py-3">
          <div className="flex items-end gap-1.5" aria-label={`Cards per day this week: ${week.join(", ")}`}>
            {week.map((n, k) => (
              <span key={k} className="flex w-[18px] flex-col items-center gap-1">
                <span className="flex h-[26px] w-[8px] items-end">
                  <span
                    className="grow-y block w-full rounded-full"
                    style={
                      {
                        height: n ? `${Math.max(18, (n / max) * 100)}%` : "8px",
                        background: n ? (k === 6 ? "var(--text)" : "color-mix(in srgb, var(--text) 32%, transparent)") : "var(--sunken)",
                        "--delay": `${150 + k * 45}ms`,
                      } as React.CSSProperties
                    }
                    title={`${n} ${n === 1 ? "card" : "cards"}`}
                  />
                </span>
                <span className={`text-[10px] font-semibold ${k === 6 ? "text-text" : "text-muted"}`}>{dayName(k)}</span>
              </span>
            ))}
          </div>
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 pb-0.5 text-[12px] text-muted">
            {study.stats.streak > 1 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--c-orange-ink)]">
                <Flame size={13} aria-hidden /> {study.stats.streak}-day streak
              </span>
            ) : (
              <span>{done ? "Day 1 of your streak. See you tomorrow." : "Learn a few cards today to start a streak."}</span>
            )}
            <span>{week.filter(Boolean).length} of the last 7 days</span>
          </p>
        </div>
      )}
    </section>
  );
}

/** „This week on one page“: je Kurs ein Klick für den Einseiter der aktuellen Woche (oder öffnen, wenn es ihn schon gibt). */
function ThisWeekSheets({ courses, onError }: { courses: Course[]; onError: (m: string | null) => void }) {
  return (
    <section aria-label="This week on one page" className="rounded-[14px] bg-surface p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="flex-1 text-[15px] font-bold">This week on one page</h2>
        <span className="text-[12px] text-muted">The exam-relevant essentials of each course, as a PDF</span>
      </div>
      <ul className="stagger flex flex-col">
        {courses.map((c) => (
          <QuickWeekRow key={c.id} course={c} onError={onError} />
        ))}
      </ul>
    </section>
  );
}

function QuickWeekRow({ course, onError }: { course: Course; onError: (m: string | null) => void }) {
  const study = useStudy();
  const weeks = useWeeks(course);
  const week = weeks.find((w) => w.current && w.kind === "week");
  const mathMode = useMathMode(course, studyFiles(course).map((f) => study.files[fileKey(f)]));
  if (!week) return null;
  const existing = sheetFor(study.sheets, course.id, week.key);
  const color = colorOf(course);
  return (
    <li className="flex items-center gap-3 border-b border-line-soft py-2 last:border-0">
      <Swatch color={color} size={9} />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <strong className="font-semibold">{course.name}</strong>
        <span className="text-muted"> · Week {week.n}{week.title ? ` · ${week.title}` : ""}</span>
      </span>
      {existing ? (
        <Button
          className="h-8"
          onClick={async () => {
            const msg = await openSheet(existing.id);
            if (msg) onError(msg);
          }}
        >
          <FileText size={13} aria-hidden /> Open one-pager
        </Button>
      ) : (
        <Button
          className="h-8"
          disabled={study.available === false || study.sheetRun.running}
          onClick={async () => {
            onError(null);
            const res = await quickSheet(course, [week], { kind: "week", math: mathMode.math, subject: subjectOf(course, mathMode.math) });
            if (res.error) onError(res.error);
          }}
        >
          <NotebookPen size={13} aria-hidden /> Make one-pager
        </Button>
      )}
    </li>
  );
}

/** Kurse mit mindestens zwei vergangenen Wochen, die noch nicht als „reviewed“ markiert sind (Kursseite, Haken je Woche). */
function CatchUp({ courses, onDeck }: { courses: Course[]; onDeck: (id: string) => void }) {
  const app = useApp();
  useReviewedWeeks(null);
  useHiddenWeeks(null);
  // Erst ab dem Tag zählen, an dem es den Haken gibt (sonst wirkt man am ersten Tag „15 Wochen im Rückstand“)
  const today = app.today || new Date().toISOString().slice(0, 10);
  const since = (() => {
    try {
      return localStorage.getItem("studi.reviewSince") || today;
    } catch {
      return today;
    }
  })();
  useEffect(() => {
    try {
      if (!localStorage.getItem("studi.reviewSince")) localStorage.setItem("studi.reviewSince", today);
    } catch {
      // egal
    }
  }, [today]);
  const behind = courses
    .map((c) => {
      const weeks = weeksOf(c, { today });
      const cur = weeks.find((w) => w.current && w.kind === "week")?.n;
      const sinceWeek = lectureWeek(new Date(`${since}T12:00:00`), semesterStart(today));
      const done = reviewedWeeksOf(c.id);
      const hidden = hiddenWeeksOf(c.id);
      const open =
        cur == null ? [] : weeks.filter((w) => w.kind === "week" && (w.n ?? 0) < cur && (w.n ?? 0) >= sinceWeek && !done.includes(w.key) && !hidden.includes(w.key));
      return { c, open };
    })
    .filter((x) => x.open.length >= 2)
    .slice(0, 3);
  if (!behind.length) return null;
  return (
    <section aria-label="Catch up" className="rounded-[12px] bg-surface px-4 py-3">
      <h2 className="text-[13px] font-bold">Catch up</h2>
      <ul className="mt-1">
        {behind.map(({ c, open }) => (
          <li key={c.id} className="flex items-center gap-2 py-1 text-[13px]">
            <Swatch color={colorOf(c)} size={8} />
            <span className="min-w-0 flex-1 truncate">
              <strong className="font-semibold">{c.name}:</strong> {open.length} past weeks not marked as reviewed ({open.map((w) => w.n).join(", ")})
            </span>
            <button onClick={() => open.forEach((w) => setWeekReviewed(c.id, w.key, true))} className="shrink-0 text-muted hover:text-text hover:underline">
              Mark all reviewed
            </button>
            <button onClick={() => onDeck(c.id)} className="shrink-0 font-semibold hover:underline" style={{ color: tone(colorOf(c), "ink") }}>
              Open
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12px] text-muted">Tick “Mark reviewed” on a week in the course page once you’ve read the lecture and done the sheet.</p>
    </section>
  );
}

/** Kürzel für die vorderste Karte: „SE“, „BWL“, „Ma I“, „Vis“. */
function deckTag(c: Course) {
  const s = shortOf(c);
  if (s.length <= 4) return s;
  const roman = /\s(I{1,3}|IV|V|\d)$/.exec(s);
  return roman ? `${s.slice(0, 2)} ${roman[1]}` : s.slice(0, 3);
}

/**
 * Kartenstapel als Symbol eines Karteikastens: „All courses“ = gefächerte Hand in allen Kursfarben, ein Kurs = drei
 * Karten in seiner Farbe mit Kürzel vorn. Beim Erscheinen werden die Karten ausgeteilt, beim Überfahren fächern sie auf.
 */
function DeckIcon({ colors, tag, empty, caughtUp }: { colors: CourseColor[]; tag?: string; empty: boolean; caughtUp: boolean }) {
  const mixed = colors.length > 1;
  const front = colors[0] ?? "blue";
  // Hinten: bei „All courses“ eine Hand in allen Kursfarben, sonst zwei Karten in der Kursfarbe links und rechts
  const back = mixed
    ? colors.slice(0, 4).map((c, k, all) => {
        const a = (k - (all.length - 1) / 2) * 15;
        return { bg: tone(c), r: a, rh: a * 1.75, x: 0, xh: 0 };
      })
    : [
        { bg: `color-mix(in srgb, ${tone(front)} 45%, var(--surface))`, r: -15, rh: -26, x: -3, xh: -8 },
        { bg: `color-mix(in srgb, ${tone(front)} 70%, var(--surface))`, r: 11, rh: 21, x: 3, xh: 8 },
      ];
  return (
    <span className="deck-fan deal relative block h-[48px] w-[52px] shrink-0" aria-hidden>
      {back.map((c, k) => (
        <span
          key={k}
          className="absolute bottom-[3px] left-[12px] h-[37px] w-[28px] rounded-[6px]"
          style={
            {
              transformOrigin: "50% 95%",
              "--r": `${c.r}deg`,
              "--rh": `${c.rh}deg`,
              "--x": `${c.x}px`,
              "--xh": `${c.xh}px`,
              "--yh": "-1px",
              background: empty ? "transparent" : c.bg,
              border: empty ? "1.5px dashed var(--line)" : undefined,
              boxShadow: empty ? undefined : "0 0 0 1.5px var(--surface)",
            } as React.CSSProperties
          }
        />
      ))}
      <span
        className="absolute bottom-[3px] left-[12px] grid h-[38px] w-[28px] place-items-center rounded-[6px] text-[10px] font-bold leading-none tracking-[-0.02em]"
        style={
          {
            transformOrigin: "50% 95%",
            "--yh": "-6px",
            "--rh": "-2deg",
            background: empty ? "var(--sunken)" : mixed ? "var(--accent)" : tone(front),
            color: empty ? "var(--muted)" : mixed ? "var(--on-accent)" : "var(--on-solid)",
            boxShadow: empty ? "inset 0 0 0 1.5px var(--line)" : "0 0 0 1.5px var(--surface), 0 4px 10px rgba(0,0,0,0.18)",
          } as React.CSSProperties
        }
      >
        {empty ? <span className="text-[15px] font-semibold">+</span> : mixed ? <Shuffle size={14} strokeWidth={2.4} /> : tag}
        {caughtUp && (
          <span className="absolute -right-1.5 -top-1.5 grid size-[15px] place-items-center rounded-full text-white" style={{ background: "var(--ok)", boxShadow: "0 0 0 1.5px var(--surface)" }}>
            <Check size={9} strokeWidth={3.5} />
          </span>
        )}
      </span>
    </span>
  );
}

function BoxTile({
  title,
  subtitle,
  cards,
  today,
  colors,
  exam,
  files,
  tag,
  onOpen,
}: {
  title: string;
  tag?: string; // Kürzel auf der vordersten Karte („BWL“, „SE“)
  subtitle?: string;
  cards: Card[];
  today: string;
  colors: CourseColor[];
  exam?: number | null;
  files?: number;
  onOpen: () => void;
}) {
  const due = cards.filter((c) => isDue(c, today)).length;
  const act = cards.filter(active);
  const counts = boxes(cards);
  const pct = Math.round(mastery(cards) * 100);
  const color = colors[0] ?? "blue";
  const mixed = colors.length > 1;
  return (
    <button
      onClick={onOpen}
      className="lift fan-host group flex h-full w-full flex-col rounded-[12px] bg-surface p-4 text-left hover:shadow-[inset_0_0_0_1.5px_var(--ring),0_8px_22px_rgba(0,0,0,0.07)]"
      style={{ "--ring": mixed ? "var(--text)" : tone(color) } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <DeckIcon colors={colors} tag={tag} empty={act.length === 0} caughtUp={act.length > 0 && due === 0} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{title}</span>
          <span className="block truncate text-[12px] text-muted">{subtitle ?? (act.length ? `${act.length} cards` : "")}</span>
        </span>
        {due > 0 && (
          <span key={due} className="bump rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: mixed ? "var(--accent)" : tone(color), color: mixed ? "var(--on-accent)" : "var(--on-solid)" }}>
            {due} due
          </span>
        )}
      </div>

      {act.length > 0 ? (
        <>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className="grow-x flex h-full" style={{ "--delay": "250ms" } as React.CSSProperties}>
              {counts.slice(1).map((n, i) =>
                n ? <div key={i} style={{ width: `${(n / act.length) * 100}%`, background: mixed ? "var(--text)" : tone(color), opacity: 0.25 + i * 0.18 }} /> : null,
              )}
            </div>
          </div>
          <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
            <span>
              <CountUp value={pct} suffix="%" /> learned
            </span>
            {counts[0] > 0 && <span>· {counts[0]} new</span>}
            <span className="flex-1" />
            {exam != null && (
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: tone(color, "ink") }}>
                <GraduationCap size={13} aria-hidden /> Exam {inDays(exam)}
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="mt-4 text-[12px] text-muted">
          No cards yet{files ? ` · ${files} files to summarize` : ""}
          {exam != null && ` · Exam ${inDays(exam)}`}
        </p>
      )}
    </button>
  );
}

// --- Ein Kasten: Kurs (nach Themenwochen) oder alle Kurse gemischt ----------------------

type StartOpts = { practice: boolean; size: number; title: string; mixed?: boolean };

function Deck(props: {
  moduleId: string;
  courses: Course[];
  cards: Card[];
  onBack: () => void;
  onStart: (pool: Card[], opts: StartOpts) => void;
  onNewSheet: (moduleId?: string, weekKeys?: string[]) => void;
  onError: (m: string | null) => void;
}) {
  if (props.moduleId === "all") return <MixedDeck {...props} />;
  const course = props.courses.find((c) => c.id === props.moduleId);
  return course ? <CourseDeck {...props} course={course} /> : <MixedDeck {...props} />;
}

function BackToStudy({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="-ml-2 -mb-3 flex w-fit items-center gap-0.5 rounded-md px-2 py-1 text-[13px] font-semibold text-muted hover:bg-hover hover:text-text">
      <ChevronLeft size={15} aria-hidden /> Study
    </button>
  );
}

/** Alle Kurse gemischt: heute fällige Karten oder alles üben, Kurse an-/abwählen. */
function MixedDeck({ courses, cards, onBack, onStart }: { courses: Course[]; cards: Card[]; onBack: () => void; onStart: (pool: Card[], opts: StartOpts) => void }) {
  const study = useStudy();
  const [picked, setPicked] = useState<string[]>(() => courses.map((c) => c.id));
  const inScope = cards.filter((c) => picked.includes(c.moduleId ?? ""));
  const todays = todaysSet(inScope, study.today, study.stats).all;
  return (
    <>
      <BackToStudy onBack={onBack} />
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">All courses</h1>
        <p className="mt-1 text-muted">Cards from all your courses, mixed. Mixing helps you remember which method fits where.</p>
      </header>
      {cards.length === 0 ? (
        <div className="rounded-[12px] bg-surface px-5 py-6">
          <h2 className="text-[15px] font-bold">No cards yet</h2>
          <p className="mt-1 text-[13px] text-muted">Open a course and let Claude summarize its files. Their cards show up here mixed.</p>
          <Button className="mt-4" onClick={onBack}>
            <ChevronLeft size={14} aria-hidden /> Back to the courses
          </Button>
        </div>
      ) : (
        <section className="rounded-[14px] bg-surface p-5">
          <h2 className="text-[15px] font-bold">Which courses?</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {courses.map((c) => {
              const on = picked.includes(c.id);
              const n = cards.filter((x) => x.moduleId === c.id && active(x)).length;
              return (
                <ToggleChip key={c.id} on={on} color={colorOf(c)} disabled={n === 0} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}>
                  {c.name} <span className="opacity-60">{n}</span>
                </ToggleChip>
              );
            })}
          </div>
          {inScope.some(active) && (
            <div className="mt-5">
              <BoxLadder cards={inScope} color={null} flat />
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" className="h-10 px-4 text-[14px]" disabled={!todays.length} onClick={() => onStart(todays, { practice: false, size: 20, title: "All courses · today", mixed: true })}>
              {todays.length ? `Learn today · ${todays.length}` : "Nothing left for today"}
            </Button>
            <Button className="h-10 px-4 text-[14px]" disabled={!inScope.some(active)} onClick={() => onStart(inScope.filter(active), { practice: true, size: 20, title: "All courses · practice", mixed: true })}>
              Practice all
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

/** Ein Kurs, geordnet nach Themenwochen: je Woche lernen, Lernzettel, fehlende Dateien, ausblenden. */
function CourseDeck({
  course,
  onBack,
  onStart,
  onNewSheet,
  onError,
}: {
  course: Course;
  onBack: () => void;
  onStart: (pool: Card[], opts: StartOpts) => void;
  onNewSheet: (moduleId?: string, weekKeys?: string[]) => void;
  onError: (m: string | null) => void;
}) {
  const app = useApp();
  const study = useStudy();
  const color = colorOf(course);
  const weeks = useWeeks(course);
  const hidden = useHiddenWeeks(course.id);
  const [showHidden, setShowHidden] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [view, setView] = useState<"weeks" | "terms" | "formulas">("weeks");
  const glossary = useGlossary(course).items.filter((i) => !i.hidden);
  const termCount = glossary.filter((i) => i.kind === "term").length;
  const formulaCount = glossary.filter((i) => i.kind === "formula").length;
  const docs = studyDocs(course);
  const keyOfWeek = (w: Week) => new Set(w.files.map((x) => fileKey(x.file)));
  const visibleWeeks = weeks.filter((w) => !hidden.includes(w.key));
  const visibleKeys = new Set(visibleWeeks.flatMap((w) => [...keyOfWeek(w)]));
  const courseCards = cardsOf(studyFiles(course).map(fileKey), study, course.id);
  const deckCards = courseCards.filter((c) => visibleKeys.has(c.path));
  const todayAll = useTodayCards();
  const todays = todayAll.filter((c) => c.moduleId === course.id);
  const exam = examIn(course.id, app.deadlines, app.today);
  const mathMode = useMathMode(course, docs.map((f) => study.files[fileKey(f)]));
  const missing = docs.filter((f) => !study.files[fileKey(f)] && !study.unreadable[fileKey(f)]);
  const withoutFormulas = mathMode.math ? docs.filter((f) => study.files[fileKey(f)] && !study.files[fileKey(f)]?.math) : [];

  const summarize = async (list: CourseFile[]) => {
    onError(null);
    const msg = await analyze(list.map(fileKey), course.name, mathMode.math, course);
    if (msg) onError(msg);
  };
  const ordered = [...weeks.filter((w) => w.kind === "week").reverse(), ...weeks.filter((w) => w.kind !== "week")];
  const shown = ordered.filter((w) => showHidden || !hidden.includes(w.key));

  return (
    <>
      <BackToStudy onBack={onBack} />
      <header className="flex flex-wrap items-center gap-4">
        <Swatch color={color} size={16} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[30px] font-bold leading-tight tracking-[-0.02em]">{course.name}</h1>
          <p className="mt-1 text-muted">
            {deckCards.length
              ? [
                  `${deckCards.filter(active).length} cards`,
                  todays.length ? `${todays.length} for today (about ${minutesFor(todays.length)} min)` : "nothing left for today",
                  `${Math.round(mastery(deckCards) * 100)}% learned`,
                  exam != null ? `exam ${inDays(exam)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : [course.fullName && course.fullName !== course.name ? course.fullName : null, exam != null ? `exam ${inDays(exam)}` : null].filter(Boolean).join(" · ") || "No cards yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="h-9 px-3.5"
            disabled={study.available === false || !docs.length}
            onClick={() => onNewSheet(course.id, weeks.filter((w) => w.current).map((w) => w.key))}
            title="Make a study sheet (PDF) from the weeks you choose"
          >
            <NotebookPen size={14} aria-hidden /> Study sheet
          </Button>
          <Button variant="primary" className="h-9 px-4" disabled={!todays.length} onClick={() => onStart(todays, { practice: false, size: 20, title: `${course.name} · today` })}>
            {todays.length ? `Learn today · ${todays.length}` : deckCards.length ? "All done for today" : "Learn today"}
          </Button>
          <Menu
            label={`More for ${course.name}`}
            items={[
              { label: "Practice all cards", disabled: !deckCards.some(active), onClick: () => onStart(deckCards.filter(active), { practice: true, size: 20, title: `${course.name} · practice` }) },
              { label: "New study sheet…", disabled: study.available === false, onClick: () => onNewSheet(course.id) },
              {
                label: "Export cards for Anki",
                disabled: !deckCards.length,
                onClick: async () => {
                  const msg = await exportAnki(course.name, deckCards.filter(active));
                  if (msg) onError(msg);
                },
              },
              { label: browse ? "Hide card list" : "Show all cards", disabled: !deckCards.length, onClick: () => setBrowse(!browse) },
              "sep",
              {
                label: `Math mode: ${mathMode.math ? "on" : "off"}`,
                hint: "Formulas in LaTeX, math card types",
                onClick: () => setMathMode(course.id, mathMode.math ? (mathMode.auto ? "off" : null) : mathMode.auto ? null : "on"),
              },
              ...(hidden.length ? [{ label: showHidden ? "Don’t show hidden weeks" : `Show hidden weeks (${hidden.length})`, onClick: () => setShowHidden(!showHidden) }] : []),
            ]}
          />
        </div>
      </header>

      {withoutFormulas.length > 0 && !study.job.running && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface px-4 py-3 text-[13px]">
          <Sigma size={16} className="shrink-0" style={{ color: tone(color, "ink") }} aria-hidden />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">{withoutFormulas.length} {withoutFormulas.length === 1 ? "file was" : "files were"} made without math mode.</strong>{" "}
            <span className="text-muted">Redo them for formulas and math cards (about {Math.max(1, Math.round((withoutFormulas.length * 55) / 2 / 60))} min).</span>
          </span>
          <Button onClick={() => void summarize(withoutFormulas)} disabled={study.available === false}>
            Redo with formulas
          </Button>
        </div>
      )}

      <Progress color={color} />

      {courseCards.length === 0 && docs.length > 0 && (
        <div className="rounded-[12px] bg-surface px-5 py-6">
          <h2 className="text-[15px] font-bold">No cards in this course yet</h2>
          <p className="mt-1 text-[13px] text-muted">
            Claude reads each file once: lectures become a summary with flashcards, exercise sheets get hints for every task. {docs.length} files take about{" "}
            {Math.max(1, Math.round((docs.length * (mathMode.math ? 55 : 20)) / 2 / 60))} min. You can keep using the app meanwhile.
          </p>
          <Button variant="primary" className="mt-4" onClick={() => void summarize(missing)} disabled={study.available === false || study.job.running}>
            <FileText size={14} aria-hidden /> Prepare {missing.length} files
          </Button>
        </div>
      )}

      {browse && deckCards.length > 0 && (
        <section aria-label="All cards">
          <h2 className="mb-1 text-[15px] font-bold">All cards</h2>
          <CardList cards={deckCards} colorOf={() => color} />
        </section>
      )}

      {deckCards.some(active) && <BoxLadder cards={deckCards} color={color} />}

      <CourseSheets course={course} weeks={visibleWeeks} math={mathMode.math} onError={onError} />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={(v) => setView(v as typeof view)}
          options={[
            { value: "weeks", label: "By week" },
            { value: "terms", label: `Glossary${termCount ? ` · ${termCount}` : ""}` },
            ...(formulaCount || mathMode.math ? [{ value: "formulas", label: `Formulas${formulaCount ? ` · ${formulaCount}` : ""}` }] : []),
          ]}
        />
      </div>

      {view !== "weeks" && <GlossaryPanel course={course} color={color} kind={view === "terms" ? "term" : "formula"} math={mathMode.math} />}

      <section aria-label="Weeks" className={`stagger flex flex-col gap-2.5 ${view === "weeks" ? "" : "hidden"}`}>
        <div className="flex items-baseline gap-2">
          <h2 className="flex-1 text-[17px] font-bold sr-only">By week</h2>
          {missing.length > 0 && courseCards.length > 0 && !study.job.running && (
            <button onClick={() => void summarize(missing)} disabled={study.available === false} className="text-[13px] font-semibold hover:underline" style={{ color: tone(color, "ink") }}>
              Prepare the other {missing.length} files
            </button>
          )}
        </div>
        {shown.map((w) => (
          <WeekCard
            key={w.key}
            week={w}
            course={course}
            color={color}
            cards={courseCards.filter((c) => keyOfWeek(w).has(c.path))}
            todays={todays.filter((c) => keyOfWeek(w).has(c.path))}
            hidden={hidden.includes(w.key)}
            onLearn={(pool, practice) => onStart(pool, { practice, size: 20, title: `${course.name} · ${weekLabel(w, false)}${practice ? " · practice" : ""}` })}
            onSheet={() => onNewSheet(course.id, [w.key])}
            onSummarize={(files) => void summarize(files)}
          />
        ))}
        {hidden.length > 0 && !showHidden && (
          <button onClick={() => setShowHidden(true)} className="self-start rounded-md px-1 text-[13px] text-muted hover:text-text">
            {hidden.length} hidden {hidden.length === 1 ? "week" : "weeks"} · Show
          </button>
        )}
      </section>
    </>
  );
}

/** Wo die Karten liegen: Neu und Fach 1–5 als Säulen (wächst beim Lernen nach rechts), ab Fach 3 „gelernt“. */
function BoxLadder({ cards, color, flat }: { cards: Card[]; color: CourseColor | null; flat?: boolean }) {
  const counts = boxes(cards);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts.slice(1)); // Fächer untereinander vergleichen; „Neu“ ist ein voller Stapel
  const learned = counts[3] + counts[4] + counts[5];
  const shown = useCountUp(learned);
  const solid = color ? tone(color) : "var(--text)";
  const labels = ["New", "Box 1", "Box 2", "Box 3", "Box 4", "Box 5"];
  const when = ["Not seen yet", "Comes back today", "Comes back in 1 day", "Comes back in 3 days", "Comes back in a week", "Comes back in 2 weeks"];
  return (
    <section aria-label="Where your cards are" className={`flex flex-wrap items-end gap-x-8 gap-y-3 ${flat ? "" : "rounded-[12px] bg-surface px-5 py-4"}`}>
      <div className="min-w-[180px] flex-1">
        <h2 className="text-[15px] font-bold">
          <span className="tabular-nums">{shown}</span> of {total} cards learned
        </h2>
        <p className="mt-0.5 max-w-[320px] text-[12px] text-muted">
          Each card moves up a box when you know it, and back to box 1 when you don’t. From box 3 on it counts as learned.
        </p>
      </div>
      <div className="flex items-end gap-2" role="list">
        {counts.map((n, k) => (
          <div key={k} role="listitem" className="flex w-[46px] flex-col items-center gap-1" title={`${labels[k]}: ${n} ${n === 1 ? "card" : "cards"}. ${when[k]}.`}>
            <span className="text-[12px] font-semibold tabular-nums">{n}</span>
            <span className="flex h-[48px] w-full items-end rounded-[6px] bg-sunken">
              <span
                className="grow-y block w-full rounded-[6px] transition-[height] duration-500"
                style={
                  {
                    // Wurzel-Skala, damit auch ein paar Karten in einem Fach sichtbar sind
                    height: !n ? "0%" : k === 0 ? "100%" : `${Math.max(12, Math.sqrt(n / max) * 100)}%`,
                    background: k === 0 ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${solid} 22%, transparent) 0 4px, transparent 4px 8px)` : solid,
                    opacity: k === 0 ? 1 : k < 3 ? 0.35 + k * 0.1 : 0.7 + (k - 3) * 0.15,
                    "--delay": `${120 + k * 60}ms`,
                  } as React.CSSProperties
                }
              />
            </span>
            <span className={`text-[11px] ${k >= 3 ? "font-semibold" : "text-muted"}`}>{labels[k]}</span>
          </div>
        ))}
      </div>
      <span className="sr-only">{total} cards</span>
    </section>
  );
}

/** Eine Woche im Study-Tab: Kopf mit Fortschritt und „Learn“, darunter die Dokumente mit Tag und Zusammenfassung/Lernhilfe. */
function WeekCard({
  week,
  course,
  color,
  cards,
  todays,
  hidden,
  onLearn,
  onSheet,
  onSummarize,
}: {
  week: Week;
  course: Course;
  color: CourseColor;
  cards: Card[];
  todays: Card[];
  hidden: boolean;
  onLearn: (pool: Card[], practice: boolean) => void;
  onSheet: () => void;
  onSummarize: (files: CourseFile[]) => void;
}) {
  const study = useStudy();
  const [open, setOpen] = useState(week.current);
  const [seen, setSeen] = useState(week.current); // erst nach dem ersten Aufklappen rendern, danach auf- und zuklappen
  const files = week.files.filter((x) => STUDY_FILE.test(x.file.name));
  const docs = files.filter((x) => isStudyDoc(x.type));
  const missing = docs.filter((x) => !study.files[fileKey(x.file)] && !study.unreadable[fileKey(x.file)]).map((x) => x.file);
  const act = cards.filter(active);
  const pct = Math.round(mastery(cards) * 100);
  const counts = new Map<string, number>();
  for (const x of docs) counts.set(DOC_LABEL[x.type], (counts.get(DOC_LABEL[x.type]) ?? 0) + 1);
  const plural = (l: string, n: number) => {
    const low = l.toLowerCase();
    return n === 1 || /(notes|info|data|study)$/.test(low) ? low : `${low}s`;
  };
  const what = [...counts.entries()].map(([l, n]) => `${n} ${plural(l, n)}`).join(", ");
  const started = act.some((c) => c.state?.box);

  return (
    <article className={`rounded-[12px] bg-surface ${hidden ? "opacity-60" : ""}`} style={week.current ? { boxShadow: `inset 3px 0 0 ${tone(color)}` } : undefined}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => {
            setOpen(!open);
            setSeen(true);
          }}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRight size={16} className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`} aria-hidden />
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[15px] font-bold">{week.kind === "week" ? `Week ${week.n}` : weekLabel(week)}</span>
              {week.kind === "week" && week.title && (
                <span className="min-w-0 truncate text-[15px] font-semibold" style={{ color: tone(color, "ink") }}>
                  {week.title}
                </span>
              )}
              {week.current && (
                <span className="rounded-full px-2 py-px text-[11px] font-bold" style={{ background: tone(color), color: "var(--on-solid)" }}>
                  This week
                </span>
              )}
              {hidden && <span className="text-[12px] font-semibold text-muted">hidden</span>}
            </span>
            <span className="block truncate text-[12px] text-muted">
              {[week.range, what || `${files.length} files`, act.length ? `${act.length} cards` : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </button>
        {started && (
          <span className="hidden w-[90px] shrink-0 sm:block" title={`${pct}% learned`}>
            <span className="block h-1.5 overflow-hidden rounded-full bg-sunken">
              <span className="grow-x block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(pct, 3)}%`, background: tone(color), "--delay": "200ms" } as React.CSSProperties} />
            </span>
            <span className="mt-0.5 block text-right text-[11px] text-muted">{pct}% learned</span>
          </span>
        )}
        <WeekSheetButton course={course} week={week} />
        {act.length > 0 ? (
          <Button className="h-8" onClick={() => (todays.length ? onLearn(todays, false) : onLearn(act, true))} title={todays.length ? "Today’s cards of this week" : "Nothing due, practice anyway"}>
            {todays.length ? `Learn · ${todays.length}` : "Practice"}
          </Button>
        ) : missing.length > 0 ? (
          <Button className="h-8" onClick={() => onSummarize(missing)} disabled={study.available === false || study.job.running}>
            Prepare
          </Button>
        ) : null}
        <Menu
          label={`More for ${weekLabel(week, false)}`}
          items={[
            { label: "Practice all cards of this week", disabled: !act.length, onClick: () => onLearn(act, true) },
            { label: "Custom study sheet for this week…", hint: "Choose parts, length and style", disabled: study.available === false || !docs.length, onClick: onSheet },
            { label: missing.length ? `Prepare ${missing.length} missing ${missing.length === 1 ? "file" : "files"}` : "All files prepared", disabled: !missing.length || study.job.running, onClick: () => onSummarize(missing) },
            "sep",
            hidden
              ? { label: "Show this week again", onClick: () => setWeekHidden(course.id, week.key, false) }
              : { label: "Hide this week", hint: "Its cards stop showing up in your reviews", onClick: () => setWeekHidden(course.id, week.key, true) },
          ]}
        />
      </div>
      {seen && (
        <div className="expand" data-open={open} inert={!open}>
        <ul className="border-t border-line-soft px-1.5 py-1">
          {files.map(({ file: f, folder }) => (
            <SummaryRow
              key={f.id}
              file={f}
              folder={folder}
              analysis={study.files[fileKey(f)] ?? null}
              unreadable={Boolean(study.unreadable[fileKey(f)])}
              color={color}
              busy={study.job.current.includes(f.name)}
              onSummarize={() => onSummarize([f])}
              disabled={study.available === false}
            />
          ))}
          {!files.length && <li className="px-3 py-2 text-[13px] text-muted">No PDFs this week.</li>}
        </ul>
        </div>
      )}
    </article>
  );
}

/** Knopf an jeder Woche: Einseiter mit einem Klick erstellen bzw. öffnen. */
function WeekSheetButton({ course, week }: { course: Course; week: Week }) {
  const study = useStudy();
  const mathMode = useMathMode(course, studyFiles(course).map((f) => study.files[fileKey(f)]));
  const existing = sheetFor(study.sheets, course.id, week.key);
  const docs = week.files.filter((x) => STUDY_FILE.test(x.file.name) && isStudyDoc(x.type));
  if (week.kind !== "week" || !docs.length) return null;
  return existing ? (
    <Button className="h-8" variant="plain" onClick={() => void openSheet(existing.id)} title={`Open “${existing.title}”`}>
      <FileText size={13} aria-hidden /> Sheet
    </Button>
  ) : (
    <Button
      className="h-8"
      variant="plain"
      disabled={study.available === false || study.sheetRun.running}
      onClick={() => void quickSheet(course, [week], { kind: "week", math: mathMode.math, subject: subjectOf(course, mathMode.math) })}
      title="Make a one-page study sheet for this week (PDF)"
    >
      <NotebookPen size={13} aria-hidden /> One-pager
    </Button>
  );
}

/** Lernzettel dieses Kurses auf einen Blick, dazu der Klausur-Spickzettel (ganzer Kurs, 2–3 Seiten) mit einem Klick. */
function CourseSheets({ course, weeks, math, onError }: { course: Course; weeks: Week[]; math: boolean; onError: (m: string | null) => void }) {
  const study = useStudy();
  const color = colorOf(course);
  const sheets = study.sheets.filter((s) => s.moduleId === course.id);
  const exam = sheetFor(study.sheets, course.id, null);
  const cur = weeks.find((w) => w.current)?.n ?? 99;
  const examWeeks = weeks.filter((w) => w.kind === "week" && (w.n ?? 0) <= cur);
  const open = async (id: string) => {
    const msg = await openSheet(id);
    if (msg) onError(msg);
  };
  return (
    <section aria-label="Study sheets of this course" className="flex flex-wrap items-center gap-2">
      {exam ? (
        <button onClick={() => void open(exam.id)} className="inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold" style={{ background: tone(color), color: "var(--on-solid)" }}>
          <GraduationCap size={14} aria-hidden /> Exam cheat sheet
        </button>
      ) : (
        <button
          disabled={study.available === false || study.sheetRun.running || !examWeeks.length}
          onClick={async () => {
            onError(null);
            const res = await quickSheet(course, examWeeks, { kind: "exam", math, subject: subjectOf(course, math) });
            if (res.error) onError(res.error);
          }}
          title="The most exam-relevant points of all weeks so far, on 2–3 pages"
          className="inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold disabled:opacity-40"
          style={{ background: tone(color, "soft"), color: tone(color, "ink"), boxShadow: `inset 0 0 0 1px ${tone(color)}` }}
        >
          <GraduationCap size={14} aria-hidden /> Make exam cheat sheet
        </button>
      )}
      {sheets
        .filter((s) => s.id !== exam?.id)
        .slice(0, 6)
        .map((s) => (
          <button key={s.id} onClick={() => void open(s.id)} title={s.title} className="inline-flex h-9 max-w-[260px] items-center gap-1.5 rounded-[10px] bg-surface px-3 text-[13px] hover:bg-hover">
            <FileText size={13} className="shrink-0 text-muted" aria-hidden />
            <span className="truncate">{s.title.replace(/^(Woche|Week) /, "W").replace(/:\s*/, " · ")}</span>
          </button>
        ))}
    </section>
  );
}

type MenuItem = { label: string; hint?: string; disabled?: boolean; onClick: () => void } | "sep";

/** „⋯“-Menü: weitere Aktionen, ohne die Oberfläche voll zu machen. */
function Menu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        if (e instanceof KeyboardEvent) e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-text"
      >
        <MoreHorizontal size={17} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-[250px] rounded-[10px] bg-surface p-1 shadow-[0_8px_30px_rgba(0,0,0,0.18),0_0_0_1px_var(--line)]">
          {items.map((it, i) =>
            it === "sep" ? (
              <div key={`sep${i}`} className="my-1 h-px bg-line-soft" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="block w-full rounded-[7px] px-2.5 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="block font-medium">{it.label}</span>
                {it.hint && <span className="block text-[11px] text-muted">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Wochen (und darin einzelne Dateien) auswählen. mode "cards": nur Dateien mit Karten; "sheet": alle lesbaren Dateien.
 * Schnellwahl: diese Woche, letzte 2 Wochen, bis jetzt.
 */
export function WeekPicker({
  course,
  weeks,
  picked,
  onChange,
  mode,
  cards = [],
}: {
  course: Course;
  weeks: Week[];
  picked: string[];
  onChange: (p: string[]) => void;
  mode: "cards" | "sheet";
  cards?: Card[];
}) {
  const study = useStudy();
  const color = colorOf(course);
  const [open, setOpen] = useState<string[]>([]);
  const eligible = (f: CourseFile) => STUDY_FILE.test(f.name) && (mode === "cards" ? Boolean(study.files[fileKey(f)]) : !study.unreadable[fileKey(f)]);
  const shown = weeks.map((w) => ({ w, files: w.files.map((x) => x.file).filter(eligible) })).filter((x) => x.files.length);
  const current = weeks.find((w) => w.current && w.kind === "week")?.n ?? null;
  const keysOf = (files: CourseFile[]) => files.map(fileKey);
  const set = (keys: string[], on: boolean) => onChange(on ? [...new Set([...picked, ...keys])] : picked.filter((k) => !keys.includes(k)));
  const quick = (pred: (w: Week) => boolean) => onChange(shown.filter((x) => pred(x.w)).flatMap((x) => keysOf(x.files)));
  const count = (files: CourseFile[]) => {
    const keys = new Set(keysOf(files));
    const list = cards.filter((c) => keys.has(c.path));
    return { total: list.filter(active).length, due: list.filter((c) => isDue(c, study.today)).length };
  };

  if (!shown.length)
    return (
      <p className="mt-3 text-[13px] text-muted">
        {mode === "cards" ? "Summarize some files first, then you can pick their weeks here." : "No readable PDFs in this course yet."}
      </p>
    );

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {current != null && (
          <QuickChip onClick={() => quick((w) => w.n === current)}>This week</QuickChip>
        )}
        {current != null && current > 1 && <QuickChip onClick={() => quick((w) => w.n != null && w.n >= current - 1 && w.n <= current)}>Last 2 weeks</QuickChip>}
        <QuickChip onClick={() => quick((w) => w.kind === "week" && (current == null || (w.n ?? 0) <= current))}>Everything so far</QuickChip>
        {picked.length > 0 && <QuickChip onClick={() => onChange([])}>Clear</QuickChip>}
      </div>
      <ul className="max-h-[340px] overflow-y-auto rounded-[10px] bg-sunken/60 p-1.5">
        {shown.map(({ w, files }) => {
          const keys = keysOf(files);
          const n = keys.filter((k) => picked.includes(k)).length;
          const all = n === keys.length;
          const isOpen = open.includes(w.key);
          const c = count(files);
          return (
            <li key={w.key} className="rounded-[8px]">
              <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-hover">
                <TriCheck checked={all} mixed={n > 0 && !all} color={color} onChange={() => set(keys, !all)} label={weekLabel(w)} />
                <button onClick={() => set(keys, !all)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{weekLabel(w)}</span>
                    {w.current && (
                      <span className="shrink-0 rounded-full px-1.5 text-[11px] font-semibold" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
                        this week
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {[w.range, `${files.length} ${files.length === 1 ? "file" : "files"}`, mode === "cards" ? `${c.total} cards${c.due ? ` · ${c.due} due` : ""}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <button
                  onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== w.key) : [...o, w.key]))}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? "Hide files" : "Show files"}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium text-muted hover:text-text"
                >
                  {n > 0 && !all ? `${n} of ${keys.length}` : isOpen ? "Hide" : "Files"}
                </button>
              </div>
              {isOpen && (
                <ul className="mb-1 ml-8 border-l border-line pl-2">
                  {w.files
                    .filter((x) => eligible(x.file))
                    .map((x) => {
                      const k = fileKey(x.file);
                      const on = picked.includes(k);
                      return (
                        <li key={x.file.id}>
                          <label className="flex cursor-default items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-hover">
                            <input type="checkbox" checked={on} onChange={() => set([k], !on)} className="size-3.5" style={{ accentColor: tone(color) }} />
                            {mode === "sheet" ? (
                              <span className="w-[92px] shrink-0 truncate text-[12px] font-semibold text-muted">{DOC_LABEL[x.type]}</span>
                            ) : (
                              <span className="w-[66px] shrink-0 text-[11px] font-semibold uppercase tracking-normal text-muted">{ROLE_LABEL[x.role]}</span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-[13px]">{displayName(x.file.name)}</span>
                            {mode === "sheet" && study.files[k]?.pages ? <span className="shrink-0 text-[12px] tabular-nums text-muted">{study.files[k]?.pages} p.</span> : null}
                          </label>
                        </li>
                      );
                    })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[12px] text-muted">
        {picked.length
          ? `${picked.length} ${picked.length === 1 ? "file" : "files"} from ${weeksText(shown.filter((x) => keysOf(x.files).some((k) => picked.includes(k))).map((x) => x.w))}`
          : "Tick whole weeks, or open a week to pick single files."}
      </p>
    </div>
  );
}

function QuickChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-7 rounded-full bg-sunken px-3 text-[12px] font-semibold hover:bg-hover">
      {children}
    </button>
  );
}

/** Kästchen mit drittem Zustand (ein Teil der Woche gewählt). */
function TriCheck({ checked, mixed, color, onChange, label }: { checked: boolean; mixed: boolean; color: CourseColor; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = mixed;
      }}
      onChange={onChange}
      aria-label={label}
      className="size-4 shrink-0"
      style={{ accentColor: tone(color) }}
    />
  );
}

function CardList({ cards, colorOf: colorFor }: { cards: Card[]; colorOf: (c: Card) => CourseColor }) {
  const [shown, setShown] = useState(60);
  return (
    <ul className="mt-2 rounded-[10px] bg-surface px-1.5 py-1">
      {cards.slice(0, shown).map((c) => {
        const hidden = !active(c);
        return (
          <li key={c.id} className={`flex items-start gap-3 border-b border-line-soft px-2.5 py-2 last:border-0 ${hidden ? "opacity-50" : ""}`}>
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: tone(colorFor(c)) }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">
                {c.type && c.type !== "concept" && <span className="mr-1.5 text-[11px] font-semibold text-muted">{TYPE_LABEL[c.type]}</span>}
                <MathText text={c.q} math={c.math} />
              </span>
              <span className="block text-[13px] text-muted">
                <MathText text={c.a} math={c.math} />
              </span>
            </span>
            <span className="shrink-0 text-[12px] text-muted">{hidden ? "hidden" : c.state?.box ? `box ${c.state.box}` : "new"}</span>
            <button
              onClick={() => void suspendCard(c.id, !hidden)}
              className="shrink-0 rounded p-1 text-muted hover:bg-hover hover:text-text"
              aria-label={hidden ? "Show this card again" : "Hide this card"}
              title={hidden ? "Show this card again" : "Hide this card"}
            >
              {hidden ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
            </button>
          </li>
        );
      })}
      {cards.length > shown && (
        <li className="px-2.5 py-2">
          <button onClick={() => setShown(shown + 100)} className="text-[13px] font-semibold text-[var(--focus)] hover:underline">
            Show {Math.min(100, cards.length - shown)} more
          </button>
        </li>
      )}
    </ul>
  );
}

// --- Lernzettel ---------------------------------------------------------------------

function SheetRunning() {
  const { sheetRun } = useStudy();
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!sheetRun.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sheetRun.running]);
  if (!sheetRun.running) return null;
  const secs = now && sheetRun.startedAt ? Math.max(0, Math.round((now - sheetRun.startedAt) / 1000)) : 0;
  const step = sheetRun.step === "pdf" ? "Making the PDF" : sheetRun.step === "reading" ? "Reading your files" : "Claude is writing";
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-surface px-4 py-3 text-[13px]" role="status">
      <Spinner />
      <span className="flex-1">
        <strong className="font-semibold">
          Writing your {sheetRun.kind === "study" ? "study sheet" : "cheat sheet"}
          {sheetRun.title ? ` for ${sheetRun.title}` : ""}
        </strong>
        <span className="text-muted">
          {" "}
          · {step} · usually {sheetRun.kind === "study" ? "2–5" : "1–2"} minutes{secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : ""}
        </span>
      </span>
      <span className="text-[12px] text-muted">It opens by itself when it’s ready.</span>
    </div>
  );
}

function Sheets({ courses, onNew, onError }: { courses: Course[]; onNew: () => void; onError: (m: string | null) => void }) {
  const study = useStudy();
  const byId = new Map(courses.map((c) => [c.id, c]));
  return (
    <section aria-label="Study sheets">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-[17px] font-bold">Study sheets</h2>
        <Button onClick={onNew} disabled={study.available === false || study.sheetRun.running || courses.length === 0}>
          <NotebookPen size={14} aria-hidden /> New sheet
        </Button>
      </div>
      {study.sheets.length === 0 ? (
        <button onClick={onNew} disabled={study.available === false} className="w-full rounded-[12px] border border-dashed border-line px-5 py-6 text-left hover:bg-hover">
          <span className="block font-semibold">Make a study sheet or a cheat sheet as a PDF</span>
          <span className="mt-1 block text-[13px] text-muted">
            A study sheet explains your lectures and tutorials and links them, with references to the slides. A cheat sheet fits a week on one page. Saved in your Uni folder.
          </span>
        </button>
      ) : (
        <ul className="stagger rounded-[12px] bg-surface px-1.5 py-1">
          {study.sheets.map((s) => {
            const c = byId.get(s.moduleId);
            const color: CourseColor = c ? colorOf(c) : "blue";
            const parts = s.parts?.length ?? s.sections?.length ?? 0;
            const date = new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return (
              <li key={s.id} className="group flex items-center gap-3 border-b border-line-soft px-2.5 py-2.5 last:border-0">
                <span className="relative grid h-10 w-8 shrink-0 place-items-end rounded-[4px] pb-1 text-[8px] font-bold text-white" style={{ background: tone(color) }} aria-hidden>
                  {s.kind === "study" ? <span className="absolute -right-1 -top-1 h-10 w-8 rounded-[4px] opacity-40" style={{ background: tone(color) }} /> : null}
                  <span className="relative">PDF</span>
                </span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={async () => {
                    const msg = await openSheet(s.id);
                    if (msg) onError(msg);
                  }}
                  title="Open the PDF"
                >
                  <span className="block truncate font-semibold">{s.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {[sheetKindLabel(s), c?.name ?? s.moduleName, date, `${s.files.length} ${s.files.length === 1 ? "file" : "files"}`, parts && s.kind === "study" ? `${parts} topics` : null, s.focus]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <Button
                  onClick={async () => {
                    const msg = await openSheet(s.id);
                    if (msg) onError(msg);
                  }}
                >
                  Open
                </Button>
                <button
                  onClick={() => void openSheet(s.id, true)}
                  className="rounded p-1.5 text-muted hover:bg-hover hover:text-text"
                  aria-label="Show in Finder"
                  title="Show in Finder"
                >
                  <FolderOpen size={15} aria-hidden />
                </button>
                <button
                  onClick={() => void deleteSheet(s.id)}
                  className="rounded p-1.5 text-muted opacity-60 hover:bg-hover hover:text-text group-hover:opacity-100"
                  aria-label="Delete study sheet"
                  title="Delete (the PDF goes to the Trash)"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** „Study sheet · 6 pages“ / „Cheat sheet · 1 page“ für Listen. */
function sheetKindLabel(s: { kind?: string; length?: string; pages?: number | null }) {
  if (s.kind === "study" || s.length === "study") return s.pages ? `Study sheet · ${s.pages} pages` : "Study sheet";
  if (s.kind === "exam") return "Exam cheat sheet";
  if (s.length === "short") return "Cheat sheet · 1 page";
  if (s.length === "exam") return "Cheat sheet · 2 pages";
  return "Study sheet";
}

const PREFS_KEY = "studi.sheetPrefs3"; // Lernzettel oder Spickzettel, Tiefe, Bausteine

function loadPrefs(): { include: Include; includeMath: Include; kind: SheetKind; depth: SheetDepth } {
  const fallback = { include: PRESETS[0].include, includeMath: MATH_PRESETS[2].include, kind: "study" as SheetKind, depth: "standard" as SheetDepth };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (raw && typeof raw === "object" && raw.include)
      return {
        include: { ...fallback.include, ...raw.include, summary: true },
        includeMath: { ...fallback.includeMath, ...(raw.includeMath ?? {}), summary: true },
        kind: raw.kind === "cheat" ? "cheat" : "study",
        depth: raw.depth === "essentials" || raw.depth === "deep" ? raw.depth : "standard",
      };
  } catch {
    // Browser-Speicher nicht verfügbar
  }
  return fallback;
}

type SheetKind = "study" | "cheat";

function NewSheet({
  courses,
  initialModule,
  initialPicked = [],
  onBack,
  onStarted,
  onError,
}: {
  courses: Course[];
  initialModule?: string;
  initialPicked?: string[];
  onBack: () => void;
  onStarted: () => void;
  onError: (m: string | null) => void;
}) {
  const study = useStudy();
  const [moduleId, setModuleId] = useState(initialModule ?? courses[0]?.id ?? "");
  const course = courses.find((c) => c.id === moduleId) ?? null;
  const color: CourseColor = course ? colorOf(course) : "blue";
  const [picked, setPicked] = useState<string[]>(initialPicked);
  const mathMode = useMathMode(course, course ? studyFiles(course).map((f) => study.files[fileKey(f)]) : []);
  const detected: Subject = course ? subjectOf(course, mathMode.math) : "business";
  const [subjectPick, setSubjectPick] = useState<Subject | null>(null);
  const subject = subjectPick ?? detected;
  const math = subject === "math";
  const SECTIONS = math ? MATH_SECTIONS : SHEET_SECTIONS;
  const PRESET_LIST = math ? MATH_PRESETS : PRESETS;
  const [prefs] = useState(loadPrefs);
  const [kind, setKind] = useState<SheetKind>(prefs.kind);
  const [depth, setDepth] = useState<SheetDepth>(prefs.depth);
  const [sheetTone, setSheetTone] = useState<SheetTone>(savedTone);
  const [includeText, setIncludeText] = useState<Include>(prefs.include);
  const [includeMath, setIncludeMath] = useState<Include>(prefs.includeMath);
  const include = math ? includeMath : includeText;
  const setInclude = (fn: Include | ((cur: Include) => Include)) => (math ? setIncludeMath : setIncludeText)(fn);
  const [focus, setFocus] = useState("");

  const weeks = useWeeks(course);
  const chosenWeeks = weeks.filter((w) => w.files.some((x) => picked.includes(fileKey(x.file))));
  const pickedFiles = weeks.flatMap((w) => w.files.filter((x) => picked.includes(fileKey(x.file))).map((x) => ({ ...x, week: w.kind === "week" ? w.n : null })));
  const matPages = materialPages(pickedFiles.map((x) => ({ pages: study.files[fileKey(x.file)]?.pages })));
  const studyPg = studyPages(matPages, depth);
  const cheatPg = cheatPages(chosenWeeks.length, matPages);
  const pages = kind === "study" ? studyPg : cheatPg;
  const preset = PRESET_LIST.find((p) => SECTIONS.every((s) => Boolean(p.include[s.key]) === Boolean(include[s.key])))?.id ?? null;
  const parentOf = math ? "practice" : "questions";
  const set = (k: keyof Include, v: boolean) =>
    setInclude((cur) => {
      const next = { ...cur, [k]: v, summary: true };
      if (k === parentOf && !v) next.answers = false;
      if (k === "answers" && v) next[parentOf] = true;
      return next;
    });
  const kinds = new Set(pickedFiles.map((x) => x.type));
  const mixed = kinds.size > 1;

  const submit = () => {
    if (!course) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ include: includeText, includeMath, kind, depth }));
    } catch {
      // egal
    }
    saveTone(sheetTone);
    onError(null);
    const weeksLabel = chosenWeeks.map((w) => (w.kind === "week" ? `Week ${w.n}${w.title ? ` (${w.title})` : ""}` : weekLabel(w))).join(", ");
    const common = {
      moduleId: course.id,
      moduleName: course.name,
      paths: picked,
      focus: focus.trim() || undefined,
      math,
      subject,
      tone: sheetTone,
      weeks: chosenWeeks.map((w) => w.key),
    };
    const job =
      kind === "study"
        ? createSheet({
            ...common,
            include,
            length: "study",
            kind: "study",
            pages: studyPg,
            context: weeksLabel,
            fileInfo: pickedFiles.map((x) => ({ path: fileKey(x.file), type: x.type, week: x.week })),
          })
        : createSheet({
            ...common,
            include: math ? QUICK_INCLUDE_MATH : QUICK_INCLUDE,
            length: cheatPg === 1 ? "short" : "exam",
            kind: "week",
            context: cheatPg === 1 ? weeksLabel : `${weeksLabel}. Make it a cheat sheet: only what is most likely to be asked`,
            fileInfo: pickedFiles.map((x) => ({ path: fileKey(x.file), type: x.type, week: x.week })),
          });
    void job.then((res) => {
      if (res.error) onError(res.error);
    });
    onStarted();
  };

  const minutes = kind === "study" ? Math.max(2, Math.round(0.7 + studyPg * 0.35)) : 1;
  const toneInfo = TONES.find((t) => t.id === sheetTone) ?? TONES[1];

  return (
    <>
      <button onClick={onBack} className="-ml-2 -mb-3 flex w-fit items-center gap-0.5 rounded-md px-2 py-1 text-[13px] font-semibold text-muted hover:bg-hover hover:text-text">
        <ChevronLeft size={15} aria-hidden /> Study
      </button>
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">New sheet</h1>
        <p className="mt-1 text-muted">Pick your material, Claude turns it into a PDF to learn from.</p>
      </header>

      <Step n={1} title="Course">
        <div className="flex flex-wrap gap-1.5">
          {courses.map((c) => (
            <ToggleChip
              key={c.id}
              on={c.id === moduleId}
              color={colorOf(c)}
              onClick={() => {
                setModuleId(c.id);
                setPicked([]);
                setSubjectPick(null);
              }}
            >
              {c.name}
            </ToggleChip>
          ))}
        </div>
      </Step>

      <Step n={2} title="Material">
        <p className="-mt-1 text-[13px] text-muted">Whole weeks, or open a week and pick files, e.g. the lecture and the tutorial slides. The sheet links them.</p>
        {course ? <WeekPicker course={course} weeks={weeks} picked={picked} onChange={setPicked} mode="sheet" /> : null}
      </Step>

      <Step n={3} title="What do you want to make?">
        <div role="radiogroup" aria-label="Kind of sheet" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <KindCard
            on={kind === "study"}
            color={color}
            onClick={() => setKind("study")}
            preview={<SheetPreview kind="study" pages={picked.length ? studyPg : 4} color={color} />}
            title="Study sheet"
            tagline="To understand it"
            text={"Every topic explained and linked across your files, with clickable references to the slides (“VL\u00a09\u00a0p.\u00a014”)."}
            meta={picked.length ? `About ${studyPg} pages · from ${matPages} pages of material` : "Grows with the material you pick"}
          />
          <KindCard
            on={kind === "cheat"}
            color={color}
            onClick={() => setKind("cheat")}
            preview={<SheetPreview kind="cheat" pages={picked.length ? cheatPg : 1} color={color} />}
            title="Cheat sheet"
            tagline="To revise it fast"
            text="Only what the exam asks, dense in two columns: terms, tables, traps and exam questions. Great the night before."
            meta={picked.length ? `${cheatPg} ${cheatPg === 1 ? "page" : "pages"}${cheatPg === 2 ? " · more than two weeks" : ""}` : "1 page per week, 2 for more"}
          />
        </div>
        {kind === "study" && picked.length > 0 && !mixed && (
          <p className="mt-2 text-[12px] text-muted">Tip: add the tutorial or exercise slides of the same week, then the sheet shows how they connect to the lecture.</p>
        )}
      </Step>

      <Step n={4} title="Style">
        <p className="mb-1.5 text-[12px] font-semibold text-muted">Writing</p>
        <div role="radiogroup" aria-label="Writing style" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TONES.map((t) => {
            const onIt = sheetTone === t.id;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={onIt}
                onClick={() => setSheetTone(t.id)}
                className={`rounded-[10px] px-3 py-2.5 text-left transition-colors ${onIt ? "" : "bg-sunken/60 hover:bg-hover"}`}
                style={onIt ? { background: tone(color, "soft"), boxShadow: `inset 0 0 0 1.5px ${tone(color)}` } : undefined}
              >
                <span className="block text-[13px] font-semibold" style={onIt ? { color: tone(color, "ink") } : undefined}>
                  {t.label}
                </span>
                <span className="block text-[12px] text-muted">{t.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Sounds like: <span className="italic text-text">“{toneInfo.sample}”</span>
        </p>
        {course && (
          <div className="mt-4">
            <p className="mb-1.5 text-[12px] font-semibold text-muted">Subject · decides the kind of diagrams and sections</p>
            <div className="flex flex-wrap gap-1.5">
              {SUBJECTS.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setSubjectPick(x.id)}
                  aria-pressed={subject === x.id}
                  title={x.hint}
                  className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${subject === x.id ? "" : "bg-sunken hover:bg-hover"}`}
                  style={subject === x.id ? { background: tone(color, "soft"), color: tone(color, "ink"), boxShadow: `inset 0 0 0 1.5px ${tone(color)}` } : undefined}
                >
                  {x.label}
                  {x.id === detected && subjectPick == null ? <span className="ml-1 opacity-60">auto</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </Step>

      {kind === "study" ? (
        <Step n={5} title="What should be in it?">
          <p className="mb-1.5 text-[12px] font-semibold text-muted">Start from a template, then switch parts on or off</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_LIST.map((p) => (
              <button
                key={p.id}
                onClick={() => setInclude(p.include)}
                aria-pressed={preset === p.id}
                className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${preset === p.id ? "bg-accent text-on-accent" : "bg-sunken hover:bg-hover"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.map((s) => {
              const onIt = Boolean(include[s.key]);
              const locked = "fixed" in s && s.fixed;
              return (
                <li key={s.key}>
                  <button
                    onClick={() => !locked && set(s.key, !onIt)}
                    aria-pressed={onIt}
                    disabled={locked}
                    className={`flex h-full w-full items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors ${onIt ? "" : "bg-sunken/60 hover:bg-hover"}`}
                    style={onIt ? { background: tone(color, "soft"), boxShadow: `inset 0 0 0 1.5px ${tone(color)}` } : undefined}
                  >
                    <span
                      className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px]"
                      style={onIt ? { background: tone(color), color: "var(--on-solid)" } : { boxShadow: "inset 0 0 0 1.5px var(--muted)" }}
                      aria-hidden
                    >
                      {onIt && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold" style={onIt ? { color: tone(color, "ink") } : undefined}>
                        {s.label}
                        {locked && <span className="ml-1 font-normal text-muted">always</span>}
                      </span>
                      <span className="block text-[12px] text-muted">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mb-1.5 mt-5 text-[12px] font-semibold text-muted">How deep</p>
          <Segmented
            value={depth}
            onChange={(v) => setDepth(v as SheetDepth)}
            options={[
              { value: "essentials", label: `Essentials${picked.length ? ` · ${studyPages(matPages, "essentials")} p.` : ""}` },
              { value: "standard", label: `Standard${picked.length ? ` · ${studyPages(matPages, "standard")} p.` : ""}` },
              { value: "deep", label: `In depth${picked.length ? ` · ${studyPages(matPages, "deep")} p.` : ""}` },
            ]}
          />
          <FocusInput value={focus} onChange={setFocus} />
        </Step>
      ) : (
        <Step n={5} title="Focus">
          <p className="-mt-1 text-[13px] text-muted">A cheat sheet picks its own parts so it fits: key terms, tables, traps and likely exam questions{math ? ", formulas and recipes" : ""}.</p>
          <FocusInput value={focus} onChange={setFocus} />
        </Step>
      )}

      <div className="sticky bottom-0 -mx-2 flex items-center gap-3 rounded-[12px] bg-bg/90 px-2 py-3 backdrop-blur">
        <span className="flex-1 text-[12px] text-muted">
          {picked.length ? (
            <>
              <strong className="font-semibold text-text">
                {kind === "study" ? "Study sheet" : "Cheat sheet"} · {kind === "study" ? "about " : ""}
                {pages} {pages === 1 ? "page" : "pages"} · {toneInfo.label}
              </strong>{" "}
              · takes about {minutes} {minutes === 1 ? "minute" : "minutes"}, the PDF opens by itself.
            </>
          ) : (
            "Pick some material first."
          )}
        </span>
        <Button variant="plain" onClick={onBack}>
          Cancel
        </Button>
        <Button variant="primary" className="h-10 px-4 text-[14px]" disabled={!course || picked.length === 0 || study.sheetRun.running} onClick={submit}>
          <NotebookPen size={15} aria-hidden /> Create PDF
        </Button>
      </div>
    </>
  );
}

function FocusInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Focus (optional), e.g. “Zuschlagskalkulation” or “only the UML parts”"
      aria-label="Focus (optional)"
      className="mt-3 h-9 w-full rounded-lg bg-sunken px-3 text-[13px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--focus)]"
    />
  );
}

function KindCard({
  on,
  color,
  onClick,
  preview,
  title,
  tagline,
  text,
  meta,
}: {
  on: boolean;
  color: CourseColor;
  onClick: () => void;
  preview: React.ReactNode;
  title: string;
  tagline: string;
  text: string;
  meta: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex items-stretch gap-4 rounded-[12px] p-3.5 text-left transition-colors ${on ? "" : "bg-sunken/60 hover:bg-hover"}`}
      style={on ? { background: tone(color, "soft"), boxShadow: `inset 0 0 0 1.5px ${tone(color)}` } : undefined}
    >
      <span className="grid w-[112px] shrink-0 place-items-center rounded-[8px] bg-sunken py-1.5" aria-hidden>
        {preview}
      </span>
      <span className="flex min-w-0 flex-col py-0.5">
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold" style={on ? { color: tone(color, "ink") } : undefined}>
            {title}
          </span>
          <span className="text-[12px] text-muted">{tagline}</span>
        </span>
        <span className="mt-1 text-[13px] leading-snug text-muted">{text}</span>
        <span className="mt-auto pt-2 text-[12px] font-semibold" style={{ color: on ? tone(color, "ink") : "var(--text)" }}>
          {meta}
        </span>
      </span>
    </button>
  );
}

/** Kleine Seitenansicht: Lernzettel als Stapel (mehr Material = mehr Blätter), Spickzettel als dichte Seite in zwei Spalten. */
function SheetPreview({ kind, pages, color }: { kind: SheetKind; pages: number; color: CourseColor }) {
  const c = tone(color);
  // Papier ist immer weiß (wie das PDF), auch im Dunkelmodus: helle Tönung statt der dunklen „soft“-Farbe
  const soft = `color-mix(in srgb, ${c} 18%, white)`;
  const ink = "#6b7480";
  const paper = "#ffffff";
  const edge = "#cfd5dd";
  const back = kind === "study" ? Math.min(3, Math.max(0, Math.ceil(pages / 3))) : pages > 1 ? 1 : 0;
  const W = 62;
  const H = 84;
  const x0 = 14;
  const y0 = 12;
  const line = (x: number, y: number, w: number, o = 0.28) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1.6} rx={0.8} fill={ink} opacity={o} />;
  return (
    <svg viewBox="0 0 96 112" width={96} height={112} role="img" aria-label={kind === "study" ? `${pages} pages` : `${pages} page`}>
      {Array.from({ length: back }, (_, i) => back - i).map((k) => (
        <rect key={k} x={x0 + k * 4} y={y0 - k * 3.5} width={W} height={H} rx={2.5} fill={paper} stroke={edge} strokeWidth={0.8} opacity={1 - k * 0.12} />
      ))}
      <rect x={x0} y={y0} width={W} height={H} rx={2.5} fill={paper} stroke={edge} strokeWidth={0.8} />
      {kind === "study" ? (
        <g>
          <rect x={x0 + 6} y={y0 + 6} width={34} height={3.4} rx={1} fill={c} />
          <rect x={x0 + 6} y={y0 + 11.5} width={W - 12} height={0.8} fill={c} opacity={0.7} />
          {/* Roter Faden: kleine Tabelle */}
          <rect x={x0 + 6} y={y0 + 15} width={W - 12} height={13} rx={1} fill={soft} />
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x={x0 + 8} y={y0 + 17.5 + r * 3.6} width={10} height={1.4} rx={0.7} fill={c} opacity={0.8} />
              <rect x={x0 + 21} y={y0 + 17.5 + r * 3.6} width={8} height={1.4} rx={0.7} fill={ink} opacity={0.35} />
              <rect x={x0 + 32} y={y0 + 17.5 + r * 3.6} width={18} height={1.4} rx={0.7} fill={ink} opacity={0.25} />
            </g>
          ))}
          <rect x={x0 + 6} y={y0 + 32} width={22} height={2.4} rx={1} fill={c} opacity={0.9} />
          {line(x0 + 6, y0 + 37, 48)}
          {line(x0 + 6, y0 + 40.5, 44)}
          {line(x0 + 6, y0 + 44, 30)}
          <rect x={x0 + 38} y={y0 + 43.2} width={12} height={3.2} rx={1.2} fill={soft} stroke={c} strokeWidth={0.6} />
          {/* Diagramm */}
          <rect x={x0 + 10} y={y0 + 51} width={14} height={8} rx={1.5} fill="none" stroke={c} strokeWidth={0.9} />
          <rect x={x0 + 36} y={y0 + 51} width={14} height={8} rx={1.5} fill="none" stroke={c} strokeWidth={0.9} />
          <path d={`M${x0 + 24} ${y0 + 55} H${x0 + 36}`} stroke={c} strokeWidth={0.9} />
          {line(x0 + 6, y0 + 64, 50)}
          {line(x0 + 6, y0 + 67.5, 46)}
          {line(x0 + 6, y0 + 71, 38)}
          <rect x={x0 + 46} y={y0 + 70.2} width={10} height={3.2} rx={1.2} fill={soft} stroke={c} strokeWidth={0.6} />
          {line(x0 + 6, y0 + 74.5, 42)}
        </g>
      ) : (
        <g>
          <rect x={x0 + 5} y={y0 + 5} width={30} height={2.8} rx={1} fill={c} />
          <rect x={x0 + 5} y={y0 + 9.5} width={W - 10} height={0.6} fill={c} opacity={0.7} />
          <rect x={x0 + W / 2 - 0.3} y={y0 + 13} width={0.6} height={H - 18} fill={edge} />
          {[0, 1].map((col) => {
            const cx = x0 + 5 + col * (W / 2 - 2.5);
            const cw = W / 2 - 7.5;
            return (
              <g key={col}>
                {[0, 1, 2].map((blk) => {
                  const by = y0 + 13 + blk * 22;
                  return (
                    <g key={blk}>
                      <rect x={cx} y={by} width={cw * 0.55} height={1.8} rx={0.8} fill={c} opacity={0.9} />
                      {(col + blk) % 2 === 0 ? (
                        <rect x={cx} y={by + 3.5} width={cw} height={7} rx={1} fill={soft} />
                      ) : (
                        <>
                          {line(cx, by + 4, cw, 0.3)}
                          {line(cx, by + 6.6, cw * 0.85, 0.3)}
                        </>
                      )}
                      {line(cx, by + 12.5, cw * 0.9, 0.3)}
                      {line(cx, by + 15.1, cw * 0.75, 0.3)}
                      {line(cx, by + 17.7, cw * 0.95, 0.3)}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

function HowItWorks() {
  const steps = [
    { icon: <FileText size={16} aria-hidden />, title: "Claude reads your slides", text: "Pick a course. Each file becomes a short summary and about 10 flashcards. Takes a few minutes, once." },
    { icon: <Layers size={16} aria-hidden />, title: "Learn a little every day", text: `Up to ${NEW_PER_DAY} new cards a day. Cards you know come back later, the others again today.` },
    { icon: <NotebookPen size={16} aria-hidden />, title: "Before the exam", text: "Practice only some lectures, or make a PDF study sheet with exactly the parts you want." },
  ];
  return (
    <section aria-label="How it works" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {steps.map((s, i) => (
        <div key={s.title} className="rounded-[12px] bg-surface p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold">
            <span className="grid size-7 place-items-center rounded-full bg-sunken text-muted">{s.icon}</span>
            {i + 1}. {s.title}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">{s.text}</p>
        </div>
      ))}
    </section>
  );
}

// --- kleine Bausteine -------------------------------------------------------------

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-bold">
        <span className="grid size-6 place-items-center rounded-full bg-sunken text-[12px] font-bold text-muted">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Segmented({ value, onChange, options, className = "" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  const { host, thumb } = useSlidingThumb([value, options.map((o) => o.label).join("|")], '[aria-checked="true"]');
  return (
    <div ref={host} role="radiogroup" className={`relative inline-flex flex-wrap gap-1 rounded-[10px] bg-sunken p-1 ${className}`}>
      <span ref={thumb} className="seg-thumb" aria-hidden />
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative h-7 rounded-[7px] px-3 text-[13px] font-medium transition-colors ${value === o.value ? "" : "text-muted hover:text-text"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleChip({
  on,
  color,
  onClick,
  disabled,
  small,
  children,
}: {
  on: boolean;
  color: CourseColor;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-40 ${small ? "h-7 px-2.5 text-[12px]" : "h-8 px-3.5 text-[13px]"} ${on ? "" : "bg-sunken hover:bg-hover"}`}
      style={on ? { background: tone(color, "soft"), color: tone(color, "ink"), boxShadow: `inset 0 0 0 1.5px ${tone(color)}` } : undefined}
    >
      {on ? <Check size={12} strokeWidth={3} aria-hidden /> : <Swatch color={color} size={8} />}
      {children}
    </button>
  );
}

