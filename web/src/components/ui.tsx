import type { ButtonHTMLAttributes, ReactNode } from "react";
import { File, FileArchive, FileText, Loader2 } from "lucide-react";
import type { FileKind } from "@/lib/mock-data";

type Variant = "primary" | "secondary" | "plain";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-on-accent hover:brightness-95 active:brightness-90",
    secondary: "border border-line bg-bg hover:bg-hover active:bg-hover",
    plain: "hover:bg-hover active:bg-hover",
  };
  return (
    <button
      {...props}
      className={`no-drag inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" aria-hidden />;
}

export function FileIcon({ kind }: { kind: FileKind }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true };
  if (kind === "pdf") return <FileText {...props} className="text-danger" />;
  if (kind === "zip") return <FileArchive {...props} className="text-warn" />;
  if (kind === "doc") return <FileText {...props} className="text-accent" />;
  return <File {...props} className="text-muted" />;
}

// Bühne für Login, Einrichtung und Import: Fensterleiste oben, Inhalt zentriert.
export function Stage({ children, width = 400 }: { children: ReactNode; width?: number }) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="drag h-[52px] shrink-0" />
      <div className="scroll flex flex-1 items-start justify-center px-6 pb-10 pt-4">
        <div style={{ width }} className="max-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Notice({
  tone,
  icon,
  children,
  action,
}: {
  tone: "danger" | "warn";
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  const color = tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn";
  return (
    <div role="alert" className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 ${color}`}>
      <span className="shrink-0">{icon}</span>
      <p className="min-w-0 flex-1 text-[13px]">{children}</p>
      {action}
    </div>
  );
}
