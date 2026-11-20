"use client";

import { Check, Folder } from "lucide-react";
import { Button, Stage, Swatch, colorOf } from "./ui";
import { courses, TARGET_FOLDER } from "@/lib/mock-data";

export function Setup({
  selected,
  onChange,
  onStart,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  onStart: () => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const allOn = selected.length === courses.length;
  const n = selected.length;

  return (
    <Stage width={520}>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">Was soll auf deinen Mac?</h1>
      <p className="mt-1.5 text-muted">Wir haben die Kurse aus diesem Semester gefunden. Du kannst das später ändern.</p>

      <section className="mt-7">
        <h2 className="mb-2 font-semibold">Speicherort</h2>
        <div className="flex items-center gap-3 rounded-[10px] bg-surface py-2 pl-3.5 pr-2">
          <Folder size={16} className="text-muted" aria-hidden />
          <span className="flex-1 truncate font-medium">{TARGET_FOLDER}</span>
          <Button>Ändern…</Button>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Kurse</h2>
          <Button variant="plain" className="-mr-2 h-7 px-2 text-muted" onClick={() => onChange(allOn ? [] : courses.map((c) => c.id))}>
            {allOn ? "Keinen" : "Alle"}
          </Button>
        </div>
        <ul className="flex flex-col gap-1">
          {courses.map((c) => {
            const on = selected.includes(c.id);
            return (
              <li key={c.id}>
                <label className="flex items-center gap-3 rounded-[10px] bg-surface px-3.5 py-3 hover:bg-hover">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="peer sr-only" />
                  <span
                    aria-hidden
                    className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)] ${
                      on ? "border-accent bg-accent text-on-accent" : "border-line"
                    }`}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <Swatch color={colorOf(c)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-[12px] text-muted">{c.lecturer}</span>
                  </span>
                  <span className="text-[12px] tabular-nums text-muted">{c.total} Dateien</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-7 flex items-center justify-end gap-4">
        <span className="text-[12px] text-muted">
          {n === 0 ? "Wähl mindestens einen Kurs." : `${n} von ${courses.length} Kursen`}
        </span>
        <Button variant="primary" className="h-10 px-5 text-[14px]" disabled={n === 0} onClick={onStart}>
          Kurse holen
        </Button>
      </div>
    </Stage>
  );
}
