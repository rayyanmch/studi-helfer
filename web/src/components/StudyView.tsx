"use client";

// Lern-Bausteine, die Kursseite und Study-Tab teilen: Abfrage (Review), Zeile mit Zusammenfassung, Fortschritt.
// Dazu der Reiter „Study“ auf der Kursseite (Zusammenfassungen + Sprung in den Study-Tab).

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronRight, EyeOff, FileText, Layers, NotebookPen, RotateCcw, Square, X } from "lucide-react";
import { Button, Notice, Spinner, colorOf, tone } from "./ui";
import { DocTile, displayName } from "./files";
import type { Course, CourseColor, CourseFile } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";
import {
  type Analysis,
  type Card,
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
  useWeeks,
  STUDY_FILE,
} from "@/lib/study";
import { weekLabel } from "@/lib/weeks";

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

  const startAnalyze = async (list: CourseFile[]) => {
    setError(null);
    const msg = await analyze(list.map(fileKey), course.name);
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
    .map((w) => ({ w, files: w.files.map((x) => x.file).filter((f) => STUDY_FILE.test(f.name)) }))
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
            {files.map((f) => (
              <SummaryRow
                key={f.id}
                file={f}
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
  const [result, setResult] = useState({ knew: 0, again: 0 });
  const card = cards[i];
  const finished = i >= cards.length;
  const color: CourseColor = card ? colorOfCard(card) : cards[0] ? colorOfCard(cards[0]) : "blue";

  const next = () => {
    setShown(false);
    setI((n) => n + 1);
  };
  const answer = (knew: boolean) => {
    if (!card) return;
    void review(card.id, knew, practice);
    setResult((r) => (knew ? { ...r, knew: r.knew + 1 } : { ...r, again: r.again + 1 }));
    next();
  };
  const hide = () => {
    if (!card) return;
    void suspendCard(card.id, true);
    next();
  };

  // Leertaste = Antwort zeigen, 1 = nicht gewusst, 2 = gewusst, Esc = beenden (vor der Seite abfangen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation(); // nicht auch noch die Seite schließen
        onClose();
      } else if (!finished && (e.key === " " || e.key === "Enter") && !shown) {
        e.preventDefault();
        setShown(true);
      } else if (!finished && shown && e.key === "1") answer(false);
      else if (!finished && shown && e.key === "2") answer(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <section aria-label="Review flashcards" className="mx-auto max-w-[760px]">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="plain" onClick={onClose} className="-ml-2">
          <X size={14} aria-hidden /> End
        </Button>
        <span className="truncate text-[13px] font-semibold">{title}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(Math.min(i, cards.length) / cards.length) * 100}%`, background: tone(color) }} />
        </div>
        <span className="text-[13px] tabular-nums text-muted">
          {Math.min(i + 1, cards.length)} / {cards.length}
        </span>
      </div>

      {finished ? (
        <div className="rounded-[14px] bg-surface px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
            <Check size={22} aria-hidden />
          </span>
          <h2 className="mt-3 text-[19px] font-bold">Nice, that’s it for now</h2>
          <p className="mt-1 text-muted">
            You knew {result.knew} of {result.knew + result.again}.
            {result.again > 0 ? ` ${result.again} ${result.again === 1 ? "card comes" : "cards come"} back in your next round.` : ""}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {onMore && <Button onClick={onMore}>Keep going</Button>}
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-[14px] bg-surface px-7 py-8 shadow-[0_1px_0_var(--line)]" style={{ borderTop: `4px solid ${tone(color)}` }}>
          <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            {courseOfCard?.(card) && (
              <span className="rounded-full px-2 py-px font-semibold" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
                {courseOfCard(card)}
              </span>
            )}
            <button onClick={() => store.openFile(card.path)} className="rounded hover:text-text hover:underline" title="Open the file">
              {displayName(card.file)}
              {card.page > 0 ? `, page ${card.page}` : ""}
            </button>
            {isNewCard(card) && <span className="font-semibold text-[var(--c-green-ink)]">new</span>}
          </p>
          <p className="mt-4 min-h-[56px] text-[20px] font-semibold leading-snug">{card.q}</p>
          {shown ? (
            <>
              <div className="my-5 h-px bg-line" />
              <p className="whitespace-pre-line text-[15px] leading-relaxed">{card.a}</p>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <Button onClick={() => answer(false)}>
                  <RotateCcw size={14} aria-hidden /> Didn’t know <Kbd>1</Kbd>
                </Button>
                <Button variant="primary" onClick={() => answer(true)}>
                  <Check size={14} aria-hidden /> Knew it <Kbd>2</Kbd>
                </Button>
                <span className="flex-1" />
                <Button variant="plain" className="text-[12px] text-muted" onClick={hide} title="This card won’t come up again. You can bring it back in the card list.">
                  <EyeOff size={13} aria-hidden /> Hide card
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-8 flex items-center gap-2">
              <Button variant="primary" onClick={() => setShown(true)}>
                Show answer <Kbd>Space</Kbd>
              </Button>
              <span className="flex-1" />
              <Button variant="plain" className="text-[12px] text-muted" onClick={next}>
                Skip
              </Button>
            </div>
          )}
        </div>
      )}
      {!finished && (
        <p className="mt-3 text-center text-[12px] text-muted">
          {practice ? "Practice: cards you know keep their schedule." : "Cards you know come back later, the others again today."}
        </p>
      )}
    </section>
  );
}

const isNewCard = (c: Card) => !c.state || !c.state.box;

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded bg-hover px-1 font-sans text-[11px] font-medium opacity-70">{children}</kbd>;
}

// --- Zusammenfassung pro Datei --------------------------------------------------

export function SummaryRow({
  file,
  analysis,
  unreadable,
  color,
  busy,
  onSummarize,
  disabled,
}: {
  file: CourseFile;
  analysis: Analysis | null;
  unreadable?: boolean;
  color: CourseColor;
  busy: boolean;
  onSummarize: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const study = useStudy();
  const ids = analysis ? analysis.cards.map((_, i) => `${analysis.id}:${i}`) : [];
  const learned = ids.filter((id) => (study.cards[id]?.box ?? 0) >= 3).length;

  return (
    <li className="border-b border-line-soft last:border-0">
      <div className="flex items-center gap-3 px-2.5 py-2">
        <DocTile name={file.name} kind={file.kind} color={color} size={26} />
        <button
          onClick={() => (analysis ? setOpen(!open) : store.openFile(file.path, file.id))}
          aria-expanded={analysis ? open : undefined}
          className="min-w-0 flex-1 truncate text-left font-medium"
          title={analysis ? "Show summary" : `Open ${file.name}`}
        >
          {displayName(file.name)}
        </button>
        {busy ? (
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <Spinner size={12} /> Summarizing…
          </span>
        ) : analysis ? (
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium hover:bg-hover" style={{ color: tone(color, "ink") }}>
            Summary · {ids.length} cards{learned ? ` · ${learned} learned` : ""}
            {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
          </button>
        ) : unreadable ? (
          <span className="text-[12px] text-muted" title="This file has no text (handwritten notes or scanned pages). Claude can’t read it yet.">
            Handwritten or scanned
          </span>
        ) : (
          <Button variant="plain" className="h-7 text-[12px]" onClick={onSummarize} disabled={disabled}>
            Summarize
          </Button>
        )}
      </div>
      {open && analysis && (
        <div className="px-3 pb-4 pl-[50px] text-[14px] leading-relaxed">
          <p>{analysis.summary}</p>
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
                  {k.text}
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
                    <dt className="font-semibold">{t.term}</dt>
                    <dd className="text-muted">{t.definition}</dd>
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
