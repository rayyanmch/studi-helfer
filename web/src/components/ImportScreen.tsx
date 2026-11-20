"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button, Spinner, Stage } from "./ui";
import { courses } from "@/lib/mock-data";

const FAIL_ID = "rechnernetze";
const FAIL_AT = 0.4;
const SPEEDS = [2, 3, 1, 2, 1];

export function ImportScreen({
  courseIds,
  failOne,
  onDone,
}: {
  courseIds: string[];
  failOne: boolean;
  onDone: () => void;
}) {
  const list = courses.filter((c) => courseIds.includes(c.id));
  const [done, setDone] = useState<Record<string, number>>({});
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => {
      setDone((prev) => {
        const next = { ...prev };
        list.forEach((c, i) => {
          const cur = next[c.id] ?? 0;
          const cap = failOne && !retried && c.id === FAIL_ID ? Math.floor(c.total * FAIL_AT) : c.total;
          next[c.id] = Math.min(cap, cur + SPEEDS[i % SPEEDS.length]);
        });
        return next;
      });
    }, 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failOne, retried, courseIds.join(",")]);

  const rows = list.map((c) => {
    const count = done[c.id] ?? 0;
    const failed = failOne && !retried && c.id === FAIL_ID && count >= Math.floor(c.total * FAIL_AT);
    return { c, count, failed, finished: count >= c.total };
  });
  const allSettled = rows.every((r) => r.finished || r.failed);
  const ok = rows.filter((r) => r.finished).length;
  const failedCount = rows.filter((r) => r.failed).length;

  return (
    <Stage width={480}>
      <h1 className="text-[22px] font-semibold tracking-tight">
        {allSettled ? "Import abgeschlossen" : "Importiere deine Kurse…"}
      </h1>
      <p className="mt-1 text-muted">
        {allSettled
          ? failedCount > 0
            ? `${ok} Kurse fertig, ${failedCount} mit Fehler.`
            : "Alles ist in deinem Zielordner."
          : "Das kann ein paar Minuten dauern. Du kannst die App weiter benutzen."}
      </p>

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {rows.map(({ c, count, failed, finished }) => (
          <li key={c.id} className="px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              {failed ? (
                <span className="flex items-center gap-1 text-danger">
                  <AlertTriangle size={14} aria-hidden /> Fehlgeschlagen
                </span>
              ) : finished ? (
                <span className="flex items-center gap-1 text-accent">
                  <Check size={14} aria-hidden /> Fertig
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-muted">
                  <Spinner size={12} /> {count} von {c.total} Dateien
                </span>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={count}
              aria-valuemax={c.total}
              aria-label={`${c.name}: ${count} von ${c.total} Dateien`}
              className="mt-2 h-1 overflow-hidden rounded-full bg-hover"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ease-out ${failed ? "bg-danger" : "bg-accent"}`}
                style={{ width: `${(count / c.total) * 100}%` }}
              />
            </div>
            {failed && (
              <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
                <span className="flex-1">Der Kurs hat nicht geantwortet. Die anderen sind nicht betroffen.</span>
                <Button className="h-6 px-2.5" onClick={() => setRetried(true)}>
                  Erneut versuchen
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" className="h-8 px-4" disabled={!allSettled} onClick={onDone}>
          {allSettled ? "Zur Übersicht" : "Läuft…"}
        </Button>
      </div>
    </Stage>
  );
}
