"use client";

// Places (Entwurf S2 + D1): Orte zum Lernen rund um die Uni. Daten: OpenStreetMap (lib/places.ts).
// „Typisch für diese Zeit“ ist eine Schätzung nach Art des Ortes und trägt auch genau diese Beschriftung;
// Live-Zahlen von der Uni und Meldungen von Studenten kommen später als eigene Quellen dazu.

import { useEffect, useRef, useState } from "react";
import { BookOpen, Clock, ExternalLink, Footprints, Heart, Plug, Utensils, Wifi, X } from "lucide-react";
import { Button, Spinner } from "./ui";
import { RouteButton } from "./RouteButton";
import { PlacesMap } from "./PlacesMap";
import {
  DAY_NAMES,
  KIND_LABEL,
  LEVEL_TEXT,
  UNI,
  RADIUS,
  hoursRows,
  levelOf,
  loadPlaces,
  openState,
  startPlaces,
  typicalBusy,
  type Place,
  type PlaceKind,
} from "@/lib/places";

const FAV_KEY = "studi.placeFavs";
const KIND_ICON = { library: BookOpen, canteen: Utensils };
// Schlicht: nur Tinte, kein Ampel-Bunt (die Stufe steht als Wort daneben)
const LEVEL_OPACITY = { quiet: 0.35, some: 0.65, busy: 1 } as const;

type Filter = "open" | "wifi" | "library" | "canteen" | "fav";

function loadFavs(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(FAV_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function PlacesView() {
  // Sofort zeigen, was wir schon haben (gespeichert oder mitgeliefert), im Hintergrund frisch nachladen
  const [places, setPlaces] = useState<Place[]>(() => startPlaces());
  const [state, setState] = useState<"loading" | "ready" | "error">(() => (startPlaces().length ? "ready" : "loading"));
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [limit, setLimit] = useState(24);
  const [now, setNow] = useState(() => new Date());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadPlaces().then((r) => {
      if (!alive) return;
      setRefreshing(false);
      setStale(r.stale);
      if (r.error) {
        setError(r.error);
        setState((s) => (s === "ready" ? s : "error"));
        return;
      }
      setPlaces(r.places);
      setState("ready");
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const toggleFav = (id: string) =>
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        // egal
      }
      return next;
    });
  const toggle = (f: Filter) => setFilters((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const kinds = filters.filter((f): f is PlaceKind => f === "library" || f === "canteen");
  const rows = places
    .map((p) => ({ p, st: openState(p.hours, now) }))
    .filter(({ p, st }) => {
      if (filters.includes("open") && st.open !== true) return false;
      if (filters.includes("wifi") && p.wifi !== true) return false;
      if (filters.includes("fav") && !favs.includes(p.id)) return false;
      if (kinds.length && !kinds.includes(p.kind)) return false;
      return true;
    })
    // Was jetzt offen ist, steht oben; sonst nach Entfernung
    .sort((a, b) => Number(b.st.open === true) - Number(a.st.open === true) || a.p.meters - b.p.meters);
  const shown = rows.slice(0, limit);
  const current = places.find((p) => p.id === selected) ?? null;

  const chip = (f: Filter, label: string, icon?: React.ReactNode) => {
    const on = filters.includes(f);
    return (
      <button
        key={f}
        onClick={() => toggle(f)}
        aria-pressed={on}
        className={`press no-drag flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${on ? "bg-accent text-on-accent" : "bg-surface text-text shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover"}`}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <>
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em]">Places</h1>
          <p className="mt-1 text-muted">
            {UNI.name} · {state === "ready" ? `${rows.length} ${rows.length === 1 ? "spot" : "spots"}` : "loading…"} within {RADIUS / 1000} km
          </p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filters">
        {chip("open", "Open now", <Clock size={13} aria-hidden />)}
        {chip("wifi", "Wi-Fi", <Wifi size={13} aria-hidden />)}
        {chip("library", "Libraries", <BookOpen size={13} aria-hidden />)}
        {chip("canteen", "Mensa", <Utensils size={13} aria-hidden />)}
        {chip("fav", "Favorites", <Heart size={13} aria-hidden />)}
      </div>
      {state === "loading" && (
        <p className="mt-8 flex items-center gap-2 text-muted">
          <Spinner /> Looking for libraries and Mensas around your uni…
        </p>
      )}
      {state === "error" && (
        <div className="mt-6 flex items-center gap-3 rounded-[10px] bg-warn-soft px-4 py-3 text-warn" role="alert">
          <span className="flex-1 font-medium">{error}</span>
          <Button onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>Try again</Button>
        </div>
      )}
      {state === "ready" && (refreshing || stale) && (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          {refreshing ? <Spinner size={12} /> : null}
          {refreshing ? "Updating from the map…" : "Showing the saved list. The map service didn’t answer just now."}
        </p>
      )}

      {state === "ready" && (
        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
          <div className="lg:sticky lg:top-4">
            <PlacesMap places={shown.map((r) => r.p)} selected={selected} onSelect={setSelected} height={580} zoom={15} controls />
          </div>
          <div>
            {shown.length === 0 ? (
              <p className="rounded-[10px] bg-surface px-4 py-6 text-muted">
                {filters.includes("fav") ? "No favorites yet. Tap the heart on a spot." : "No spots match. Switch a filter off, for example “Open now”."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shown.map(({ p, st }, i) => (
                  <li key={p.id}>
                    <PlaceCard p={p} n={i + 1} st={st} now={now} fav={favs.includes(p.id)} active={selected === p.id} onFav={() => toggleFav(p.id)} onOpen={() => setSelected(p.id)} />
                  </li>
                ))}
              </ul>
            )}
            {rows.length > shown.length && (
              <div className="mt-3">
                <Button onClick={() => setLimit((l) => l + 24)}>Show more ({rows.length - shown.length})</Button>
              </div>
            )}
            <p className="mt-3 text-[12px] text-muted">“Usually quiet / busy” is an estimate by type of place and time of day, not a live count.</p>
          </div>
        </div>
      )}

      <p className="mt-8 text-[12px] text-muted">Map data © OpenStreetMap contributors. Opening hours as entered there; some spots have none.</p>

      {current && <PlaceSheet p={current} now={now} fav={favs.includes(current.id)} onFav={() => toggleFav(current.id)} onClose={() => setSelected(null)} />}
    </>
  );
}

function OpenLine({ st }: { st: ReturnType<typeof openState> }) {
  if (st.open === true) return <span className="font-semibold text-text">Open{st.until ? ` · until ${st.until}` : ""}</span>;
  if (st.open === false) return <span>Closed{st.opens ? ` · opens ${st.opens}` : ""}</span>;
  return <span>Hours not listed</span>;
}

function PlaceCard({ p, n, st, now, fav, active, onFav, onOpen }: { p: Place; n: number; st: ReturnType<typeof openState>; now: Date; fav: boolean; active: boolean; onFav: () => void; onOpen: () => void }) {
  const day = (now.getDay() + 6) % 7;
  const pct = typicalBusy(p.kind, day, now.getHours() + now.getMinutes() / 60);
  const level = levelOf(pct);
  return (
    <div className={`hit relative rounded-[12px] bg-surface px-3 py-2.5 ${active ? "shadow-[0_0_0_2px_var(--accent)]" : "shadow-[inset_0_0_0_1px_var(--line)]"}`} onClick={(e) => (e.target as HTMLElement).closest("button, a") === null && onOpen()}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-on-accent">
          {n}
        </span>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <b className="block truncate font-semibold">{p.name}</b>
          <span className="block truncate text-[12px] text-muted">
            {KIND_LABEL[p.kind]} · <OpenLine st={st} />
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {p.wifi && <Feature icon={<Wifi size={12} aria-hidden />}>Wi-Fi</Feature>}
            {p.outlets && <Feature icon={<Plug size={12} aria-hidden />}>Outlets</Feature>}
            {/* „Typisch“ sagt nur etwas, solange geöffnet ist */}
            {st.open !== false && (
              <Feature icon={<Clock size={12} aria-hidden />} title="Typical for this time, an estimate">
                {LEVEL_TEXT[level]}
              </Feature>
            )}
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <button onClick={onFav} aria-pressed={fav} aria-label={fav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`} className="press flex size-7 items-center justify-center rounded-lg text-muted hover:bg-hover">
            <Heart size={15} aria-hidden fill={fav ? "currentColor" : "none"} style={fav ? { color: "var(--text)" } : undefined} />
          </button>
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <Footprints size={12} aria-hidden /> {p.walkMin} min
          </span>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, children, unknown, title }: { icon: React.ReactNode; children: React.ReactNode; unknown?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[12px] font-semibold ${unknown ? "text-muted shadow-[inset_0_0_0_1px_var(--line)]" : "bg-sunken text-text"}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Ort-Karte (Entwurf D1): Zeiten, Ausstattung, „typisch für diese Zeit“ über den Tag, Wegbeschreibung. */
function PlaceSheet({ p, now, fav, onFav, onClose }: { p: Place; now: Date; fav: boolean; onFav: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = openState(p.hours, now);
  const rows = hoursRows(p.hours);
  const day = (now.getDay() + 6) % 7;
  const hour = now.getHours();
  const Icon = KIND_ICON[p.kind];
  const pctNow = typicalBusy(p.kind, day, hour + now.getMinutes() / 60);
  const levelNow = levelOf(pctNow);
  const hours = Array.from({ length: 15 }, (_, i) => 8 + i); // 08–22
  const peak = hours.reduce((best, h) => (typicalBusy(p.kind, day, h) > typicalBusy(p.kind, day, best) ? h : best), 8);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-6 pt-[7vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={p.name} className="scroll max-h-[86vh] w-[480px] max-w-full rounded-[16px] bg-bg px-6 pb-5 pt-5 shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)] outline-none">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
            <Icon size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em]">{p.name}</h2>
            <p className="text-muted">
              {KIND_LABEL[p.kind]} · {p.walkMin} min walk{p.address ? ` · ${p.address}` : ""}
            </p>
          </div>
          <button onClick={onFav} aria-pressed={fav} aria-label={fav ? "Remove from favorites" : "Add to favorites"} className="press flex size-9 shrink-0 items-center justify-center rounded-lg shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover">
            <Heart size={16} aria-hidden fill={fav ? "currentColor" : "none"} />
          </button>
          <button onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className={`mt-4 flex items-center gap-2 rounded-[10px] bg-sunken px-3.5 py-2.5 font-semibold ${st.open === true ? "text-text" : "text-muted"}`}>
          <Clock size={16} aria-hidden />
          {st.open === true ? `Open now${st.until ? ` · closes at ${st.until}` : ""}` : st.open === false ? `Closed${st.opens ? ` · opens ${st.opens}` : ""}` : "Opening hours not listed on the map"}
        </div>

        <p className="mt-4 font-bold">Features</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Feature icon={<Wifi size={12} aria-hidden />} unknown={p.wifi !== true}>
            {p.wifi === true ? "Wi-Fi" : p.wifi === false ? "No Wi-Fi" : "Wi-Fi not listed"}
          </Feature>
          <Feature icon={<Plug size={12} aria-hidden />} unknown={p.outlets !== true}>
            {p.outlets === true ? "Outlets" : p.outlets === false ? "No outlets" : "Outlets not listed"}
          </Feature>
        </div>
        <p className="mt-1.5 text-[12px] text-muted">Grey with a border means nobody has entered it on the map yet.</p>

        <p className="mt-4 font-bold">How busy is it usually?</p>
        <div className="mt-1.5 rounded-[10px] px-3.5 py-2.5" style={{ background: "var(--sunken)" }}>
          <b>{LEVEL_TEXT[levelNow]} right now</b>
          <p className="text-[12px] text-muted">
            Typical for {DAY_NAMES[day]} at {String(hour).padStart(2, "0")}:00. Busiest around {String(peak).padStart(2, "0")}:00. An estimate, not a live count.
          </p>
        </div>
        <div className="mt-2 flex gap-[3px]" aria-hidden>
          {hours.map((h) => {
            const v = typicalBusy(p.kind, day, h);
            const isNow = h === hour;
            return (
              <div key={h} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative flex h-[70px] w-full items-end justify-center">
                  <span className="w-full max-w-[14px] rounded-t-[3px]" style={{ height: `${v * 0.72}px`, background: "var(--accent)", opacity: isNow ? 1 : LEVEL_OPACITY[levelOf(v)] * 0.6 }} />
                  {isNow && <span className="absolute inset-x-[-1px] inset-y-[-3px] rounded-[5px] shadow-[0_0_0_2px_var(--text)]" />}
                </div>
                <span className={`text-[10px] ${isNow ? "font-bold text-text" : "text-muted"}`}>{String(h).padStart(2, "0")}</span>
              </div>
            );
          })}
        </div>

        {rows && (
          <>
            <p className="mt-4 font-bold">Opening hours</p>
            <div className="mt-1">
              {rows.map((r) => (
                <div key={r.label} className="flex border-t border-line-soft py-1.5">
                  <span className="flex-1">{r.label}</span>
                  <span className="text-muted">{r.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-5 flex gap-2">
          <span className="flex-1 [&>a]:h-10 [&>a]:w-full [&>a]:rounded-[10px] [&>a]:text-[14px]">
            <RouteButton route={{ url: `https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=w`, label: p.name, exact: true }} label="Directions" />
          </span>
          {p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer" className="press flex h-10 items-center gap-1.5 rounded-[10px] px-4 font-semibold shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover">
              Website <ExternalLink size={13} aria-hidden />
            </a>
          )}
        </div>
        <p className="mt-3 text-[11px] text-muted">Source: OpenStreetMap contributors. “Open now” is worked out by Ordo from the entered hours.</p>
      </div>
    </div>
  );
}
