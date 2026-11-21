"use client";

// Termin aus Google Kalender anklicken: Details, Route (wenn ein Ort dabei steht) und Sprung zu Google Kalender.
// Einmal in der Übersicht eingehängt (<GoogleEventHost />); öffnen von überall mit openGoogleEvent(ev).

import { useEffect, useRef, useSyncExternalStore } from "react";
import { CalendarDays, Clock, ExternalLink, MapPin, X } from "lucide-react";
import { RouteButton } from "./RouteButton";
import { placeLabel, routeFor } from "@/lib/rooms";
import type { GoogleEvent } from "@/lib/mail-data";

let current: GoogleEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function openGoogleEvent(ev: GoogleEvent) {
  current = ev;
  emit();
}
const close = () => {
  current = null;
  emit();
};
const useCurrent = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );

const fmtDay = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

export function GoogleEventHost() {
  const ev = useCurrent();
  return ev ? <GoogleEventDialog ev={ev} /> : null;
}

function GoogleEventDialog({ ev }: { ev: GoogleEvent }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, []);
  const color = ev.color ?? "var(--muted)";
  const route = routeFor(ev.location, { allowText: true });
  const link = /https?:\/\/\S+/.exec(ev.location ?? "")?.[0];
  const [y, m, d] = [ev.date.slice(0, 4), +ev.date.slice(5, 7), +ev.date.slice(8, 10)];

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-4 pt-[9vh] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={ev.title} className="w-[480px] max-w-full rounded-[14px] bg-bg shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)] outline-none">
        <header className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[18px] font-bold">Google Calendar event</h2>
          <button onClick={close} aria-label="Close" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="px-5 pb-5">
          <div className="rounded-[12px] bg-surface p-4" style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }}>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-muted">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color }} /> {ev.calendar ?? "Google Calendar"}
            </p>
            <p className="mt-1 text-[17px] font-bold leading-snug">{ev.title}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span className="flex items-center gap-2">
                <CalendarDays size={14} className="text-muted" aria-hidden /> {fmtDay(ev.date)}
              </span>
              <span className="flex items-center gap-2">
                <Clock size={14} className="text-muted" aria-hidden /> {ev.time.replace(" to ", "–")}
              </span>
            </p>
            {ev.location && (
              <p className="mt-1 flex items-start gap-2 text-[13px]">
                <MapPin size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden /> <span className="min-w-0 break-words">{placeLabel(ev.location)}</span>
              </p>
            )}
            {route && !route.exact && <p className="mt-2 text-[12px] text-muted">Apple Maps looks this place up for you.</p>}
            {route?.exact && <p className="mt-2 text-[12px] text-muted">{route.label}</p>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {route && <RouteButton route={route} />}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="press inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-on-accent hover:opacity-90">
                Join online <ExternalLink size={13} aria-hidden />
              </a>
            )}
            <a
              href={`https://calendar.google.com/calendar/u/0/r/day/${y}/${m}/${d}`}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover"
            >
              Open in Google Calendar <ExternalLink size={13} aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
