import type { ButtonHTMLAttributes, ReactNode } from "react";
import { File, FileArchive, FileText, Loader2 } from "lucide-react";
import { type Course, type CourseColor, type FileKind } from "@/lib/mock-data";
import { colorFor } from "@/lib/app-store";

type Variant = "primary" | "secondary" | "plain";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-on-accent hover:opacity-90 active:opacity-80",
    secondary: "border border-line bg-surface hover:bg-hover active:bg-hover",
    plain: "hover:bg-hover active:bg-hover",
  };
  return (
    <button
      {...props}
      className={`no-drag inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors disabled:opacity-45 ${styles[variant]} ${className}`}
    />
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" aria-hidden />;
}

export function FileIcon({ kind }: { kind: FileKind }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true, className: "shrink-0 text-muted" };
  if (kind === "zip") return <FileArchive {...props} />;
  if (kind === "pdf" || kind === "doc") return <FileText {...props} />;
  return <File {...props} />;
}

// --- Kursfarben -------------------------------------------------------------

// Reihenfolge der Farben steht in app-store.ts (colorFor), damit sie in der Mac-App überall gleich bleiben.
export function colorOf(course: Pick<Course, "id" | "color">): CourseColor {
  return course.color ?? colorFor(course.id);
}

/** Kursname ohne Semester-Vorsatz aus ILIAS ("[WS26/27] Softwaretechnik" → "Softwaretechnik"). */
export function nameOf(course: Pick<Course, "name">): string {
  return course.name.replace(/^\s*\[[^\]]*\]\s*/, "");
}

/** Kurzname für enge Stellen (Wochenstreifen). Ohne `short`: Name, ab 14 Zeichen gekürzt. */
export function shortOf(course: Pick<Course, "name" | "short">): string {
  if (course.short) return course.short;
  const n = nameOf(course);
  return n.length > 14 ? `${n.slice(0, 12).trimEnd()}…` : n;
}

/** CSS-Farbe eines Kurses: "solid" kräftig, "soft" zarte Fläche, "ink" Schrift auf der Fläche. */
export function tone(color: CourseColor, part: "solid" | "soft" | "ink" = "solid") {
  return part === "solid" ? `var(--c-${color})` : `var(--c-${color}-${part})`;
}

export function Swatch({ color, size = 10 }: { color: CourseColor; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[3px]"
      style={{ width: size, height: size, background: tone(color) }}
    />
  );
}

// --- Bausteine --------------------------------------------------------------

// Bühne für Login, Einrichtung und Import: Fensterleiste oben, Inhalt zentriert.
export function Stage({ children, width = 420 }: { children: ReactNode; width?: number }) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="drag h-[52px] shrink-0" />
      <div className="scroll flex flex-1 items-start justify-center px-6 pb-12 pt-6">
        <div style={{ width }} className="max-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Notice({
  tone: kind,
  icon,
  children,
  action,
}: {
  tone: "danger" | "warn";
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  const color = kind === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn";
  return (
    <div role="alert" className={`flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 ${color}`}>
      <span className="shrink-0">{icon}</span>
      <p className="min-w-0 flex-1 font-medium">{children}</p>
      {action}
    </div>
  );
}

/** Ordner verständlich benennen: "~/Uni" → "Uni" (statt Pfad im Knopf). */
export function folderName(dir: string): string {
  return dir.split("/").filter(Boolean).pop() ?? dir;
}

/** "the “Uni” folder in your home folder" für ~/Uni, sonst "the “Uni” folder". */
export function folderPlace(dir: string): string {
  const name = folderName(dir);
  return /^~\/[^/]+\/?$/.test(dir) ? `the “${name}” folder in your home folder` : `the “${name}” folder`;
}

/** „today“, „tomorrow“, „in 82 days“ (für den Klausur-Countdown). */
export function inDays(n: number): string {
  return n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}
