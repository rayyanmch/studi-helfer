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
import { Button, Spinner, Swatch, colorOf, inDays, tone } from "./ui";
import { displayName } from "./files";
import { ErrorNotice, NoClaude, Progress, Review, SummaryRow, TYPE_LABEL } from "./StudyView";
import { DOC_LABEL, isStudyDoc } from "@/lib/doctype";
import { MathText } from "./MathText";
import { setMathMode, useMathMode } from "@/lib/subject";
import type { Course, CourseColor, CourseFile } from "@/lib/mock-data";
import { useApp } from "@/lib/app-store";
import {
  type Card,
  type Include,
  type SheetLength,
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
  hiddenWeeksOf,
  minutesFor,
} from "@/lib/study";
import { type Week, ROLE_LABEL, weekLabel, weeksOf } from "@/lib/weeks";

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
    return t ? (t.screen === "deck" ? { kind: "deck", moduleId: t.moduleId } : { kind: "new-sheet", moduleId: t.moduleId }) : { kind: "home" };
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStudy(pathsKey ? pathsKey.split("\n") : []);
  }, [pathsKey]);

  // Sprung aus der Kursseite, während der Tab schon offen ist
  useEffect(() => {
    const onOpen = () => {
      const t = takeTarget();
      if (t) setScreen(t.screen === "deck" ? { kind: "deck", moduleId: t.moduleId } : { kind: "new-sheet", moduleId: t.moduleId });
    };
    window.addEventListener("studi:open-study", onOpen);
    return () => window.removeEventListener("studi:open-study", onOpen);
  }, []);

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
    <div className="flex flex-col gap-6">
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
          {study.stats.today > 0 && <span>· {study.stats.today} reviewed today</span>}
          {study.stats.streak > 1 && (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--c-orange-ink)]">
              <Flame size={14} aria-hidden /> {study.stats.streak}-day streak
            </span>
          )}
        </p>
      </header>

      <Progress color="blue" />
      <SheetRunning />

      {/* Heute */}
      <section aria-label="Today" className="overflow-hidden rounded-[14px] bg-surface">
        <div className="flex flex-wrap items-center gap-5 p-5">
          <div className="grid size-14 shrink-0 place-items-center rounded-[12px] bg-accent text-on-accent">
            <Shuffle size={24} aria-hidden />
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
      </section>

      {!anyCards && <HowItWorks />}

      <CatchUp courses={courses} onDeck={onDeck} />

      {/* Karteikästen */}
      <section aria-label="Card boxes">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="flex-1 text-[17px] font-bold">Card boxes</h2>
          <span className="text-[12px] text-muted">Open a box to learn single weeks</span>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

/** Kurse mit mindestens zwei vergangenen Wochen, die noch nicht als „reviewed“ markiert sind (Kursseite, Haken je Woche). */
function CatchUp({ courses, onDeck }: { courses: Course[]; onDeck: (id: string) => void }) {
  const app = useApp();
  useReviewedWeeks(null);
  useHiddenWeeks(null);
  const behind = courses
    .map((c) => {
      const weeks = weeksOf(c, { today: app.today || new Date().toISOString().slice(0, 10) });
      const cur = weeks.find((w) => w.current && w.kind === "week")?.n;
      const done = reviewedWeeksOf(c.id);
      const hidden = hiddenWeeksOf(c.id);
      const open = cur == null ? [] : weeks.filter((w) => w.kind === "week" && (w.n ?? 0) < cur && !done.includes(w.key) && !hidden.includes(w.key));
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

function BoxTile({
  title,
  subtitle,
  cards,
  today,
  colors,
  exam,
  files,
  onOpen,
}: {
  title: string;
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
      className="group flex h-full w-full flex-col rounded-[12px] bg-surface p-4 text-left transition-[box-shadow,transform] hover:shadow-[inset_0_0_0_1.5px_var(--ring)] active:scale-[0.99]"
      style={{ "--ring": mixed ? "var(--text)" : tone(color) } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-[10px]"
          style={
            mixed
              ? { background: `conic-gradient(${colors.map((c, i) => `${tone(c)} ${(i / colors.length) * 360}deg ${((i + 1) / colors.length) * 360}deg`).join(",")})`, color: "white" }
              : { background: tone(color, "soft"), color: tone(color, "ink") }
          }
        >
          {mixed ? <Shuffle size={17} aria-hidden /> : <Layers size={17} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{title}</span>
          <span className="block truncate text-[12px] text-muted">{subtitle ?? (act.length ? `${act.length} cards` : "")}</span>
        </span>
        {due > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: mixed ? "var(--accent)" : tone(color), color: mixed ? "var(--on-accent)" : "var(--on-solid)" }}>
            {due} due
          </span>
        )}
      </div>

      {act.length > 0 ? (
        <>
          <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            {counts.slice(1).map((n, i) =>
              n ? <div key={i} style={{ width: `${(n / act.length) * 100}%`, background: mixed ? "var(--text)" : tone(color), opacity: 0.25 + i * 0.18 }} /> : null,
            )}
          </div>
          <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
            <span>{pct}% learned</span>
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

      <section aria-label="Weeks" className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="flex-1 text-[17px] font-bold">By week</h2>
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
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronRight size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
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
              <span className="block h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%`, background: tone(color) }} />
            </span>
            <span className="mt-0.5 block text-right text-[11px] text-muted">{pct}% learned</span>
          </span>
        )}
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
            { label: "Study sheet for this week…", disabled: study.available === false || !docs.length, onClick: onSheet },
            { label: missing.length ? `Prepare ${missing.length} missing ${missing.length === 1 ? "file" : "files"}` : "All files prepared", disabled: !missing.length || study.job.running, onClick: () => onSummarize(missing) },
            "sep",
            hidden
              ? { label: "Show this week again", onClick: () => setWeekHidden(course.id, week.key, false) }
              : { label: "Hide this week", hint: "Its cards stop showing up in your reviews", onClick: () => setWeekHidden(course.id, week.key, true) },
          ]}
        />
      </div>
      {open && (
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
      )}
    </article>
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
                            <span className="w-[66px] shrink-0 text-[11px] font-semibold uppercase tracking-normal text-muted">{ROLE_LABEL[x.role]}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px]">{displayName(x.file.name)}</span>
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
        <strong className="font-semibold">Writing your study sheet{sheetRun.title ? ` for ${sheetRun.title}` : ""}</strong>
        <span className="text-muted">
          {" "}
          · {step} · usually 1–3 minutes{secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : ""}
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
          <NotebookPen size={14} aria-hidden /> New study sheet
        </Button>
      </div>
      {study.sheets.length === 0 ? (
        <button onClick={onNew} disabled={study.available === false} className="w-full rounded-[12px] border border-dashed border-line px-5 py-6 text-left hover:bg-hover">
          <span className="block font-semibold">Make your own study guide as a PDF</span>
          <span className="mt-1 block text-[13px] text-muted">
            Pick lectures and choose what goes in: summaries, explanations, analogies, examples, review questions and more. Saved in your Uni folder.
          </span>
        </button>
      ) : (
        <ul className="rounded-[12px] bg-surface px-1.5 py-1">
          {study.sheets.map((s) => {
            const c = byId.get(s.moduleId);
            const color: CourseColor = c ? colorOf(c) : "blue";
            const parts = s.parts?.length ?? s.sections?.length ?? 0;
            const date = new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return (
              <li key={s.id} className="group flex items-center gap-3 border-b border-line-soft px-2.5 py-2.5 last:border-0">
                <span className="relative grid h-10 w-8 shrink-0 place-items-end rounded-[4px] pb-1 text-[8px] font-bold text-white" style={{ background: tone(color) }} aria-hidden>
                  PDF
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
                    {[c?.name ?? s.moduleName, date, `${s.files.length} ${s.files.length === 1 ? "file" : "files"}`, parts ? `${parts} parts` : null, s.focus]
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

const PREFS_KEY = "studi.sheetPrefs";

function loadPrefs(): { include: Include; includeMath: Include; length: SheetLength } {
  const fallback = { include: PRESETS[0].include, includeMath: MATH_PRESETS[1].include, length: "normal" as SheetLength };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (raw && typeof raw === "object" && raw.include)
      return {
        include: { ...fallback.include, ...raw.include, summary: true },
        includeMath: { ...fallback.includeMath, ...(raw.includeMath ?? {}), summary: true },
        length: raw.length ?? "normal",
      };
  } catch {
    // Browser-Speicher nicht verfügbar
  }
  return fallback;
}

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
  const math = mathMode.math;
  const SECTIONS = math ? MATH_SECTIONS : SHEET_SECTIONS;
  const PRESET_LIST = math ? MATH_PRESETS : PRESETS;
  const [prefs] = useState(loadPrefs);
  const [includeText, setIncludeText] = useState<Include>(prefs.include);
  const [includeMath, setIncludeMath] = useState<Include>(prefs.includeMath);
  const include = math ? includeMath : includeText;
  const setInclude = (fn: Include | ((cur: Include) => Include)) => (math ? setIncludeMath : setIncludeText)(fn);
  const [length, setLength] = useState<SheetLength>(prefs.length);
  const [focus, setFocus] = useState("");

  const weeks = useWeeks(course);
  const chosenWeeks = weeks.filter((w) => w.files.some((x) => picked.includes(fileKey(x.file))));
  const preset = PRESET_LIST.find((p) => SECTIONS.every((s) => Boolean(p.include[s.key]) === Boolean(include[s.key])))?.id ?? null;
  const parentOf = math ? "practice" : "questions";
  const set = (k: keyof Include, v: boolean) =>
    setInclude((cur) => {
      const next = { ...cur, [k]: v, summary: true };
      if (k === parentOf && !v) next.answers = false;
      if (k === "answers" && v) next[parentOf] = true;
      return next;
    });

  const submit = () => {
    if (!course) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ include: includeText, includeMath, length }));
    } catch {
      // egal
    }
    onError(null);
    const context = chosenWeeks
      .map((w) => (w.kind === "week" ? `Week ${w.n}${w.title ? ` (${w.title})` : ""}` : weekLabel(w)))
      .join(", ");
    void createSheet({ moduleId: course.id, moduleName: course.name, paths: picked, focus: focus.trim() || undefined, include, length, context, math }).then((res) => {
      if (res.error) onError(res.error);
    });
    onStarted();
  };

  const sizeHint = picked.length > 10 ? "That’s a lot. Claude uses the saved summaries for some files, so the sheet stays readable." : null;

  return (
    <>
      <button onClick={onBack} className="-ml-2 -mb-3 flex w-fit items-center gap-0.5 rounded-md px-2 py-1 text-[13px] font-semibold text-muted hover:bg-hover hover:text-text">
        <ChevronLeft size={15} aria-hidden /> Study
      </button>
      <header>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">New study sheet</h1>
        <p className="mt-1 text-muted">A PDF study guide made from your lectures, with exactly the parts you want.</p>
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
              }}
            >
              {c.name}
            </ToggleChip>
          ))}
        </div>
      </Step>

      <Step n={2} title="Which weeks?">
        {course ? <WeekPicker course={course} weeks={weeks} picked={picked} onChange={setPicked} mode="sheet" /> : null}
        {sizeHint && <p className="mt-1 text-[12px] text-muted">{sizeHint}</p>}
      </Step>

      <Step n={3} title="What should be in it?">
        {course && (
          <p className="-mt-1 mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <button
              onClick={() => setMathMode(course.id, math ? (mathMode.auto ? "off" : null) : mathMode.auto ? null : "on")}
              aria-pressed={math}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-semibold transition-colors ${math ? "" : "bg-sunken hover:text-text"}`}
              style={math ? { background: tone(color, "soft"), color: tone(color, "ink") } : undefined}
            >
              <Sigma size={13} aria-hidden /> Math mode {math ? "on" : "off"}
            </button>
            {math ? "Formulas in LaTeX, definitions and theorems in boxes, worked examples step by step." : "For courses with formulas, turn on math mode."}
          </p>
        )}
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
      </Step>

      <Step n={4} title="Length and focus">
        <Segmented
          value={length}
          onChange={(v) => setLength(v as SheetLength)}
          options={[
            { value: "short", label: "Short · 2–3 pages" },
            { value: "normal", label: "Normal · 4–7 pages" },
            { value: "detailed", label: "Detailed · 8+ pages" },
          ]}
        />
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Focus (optional), e.g. “only what the exam needs” or “Zuschlagskalkulation”"
          className="mt-3 h-9 w-full rounded-lg bg-sunken px-3 text-[13px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--focus)]"
        />
      </Step>

      <div className="sticky bottom-0 -mx-2 flex items-center gap-3 rounded-[12px] bg-bg/90 px-2 py-3 backdrop-blur">
        <span className="flex-1 text-[12px] text-muted">
          Takes 1–3 minutes. You can keep using the app; the PDF opens by itself and is saved in your Uni folder under “Study sheets”.
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
  return (
    <div role="radiogroup" className={`inline-flex flex-wrap gap-1 rounded-[10px] bg-sunken p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-[7px] px-3 text-[13px] font-medium transition-colors ${value === o.value ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-muted hover:text-text"}`}
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

