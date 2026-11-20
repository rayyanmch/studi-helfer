"use client";

import { Folder } from "lucide-react";
import { Button, Stage } from "./ui";
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
    <Stage width={480}>
      <h1 className="text-[22px] font-semibold tracking-tight">Einrichtung</h1>
      <p className="mt-1 text-muted">Wähle, wohin die Dateien kommen und welche Kurse du brauchst.</p>

      <section className="mt-6">
        <h2 className="mb-1.5 font-medium">Zielordner</h2>
        <div className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
          <Folder size={16} className="text-muted" aria-hidden />
          <span className="flex-1 truncate">{TARGET_FOLDER}</span>
          <Button>Ändern…</Button>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="font-medium">Kurse dieses Semesters</h2>
          <Button variant="plain" className="-mr-2 h-6 px-2 text-accent" onClick={() => onChange(allOn ? [] : courses.map((c) => c.id))}>
            {allOn ? "Alle abwählen" : "Alle wählen"}
          </Button>
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {courses.map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-[12px] text-muted">{c.lecturer}</span>
                </span>
                <span className="text-[12px] text-muted">{c.total} Dateien</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 flex items-center justify-end gap-3">
        <span className="text-[12px] text-muted">
          {n === 0 ? "Wähle mindestens einen Kurs." : `${n} von ${courses.length} Kursen gewählt`}
        </span>
        <Button variant="primary" className="h-8 px-4" disabled={n === 0} onClick={onStart}>
          Import starten
        </Button>
      </div>
    </Stage>
  );
}
