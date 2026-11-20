"use client";

// Holen von Dateien im Hintergrund (erster Import oder normaler Sync), hier noch simuliert.
// Später liefert desktop.ts den echten Zustand (SyncState über onSyncState).

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { Spinner, Swatch, colorOf, nameOf } from "./ui";
import type { Course, CourseColor } from "@/lib/mock-data";

export type JobKind = "import" | "sync";
type RowStatus = "waiting" | "running" | "done" | "failed";

export interface JobRow {
  id: string;
  name: string;
  color: CourseColor;
  total: number;
  count: number;
  status: RowStatus;
}

export interface Job {
  kind: JobKind;
  rows: JobRow[];
  running: boolean;
  stopped: boolean;
}

const FAIL_ID = "rechnernetze";
const TICK_MS = 220;

export function useJob(onFinish: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const failRef = useRef(false);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });

  const start = useCallback((kind: JobKind, courses: Course[], failOne = false) => {
    failRef.current = failOne && kind === "import";
    setJob({
      kind,
      running: true,
      stopped: false,
      rows: courses.map((c, i) => ({
        id: c.id,
        name: nameOf(c),
        color: colorOf(c),
        total: kind === "import" ? c.total : 3,
        count: 0,
        status: i === 0 ? "running" : "waiting",
      })),
    });
  }, []);

  const stop = useCallback(() => setJob((j) => (j ? { ...j, running: false, stopped: true } : j)), []);
  const dismiss = useCallback(() => setJob(null), []);
  const retry = useCallback((id: string) => {
    failRef.current = false;
    setJob((j) =>
      j && {
        ...j,
        running: true,
        rows: j.rows.map((r) => (r.id === id ? { ...r, status: "running" } : r)),
      },
    );
  }, []);

  // Eine Sache nach der anderen: immer der laufende Kurs bekommt neue Dateien.
  useEffect(() => {
    if (!job?.running) return;
    const t = window.setInterval(() => {
      setJob((j) => {
        if (!j || !j.running) return j;
        const rows = j.rows.map((r) => ({ ...r }));
        const cur = rows.find((r) => r.status === "running");
        if (!cur) {
          const next = rows.find((r) => r.status === "waiting");
          if (next) next.status = "running";
          else return { ...j, rows, running: false };
          return { ...j, rows };
        }
        const step = j.kind === "import" ? Math.max(2, Math.ceil(cur.total / 9)) : 1;
        cur.count = Math.min(cur.total, cur.count + step);
        if (failRef.current && cur.id === FAIL_ID && cur.count >= cur.total * 0.4) {
          cur.status = "failed";
        } else if (cur.count >= cur.total) {
          cur.status = "done";
        }
        if (cur.status !== "running") {
          const next = rows.find((r) => r.status === "waiting");
          if (next) next.status = "running";
          else return { ...j, rows, running: false };
        }
        return { ...j, rows };
      });
    }, TICK_MS);
    return () => window.clearInterval(t);
  }, [job?.running]);

  // Fertig melden (einmal pro Lauf)
  const reported = useRef<Job | null>(null);
  useEffect(() => {
    if (job && !job.running && !job.stopped && reported.current !== job) {
      reported.current = job;
      finishRef.current(job);
    }
  }, [job]);

  return { job, start, stop, dismiss, retry };
}

export function jobProgress(job: Job) {
  const n = job.rows.length;
  const done = job.rows.filter((r) => r.status === "done" || r.status === "failed").length;
  const cur = job.rows.find((r) => r.status === "running");
  const frac = n === 0 ? 1 : (done + (cur ? cur.count / cur.total : 0)) / n;
  return { n, done, cur, frac, failed: job.rows.filter((r) => r.status === "failed") };
}

// Variante A2: kleines Fenster unten rechts, solange der erste Import läuft.
export function ImportPanel({ job, onRetry, onClose }: { job: Job; onRetry: (id: string) => void; onClose: () => void }) {
  const [small, setSmall] = useState(false);
  const { n, done, cur, frac, failed } = jobProgress(job);
  const finished = !job.running;
  const visible = job.rows.filter((r) => r.status === "running" || r.status === "failed" || r.status === "waiting").slice(0, 4);
  const waitingRest = job.rows.filter((r) => r.status === "waiting").length - visible.filter((r) => r.status === "waiting").length;

  // Ohne Fehler verschwindet das Fenster ein paar Sekunden nach dem Ende von selbst
  useEffect(() => {
    if (!finished || failed.length > 0) return;
    const t = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(t);
  }, [finished, failed.length, onClose]);

  return (
    <section
      aria-label="Getting your courses"
      aria-live="polite"
      className="no-drag absolute bottom-5 right-5 z-30 w-[300px] rounded-[12px] bg-surface p-3.5 shadow-[0_0_0_1px_var(--line),0_14px_34px_rgba(0,0,0,0.16)]"
    >
      <div className="flex items-center gap-2">
        {finished ? (
          failed.length > 0 ? (
            <AlertTriangle size={15} className="text-danger" aria-hidden />
          ) : (
            <Check size={15} className="text-ok" aria-hidden />
          )
        ) : (
          <Spinner size={13} />
        )}
        <b className="min-w-0 flex-1 truncate font-semibold">
          {finished ? (failed.length > 0 ? `${n - failed.length} of ${n} courses ready` : "All courses are ready") : "Getting your courses"}
        </b>
        {!finished && <span className="text-[12px] tabular-nums text-muted">{done} of {n}</span>}
        {!finished ? (
          <button
            onClick={() => setSmall((v) => !v)}
            aria-label={small ? "Expand" : "Minimize"}
            className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover"
          >
            {small ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        ) : (
          <button onClick={onClose} aria-label="Close" className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover">
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {!finished && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out" style={{ width: `${frac * 100}%` }} />
        </div>
      )}

      {!small && (
        <ul className="mt-2.5 flex flex-col gap-1.5 text-[12px]">
          {visible.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 ${r.status === "waiting" ? "text-muted" : ""}`}>
              <Swatch color={r.color} size={8} />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              {r.status === "running" && <span className="tabular-nums text-muted">{r.count} of {r.total}</span>}
              {r.status === "waiting" && <span>waiting</span>}
              {r.status === "failed" && (
                <button onClick={() => onRetry(r.id)} className="rounded font-semibold text-danger hover:underline">
                  Try again
                </button>
              )}
            </li>
          ))}
          {waitingRest > 0 && <li className="text-muted">and {waitingRest} more</li>}
          {finished && failed.length === 0 && <li className="text-muted">Everything is now in ~/Uni.</li>}
        </ul>
      )}
      {cur && small && <p className="mt-2 truncate text-[12px] text-muted">now {cur.name}</p>}
    </section>
  );
}
