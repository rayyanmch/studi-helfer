"use client";

// Lern-Bausteine, die Kursseite und Study-Tab teilen: Abfrage (Review), Zeile mit Zusammenfassung, Fortschritt.
// Dazu der Reiter „Study“ auf der Kursseite (Zusammenfassungen + Sprung in den Study-Tab).

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronRight, EyeOff, FileText, Flame, Layers, NotebookPen, RotateCcw, Square, X } from "lucide-react";
import { reducedMotion, useCountUp } from "./motion";
import { Button, Notice, Spinner, colorOf, tone } from "./ui";
import { DocTile, displayName } from "./files";
import { MathText } from "./MathText";
import { DocTag, useDocTypes } from "./DocTag";
import { docTypeOf, isStudyDoc, isTaskDoc } from "@/lib/doctype";
import type { Folder } from "@/lib/mock-data";
import type { Course, CourseColor, CourseFile } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";
import {
  type Analysis,
  type Card,
  type CardType,
  analyze,
  cancelAnalyze,
  cardsOf,
  fileKey,
  todaysSet,
  loadStudy,
  openStudy,
  resetCards,
  review,
  studyFiles,
  suspendCard,
  useStudy,
  useTodayCards,
  useWeeks,
  STUDY_FILE,
} from "@/lib/study";
import { weekLabel } from "@/lib/weeks";
import { useMathMode } from "@/lib/subject";

// --- Reiter „Study“ auf der Kursseite ------------------------------------------------

export function StudyPanel({ course }: { course: Course }) {
  const app = useApp();
  const study = useStudy();
  const color = colorOf(course);
  const files = useMemo(() => studyFiles(course), [course]);
  const paths = useMemo(() => files.map(fileKey), [files]);
  const pathsKey = paths.join("\n");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStudy(pathsKey ? pathsKey.split("\n") : []);
  }, [pathsKey]);

  const cards = cardsOf(paths, study, course.id);
  const due = todaysSet(cards, study.today, study.stats).all;
  const missing = files.filter((f) => !study.files[fileKey(f)] && !study.unreadable[fileKey(f)]);

  const { math } = useMathMode(course, files.map((f) => study.files[fileKey(f)]));
  const startAnalyze = async (list: CourseFile[]) => {
    setError(null);
    const msg = await analyze(list.map(fileKey), course.name, math, course);
    if (msg) setError(msg);
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      {study.available === false && <NoClaude />}
      {error && <ErrorNotice message={error} onClose={() => setError(null)} />}

      <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-surface p-4">
        <span className="grid size-9 place-items-center rounded-lg" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
          <Layers size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold">Flashcards and study sheets</h2>
          <p className="text-[13px] text-muted">
            {cards.length
              ? `${due.length} of ${cards.length} cards are up for today. Learn them, or only some lectures, in Study.`
              : "Summarize files below to get flashcards. You learn them in Study."}
          </p>
        </div>
        <Button onClick={() => openStudy({ screen: "new-sheet", moduleId: course.id })} disabled={study.available === false || files.length === 0}>
          <NotebookPen size={14} aria-hidden /> New study sheet
        </Button>
        <Button variant="primary" onClick={() => openStudy({ screen: "deck", moduleId: course.id })}>
          Open in Study <ArrowRight size={14} aria-hidden />
        </Button>
      </div>

      <Progress color={color} />

      <section aria-label="Summaries">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-[15px] font-bold">Summaries</h2>
          {missing.length > 0 && !study.job.running && (
            <Button onClick={() => void startAnalyze(missing)} disabled={study.available === false}>
              <FileText size={14} aria-hidden /> Summarize {missing.length === files.length ? "all" : "the other"} {missing.length}
            </Button>
          )}
        </div>
        <p className="mb-2 text-[13px] text-muted">
          Written by Claude from your files{app.mode === "desktop" ? " on this Mac" : " (sample data in the browser)"}. Check the page in the file when something looks off.
        </p>
        <SummaryList course={course} color={color} onSummarize={(f) => void startAnalyze([f])} />
      </section>
    </div>
  );
}

/** Zusammenfassungen eines Moduls, nach Themenwochen gruppiert (neueste Woche oben). */
export function SummaryList({ course, color, onSummarize }: { course: Course; color: CourseColor; onSummarize: (f: CourseFile) => void }) {
  const study = useStudy();
  const weeks = useWeeks(course);
  const groups = weeks
    .map((w) => ({ w, files: w.files.filter((x) => STUDY_FILE.test(x.file.name)) }))
    .filter((g) => g.files.length);
  if (groups.length === 0) return <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">No PDFs in this course yet.</p>;
  const ordered = [...groups.filter((g) => g.w.kind === "week").reverse(), ...groups.filter((g) => g.w.kind !== "week")];
  return (
    <div className="flex flex-col gap-4">
      {ordered.map(({ w, files }) => (
        <div key={w.key}>
          <h3 className="mb-1.5 flex items-baseline gap-2 text-[13px] font-bold">
            {weekLabel(w)}
            {w.current && (
              <span className="rounded-full px-1.5 text-[11px] font-semibold" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
                this week
              </span>
            )}
            {w.range && <span className="text-[12px] font-normal text-muted">{w.range}</span>}
          </h3>
          <ul className="rounded-[10px] bg-surface px-1.5 py-1">
            {files.map(({ file: f, folder }) => (
              <SummaryRow
                key={f.id}
                file={f}
                folder={folder}
                analysis={study.files[fileKey(f)] ?? null}
                unreadable={Boolean(study.unreadable[fileKey(f)])}
                color={color}
                busy={study.job.current.includes(f.name)}
                onSummarize={() => onSummarize(f)}
                disabled={study.available === false}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function NoClaude() {
  return (
    <Notice tone="warn" icon={<AlertTriangle size={16} aria-hidden />}>
      Claude Code isn’t set up on this Mac. Summaries, cards and study sheets need it for now.
    </Notice>
  );
}

export function ErrorNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Notice
      tone="danger"
      icon={<AlertTriangle size={16} aria-hidden />}
      action={
        <button onClick={onClose} aria-label="Dismiss" className="rounded p-1 hover:bg-hover">
          <X size={14} aria-hidden />
        </button>
      }
    >
      {message}
    </Notice>
  );
}

// --- Fortschritt beim Zusammenfassen --------------------------------------------

function etaText(s: number | null) {
  if (s == null) return "Estimating time…";
  if (s < 20) return "Almost done";
  if (s < 60) return "Less than a minute left";
  return `About ${Math.round(s / 60)} min left`;
}

export function Progress({ color }: { color: CourseColor }) {
  const { job } = useStudy();
  if (!job.running && job.failed.length === 0) return null;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  return (
    <div className="rounded-[10px] bg-surface px-4 py-3" role="status">
      {job.running ? (
        <>
          <div className="flex items-center gap-3 text-[13px]">
            <Spinner />
            <span className="min-w-0 flex-1 truncate">
              <strong className="font-semibold">
                Summarizing {job.total === 1 ? "1 file" : `${job.total} files`} · {job.done} done
              </strong>
              <span className="text-muted"> · {etaText(job.etaSeconds)}</span>
            </span>
            <Button variant="plain" onClick={() => void cancelAnalyze()}>
              <Square size={12} aria-hidden /> Stop
            </Button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tone(color) }} />
          </div>
        </>
      ) : null}
      {job.failed.length > 0 && (
        <div className={`text-[13px] ${job.running ? "mt-3" : ""}`}>
          <p className="font-semibold text-warn">
            {job.failed.length === 1 ? "1 file couldn’t be summarized:" : `${job.failed.length} files couldn’t be summarized:`}
          </p>
          <ul className="mt-1 text-muted">
            {job.failed.slice(0, 4).map((f) => (
              <li key={f.path} className="truncate">
                {displayName(f.name)}: {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Abfrage --------------------------------------------------------------------

type Outcome = "knew" | "again" | "skip" | "hide";

/**
 * Abfrage: Karten liegen als Stapel, Leertaste/Klick dreht die Karte um, „gewusst“ fliegt nach rechts,
 * „nicht gewusst“ nach links, die nächste rückt aus dem Stapel nach vorn. Fortschritt in Abschnitten
 * (grün gewusst, orange nochmal), am Ende Ring mit Anteil und Serie. Alles bricht ab, sobald man weiterdrückt.
 */
export function Review({
  cards,
  practice,
  title,
  colorOfCard,
  courseOfCard,
  onClose,
  onMore,
}: {
  cards: Card[];
  practice: boolean;
  title: string;
  colorOfCard: (c: Card) => CourseColor;
  courseOfCard?: (c: Card) => string | null; // Kursname (gemischter Kasten)
  onClose: () => void;
  onMore?: () => void; // weitere Karten in diesem Kasten
}) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [stepsShown, setStepsShown] = useState(0); // Rechenweg Schritt für Schritt aufdecken
  const [results, setResults] = useState<Outcome[]>([]);
  const [combo, setCombo] = useState(0);
  const [leaving, setLeaving] = useState<{ id: number; card: Card; dir: Outcome; shown: boolean; stepsShown: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const flipping = useRef(false);
  const card = cards[i];
  const finished = i >= cards.length;
  const color: CourseColor = card ? colorOfCard(card) : cards[0] ? colorOfCard(cards[0]) : "blue";
  const steps = card?.steps ?? [];
  const knew = results.filter((r) => r === "knew").length;
  const again = results.filter((r) => r === "again").length;

  const advance = (dir: Outcome) => {
    if (!card) return;
    flipping.current = false;
    setLeaving({ id: Date.now() + Math.random(), card, dir, shown, stepsShown });
    setResults((r) => {
      const n = [...r];
      n[i] = dir;
      return n;
    });
    setShown(false);
    setStepsShown(0);
    setI((n) => n + 1);
  };
  const answer = (k: boolean) => {
    if (!card) return;
    void review(card.id, k, practice);
    setCombo((c) => (k ? c + 1 : 0));
    advance(k ? "knew" : "again");
  };
  const hide = () => {
    if (!card) return;
    void suspendCard(card.id, true);
    advance("hide");
  };
  const nextStep = () => setStepsShown((n) => Math.min(steps.length, n + 1));

  // Umdrehen: erste Hälfte bis hochkant, dann Antwort zeigen (Höhensprung unsichtbar), zweite Hälfte zurück
  const reveal = () => {
    if (shown || flipping.current || !card) return;
    const el = cardRef.current;
    if (!el || typeof el.animate !== "function" || reducedMotion()) {
      setShown(true);
      return;
    }
    flipping.current = true;
    // Sicherheitsnetz: läuft die Animation nicht (Fenster im Hintergrund), trotzdem umdrehen
    const safety = window.setTimeout(() => {
      if (!flipping.current) return;
      first.cancel();
      flipping.current = false;
      setShown(true);
    }, 600);
    const first = el.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(-90deg)" }], {
      duration: 130,
      easing: "cubic-bezier(0.55, 0, 1, 0.45)",
      fill: "forwards",
    });
    first.onfinish = () => {
      window.clearTimeout(safety);
      if (!flipping.current) return first.cancel();
      flushSync(() => setShown(true));
      const second = el.animate([{ transform: "rotateY(90deg)" }, { transform: "rotateY(0deg)" }], {
        duration: 260,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
      first.cancel();
      second.onfinish = () => {
        flipping.current = false;
      };
    };
  };

  // Leertaste = umdrehen, 1 = nicht gewusst, 2 = gewusst, N = nächster Schritt, Esc = beenden (vor der Seite abfangen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation(); // nicht auch noch die Seite schließen
        onClose();
      } else if (finished && e.key === "Enter") {
        e.preventDefault();
        onClose();
      } else if (!finished && (e.key === " " || e.key === "Enter") && !shown) {
        e.preventDefault();
        reveal();
      } else if (!finished && !shown && (e.key === "n" || e.key === "N") && stepsShown < steps.length) {
        nextStep();
      } else if (!finished && shown && e.key === "1") answer(false);
      else if (!finished && shown && e.key === "2") answer(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Weggeflogene Kopie spätestens nach 0,6 s entfernen (falls animationend ausbleibt)
  useEffect(() => {
    if (!leaving) return;
    const id = leaving.id;
    const t = window.setTimeout(() => setLeaving((l) => (l?.id === id ? null : l)), 600);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const behind = Math.min(2, cards.length - i - 1);
  const segmented = cards.length <= 40;

  return (
    <section aria-label="Review flashcards" className="mx-auto max-w-[760px]">
      <div className="mb-5 flex items-center gap-3">
        <Button variant="plain" onClick={onClose} className="-ml-2">
          <X size={14} aria-hidden /> End
        </Button>
        <span className="truncate text-[13px] font-semibold">{title}</span>
        {segmented ? (
          <div className="flex h-1.5 min-w-[80px] flex-1 gap-[3px]" aria-hidden>
            {cards.map((c, k) => {
              const r = results[k];
              const bg =
                r === "knew"
                  ? "var(--ok)"
                  : r === "again"
                    ? "var(--c-orange)"
                    : r
                      ? "var(--line)"
                      : k === i
                        ? `color-mix(in srgb, ${tone(color)} 40%, var(--sunken))`
                        : "var(--sunken)";
              return <span key={c.id} className={`h-full flex-1 rounded-full transition-colors duration-300 ${r && k === i - 1 ? "seg-pop" : ""}`} style={{ background: bg }} />;
            })}
          </div>
        ) : (
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(Math.min(i, cards.length) / cards.length) * 100}%`, background: tone(color) }} />
          </div>
        )}
        {combo >= 3 && !finished && (
          <span
            key={combo}
            className="bump inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums"
            style={{ background: tone(color, "soft"), color: tone(color, "ink") }}
            title="Cards you knew in a row"
          >
            <Flame size={12} aria-hidden /> {combo} in a row
          </span>
        )}
        <span className="shrink-0 text-[13px] tabular-nums text-muted">
          {Math.min(i + 1, cards.length)} / {cards.length}
        </span>
      </div>

      <div className="relative">
        {finished ? (
          <RoundDone
            knew={knew}
            again={again}
            color={color}
            colors={[...new Set(cards.map(colorOfCard))]}
            onMore={onMore}
            onClose={onClose}
          />
        ) : (
          <div className="fc-stack relative mb-9">
              <div
                className="fc-behind"
                style={{ transform: behind >= 2 ? "translateY(26px) scale(0.92)" : "translateY(0) scale(1)", opacity: behind >= 2 ? 0.45 : 0 }}
                aria-hidden
              />
              <div
                className="fc-behind"
                style={{ transform: behind >= 1 ? "translateY(13px) scale(0.96)" : "translateY(0) scale(1)", opacity: behind >= 1 ? 0.8 : 0 }}
                aria-hidden
              />
              <div
                key={card.id}
                ref={cardRef}
                onClick={(e) => {
                  if (!shown && !(e.target as HTMLElement).closest("button, a")) reveal();
                }}
                title={shown ? undefined : "Click or press Space to flip"}
                className={`fc-enter relative z-[2] rounded-[14px] bg-surface px-7 py-8 shadow-[0_1px_0_var(--line),0_6px_20px_rgba(0,0,0,0.05)] ${shown ? "" : "cursor-pointer"}`}
                style={{ borderTop: `4px solid ${tone(color)}` }}
              >
                <CardFace
                  card={card}
                  color={color}
                  course={courseOfCard?.(card) ?? null}
                  shown={shown}
                  stepsShown={stepsShown}
                  onReveal={reveal}
                  onAnswer={answer}
                  onHide={hide}
                  onSkip={() => advance("skip")}
                  onNextStep={nextStep}
                />
              </div>
          </div>
        )}
        {leaving && (
          <div
            key={leaving.id}
            className="fc-out rounded-[14px] bg-surface px-7 py-8 shadow-[0_14px_40px_rgba(0,0,0,0.14)]"
            data-dir={leaving.dir}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setLeaving((l) => (l?.id === leaving.id ? null : l));
            }}
            style={{
              borderTop: `4px solid ${tone(colorOfCard(leaving.card))}`,
              outline: leaving.dir === "knew" ? "2px solid var(--ok)" : leaving.dir === "again" ? "2px solid var(--c-orange)" : undefined,
              outlineOffset: -2,
            }}
            inert
            aria-hidden
          >
            <CardFace
              card={leaving.card}
              color={colorOfCard(leaving.card)}
              course={courseOfCard?.(leaving.card) ?? null}
              shown={leaving.shown}
              stepsShown={leaving.stepsShown}
            />
            {(leaving.dir === "knew" || leaving.dir === "again") && (
              <span
                className="fc-stamp absolute right-5 top-5 grid size-11 place-items-center rounded-full text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
                style={{ background: leaving.dir === "knew" ? "var(--ok)" : "var(--c-orange)" }}
              >
                {leaving.dir === "knew" ? <Check size={22} strokeWidth={3} /> : <RotateCcw size={20} strokeWidth={2.5} />}
              </span>
            )}
          </div>
        )}
      </div>
      {!finished && (
        <p className="mt-1 text-center text-[12px] text-muted">
          {practice ? "Practice: cards you know keep their schedule." : "Cards you know come back later, the others again today."}
        </p>
      )}
    </section>
  );
}

/** Inhalt einer Karte (aktive Karte und die wegfliegende Kopie). Ohne Handler = nur Anzeige. */
function CardFace({
  card,
  color,
  course,
  shown,
  stepsShown,
  onReveal,
  onAnswer,
  onHide,
  onSkip,
  onNextStep,
}: {
  card: Card;
  color: CourseColor;
  course: string | null;
  shown: boolean;
  stepsShown: number;
  onReveal?: () => void;
  onAnswer?: (knew: boolean) => void;
  onHide?: () => void;
  onSkip?: () => void;
  onNextStep?: () => void;
}) {
  const steps = card.steps ?? [];
  const typed = card.type && card.type !== "concept";
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
        {course && (
          <span className="rounded-full px-2 py-px font-semibold" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
            {course}
          </span>
        )}
        <button onClick={() => store.openFile(card.path)} className="rounded hover:text-text hover:underline" title="Open the file">
          {displayName(card.file)}
          {card.page > 0 ? `, page ${card.page}` : ""}
        </button>
        {isNewCard(card) && <span className="font-semibold text-[var(--c-green-ink)]">new</span>}
      </p>
      {typed && (
        <p className="mt-4 text-[12px] font-semibold" style={{ color: tone(color, "ink") }}>
          {TYPE_LABEL[card.type!]}
        </p>
      )}
      <p className={`${typed ? "mt-1" : "mt-4"} min-h-[56px] text-[20px] font-semibold leading-snug`}>
        <MathText text={card.q} math={card.math} />
      </p>
      {steps.length > 0 && (shown || stepsShown > 0) && (
        <ol className="mt-4 flex flex-col gap-1.5 border-l-2 pl-4 text-[15px]" style={{ borderColor: tone(color, "soft") }}>
          {steps.slice(0, shown ? steps.length : stepsShown).map((st, k) => (
            <li key={k} className="answer-in leading-relaxed">
              <span className="mr-2 text-[12px] font-semibold text-muted">{k + 1}.</span>
              <MathText text={st} math={card.math} />
            </li>
          ))}
        </ol>
      )}
      {shown ? (
        <>
          <div className="my-5 h-px bg-line" />
          <p className="whitespace-pre-line text-[15px] leading-relaxed">
            <MathText text={card.a} math={card.math} />
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Button onClick={() => onAnswer?.(false)}>
              <RotateCcw size={14} aria-hidden /> Didn’t know <Kbd>1</Kbd>
            </Button>
            <Button variant="primary" onClick={() => onAnswer?.(true)}>
              <Check size={14} aria-hidden /> Knew it <Kbd>2</Kbd>
            </Button>
            <span className="flex-1" />
            <Button variant="plain" className="text-[12px] text-muted" onClick={onHide} title="This card won’t come up again. You can bring it back in the card list.">
              <EyeOff size={13} aria-hidden /> Hide card
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-2">
          {steps.length > 0 && stepsShown < steps.length && (
            <Button onClick={onNextStep} title="Try the next step yourself first, then check it">
              {stepsShown === 0 ? "Show first step" : "Next step"} <Kbd>N</Kbd>
            </Button>
          )}
          <Button variant="primary" onClick={onReveal}>
            Show answer <Kbd>Space</Kbd>
          </Button>
          <span className="flex-1" />
          <Button variant="plain" className="text-[12px] text-muted" onClick={onSkip}>
            Skip
          </Button>
        </div>
      )}
    </>
  );
}

/** Ende einer Runde: Ring füllt sich auf den Anteil „gewusst“, ein paar Punkte springen heraus, Serie und Tagesstand. */
function RoundDone({
  knew,
  again,
  color,
  colors,
  onMore,
  onClose,
}: {
  knew: number;
  again: number;
  color: CourseColor;
  colors: CourseColor[];
  onMore?: () => void;
  onClose: () => void;
}) {
  const study = useStudy();
  const leftToday = useTodayCards().length;
  const answered = knew + again;
  const share = answered ? knew / answered : 0;
  const pct = useCountUp(Math.round(share * 100), { duration: 1000, delay: 150 });
  const R = 48;
  const len = 2 * Math.PI * R;
  const ringColor = colors.length > 1 ? "var(--text)" : tone(color);
  const dots = [...colors.map((c) => tone(c)), "var(--ok)"];
  const headline = !answered ? "Round finished" : share >= 0.9 ? "Excellent round" : share >= 0.6 ? "Nice work" : "Good start";
  return (
    <div className="stagger flex flex-col items-center rounded-[14px] bg-surface px-6 pb-9 pt-10 text-center">
      <div className="relative size-[124px]">
        {knew > 0 && (
          <div className="burst absolute inset-0" aria-hidden>
            {Array.from({ length: 16 }, (_, k) => (
              <i
                key={k}
                style={
                  {
                    "--a": `${(k * 360) / 16 + (k % 2) * 8}deg`,
                    "--d": `${82 + (k % 3) * 16}px`,
                    "--k": k,
                    "--c": dots[k % dots.length],
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}
        <svg viewBox="0 0 124 124" className="size-full -rotate-90" aria-hidden>
          <circle cx="62" cy="62" r={R} fill="none" stroke="var(--sunken)" strokeWidth="10" />
          {share > 0 && (
            <circle
              className="ring-fill"
              cx="62"
              cy="62"
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len * (1 - share)}
              style={{ "--ring-len": len } as React.CSSProperties}
            />
          )}
        </svg>
        <span className="absolute inset-0 grid place-items-center">
          <span>
            <span className="block text-[28px] font-bold leading-none tabular-nums">{answered ? `${pct}%` : "–"}</span>
            <span className="mt-1 block text-[11px] font-semibold text-muted">knew it</span>
          </span>
        </span>
      </div>
      <h2 className="mt-5 text-[21px] font-bold">{headline}</h2>
      <p className="mt-1 text-muted">
        {answered
          ? `You knew ${knew} of ${answered}.${again > 0 ? ` ${again} ${again === 1 ? "card comes" : "cards come"} back in your next round.` : ""}`
          : "You skipped every card."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2 text-[13px]">
        <Stat dot="var(--ok)" n={knew} label="knew" />
        <Stat dot="var(--c-orange)" n={again} label="again" />
        {study.stats.streak > 1 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1 font-semibold text-[var(--c-orange-ink)]">
            <Flame size={13} aria-hidden /> {study.stats.streak}-day streak
          </span>
        )}
        {study.stats.today > 0 && <span className="inline-flex items-center rounded-full bg-sunken px-3 py-1 text-muted">{study.stats.today} {study.stats.today === 1 ? "card" : "cards"} today</span>}
      </div>
      <p className="mt-4 text-[13px] text-muted">{leftToday ? `${leftToday} more ${leftToday === 1 ? "card" : "cards"} for today.` : "That’s everything for today."}</p>
      <div className="mt-6 flex justify-center gap-2">
        {onMore && <Button onClick={onMore}>Keep going</Button>}
        <Button variant="primary" onClick={onClose}>
          Done <Kbd>↵</Kbd>
        </Button>
      </div>
    </div>
  );
}

function Stat({ dot, n, label }: { dot: string; n: number; label: string }) {
  const v = useCountUp(n, { duration: 600, delay: 300 });
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1">
      <span className="size-2 rounded-full" style={{ background: dot }} />
      <strong className="font-semibold tabular-nums">{v}</strong> <span className="text-muted">{label}</span>
    </span>
  );
}

const isNewCard = (c: Card) => !c.state || !c.state.box;

/** Kartentypen im Mathe-Modus (Konzept: kleine Karten, Methodenwahl üben, Rechenwege, Gegenbeispiele). */
export const TYPE_LABEL: Record<CardType, string> = {
  concept: "Concept",
  definition: "Definition",
  theorem: "Theorem",
  formula: "Formula",
  strategy: "Which method?",
  compute: "Calculate",
  truefalse: "True or false?",
  proof: "Proof idea",
};

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded bg-hover px-1 font-sans text-[11px] font-medium opacity-70">{children}</kbd>;
}

// --- Zusammenfassung pro Datei --------------------------------------------------

export function SummaryRow({
  file,
  folder,
  analysis,
  unreadable,
  color,
  busy,
  onSummarize,
  disabled,
}: {
  file: CourseFile;
  folder?: Pick<Folder, "category" | "name">;
  analysis: Analysis | null;
  unreadable?: boolean;
  color: CourseColor;
  busy: boolean;
  onSummarize: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hints, setHints] = useState<number[]>([]);
  const study = useStudy();
  useDocTypes();
  const type = docTypeOf(file, folder);
  const task = isTaskDoc(type);
  const isHelp = analysis?.kind === "help";
  const ids = analysis ? analysis.cards.map((_, i) => `${analysis.id}:${i}`) : [];
  const learned = ids.filter((id) => (study.cards[id]?.box ?? 0) >= 3).length;

  return (
    <li className="border-b border-line-soft last:border-0">
      <div className="flex items-center gap-3 px-2.5 py-2">
        <DocTile name={file.name} kind={file.kind} color={color} size={26} />
        <button
          onClick={() => (analysis ? setOpen(!open) : store.openFile(file.path, file.id))}
          aria-expanded={analysis ? open : undefined}
          className="min-w-0 truncate text-left font-medium"
          title={analysis ? (isHelp ? "Show study help" : "Show summary") : `Open ${file.name}`}
        >
          {displayName(file.name)}
        </button>
        <DocTag file={file} folder={folder} />
        <span className="flex-1" />
        {busy ? (
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <Spinner size={12} /> {task ? "Preparing help…" : "Summarizing…"}
          </span>
        ) : analysis ? (
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium hover:bg-hover" style={{ color: tone(color, "ink") }}>
            {isHelp ? "Study help" : "Summary"} · {ids.length} cards{learned ? ` · ${learned} learned` : ""}
            {analysis.math && <span className="text-muted"> · formulas</span>}
            {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
          </button>
        ) : unreadable ? (
          <span className="text-[12px] text-muted" title="This file has no text (handwritten notes or scanned pages). Claude can’t read it yet.">
            Handwritten or scanned
          </span>
        ) : !isStudyDoc(type) ? null : (
          <Button variant="plain" className="h-7 text-[12px]" onClick={onSummarize} disabled={disabled} title={task ? "Hints, methods and where to read up for each task. No solutions." : undefined}>
            {task ? "Get help" : "Summarize"}
          </Button>
        )}
      </div>
      {open && analysis && isHelp && (
        <div className="px-3 pb-4 pl-[50px] text-[14px] leading-relaxed">
          <p>
            <MathText text={analysis.summary} math={analysis.math} />
          </p>
          {analysis.keyPoints.length > 0 && (
            <>
              <h4 className="mb-1 mt-4 text-[13px] font-bold">Before you start</h4>
              <ul className="flex flex-col gap-1">
                {analysis.keyPoints.map((k, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[9px] size-1.5 shrink-0 rounded-full" style={{ background: tone(color) }} aria-hidden />
                    <span>
                      <MathText text={k.text} math={analysis.math} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4 className="mb-1.5 mt-4 text-[13px] font-bold">Task by task</h4>
          <ol className="flex flex-col gap-2">
            {(analysis.tasks ?? []).map((t, i) => {
              const shown = hints.includes(i);
              return (
                <li key={i} className="rounded-[10px] bg-sunken/60 px-3 py-2">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <strong className="font-semibold">{t.label}</strong>
                    <span className="text-muted">
                      <MathText text={t.topic} math={analysis.math} />
                    </span>
                  </p>
                  <p className="text-[13px]">
                    <span className="text-muted">Method: </span>
                    <MathText text={t.method} math={analysis.math} />
                  </p>
                  {shown ? (
                    <p className="mt-1 text-[13px]">
                      <span className="font-semibold" style={{ color: tone(color, "ink") }}>
                        Hint:{" "}
                      </span>
                      <MathText text={t.hint} math={analysis.math} />
                    </p>
                  ) : (
                    <button onClick={() => setHints((h) => [...h, i])} className="mt-1 text-[12px] font-semibold hover:underline" style={{ color: tone(color, "ink") }}>
                      Show hint
                    </button>
                  )}
                  {t.lookup && <p className="mt-0.5 text-[12px] text-muted">Read up: {t.lookup}</p>}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[12px] text-muted">Hints only, no solutions: you learn most by solving it yourself.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => store.openFile(file.path, file.id)}>Open sheet</Button>
          </div>
        </div>
      )}
      {open && analysis && !isHelp && (
        <div className="px-3 pb-4 pl-[50px] text-[14px] leading-relaxed">
          {task && (
            <p className="mb-3 rounded-[8px] bg-sunken/60 px-3 py-2 text-[13px]">
              This is an exercise sheet. A study help with hints for each task is more useful than a summary.{" "}
              <button onClick={onSummarize} className="font-semibold hover:underline" style={{ color: tone(color, "ink") }}>
                Make a study help instead
              </button>
            </p>
          )}
          <p>
            <MathText text={analysis.summary} math={analysis.math} />
          </p>
          {analysis.partial && <p className="mt-1 text-[12px] text-muted">Based on pages 1–{analysis.partial} of {analysis.pages}.</p>}
          {analysis.topics.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-1.5">
              {analysis.topics.map((t) => (
                <span key={t} className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
                  {t}
                </span>
              ))}
            </p>
          )}
          <h4 className="mb-1 mt-4 text-[13px] font-bold">Key points</h4>
          <ul className="flex flex-col gap-1">
            {analysis.keyPoints.map((k, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full" style={{ background: tone(color) }} aria-hidden />
                <span>
                  <MathText text={k.text} math={analysis.math} />
                  {k.page > 0 && <span className="ml-1 text-[12px] text-muted">p. {k.page}</span>}
                </span>
              </li>
            ))}
          </ul>
          {analysis.terms.length > 0 && (
            <>
              <h4 className="mb-1 mt-4 text-[13px] font-bold">Terms</h4>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(120px,max-content)_1fr]">
                {analysis.terms.map((t, i) => (
                  <div key={i} className="contents">
                    <dt className="font-semibold">
                      <MathText text={t.term} math={analysis.math} />
                    </dt>
                    <dd className="text-muted">
                      <MathText text={t.definition} math={analysis.math} />
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => store.openFile(file.path, file.id)}>Open file</Button>
            {learned > 0 && (
              <Button variant="plain" onClick={() => void resetCards(ids)} className="text-muted">
                Reset these cards
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
