"use client";

// Datei-Zeile und Hervorhebung, gemeinsam für Übersicht, „New“, Suche und Modulseite.

import { BookOpen, Check, CircleCheck, ClipboardList, Folder, GraduationCap, Info, PencilLine, Presentation, Video, type LucideIcon } from "lucide-react";
import { Button, FileIcon, colorOf, tone } from "./ui";
import type { CourseColor, CourseFile, FileKind, Folder as FolderData } from "@/lib/mock-data";
import { DocTag } from "./DocTag";
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

/** Datei-Symbol als Blatt mit Eselsohr in Kursfarbe, unten die Endung (PDF, ZIP …). */
export function DocTile({ name, kind, color, solid, size = 32 }: { name: string; kind: FileKind; color: CourseColor; solid?: boolean; size?: number }) {
  const ext = (name.match(/\.([a-z0-9]{1,4})$/i)?.[1] ?? (kind === "other" ? "" : kind)).toUpperCase();
  const w = Math.round(size * 0.8);
  const fold = Math.round(size * 0.28);
  return (
    <span aria-hidden className="relative inline-flex shrink-0 items-end justify-center" style={{ width: w, height: size }}>
      <span
        className="absolute inset-0 rounded-[5px]"
        style={{
          background: solid ? tone(color) : `color-mix(in srgb, ${tone(color)} 26%, var(--surface))`,
          clipPath: `polygon(0 0, calc(100% - ${fold}px) 0, 100% ${fold}px, 100% 100%, 0 100%)`,
        }}
      />
      <span
        className="absolute right-0 top-0 rounded-bl-[3px]"
        style={{
          width: fold,
          height: fold,
          background: solid ? "var(--on-solid)" : tone(color),
          opacity: solid ? 0.45 : 0.7,
          clipPath: "polygon(0 0, 100% 100%, 0 100%)",
        }}
      />
      {ext && (
        <span
          className="relative font-bold leading-none"
          style={{ fontSize: Math.max(7.5, size * 0.25), marginBottom: Math.round(size * 0.14), color: solid ? "var(--on-solid)" : tone(color, "ink") }}
        >
          {ext}
        </span>
      )}
    </span>
  );
}

// Art der Dateien → Symbol. In der Mac-App kommt `category` mit, bei Beispieldaten raten wir aus dem Namen.
const CATEGORY_ICON: [string, RegExp, LucideIcon][] = [
  ["solutions", /solution|lösung/i, CircleCheck],
  ["exams", /exam|klausur/i, ClipboardList],
  ["selfstudy", /self.?study/i, GraduationCap],
  ["readings", /reading|literat/i, BookOpen],
  ["exercises", /exercise|übung|sheet|tutor/i, PencilLine],
  ["lectures", /lecture|slides|vorlesung|notes/i, Presentation],
  ["info", /info|general|orga/i, Info],
  ["recordings", /recording|video/i, Video],
];

/** Kleines Symbol in voller Kursfarbe für eine Art von Dateien („Lecture slides“, „Exercises“ …). */
export function FolderBadge({ name, category, color, size = 24 }: { name: string; category?: string; color: CourseColor; size?: number }) {
  const hit = CATEGORY_ICON.find(([id, re]) => (category ? id === category : re.test(name)));
  const Icon = hit?.[2] ?? Folder;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-[7px]" style={{ width: size, height: size, background: tone(color), color: "var(--on-solid)" }}>
      <Icon size={Math.round(size * 0.56)} strokeWidth={2.1} />
    </span>
  );
}

export function FileRow({
  file,
  sub,
  courseId,
  color,
  compact,
  highlight,
  solutions,
  sheet,
  folder,
  noTag,
}: {
  file: CourseFile;
  folder?: Pick<FolderData, "category" | "name">; // für die Art (Tag); fehlt er, wird er in den Kursen gesucht
  noTag?: boolean;
  sub?: string; // eigene Unterzeile; sonst Teil + Ordner
  courseId?: string; // Datei-Symbol in der Farbe dieses Kurses (in Listen über mehrere Kurse)
  color?: CourseColor; // Datei-Symbol in dieser Farbe (Modulseite)
  compact?: boolean;
  highlight?: string;
  solutions?: CourseFile[]; // Lösungen zu diesem Blatt (Chip „Solution“ neben dem Namen)
  sheet?: CourseFile; // diese Datei ist die Lösung zu diesem Blatt
}) {
  const desktop = appStore.get().mode === "desktop";
  const changed = Boolean(file.changeNote);
  const auto = [file.part, shortWhere(file.where)].filter(Boolean).join(" · ");
  const line2 = changed ? file.changeNote : (sub ?? (sheet ? `Solution to ${displayName(sheet.name)}` : auto));
  const open = () => store.openFile(file.path, file.id);
  const tint = color ?? (courseId ? colorOf({ id: courseId, color: appStore.get().courses.find((c) => c.id === courseId)?.color }) : undefined);
  return (
    <li
      onDoubleClick={open}
      title={desktop ? "Double-click to open" : undefined}
      className="group flex min-h-[48px] items-center gap-3 rounded-[8px] px-2.5 py-1.5 transition-colors hover:bg-[var(--row-hover,var(--hover))] focus-within:bg-[var(--row-hover,var(--hover))]"
      style={tint ? ({ "--row-hover": `color-mix(in srgb, ${tone(tint, "soft")} 70%, transparent)` } as React.CSSProperties) : undefined}
    >
      {tint ? <DocTile name={file.name} kind={file.kind} color={tint} size={30} /> : <FileIcon kind={file.kind} />}
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <span className="truncate" title={file.name}>
            <Highlight text={displayName(file.name)} q={highlight} />
          </span>
          {!noTag && <DocTag file={file} folder={folder ?? folderOf(file)} />}
          {changed && <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-px text-[11px] font-semibold text-warn">updated</span>}
          {!changed && file.isNew && <span className="shrink-0 rounded-full bg-[var(--c-green-soft)] px-1.5 py-px text-[11px] font-semibold text-[var(--c-green-ink)]">new</span>}
          {solutions?.map((s, i) => (
            <SolutionChip key={s.id} file={s} color={tint} label={solutions.length > 1 ? `Solution ${i + 1}` : "Solution"} />
          ))}
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

/** Ordner einer Datei in den geladenen Kursen (für die Art, wenn der Aufrufer ihn nicht kennt). */
function folderOf(file: CourseFile): FolderData | undefined {
  for (const c of appStore.get().courses) for (const f of c.folders) if (f.files.some((x) => x.id === file.id)) return f;
  return undefined;
}

/** Kleiner Knopf neben dem Blatt: öffnet die passende Lösung. */
function SolutionChip({ file, color, label }: { file: CourseFile; color?: CourseColor; label: string }) {
  return (
    <button
      onClick={() => store.openFile(file.path, file.id)}
      onDoubleClick={(e) => e.stopPropagation()}
      title={`Open ${file.name}`}
      aria-label={`${label}: open ${displayName(file.name)}`}
      className="inline-flex h-[20px] shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold transition-[filter] hover:brightness-95"
      style={
        color
          ? { background: tone(color, "soft"), color: tone(color, "ink"), boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone(color)} 45%, transparent)` }
          : { background: "var(--sunken)", color: "var(--text)" }
      }
    >
      <CircleCheck size={11} strokeWidth={2.4} aria-hidden />
      {label}
    </button>
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
      {done && <Check size={12} strokeWidth={3.2} aria-hidden className="check-pop" />}
    </button>
  );
}
