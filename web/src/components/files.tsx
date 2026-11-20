"use client";

// Datei-Zeile und Hervorhebung, gemeinsam für Übersicht, „New“, Suche und Modulseite.

import { Check } from "lucide-react";
import { Button, FileIcon, Swatch, colorOf } from "./ui";
import type { CourseFile } from "@/lib/mock-data";
import * as store from "@/lib/app-store";
import { appStore } from "@/lib/app-store";
import { displayName, shortWhere } from "@/lib/names";

export { displayName, shortWhere };

export function Highlight({ text, q }: { text: string; q?: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-[var(--c-ochre-soft)] px-px font-semibold text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function FileRow({
  file,
  sub,
  courseId,
  compact,
  highlight,
}: {
  file: CourseFile;
  sub?: string; // eigene Unterzeile; sonst Teil + Ordner
  courseId?: string; // Farbpunkt statt Datei-Symbol (in Listen über mehrere Kurse)
  compact?: boolean;
  highlight?: string;
}) {
  const desktop = appStore.get().mode === "desktop";
  const changed = Boolean(file.changeNote);
  const auto = [file.part, shortWhere(file.where)].filter(Boolean).join(" · ");
  const line2 = changed ? file.changeNote : (sub ?? auto);
  const open = () => store.openFile(file.path, file.id);
  return (
    <li
      onDoubleClick={open}
      title={desktop ? "Double-click to open" : undefined}
      className="group flex min-h-[46px] items-center gap-3 rounded-[7px] px-2.5 py-1.5 hover:bg-hover focus-within:bg-hover"
    >
      {courseId ? <Swatch color={colorOf({ id: courseId, color: appStore.get().courses.find((c) => c.id === courseId)?.color })} /> : <FileIcon kind={file.kind} />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={file.name}>
          <Highlight text={displayName(file.name)} q={highlight} />
          {changed && <span className="ml-2 text-[12px] font-semibold text-warn">updated</span>}
          {!changed && file.isNew && <span className="ml-2 text-[12px] font-semibold text-ok">new</span>}
        </p>
        {line2 && <p className="truncate text-[12px] text-muted">{line2}</p>}
      </div>
      <div className="hidden items-center gap-1.5 group-hover:flex group-focus-within:flex">
        {changed && !desktop && <Button className="h-7 px-2.5">What changed</Button>}
        <Button className="h-7 px-2.5" onClick={open}>
          Open
        </Button>
        {!compact && (
          <Button className="h-7 px-2.5" onClick={() => store.revealFile(file.path)}>
            Show in Finder
          </Button>
        )}
      </div>
      <span className="w-[72px] shrink-0 text-right text-[12px] text-muted group-hover:hidden group-focus-within:hidden">{file.updated}</span>
      {!compact && <span className="w-[56px] shrink-0 text-right text-[12px] tabular-nums text-muted">{file.size}</span>}
    </li>
  );
}

export function CheckButton({ done, onClick, label, onSolid }: { done: boolean; onClick: () => void; label: string; onSolid?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={done}
      aria-label={done ? `${label}: mark as open` : `${label}: mark as done`}
      title={done ? "Mark as open" : "Done"}
      className={`flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors ${
        done
          ? "bg-accent text-on-accent"
          : onSolid
            ? "border-2 border-[var(--on-solid)] opacity-90 hover:bg-white/20"
            : "border-2 border-current bg-surface hover:bg-hover"
      }`}
    >
      {done && <Check size={12} strokeWidth={3.2} aria-hidden />}
    </button>
  );
}
