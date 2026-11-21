"use client";

// Mensa-Tab: Speiseplan der Kölner Mensen (Kölner Studierendenwerk, Daten von CloudMensa, siehe lib/mensa.ts).
// Oben Mensa, Preisgruppe und Tage (diese + nächste Woche), darunter Hauptgerichte als Karten mit Teller-Foto,
// dann Beilagen und Desserts als kompakte Listen. Vorlieben (Mensa, Preis, vegan/vegetarisch) merkt sich der Mac.

import { useEffect, useMemo, useRef, useState } from "react";
import { Beef, CakeSlice, ChevronLeft, ChevronRight, Clock, Drumstick, Fish, Ham, Leaf, MapPin, Pizza, RefreshCw, Salad, Soup, Sprout, UtensilsCrossed, WifiOff, X } from "lucide-react";
import { Spinner } from "./ui";
import { getDesktop } from "@/lib/desktop";
import { loadMensa, readPrefs, useMensa, writePrefs, type Dish, type MensaPrefs } from "@/lib/mensa";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const euro = (n: number | null) => (n == null ? "–" : `€${n.toFixed(2)}`);
const shortLoc = (s: string) => s.replace(/^Mensa\s+/i, "");
const CONTAINS: Record<string, string> = { pork: "Pork", beef: "Beef", poultry: "Poultry", fish: "Fish", lamb: "Lamb", game: "Game", alcohol: "Alcohol" };

/** Tag, der beim Öffnen gezeigt wird: heute bis 18:30 Uhr, sonst der nächste Tag mit Speiseplan. */
function defaultDay(days: string[]) {
  const now = new Date();
  const today = isoOf(now);
  const late = now.getHours() * 60 + now.getMinutes() > 18 * 60 + 30;
  return days.find((d) => (late ? d > today : d >= today)) ?? days[days.length - 1];
}

export function MensaView() {
  const { status, data, error } = useMensa();
  const [prefs, setPrefsState] = useState<MensaPrefs>(readPrefs);
  const setPrefs = (patch: Partial<MensaPrefs>) =>
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      writePrefs(next);
      return next;
    });
  const [day, setDay] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null); // Gericht in der großen Ansicht

  // Laden beim Öffnen, danach alle 30 min (Ausverkauft-Status, Tageswechsel)
  useEffect(() => {
    void loadMensa();
    const t = setInterval(() => void loadMensa(), 30 * 60_000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(() => Object.keys(data?.days ?? {}).sort(), [data]);
  const location = data?.locations.includes(prefs.location) ? prefs.location : (data?.locations[0] ?? prefs.location);
  const shownDay = day && days.includes(day) ? day : days.length ? defaultDay(days) : null;
  const all = (shownDay && data?.days[shownDay]) || [];
  const here = all.filter((d) => d.location === location);
  const visible = here.filter((d) => prefs.diet === "all" || (prefs.diet === "vegan" ? d.diet === "vegan" : d.diet !== null));
  const mains = visible.filter((d) => d.group !== "side" && d.group !== "dessert").sort(byGroup);
  const sides = visible.filter((d) => d.group === "side");
  const desserts = visible.filter((d) => d.group === "dessert");
  const today = isoOf(new Date());
  // Reihenfolge wie auf der Seite, damit ← → in der großen Ansicht dazu passt
  const ordered = [...SECTIONS.flatMap(([, g]) => mains.filter((d) => g.includes(d.group))), ...sides, ...desserts];
  const zoomed = ordered.find((d) => d.id === zoom) ?? null;
  const weekSplit = days.findIndex((d) => parse(d).getDay() === 1 && d !== days[0]);

  return (
    <div className="pb-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight">Mensa</h1>
          <p className="mt-1 text-muted">
            {shownDay ? `${shortLoc(location)} · ${parse(shownDay).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}` : "Kölner Studierendenwerk"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="Mensa" value={location} onChange={(v) => setPrefs({ location: v })} icon={<MapPin size={14} aria-hidden />}>
            {(data?.locations ?? [location]).map((l) => (
              <option key={l} value={l}>
                {shortLoc(l)}
              </option>
            ))}
          </Select>
          <Select label="Prices for" value={prefs.price} onChange={(v) => setPrefs({ price: v as MensaPrefs["price"] })}>
            <option value="student">Student prices</option>
            <option value="staff">Staff prices</option>
            <option value="guest">Guest prices</option>
          </Select>
        </div>
      </header>

      {status === "loading" && !data && (
        <div className="mt-16 flex items-center justify-center gap-2 text-muted">
          <Spinner /> Getting today’s menu…
        </div>
      )}
      {status === "error" && !data && (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-[14px] bg-surface px-6 py-10 text-center">
          <WifiOff size={22} className="text-muted" aria-hidden />
          <p className="font-semibold">The menu could not be loaded.</p>
          <p className="text-[13px] text-muted">Check your internet connection and try again.</p>
          <button onClick={() => void loadMensa(true)} className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-on-accent">
            <RefreshCw size={13} aria-hidden /> Try again
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Tage: diese und nächste Woche */}
          <div className="mt-6 flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Day">
            {days.map((d, i) => {
              const date = parse(d);
              const count = (data.days[d] ?? []).filter((x) => x.location === location && x.group !== "side" && x.group !== "dessert").length;
              const active = d === shownDay;
              return (
                <div key={d} className="flex items-center">
                  {i === weekSplit && <span className="mx-1.5 h-8 w-px shrink-0 bg-line" aria-hidden />}
                  <button
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDay(d)}
                    disabled={count === 0}
                    className={`flex h-[54px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[11px] transition-colors disabled:opacity-35 ${
                      active ? "bg-accent text-on-accent" : "bg-surface hover:bg-hover"
                    }`}
                  >
                    <span className={`text-[11px] font-semibold ${active ? "opacity-80" : "text-muted"}`}>{d === today ? "Today" : WD[date.getDay()]}</span>
                    <span className="text-[17px] font-bold leading-tight">{date.getDate()}</span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-[9px] bg-sunken p-[3px]" role="radiogroup" aria-label="Diet">
              {(
                [
                  ["all", "Everything"],
                  ["vegetarian", "Vegetarian"],
                  ["vegan", "Vegan"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={prefs.diet === v}
                  onClick={() => setPrefs({ diet: v })}
                  className={`h-7 rounded-[7px] px-3 text-[13px] transition-colors ${prefs.diet === v ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-[var(--text)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[12px] text-muted">
              {error ? (
                <span className="inline-flex items-center gap-1">
                  <WifiOff size={12} aria-hidden /> Offline, menu from {new Date(data.fetchedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              ) : (
                `Updated ${new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              )}
            </span>
          </div>

          {here.length === 0 ? (
            <Empty title="No menu for this day" text="This mensa may be closed. Try another day or mensa." />
          ) : visible.length === 0 ? (
            <Empty title={`Nothing ${prefs.diet} here today`} text="Try another mensa or show everything." />
          ) : (
            <>
              {SECTIONS.map(([title, groups]) => {
                const list = mains.filter((d) => groups.includes(d.group));
                if (!list.length) return null;
                return (
                  <section key={title} className="mt-7" aria-label={title}>
                    <h2 className="mb-2.5 text-[17px] font-bold">{title}</h2>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-2.5">
                      {list.map((d) => (
                        <DishCard key={d.id} dish={d} price={d.prices[prefs.price]} onZoom={() => setZoom(d.id)} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {(sides.length > 0 || desserts.length > 0) && (
                <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
                  {sides.length > 0 && <SmallList title="Sides & salads" dishes={sides} price={prefs.price} onZoom={setZoom} />}
                  {desserts.length > 0 && <SmallList title="Desserts" dishes={desserts} price={prefs.price} onZoom={setZoom} />}
                </div>
              )}
            </>
          )}
          {zoomed && (
            <DishViewer
              dish={zoomed}
              price={prefs.price}
              onClose={() => setZoom(null)}
              onStep={(dir) => {
                const i = ordered.findIndex((d) => d.id === zoomed.id);
                const next = ordered[(i + dir + ordered.length) % ordered.length];
                if (next) setZoom(next.id);
              }}
              count={ordered.length}
            />
          )}
          <p className="mt-10 text-[12px] text-muted">
            Menu from Kölner Studierendenwerk. Allergens and prices without guarantee, please check the signs at the counter.
          </p>
        </>
      )}
    </div>
  );
}

const SECTIONS: [string, Dish["group"][]][] = [
  ["Specials", ["special"]],
  ["Vegan & vegetarian", ["veggie"]],
  ["Meat & fish", ["meat", "fish", "other"]],
];

const ORDER: Record<Dish["group"], number> = { special: 0, veggie: 1, meat: 2, fish: 3, other: 4, side: 5, dessert: 6 };
function byGroup(a: Dish, b: Dish) {
  return ORDER[a.group] - ORDER[b.group] || (b.prices.student ?? 0) - (a.prices.student ?? 0);
}

function Select({ label, value, onChange, icon, children }: { label: string; value: string; onChange: (v: string) => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="relative inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface pl-2.5 pr-1 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
      {icon && <span className="text-muted">{icon}</span>}
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-full cursor-default bg-transparent pr-1 outline-none">
        {children}
      </select>
    </label>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-[14px] bg-surface px-6 py-12 text-center">
      <UtensilsCrossed size={22} className="text-muted" aria-hidden />
      <p className="font-semibold">{title}</p>
      <p className="text-[13px] text-muted">{text}</p>
    </div>
  );
}

function DietTag({ dish }: { dish: Dish }) {
  if (dish.diet === "vegan")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--c-green-soft)", color: "var(--c-green-ink)" }}>
        <Leaf size={11} aria-hidden /> Vegan
      </span>
    );
  if (dish.diet === "vegetarian")
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--c-teal-soft)", color: "var(--c-teal-ink)" }}>
        <Sprout size={11} aria-hidden /> Vegetarian
      </span>
    );
  if (dish.contains.length)
    return (
      <span className="rounded-full bg-sunken px-2 py-0.5 text-[11.5px] font-semibold text-muted">
        {dish.contains.map((c) => CONTAINS[c]).join(" · ")}
        {dish.neuland ? " · Neuland" : ""}
      </span>
    );
  return null;
}

function DishCard({ dish, price, onZoom }: { dish: Dish; price: number | null; onZoom: () => void }) {
  return (
    <article className={`flex items-start gap-4 rounded-[14px] bg-surface p-3.5 pr-4 ${dish.soldOut ? "opacity-55" : ""}`}>
      <Visual dish={dish} size={84} onClick={onZoom} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 self-stretch">
        <div className="flex min-h-[20px] flex-wrap items-center gap-1.5">
          <DietTag dish={dish} />
          {dish.soldOut && <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">Sold out</span>}
        </div>
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug" title={dish.nameDe !== dish.name ? dish.nameDe : undefined}>
          {dish.name}
        </h3>
        {dish.sides.length > 0 && <p className="line-clamp-1 text-[12.5px] text-muted">with {dish.sides.map((x) => x.toLowerCase()).join(", ")}</p>}
        <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 text-[12px] text-muted">
          {dish.counter && <span className="truncate">{dish.counter}</span>}
          {dish.hours && (
            <span className="inline-flex items-center gap-1">
              <Clock size={11} aria-hidden /> {dish.hours}
            </span>
          )}
        </p>
        {dish.allergens.length > 0 && (
          <p className="truncate text-[11.5px] text-muted" title={dish.allergens.join(", ")}>
            Contains {dish.allergens.join(", ")}
          </p>
        )}
      </div>
      <span className="shrink-0 pt-0.5 text-[19px] font-bold tabular-nums leading-none">{euro(price)}</span>
    </article>
  );
}

/** Foto, falls vorhanden, sonst ein passendes Symbol in zarter Farbe (Zülpicher Straße hat keine Fotos). */
function Visual({ dish, size, onClick }: { dish: Dish; size: number; onClick?: () => void }) {
  if (dish.image) {
    const plate = <Plate src={dish.image} size={size} />;
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Show a larger photo of ${dish.name}`}
        className="shrink-0 cursor-zoom-in rounded-full transition-transform duration-200 ease-out hover:scale-[1.04] active:scale-[0.98]"
      >
        {plate}
      </button>
    ) : (
      plate
    );
  }
  const n = `${dish.name} ${dish.nameDe}`.toLowerCase();
  const [Icon, tint] =
    dish.group === "dessert"
      ? [CakeSlice, "rose"]
      : /soup|suppe|eintopf|stew/.test(n)
        ? [Soup, dish.diet ? "green" : "ochre"]
        : /pizza|flamm|tarte/.test(n)
          ? [Pizza, dish.diet ? "green" : "orange"]
          : /salad|salat/.test(n)
            ? [Salad, "green"]
            : dish.contains.includes("fish") || dish.group === "fish"
              ? [Fish, "blue"]
              : dish.contains.includes("poultry")
                ? [Drumstick, "orange"]
                : dish.contains.includes("beef")
                  ? [Beef, "orange"]
                  : dish.contains.includes("pork")
                    ? [Ham, "orange"]
                    : dish.diet === "vegan"
                      ? [Leaf, "green"]
                      : dish.diet === "vegetarian"
                        ? [Sprout, "teal"]
                        : [UtensilsCrossed, "indigo"];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `var(--c-${tint}-soft)`, color: `var(--c-${tint}-ink)` }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.36)} strokeWidth={1.6} />
    </span>
  );
}

function SmallList({ title, dishes, price, onZoom }: { title: string; dishes: Dish[]; price: MensaPrefs["price"]; onZoom: (id: string) => void }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-[17px] font-bold">{title}</h2>
      <ul className="flex flex-col divide-y divide-[var(--line)] rounded-[14px] bg-surface">
        {dishes.map((d) => (
          <li key={d.id} className={`flex items-center gap-3 px-3 py-2 ${d.soldOut ? "opacity-55" : ""}`}>
            <Visual dish={d} size={38} onClick={() => onZoom(d.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{d.name}</span>
              <span className="block truncate text-[11.5px] text-muted">
                {[d.diet === "vegan" ? "Vegan" : d.diet === "vegetarian" ? "Vegetarian" : null, d.soldOut ? "Sold out" : null, d.allergens.length ? `Contains ${d.allergens.join(", ")}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="text-[13.5px] font-semibold tabular-nums">{euro(d.prices[price])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Teller-Foto: in der Mac-App als kleines Vorschaubild, erst wenn sichtbar ------------------------

const thumbs = new Map<string, string | null>();

function Plate({ src, size }: { src: string | null; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(() => (src ? (thumbs.get(src) ?? null) : null));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!src || thumbs.get(src)) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        const desktop = getDesktop();
        if (!desktop?.mensaThumb) {
          setUrl(src); // Browser: Originalbild (nur Entwicklung)
          return;
        }
        void desktop.mensaThumb(src).then((u) => {
          thumbs.set(src, u);
          if (!cancelled) setUrl(u);
        });
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [src]);

  return (
    <div ref={ref} className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {!url || !loaded ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
          {!src && <UtensilsCrossed size={Math.max(12, size * 0.22)} className="text-muted opacity-60" aria-hidden />}
        </span>
      ) : null}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- data:-URL aus dem Mac-Teil, kein next/image nötig
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="relative h-full w-full object-contain transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0, filter: size > 60 ? "drop-shadow(0 6px 10px rgba(0,0,0,0.14))" : undefined }}
        />
      )}
    </div>
  );
}

// --- Große Ansicht: Foto groß, alle Angaben, ← → blättert, Esc schließt -------------------------------

const PRICE_LABEL = { student: "Students", staff: "Staff", guest: "Guests" } as const;

function DishViewer({
  dish,
  price,
  onClose,
  onStep,
  count,
}: {
  dish: Dish;
  price: MensaPrefs["price"];
  onClose: () => void;
  onStep: (dir: 1 | -1) => void;
  count: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [large, setLarge] = useState<{ src: string; url: string | null } | null>(null);
  const small = dish.image ? (thumbs.get(dish.image) ?? null) : null;
  const url = large && large.src === dish.image ? large.url : null;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onStep(1);
      else if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", key);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", key);
  }, [onClose, onStep]);

  // Großes Bild nachladen (Mac-App: 1100 px; Browser: Original), vorher das kleine vergrößert zeigen
  useEffect(() => {
    const src = dish.image;
    if (!src) return;
    let cancelled = false;
    const desktop = getDesktop();
    const done = (u: string | null) => !cancelled && setLarge({ src, url: u });
    if (desktop?.mensaThumb) void desktop.mensaThumb(src, "large").then(done);
    else done(src);
    return () => {
      cancelled = true;
    };
  }, [dish.image]);

  const shown = url ?? small;
  return (
    <div className="no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={dish.name}
        className="relative flex max-h-full w-[min(920px,100%)] flex-col overflow-hidden rounded-[18px] bg-bg shadow-[0_30px_80px_rgba(0,0,0,0.45)] outline-none md:flex-row"
      >
        <div className="relative flex aspect-square shrink-0 items-center justify-center bg-sunken md:w-[min(560px,62vh)]">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- data:-URL aus dem Mac-Teil
            <img src={shown} alt={dish.name} className="h-[88%] w-[88%] object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.25)]" />
          ) : (
            <Visual dish={dish} size={180} />
          )}
          {dish.image && !url && <span className="absolute bottom-3 right-3 text-muted"><Spinner size={14} /></span>}
          {count > 1 && (
            <>
              <button onClick={() => onStep(-1)} aria-label="Previous dish" className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-sm hover:bg-surface">
                <ChevronLeft size={18} aria-hidden />
              </button>
              <button onClick={() => onStep(1)} aria-label="Next dish" className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-sm hover:bg-surface">
                <ChevronRight size={18} aria-hidden />
              </button>
            </>
          )}
        </div>
        <div className="scroll flex min-w-0 flex-1 flex-col gap-3 p-6">
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-surface/90 text-muted hover:text-[var(--text)]">
            <X size={16} aria-hidden />
          </button>
          <div className="flex flex-wrap items-center gap-1.5 pr-8">
            <DietTag dish={dish} />
            {dish.group === "special" && <span className="rounded-full bg-accent px-2 py-0.5 text-[11.5px] font-bold text-on-accent">Today’s special</span>}
            {dish.soldOut && <span className="rounded-full bg-danger px-2 py-0.5 text-[11.5px] font-bold text-white">Sold out</span>}
          </div>
          <div>
            <h2 className="text-[22px] font-bold leading-tight">{dish.name}</h2>
            {dish.nameDe && dish.nameDe !== dish.name && <p className="mt-1 text-[13px] text-muted">{dish.nameDe}</p>}
            {dish.sides.length > 0 && <p className="mt-2 text-[14px]">with {dish.sides.map((x) => x.toLowerCase()).join(", ")}</p>}
          </div>
          <dl className="grid grid-cols-3 gap-2">
            {(["student", "staff", "guest"] as const).map((k) => (
              <div key={k} className={`rounded-[10px] px-3 py-2 ${k === price ? "bg-accent text-on-accent" : "bg-surface"}`}>
                <dt className={`text-[11.5px] font-semibold ${k === price ? "opacity-80" : "text-muted"}`}>{PRICE_LABEL[k]}</dt>
                <dd className="text-[17px] font-bold tabular-nums">{euro(dish.prices[k])}</dd>
              </div>
            ))}
          </dl>
          {(dish.counter || dish.hours) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              {dish.counter && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={13} className="text-muted" aria-hidden /> {dish.counter}
                </span>
              )}
              {dish.hours && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={13} className="text-muted" aria-hidden /> {dish.hours}
                </span>
              )}
            </p>
          )}
          {dish.allergens.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-muted">Contains</p>
              <div className="flex flex-wrap gap-1.5">
                {dish.allergens.map((a) => (
                  <span key={a} className="rounded-full bg-surface px-2.5 py-0.5 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)]">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="mt-auto pt-2 text-[11.5px] text-muted">{shortLoc(dish.location)} · Without guarantee, please check the signs at the counter.</p>
        </div>
      </div>
    </div>
  );
}
