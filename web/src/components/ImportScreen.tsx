"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button, Spinner, Stage, Swatch, colorOf, tone } from "./ui";
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
  const files = rows.reduce((n, r) => n + r.count, 0);

  return (
    <Stage width={520}>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">
        {allSettled ? "Deine Kurse sind da" : "Hole deine Kurse…"}
      </h1>
      <p className="mt-1.5 text-muted">
        {allSettled
          ? failedCount > 0
            ? `${ok} Kurse fertig, einer hat nicht geklappt.`
            : `${files} Dateien liegen jetzt in ~/Uni.`
          : "Das dauert beim ersten Mal ein paar Minuten. Du kannst solange weiterarbeiten."}
      </p>

      <ul className="mt-7 flex flex-col gap-1">
        {rows.map(({ c, count, failed, finished }) => {
          const col = colorOf(c);
          return (
            <li key={c.id} className="rounded-[10px] bg-surface px-3.5 py-3">
              <div className="flex items-center gap-3">
                <Swatch color={col} />
                <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                {failed ? (
                  <span className="flex items-center gap-1 text-[13px] font-medium text-danger">
                    <AlertTriangle size={14} aria-hidden /> Fehlgeschlagen
                  </span>
                ) : finished ? (
                  <span className="flex items-center gap-1 text-[13px] font-medium text-ok">
                    <Check size={14} aria-hidden /> {c.total} Dateien
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[13px] tabular-nums text-muted">
                    <Spinner size={12} /> {count} von {c.total}
                  </span>
                )}
              </div>
              <div
                role="progressbar"
                aria-valuenow={count}
                aria-valuemax={c.total}
                aria-label={`${c.name}: ${count} von ${c.total} Dateien`}
                className="mt-2.5 h-1.5 overflow-hidden rounded-full"
                style={{ background: tone(col, "soft") }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${(count / c.total) * 100}%`, background: failed ? "var(--danger)" : tone(col) }}
                />
              </div>
              {failed && (
                <div className="mt-2.5 flex items-center gap-3 text-[12px] text-muted">
                  <span className="flex-1">ILIAS hat für diesen Kurs nicht geantwortet. Die anderen sind nicht betroffen.</span>
                  <Button className="h-7 px-2.5" onClick={() => setRetried(true)}>
                    Erneut versuchen
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-7 flex justify-end">
        <Button variant="primary" className="h-10 px-5 text-[14px]" disabled={!allSettled} onClick={onDone}>
          {allSettled ? "Los geht’s" : "Läuft…"}
        </Button>
      </div>
    </Stage>
  );
}
