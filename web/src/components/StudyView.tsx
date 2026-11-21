"use client";

// Reiter „Study“ auf der Modulseite: Karteikarten (Leitner), Lernzettel, Zusammenfassung pro Datei.
// Daten und Aktionen aus @/lib/study (Mac-App: desktop/lib/study.js mit Claude Code).

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, FileText, Layers, NotebookPen, RotateCcw, Square, Trash2, X } from "lucide-react";
import { Button, Notice, Spinner, colorOf, tone } from "./ui";
import { DocTile, displayName } from "./files";
import type { Course, CourseColor, CourseFile } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";
import {
  type Analysis,
  type Card,
  type Sheet,
  analyze,
  cancelAnalyze,
  cardsOf,
  createSheet,
  deleteSheet,
  exportAnki,
  isDue,
  loadStudy,
  resetCards,
  review,
  useStudy,
} from "@/lib/study";

const SUPPORTED = /\.(pdf|txt|md|tex)$/i;
const SESSION = 20; // Karten pro Abfrage

const keyOf = (f: CourseFile) => f.path ?? f.id;

export function StudyPanel({ course }: { course: Course }) {
  const app = useApp();
  const study = useStudy();
  const color = colorOf(course);
  const files = useMemo(() => course.folders.flatMap((f) => f.files).filter((f) => SUPPORTED.test(f.name)), [course]);
  const paths = useMemo(() => files.map(keyOf), [files]);
  const pathsKey = paths.join("\n");
  const [reviewing, setReviewing] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStudy(course.id, pathsKey ? pathsKey.split("\n") : []);
  }, [course.id, pathsKey]);

  const cards = cardsOf(paths, study);
  const due = cards.filter((c) => isDue(c, study.today));
  const missing = files.filter((f) => !study.files[keyOf(f)]);

  if (reviewing) {
    return <Review cards={reviewing} color={color} onClose={() => setReviewing(null)} />;
  }

  const startAnalyze = async (list: CourseFile[]) => {
    setError(null);
    const msg = await analyze(list.map(keyOf), course.name);
    if (msg) setError(msg);
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-[13px] text-muted">
        Summaries, study sheets and flashcards from your course files, written by Claude
        {app.mode === "desktop" ? " on this Mac." : ". Sample data in the browser."}
      </p>

      {study.available === false && (
        <Notice tone="warn" icon={<AlertTriangle size={16} aria-hidden />}>
          Claude Code isn’t set up on this Mac. Study tools need it for now.
        </Notice>
      )}
      {error && (
        <Notice tone="danger" icon={<AlertTriangle size={16} aria-hidden />} action={<CloseButton onClick={() => setError(null)} />}>
          {error}
        </Notice>
      )}

      <Progress color={color} />

      {/* --- Karteikarten --- */}
      <section aria-label="Flashcards" className="rounded-[10px] bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
            <Layers size={17} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold">Flashcards</h2>
            <p className="text-[13px] text-muted">
              {cards.length === 0
                ? "Cards appear here once files are summarized."
                : (() => {
                    const n = new Set(cards.map((c) => c.path)).size;
                    return `${due.length} due today · ${cards.length} ${cards.length === 1 ? "card" : "cards"} from ${n} ${n === 1 ? "file" : "files"}`;
                  })()}
            </p>
          </div>
          <Button
            disabled={cards.length === 0}
            onClick={async () => {
              const msg = await exportAnki(course.name, cards);
              if (msg) setError(msg);
            }}
            title="Saves a text file that Anki can import (File → Import)"
          >
            <Download size={14} aria-hidden /> Export for Anki
          </Button>
          <Button variant="primary" disabled={due.length === 0} onClick={() => setReviewing(due.slice(0, SESSION))}>
            {due.length === 0 && cards.length > 0 ? "All done for today" : `Review ${Math.min(due.length, SESSION) || ""}`.trim()}
          </Button>
        </div>
        {cards.length > 0 && <Boxes cards={cards} color={color} />}
      </section>

      {/* --- Lernzettel --- */}
      <Sheets course={course} files={files} color={color} onError={setError} />

      {/* --- Zusammenfassungen --- */}
      <section aria-label="Summaries">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-[15px] font-bold">Summaries</h2>
          {missing.length > 0 && !study.job.running && (
            <Button onClick={() => void startAnalyze(missing)} disabled={study.available === false}>
              <FileText size={14} aria-hidden /> Summarize {missing.length === files.length ? "all" : "the other"} {missing.length}
            </Button>
          )}
        </div>
        {files.length === 0 ? (
          <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">No PDFs in this course yet.</p>
        ) : (
          <ul className="rounded-[10px] bg-surface px-1.5 py-1">
            {files.map((f) => (
              <SummaryRow
                key={f.id}
                file={f}
                analysis={study.files[keyOf(f)] ?? null}
                color={color}
                busy={study.job.current.includes(f.name)}
                onSummarize={() => void startAnalyze([f])}
                disabled={study.available === false}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Dismiss" className="rounded p-1 hover:bg-hover">
      <X size={14} aria-hidden />
    </button>
  );
}

// --- Fortschritt beim Zusammenfassen --------------------------------------------

function etaText(s: number | null) {
  if (s == null) return "Estimating time…";
  if (s < 20) return "Almost done";
  if (s < 60) return "Less than a minute left";
  return `About ${Math.round(s / 60)} min left`;
}

function Progress({ color }: { color: CourseColor }) {
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

// --- Leitner-Fächer -----------------------------------------------------------

function Boxes({ cards, color }: { cards: Card[]; color: CourseColor }) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of cards) counts[c.state?.box ?? 0] += 1;
  const labels = ["New", "Box 1", "Box 2", "Box 3", "Box 4", "Box 5"];
  return (
    <div className="mt-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
        {counts.map((n, i) =>
          n ? <div key={i} style={{ width: `${(n / cards.length) * 100}%`, background: i === 0 ? "var(--line)" : tone(color), opacity: i === 0 ? 1 : 0.35 + i * 0.13 }} /> : null,
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {counts.map((n, i) => (n ? <span key={i}>{labels[i]}: {n}</span> : null))}
        <span className="ml-auto">Cards you know move to a higher box and come back less often.</span>
      </p>
    </div>
  );
}

// --- Abfrage --------------------------------------------------------------------

function Review({ cards, color, onClose }: { cards: Card[]; color: CourseColor; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [result, setResult] = useState({ knew: 0, again: 0 });
  const card = cards[i];
  const finished = i >= cards.length;

  const answer = (knew: boolean) => {
    if (!card) return;
    void review(card.id, knew);
    setResult((r) => (knew ? { ...r, knew: r.knew + 1 } : { ...r, again: r.again + 1 }));
    setShown(false);
    setI((n) => n + 1);
  };

  // Leertaste = Antwort zeigen, 1 = nicht gewusst, 2 = gewusst, Esc = beenden (vor der Modulseite abfangen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation(); // nicht auch noch die Modulseite schließen
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
    <section aria-label="Review flashcards" className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <Button variant="plain" onClick={onClose} className="-ml-2">
          <X size={14} aria-hidden /> End review
        </Button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(Math.min(i, cards.length) / cards.length) * 100}%`, background: tone(color) }} />
        </div>
        <span className="text-[13px] tabular-nums text-muted">
          {Math.min(i + 1, cards.length)} / {cards.length}
        </span>
      </div>

      {finished ? (
        <div className="rounded-[10px] bg-surface px-6 py-10 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
            <Check size={20} aria-hidden />
          </span>
          <h2 className="mt-3 text-[17px] font-bold">Done for now</h2>
          <p className="mt-1 text-muted">
            You knew {result.knew} of {cards.length}.{result.again > 0 ? ` ${result.again} ${result.again === 1 ? "card comes" : "cards come"} back in your next review.` : ""}
          </p>
          <Button variant="primary" className="mt-5" onClick={onClose}>
            Back to Study
          </Button>
        </div>
      ) : (
        <div className="rounded-[10px] bg-surface px-6 py-8">
          <p className="text-[12px] text-muted">
            {displayName(card.file)}
            {card.page > 0 ? `, page ${card.page}` : ""}
          </p>
          <p className="mt-3 text-[19px] font-semibold leading-snug">{card.q}</p>
          {shown ? (
            <>
              <div className="my-5 h-px bg-line" />
              <p className="whitespace-pre-line text-[15px] leading-relaxed">{card.a}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                <Button onClick={() => answer(false)}>
                  <RotateCcw size={14} aria-hidden /> Didn’t know <Kbd>1</Kbd>
                </Button>
                <Button variant="primary" onClick={() => answer(true)}>
                  <Check size={14} aria-hidden /> Knew it <Kbd>2</Kbd>
                </Button>
              </div>
            </>
          ) : (
            <Button variant="primary" className="mt-7" onClick={() => setShown(true)}>
              Show answer <Kbd>Space</Kbd>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded bg-hover px-1 font-sans text-[11px] font-medium opacity-70">{children}</kbd>;
}

// --- Lernzettel -----------------------------------------------------------------

function Sheets({ course, files, color, onError }: { course: Course; files: CourseFile[]; color: CourseColor; onError: (m: string | null) => void }) {
  const study = useStudy();
  const sheets = study.sheets[course.id] ?? [];
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section aria-label="Study sheets">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-bold">Study sheets</h2>
        {!creating && (
          <Button onClick={() => setCreating(true)} disabled={study.available === false || files.length === 0}>
            <NotebookPen size={14} aria-hidden /> New study sheet
          </Button>
        )}
      </div>
      {creating && (
        <NewSheet
          course={course}
          color={color}
          onCancel={() => setCreating(false)}
          onDone={(sheet) => {
            setCreating(false);
            setOpen(sheet.id);
          }}
          onError={onError}
        />
      )}
      {sheets.length === 0 && !creating ? (
        <p className="rounded-[10px] bg-surface px-4 py-5 text-muted">
          Pick a few lectures and get one sheet with everything that matters, with page numbers to look things up.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sheets.map((s) => (
            <SheetItem key={s.id} sheet={s} color={color} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} onDelete={() => void deleteSheet(course.id, s.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NewSheet({
  course,
  color,
  onCancel,
  onDone,
  onError,
}: {
  course: Course;
  color: CourseColor;
  onCancel: () => void;
  onDone: (s: Sheet) => void;
  onError: (m: string | null) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [busySince, setBusySince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (busySince == null) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - busySince) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busySince]);

  const toggle = (k: string) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const groups = course.folders.map((f) => ({ ...f, files: f.files.filter((x) => SUPPORTED.test(x.name)) })).filter((f) => f.files.length);

  const submit = async () => {
    onError(null);
    setElapsed(0);
    setBusySince(Date.now());
    const res = await createSheet({ moduleId: course.id, moduleName: course.name, paths: chosen, focus: focus.trim() || undefined });
    setBusySince(null);
    if (res.error) onError(res.error);
    else if (res.sheet) onDone(res.sheet);
  };

  if (busySince != null) {
    return (
      <div className="mb-2 flex items-center gap-3 rounded-[10px] bg-surface px-4 py-4 text-[13px]" role="status">
        <Spinner />
        <span className="flex-1">
          <strong className="font-semibold">Writing your study sheet</strong>
          <span className="text-muted"> · usually 30–90 seconds · {elapsed} s</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-[10px] bg-surface p-4">
      <p className="text-[13px] font-semibold">Which files should the sheet cover?</p>
      <div className="mt-2 max-h-[280px] overflow-y-auto pr-1">
        {groups.map((g) => {
          const keys = g.files.map(keyOf);
          const all = keys.every((k) => chosen.includes(k));
          return (
            <div key={g.id} className="mb-2">
              <button
                onClick={() => setChosen((c) => (all ? c.filter((k) => !keys.includes(k)) : [...new Set([...c, ...keys])]))}
                className="mb-1 rounded px-1 text-[12px] font-semibold text-muted hover:text-text"
              >
                {g.name} · {all ? "none" : "all"}
              </button>
              <ul>
                {g.files.map((f) => {
                  const k = keyOf(f);
                  const on = chosen.includes(k);
                  return (
                    <li key={f.id}>
                      <label className="flex cursor-default items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-hover">
                        <input type="checkbox" checked={on} onChange={() => toggle(k)} className="size-3.5" style={{ accentColor: tone(color) }} />
                        <span className="truncate text-[13px]">{displayName(f.name)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <label className="mt-3 block">
        <span className="text-[13px] font-semibold">Focus (optional)</span>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. only what’s needed for the exam, or one topic"
          className="mt-1 h-8 w-full rounded-lg bg-sunken px-2.5 text-[13px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--focus)]"
        />
      </label>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-[12px] text-muted">{chosen.length ? `${chosen.length} chosen` : ""}</span>
        <Button variant="plain" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={chosen.length === 0} onClick={() => void submit()}>
          Write study sheet
        </Button>
      </div>
    </div>
  );
}

function SheetItem({ sheet, color, open, onToggle, onDelete }: { sheet: Sheet; color: CourseColor; open: boolean; onToggle: () => void; onDelete: () => void }) {
  const date = new Date(sheet.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <li className="rounded-[10px] bg-surface">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: tone(color, "soft"), color: tone(color, "ink") }}>
          <NotebookPen size={15} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{sheet.title}</span>
          <span className="block truncate text-[12px] text-muted">
            {date} · {sheet.files.length} {sheet.files.length === 1 ? "file" : "files"}
            {sheet.focus ? ` · ${sheet.focus}` : ""}
          </span>
        </span>
        {open ? <ChevronDown size={15} className="text-muted" aria-hidden /> : <ChevronRight size={15} className="text-muted" aria-hidden />}
      </button>
      {open && (
        <div className="border-t border-line-soft px-5 pb-5 pt-4">
          {sheet.sections.map((s, si) => (
            <section key={si} className="mb-5 last:mb-0">
              <h3 className="mb-2 text-[15px] font-bold" style={{ color: tone(color, "ink") }}>
                {s.heading}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {s.points.map((p, pi) => {
                  const src = p.file > 0 ? sheet.files[p.file - 1] : null;
                  return (
                    <li key={pi} className="flex gap-2 leading-relaxed">
                      <span className="mt-[9px] size-1.5 shrink-0 rounded-full" style={{ background: tone(color) }} aria-hidden />
                      <span className="min-w-0">
                        {p.text}
                        {src && (
                          <button
                            onClick={() => store.openFile(src.path)}
                            title={`Open ${src.name}`}
                            className="ml-1.5 inline-flex items-center rounded px-1.5 align-[1px] text-[11px] font-medium text-muted hover:bg-hover hover:text-text"
                            style={{ boxShadow: "inset 0 0 0 1px var(--line)" }}
                          >
                            {displayName(src.name)}
                            {p.page > 0 ? `, p. ${p.page}` : ""}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="mt-5 flex justify-end">
            <Button variant="plain" onClick={onDelete} className="text-muted">
              <Trash2 size={13} aria-hidden /> Delete sheet
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// --- Zusammenfassung pro Datei --------------------------------------------------

function SummaryRow({
  file,
  analysis,
  color,
  busy,
  onSummarize,
  disabled,
}: {
  file: CourseFile;
  analysis: Analysis | null;
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
            {ids.length} cards{learned ? ` · ${learned} learned` : ""}
            {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
          </button>
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
