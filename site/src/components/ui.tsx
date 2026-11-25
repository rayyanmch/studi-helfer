import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { APP_STORE_URL, DOWNLOAD_URL } from "@/lib/links";
import type { Tone } from "@/lib/week";

/** CSS-Variablen einer Kursfarbe für ein Element: --c (kräftig), --soft, --ink */
export function tone(t: Tone): CSSProperties {
  return {
    ["--c" as string]: `var(--c-${t})`,
    ["--soft" as string]: `var(--c-${t}-soft)`,
    ["--ink-c" as string]: `var(--c-${t}-ink)`,
  };
}

export function AppIcon({ size, className = "" }: { size: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: size * 0.225 }}
      priority={size > 60}
    />
  );
}

export function DownloadButtons({ size = "lg", align = "start" }: { size?: "lg" | "md"; align?: "start" | "center" }) {
  const h = size === "lg" ? "h-[52px] text-[17px]" : "h-12 text-base";
  return (
    <div className={`flex flex-wrap gap-3 ${align === "center" ? "justify-center" : ""}`}>
      <a
        href={DOWNLOAD_URL}
        className={`press inline-flex items-center gap-2.5 rounded-full bg-accent px-[26px] font-semibold text-on-accent hover:bg-[color-mix(in_srgb,var(--accent)_86%,var(--bg))] ${h}`}
      >
        <ArrowDown aria-hidden className="nudge" size={18} strokeWidth={2.2} />
        Download for Mac
      </a>
      <a
        href={APP_STORE_URL}
        className={`press inline-flex items-center rounded-full px-6 font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface ${h}`}
      >
        Mac App Store
      </a>
    </div>
  );
}

/** Kleines Dokument-Symbol mit Eselsohr in Kursfarbe, wie in der App */
export function DocGlyph({ t, size = 14 }: { t: Tone; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size * 1.2} viewBox="0 0 14 17" className="flex-none">
      <path d="M1 2a1 1 0 0 1 1-1h7l4 4v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" fill={`var(--c-${t})`} />
      <path d="M9 1v4h4" fill={`var(--c-${t}-ink)`} opacity={0.55} />
    </svg>
  );
}

export function TrafficLights({ size = 12 }: { size?: number }) {
  return (
    <div aria-hidden className="flex gap-2">
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <span key={c} className="rounded-full" style={{ width: size, height: size, background: c }} />
      ))}
    </div>
  );
}

export function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1160px] px-6 sm:px-8 ${className}`}>
      {children}
    </section>
  );
}

export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`m-0 text-[clamp(38px,5vw,64px)] font-medium leading-[1.02] tracking-[-0.04em] text-balance ${className}`}
    >
      {children}
    </h2>
  );
}

export function Lead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-[19px] leading-[1.5] text-muted text-pretty ${className}`}>{children}</p>;
}
