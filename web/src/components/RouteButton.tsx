"use client";

// „Route“-Knopf mit Rückmeldung: Nach dem Klick steht kurz „Opening Maps…“, damit man sieht, dass etwas passiert.

import { useEffect, useRef, useState } from "react";
import { Check, Navigation } from "lucide-react";
import type { Route } from "@/lib/rooms";

export function RouteButton({ route, label = "Route", primary = true }: { route: Route; label?: string; primary?: boolean }) {
  const [opened, setOpened] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <a
      href={route.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        setOpened(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setOpened(false), 2200);
      }}
      title={route.exact ? `Walking route to ${route.label}` : `Walking route to “${route.label}” (Apple Maps searches for it)`}
      className={`press inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
        primary ? "bg-accent text-on-accent hover:opacity-90" : "bg-surface shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover"
      }`}
    >
      {opened ? <Check size={13} aria-hidden /> : <Navigation size={13} aria-hidden />}
      {opened ? "Opening Maps…" : label}
    </a>
  );
}
