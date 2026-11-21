"use client";

// Study-Tab (Seitenleiste „Study“): Karteikästen je Modul und ein gemischter Kasten für alles,
// gezielt einzelne Vorlesungen oder Themen lernen, Lernzettel als PDF mit wählbaren Bausteinen.
// Daten aus @/lib/study (Mac-App: desktop/lib/study.js), Abfrage und Zusammenfassungen aus StudyView.tsx.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Download,
  Eye,
  EyeOff,
  FileText,
  Flame,
  FolderOpen,
  GraduationCap,
  Layers,
  NotebookPen,
  Shuffle,
  Trash2,
} from "lucide-react";
import { Button, Spinner, Swatch, colorOf, inDays, tone } from "./ui";
import { displayName } from "./files";
import { ErrorNotice, NoClaude, Progress, Review, SummaryList } from "./StudyView";
import type { Course, CourseColor, CourseFile } from "@/lib/mock-data";
import { realCourses, useApp } from "@/lib/app-store";
import {
  type Card,
  type Include,
  type SheetLength,
  NEW_PER_DAY,
  PRESETS,
  SHEET_SECTIONS,
  active,
  allCards,
  analyze,
  boxes,
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
} from "@/lib/study";

/** Module dieses Semesters mit lernbaren Dateien. */
function useStudyCourses() {
  const app = useApp();
  return useMemo(() => realCourses(app.courses).filter((c) => c.semester !== "past" && studyFiles(c).length > 0), [app.courses]);
}

/** Anzahl fälliger Karten für die Seitenleiste (lädt den Lernstand einmal beim Start). */
export function useStudyDue() {
  const study = useStudy();
  const courses = useStudyCourses();
  const key = courses.flatMap((c) => studyFiles(c).map(fileKey)).join("\n");
  useEffect(() => {
    if (key) void loadStudy(key.split("\n"));
  }, [key]);
  return todaysSet(allCards(courses, study), study.today, study.stats).all.length;
}

type Screen =
  | { kind: "home" }
  | { kind: "deck"; moduleId: string } // "all" = alle Module gemischt
  | { kind: "review"; cards: Card[]; rest: Card[]; practice: boolean; title: string; back: Screen }
  | { kind: "new-sheet"; moduleId?: string };

const SESSION_SIZES = [10, 20, 50, 0] as const; // 0 = alle

export function StudyHub() {
  const study = useStudy();
  const courses = useStudyCourses();
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
          onNewSheet={(moduleId) => setScreen({ kind: "new-sheet", moduleId })}
          onError={setError}
        />
      )}
      {screen.kind === "new-sheet" && (
        <NewSheet
          courses={courses}
          initialModule={screen.moduleId}
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
                ? [set.reviews.length ? `${set.reviews.length} to review` : null, set.fresh.length ? `${set.fresh.length} new cards` : null].filter(Boolean).join(" and ") + " today"
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

      {/* Karteikästen */}
      <section aria-label="Card boxes">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="flex-1 text-[17px] font-bold">Card boxes</h2>
          <span className="text-[12px] text-muted">Click a box to choose lectures or topics</span>
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

// --- Ein Kasten (Modul oder alle) ------------------------------------------------

function Deck({
  moduleId,
  courses,
  cards,
  onBack,
  onStart,
  onNewSheet,
  onError,
}: {
  moduleId: string;
  courses: Course[];
  cards: Card[];
  onBack: () => void;
  onStart: (pool: Card[], opts: { practice: boolean; size: number; title: string; mixed?: boolean }) => void;
  onNewSheet: (moduleId?: string) => void;
  onError: (m: string | null) => void;
}) {
  const app = useApp();
  const study = useStudy();
  const all = moduleId === "all";
  const course = all ? null : courses.find((c) => c.id === moduleId) ?? null;
  const color: CourseColor = course ? colorOf(course) : "blue";
  const deckCards = all ? cards : cards.filter((c) => c.moduleId === moduleId);
  const files = course ? studyFiles(course) : [];

  // Auswahl: alle Module/Dateien oder nur bestimmte
  const [scope, setScope] = useState<"everything" | "choose">("everything");
  const [pickedFiles, setPickedFiles] = useState<string[]>([]);
  const [pickedCourses, setPickedCourses] = useState<string[]>(() => courses.map((c) => c.id));
  const [mode, setMode] = useState<"due" | "practice">("due");
  const [size, setSize] = useState<number>(20);
  const [browse, setBrowse] = useState(false);

  const inScope = deckCards.filter((c) => {
    if (scope === "everything") return true;
    return all ? pickedCourses.includes(c.moduleId ?? "") : pickedFiles.includes(c.path);
  });
  const todays = todaysSet(inScope, study.today, study.stats).all;
  const pool = mode === "due" ? todays : inScope.filter(active);
  const exam = course ? examIn(course.id, app.deadlines, app.today) : null;
  const missing = files.filter((f) => !study.files[fileKey(f)]);

  const summarize = async (list: CourseFile[]) => {
    onError(null);
    const msg = await analyze(list.map(fileKey), course?.name ?? "");
    if (msg) onError(msg);
  };

  return (
    <>
      <button onClick={onBack} className="-ml-2 -mb-3 flex w-fit items-center gap-0.5 rounded-md px-2 py-1 text-[13px] font-semibold text-muted hover:bg-hover hover:text-text">
        <ChevronLeft size={15} aria-hidden /> Study
      </button>
      <header className="flex flex-wrap items-center gap-4">
        {course ? <Swatch color={color} size={16} /> : <Shuffle size={20} aria-hidden />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[30px] font-bold leading-tight tracking-[-0.02em]">{course ? course.name : "All courses"}</h1>
          <p className="mt-1 text-muted">
            {deckCards.length === 0
              ? [course?.fullName && course.fullName !== course.name ? course.fullName : null, exam != null ? `exam ${inDays(exam)}` : null].filter(Boolean).join(" · ") ||
                "No cards yet"
              : [
              `${deckCards.filter(active).length} cards`,
              `${todaysSet(deckCards, study.today, study.stats).all.length} for today`,
              `${Math.round(mastery(deckCards) * 100)}% learned`,
              exam != null ? `exam ${inDays(exam)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={deckCards.length === 0}
            onClick={async () => {
              const msg = await exportAnki(course?.name ?? "All courses", inScope.filter(active));
              if (msg) onError(msg);
            }}
            title="Saves a text file that Anki can import (File → Import)"
          >
            <Download size={14} aria-hidden /> Export for Anki
          </Button>
          <Button onClick={() => onNewSheet(course?.id)} disabled={study.available === false}>
            <NotebookPen size={14} aria-hidden /> Study sheet
          </Button>
        </div>
      </header>

      <Progress color={color} />

      {deckCards.length === 0 && !course ? (
        <div className="rounded-[12px] bg-surface px-5 py-6">
          <h2 className="text-[15px] font-bold">No cards yet</h2>
          <p className="mt-1 text-[13px] text-muted">This box mixes the cards of all your courses. Open a course box first and let Claude summarize its files.</p>
          <Button className="mt-4" onClick={onBack}>
            <ChevronLeft size={14} aria-hidden /> Back to the boxes
          </Button>
        </div>
      ) : deckCards.length === 0 && course ? (
        <div className="rounded-[12px] bg-surface px-5 py-6">
          <h2 className="text-[15px] font-bold">No cards in this box yet</h2>
          <p className="mt-1 text-[13px] text-muted">
            Claude reads each file once and writes a summary and about 10 flashcards. {files.length} files take about {Math.max(1, Math.round((files.length * 17) / 2 / 60))} min.
            You can keep using the app meanwhile.
          </p>
          <Button variant="primary" className="mt-4" onClick={() => void summarize(missing)} disabled={study.available === false || study.job.running}>
            <FileText size={14} aria-hidden /> Summarize {files.length} files
          </Button>
        </div>
      ) : (
        <section aria-label="Start a round" className="rounded-[14px] bg-surface p-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            {/* Was */}
            <div>
              <h2 className="text-[15px] font-bold">What do you want to learn?</h2>
              <Segmented
                className="mt-3"
                value={scope}
                onChange={(v) => setScope(v as typeof scope)}
                options={[
                  { value: "everything", label: all ? "All courses" : "The whole course" },
                  { value: "choose", label: all ? "Choose courses" : "Choose lectures" },
                ]}
              />
              {scope === "choose" &&
                (all ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {courses.map((c) => {
                      const onIt = pickedCourses.includes(c.id);
                      const n = cards.filter((x) => x.moduleId === c.id && active(x)).length;
                      return (
                        <ToggleChip
                          key={c.id}
                          on={onIt}
                          color={colorOf(c)}
                          onClick={() => setPickedCourses((p) => (onIt ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                          disabled={n === 0}
                        >
                          {c.name} <span className="opacity-60">{n}</span>
                        </ToggleChip>
                      );
                    })}
                  </div>
                ) : (
                  course && <LecturePicker course={course} cards={deckCards} picked={pickedFiles} onChange={setPickedFiles} />
                ))}
            </div>

            {/* Wie */}
            <div className="flex flex-col">
              <h2 className="text-[15px] font-bold">How?</h2>
              <div className="mt-3 flex flex-col gap-2">
                <ModeOption
                  on={mode === "due"}
                  onClick={() => setMode("due")}
                  title="Today’s cards"
                  text={`What’s due plus up to ${NEW_PER_DAY} new cards a day. Best as a daily habit.`}
                  count={todays.length}
                />
                <ModeOption
                  on={mode === "practice"}
                  onClick={() => setMode("practice")}
                  title="Practice all"
                  text="Every card in your choice. Good before an exam."
                  count={inScope.filter(active).length}
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <span className="text-muted">Cards per round</span>
                <select
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="h-8 rounded-lg bg-sunken px-2 text-[13px] outline-none"
                >
                  {SESSION_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "All" : n}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="primary"
                className="mt-4 h-10 text-[14px]"
                disabled={pool.length === 0}
                onClick={() =>
                  onStart(pool, {
                    practice: mode === "practice",
                    size,
                    title: `${course?.name ?? "All courses"}${scope === "choose" ? " · your choice" : ""}${mode === "practice" ? " · practice" : ""}`,
                    mixed: all,
                  })
                }
              >
                {pool.length === 0 ? "Nothing to review" : `Start ${size && size < pool.length ? size : pool.length} cards`} {pool.length > 0 && <ArrowRight size={15} aria-hidden />}
              </Button>
              {pool.length === 0 && (
                <p className="mt-2 text-center text-[12px] text-muted">
                  {scope === "choose" && inScope.length === 0
                    ? all
                      ? "Pick at least one course."
                      : "Pick at least one lecture."
                    : mode === "due"
                      ? "Nothing left for today in your choice. Try “Practice all”."
                      : "No cards in your choice."}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Karten ansehen und ausblenden */}
      {deckCards.length > 0 && (
        <section aria-label="Cards">
          <button onClick={() => setBrowse(!browse)} aria-expanded={browse} className="-ml-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-[15px] font-bold hover:bg-hover">
            Cards in this box <span className="text-[13px] font-normal text-muted">{inScope.length}</span>
            <ChevronLeft size={14} className={`text-muted transition-transform ${browse ? "-rotate-90" : "rotate-180"}`} aria-hidden />
          </button>
          {browse && <CardList cards={inScope} colorOf={(c) => (c.moduleId ? colorOf(courses.find((x) => x.id === c.moduleId) ?? { id: "x" }) : color)} />}
        </section>
      )}

      {course && (
        <section aria-label="Summaries">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-[15px] font-bold">Summaries</h2>
            {missing.length > 0 && deckCards.length > 0 && !study.job.running && (
              <Button onClick={() => void summarize(missing)} disabled={study.available === false}>
                <FileText size={14} aria-hidden /> Summarize the other {missing.length}
              </Button>
            )}
          </div>
          <SummaryList files={files} color={color} onSummarize={(f) => void summarize([f])} />
        </section>
      )}
    </>
  );
}

/** Vorlesungen/Dateien auswählen, gruppiert nach Art; Themen-Chips wählen passende Dateien mit aus. */
function LecturePicker({ course, cards, picked, onChange }: { course: Course; cards: Card[]; picked: string[]; onChange: (p: string[]) => void }) {
  const study = useStudy();
  const color = colorOf(course);
  const groups = course.folders
    .map((f) => ({ ...f, files: f.files.filter((x) => study.files[fileKey(x)]) }))
    .filter((f) => f.files.length);
  const topics = new Map<string, string[]>();
  for (const g of groups)
    for (const f of g.files)
      for (const t of study.files[fileKey(f)]?.topics ?? []) topics.set(t, [...(topics.get(t) ?? []), fileKey(f)]);
  const [allTopics, setAllTopics] = useState(false);
  const topicList = [...topics.entries()];
  const topTopics = allTopics ? topicList : topicList.slice(0, 8);
  const toggle = (keys: string[], on: boolean) => onChange(on ? [...new Set([...picked, ...keys])] : picked.filter((k) => !keys.includes(k)));
  const countFor = (k: string) => {
    const list = cards.filter((c) => c.path === k);
    return { total: list.filter(active).length, due: list.filter((c) => isDue(c, study.today)).length };
  };

  if (!groups.length) return <p className="mt-3 text-[13px] text-muted">Summarize some files first, then you can pick them here.</p>;

  return (
    <div className="mt-3">
      {topTopics.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[12px] font-semibold text-muted">By topic</p>
          <div className="flex flex-wrap gap-1.5">
            {topTopics.map(([t, ps]) => {
              const onIt = ps.every((p) => picked.includes(p));
              return (
                <ToggleChip key={t} on={onIt} color={color} onClick={() => toggle(ps, !onIt)} small>
                  {t}
                </ToggleChip>
              );
            })}
            {topicList.length > 8 && (
              <button onClick={() => setAllTopics(!allTopics)} className="h-7 rounded-full px-2.5 text-[12px] font-semibold text-muted hover:text-text">
                {allTopics ? "Fewer" : `${topicList.length - 8} more`}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="max-h-[300px] overflow-y-auto rounded-[10px] bg-sunken/60 p-2">
        {groups.map((g) => {
          const keys = g.files.map(fileKey);
          const allOn = keys.every((k) => picked.includes(k));
          return (
            <div key={g.id} className="mb-2 last:mb-0">
              <button onClick={() => toggle(keys, !allOn)} className="mb-0.5 rounded px-1.5 text-[12px] font-semibold text-muted hover:text-text">
                {g.name} · {allOn ? "none" : "all"}
              </button>
              <ul>
                {g.files.map((f) => {
                  const k = fileKey(f);
                  const onIt = picked.includes(k);
                  const n = countFor(k);
                  return (
                    <li key={f.id}>
                      <label className="flex cursor-default items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-hover">
                        <input type="checkbox" checked={onIt} onChange={() => toggle([k], !onIt)} className="size-3.5" style={{ accentColor: tone(color) }} />
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {displayName(f.name)}
                          {study.files[k]?.topics?.[0] && <span className="text-muted"> · {study.files[k]?.topics.slice(0, 2).join(", ")}</span>}
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums text-muted">
                          {n.total} cards{n.due ? ` · ${n.due} due` : ""}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[12px] text-muted">{picked.length ? `${picked.length} chosen` : "Nothing chosen yet"}</p>
    </div>
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
              <span className="block text-[13px] font-semibold">{c.q}</span>
              <span className="block text-[13px] text-muted">{c.a}</span>
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

function loadPrefs(): { include: Include; length: SheetLength } {
  const fallback = { include: PRESETS[0].include, length: "normal" as SheetLength };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (raw && typeof raw === "object" && raw.include) return { include: { ...fallback.include, ...raw.include, summary: true }, length: raw.length ?? "normal" };
  } catch {
    // Browser-Speicher nicht verfügbar
  }
  return fallback;
}

function NewSheet({
  courses,
  initialModule,
  onBack,
  onStarted,
  onError,
}: {
  courses: Course[];
  initialModule?: string;
  onBack: () => void;
  onStarted: () => void;
  onError: (m: string | null) => void;
}) {
  const study = useStudy();
  const [moduleId, setModuleId] = useState(initialModule ?? courses[0]?.id ?? "");
  const course = courses.find((c) => c.id === moduleId) ?? null;
  const color: CourseColor = course ? colorOf(course) : "blue";
  const [picked, setPicked] = useState<string[]>([]);
  const [prefs] = useState(loadPrefs);
  const [include, setInclude] = useState<Include>(prefs.include);
  const [length, setLength] = useState<SheetLength>(prefs.length);
  const [focus, setFocus] = useState("");

  const groups = course ? course.folders.map((f) => ({ ...f, files: f.files.filter((x) => /\.(pdf|txt|md|tex)$/i.test(x.name)) })).filter((f) => f.files.length) : [];
  const preset = PRESETS.find((p) => SHEET_SECTIONS.every((s) => p.include[s.key] === include[s.key]))?.id ?? null;
  const set = (k: keyof Include, v: boolean) =>
    setInclude((cur) => {
      const next = { ...cur, [k]: v, summary: true };
      if (k === "questions" && !v) next.answers = false;
      if (k === "answers" && v) next.questions = true;
      return next;
    });

  const submit = () => {
    if (!course) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ include, length }));
    } catch {
      // egal
    }
    onError(null);
    void createSheet({ moduleId: course.id, moduleName: course.name, paths: picked, focus: focus.trim() || undefined, include, length }).then((res) => {
      if (res.error) onError(res.error);
    });
    onStarted();
  };

  const sizeHint = picked.length > 8 ? "Many files: Claude uses the saved summaries for some of them." : null;

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

      <Step n={2} title="Which lectures or files?">
        {course && groups.length > 0 ? (
          <div className="max-h-[320px] overflow-y-auto rounded-[10px] bg-sunken/60 p-2">
            {groups.map((g) => {
              const keys = g.files.map(fileKey);
              const allOn = keys.every((k) => picked.includes(k));
              return (
                <div key={g.id} className="mb-2 last:mb-0">
                  <button
                    onClick={() => setPicked((p) => (allOn ? p.filter((k) => !keys.includes(k)) : [...new Set([...p, ...keys])]))}
                    className="mb-0.5 rounded px-1.5 text-[12px] font-semibold text-muted hover:text-text"
                  >
                    {g.name} · {allOn ? "none" : "all"}
                  </button>
                  <ul>
                    {g.files.map((f) => {
                      const k = fileKey(f);
                      const onIt = picked.includes(k);
                      const a = study.files[k];
                      return (
                        <li key={f.id}>
                          <label className="flex cursor-default items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-hover">
                            <input
                              type="checkbox"
                              checked={onIt}
                              onChange={() => setPicked((p) => (onIt ? p.filter((x) => x !== k) : [...p, k]))}
                              className="size-3.5"
                              style={{ accentColor: tone(color) }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px]">{displayName(f.name)}</span>
                            {a?.topics?.[0] && <span className="hidden shrink-0 truncate text-[12px] text-muted sm:block">{a.topics.slice(0, 2).join(", ")}</span>}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted">No PDFs in this course yet.</p>
        )}
        <p className="mt-1.5 text-[12px] text-muted">{picked.length ? `${picked.length} chosen` : "Pick one or more. Two or three lectures make a good sheet."}</p>
        {sizeHint && <p className="mt-1 text-[12px] text-muted">{sizeHint}</p>}
      </Step>

      <Step n={3} title="What should be in it?">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
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
          {SHEET_SECTIONS.map((s) => {
            const onIt = include[s.key];
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

function ModeOption({ on, onClick, title, text, count }: { on: boolean; onClick: () => void; title: string; text: string; count: number }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${on ? "bg-sunken shadow-[inset_0_0_0_1.5px_var(--text)]" : "hover:bg-hover"}`}
    >
      <span className={`mt-1 grid size-3.5 shrink-0 place-items-center rounded-full ${on ? "bg-text" : "shadow-[inset_0_0_0_1.5px_var(--muted)]"}`} aria-hidden>
        {on && <span className="size-1.5 rounded-full bg-surface" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{title}</span>
        <span className="block text-[12px] text-muted">{text}</span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums">{count}</span>
    </button>
  );
}
