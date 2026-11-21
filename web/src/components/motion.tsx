"use client";

// Kleine Bewegungs-Helfer (Zahlen hochzählen, „Bewegung reduzieren“ abfragen, Fläche gleiten lassen).
// Regeln wie in globals.css: nur transform/opacity, ease-out, kurz; bei „Bewegung reduzieren“ sofort am Ziel.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Zahl zählt beim ersten Zeigen von 0 hoch und gleitet bei Änderungen zum neuen Wert. */
export function useCountUp(value: number, { duration = 700, delay = 120 }: { duration?: number; delay?: number } = {}) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    let raf = 0;
    const a = from.current;
    if (reducedMotion() || a === value) {
      raf = requestAnimationFrame(() => {
        from.current = value;
        setN(value);
      });
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now() + (a === 0 ? delay : 0);
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / duration));
      const v = a + (value - a) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      setN(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);
  return Math.round(n);
}

/** Zählende Zahl als Element (für Stellen ohne eigenen Hook). */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const n = useCountUp(value);
  return (
    <span className="tabular-nums">
      {n}
      {suffix}
    </span>
  );
}

/**
 * Gleitende Markierung: misst das gewählte Element in `host` (Selektor) und schiebt `thumb` per transform dorthin.
 * Beim ersten Messen ohne Übergang, danach mit (CSS-Übergang am Thumb).
 */
export function useSlidingThumb(deps: unknown[], selector: string) {
  const host = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const ready = useRef(false);
  useLayoutEffect(() => {
    const h = host.current;
    const t = thumb.current;
    if (!h || !t) return;
    const place = () => {
      const el = h.querySelector<HTMLElement>(selector);
      if (!el) {
        t.style.opacity = "0";
        return;
      }
      t.style.opacity = "1";
      t.style.width = `${el.offsetWidth}px`;
      t.style.height = `${el.offsetHeight}px`;
      t.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
    };
    if (!ready.current) {
      t.style.transition = "none";
      place();
      void t.offsetWidth;
      t.style.transition = "";
      ready.current = true;
    } else place();
    // Nur bei echter Größenänderung neu setzen (der erste Aufruf kommt sofort und würde den Übergang abbrechen)
    let size = `${h.offsetWidth}x${h.offsetHeight}`;
    const ro = new ResizeObserver(() => {
      const now = `${h.offsetWidth}x${h.offsetHeight}`;
      if (now === size) return;
      size = now;
      t.style.transition = "none";
      place();
      void t.offsetWidth;
      t.style.transition = "";
    });
    ro.observe(h);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { host, thumb };
}
