// Speiseplan der Mensen des Kölner Studierendenwerks (KStW).
//
// Quelle: Das KStW bettet auf kstw.de/speiseplan die Seite app.cloudmensa.io/menu/kstw ein. Die holt ihre Daten
// über öffentliche Supabase-Funktionen (public_get_organization_by_slug, public_get_week_menu_cached) mit dem
// öffentlichen Schlüssel aus genau dieser Seite. Wir rufen dieselben Funktionen auf (lesend, ohne Konto).
// Läuft im Browser wie in der Mac-App; Zwischenspeicher im localStorage, neu geholt einmal pro Tag bzw. nach 30 min.
// Fotos sind riesig (4747 px): Die Mac-App macht daraus kleine Vorschaubilder (desktop/lib/mensa.js).

import { useSyncExternalStore } from "react";

const API = "https://axxiebkvmfjmiaanviob.supabase.co/rest/v1/rpc";
const KEY = "sb_publishable_G6p4Gfhzcx2AM5ToCWAChA_pY-PKF2a"; // öffentlich, steht in der Speiseplan-Seite des KStW
const SLUG = "kstw";
const CACHE_KEY = "studi.mensa.v1";
const MAX_AGE = 30 * 60_000;

export type DishGroup = "special" | "veggie" | "meat" | "fish" | "side" | "dessert" | "other";
export type Diet = "vegan" | "vegetarian" | null;
export type Contains = "pork" | "beef" | "poultry" | "fish" | "lamb" | "game" | "alcohol";

export interface Dish {
  id: string;
  name: string; // englisch, bereinigt
  nameDe: string;
  location: string; // „Mensa Zülpicher Straße“
  counter: string | null; // „Ausgabe 1“, „EG Süd“
  hours: string | null; // „11:30–14:30“
  group: DishGroup;
  diet: Diet;
  contains: Contains[];
  neuland: boolean; // Fleisch vom Neuland-Hof
  prices: { student: number | null; staff: number | null; guest: number | null };
  allergens: string[]; // englisch, kurz („gluten“, „soy“)
  sides: string[]; // „Bread rolls“
  image: string | null;
  soldOut: boolean;
}

export interface MensaData {
  fetchedAt: number;
  from: string;
  to: string;
  days: Record<string, Dish[]>; // „2026-11-23“ → Gerichte aller Mensen
  locations: string[]; // nach Anzahl Gerichte, Zülpicher Straße zuerst
}

type State = { status: "idle" | "loading" | "ready" | "error"; data: MensaData | null; error: string | null };

let state: State = { status: "idle", data: null, error: null };
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const SERVER: State = { status: "idle", data: null, error: null };

export function useMensa(): State {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

// --- Datum ------------------------------------------------------------------------------------------

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/** Montag dieser Woche bis Freitag nächster Woche (am Wochenende: ab nächstem Montag). */
export function mensaRange(today = new Date()) {
  const weekend = today.getDay() === 0 || today.getDay() === 6;
  const start = weekend ? addDays(mondayOf(today), 7) : mondayOf(today);
  return { from: iso(start), to: iso(addDays(start, 11)) };
}

// --- Abruf ------------------------------------------------------------------------------------------

async function rpc<T>(fn: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface RawField {
  field_id: string;
  value: string | null;
}
interface RawDish {
  id: string;
  price: number | null;
  name_de: string | null;
  name_en: string | null;
  image_url: string | null;
  is_available: boolean;
  category: { name_en?: string | null } | null;
  custom_fields: RawField[] | null;
  screens: { location?: string | null; is_sold_out?: boolean }[] | null;
}

const ALLERGEN_SHORT: [RegExp, string][] = [
  [/gluten|wheat|weizen|rye|roggen|barley|gerste|oat|hafer|spelt|dinkel/i, "gluten"],
  [/crustacean|krebs/i, "crustaceans"],
  [/\begg|\bei\b|eier/i, "eggs"],
  [/fish|fisch/i, "fish"],
  [/peanut|erdnuss/i, "peanuts"],
  [/soy|soja/i, "soy"],
  [/lactose|laktose|milk|milch/i, "milk"],
  [/nut|schalenfr/i, "nuts"],
  [/celery|sellerie/i, "celery"],
  [/mustard|senf/i, "mustard"],
  [/sesame|sesam/i, "sesame"],
  [/sulphite|sulfite|schwefel/i, "sulphites"],
  [/lupin/i, "lupin"],
  [/mollus|weichtier/i, "molluscs"],
  [/colou?rant|farbstoff/i, "colouring"],
  [/preservative|konservier/i, "preservatives"],
  [/antioxidant/i, "antioxidants"],
  [/flavou?r enhancer|geschmacksverst/i, "flavour enhancer"],
  [/sweetener|süßungs/i, "sweetener"],
  [/phosphat/i, "phosphate"],
  [/caffeine|koffein/i, "caffeine"],
  [/waxed|gewachst/i, "waxed"],
  [/blackened|geschwärzt/i, "blackened"],
];

/** „Chili sin carne (1,2,16)“ → „Chili sin carne“; „creamy vegetable soup“ → „Creamy vegetable soup“ */
export function cleanName(s: string) {
  const t = s
    .replace(/\s*\((?:\s*\d+[a-z]?\s*,?)+\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const euro = (v: string | null | undefined) => {
  const n = v ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function normalizeDish(raw: RawDish): Dish | null {
  const f = (id: string) => raw.custom_fields?.find((x) => x.field_id === id)?.value?.trim() ?? "";
  const icon = f("food_icon").toUpperCase().split(/[,\s]+/).filter(Boolean);
  const type = f("menu_type").toLowerCase();
  const cat = (raw.category?.name_en ?? "").toLowerCase();
  const nameEn = cleanName(raw.name_en || f("dish_1_eng") || raw.name_de || "");
  const nameDe = cleanName(raw.name_de || f("dish_ger_1") || "");
  if (!nameEn && !nameDe) return null;

  if (/tagesrest/i.test(nameDe)) return null; // Restverkauf, kein Gericht
  let group: DishGroup = "other";
  if (icon.includes("D") || cat.includes("dessert")) group = "dessert";
  else if (type.includes("beilage") || cat.includes("side")) group = "side";
  else if (type === "aktion" || type.includes("meisterwerk") || type.includes("querbeet")) group = "special";
  else if (type.includes("fisch")) group = "fish";
  else if (type.includes("fleisch")) group = "meat";
  else if (type.includes("vegan") || type.includes("vegetar")) group = "veggie";
  // Süßes steht oft als „Beilage“ im Plan; Hauptgerichte (Flammkuchen!) bleiben, was sie sind
  const sweet = /pudding|kompott|compote|quark|\bcurd|\bcreme\b|crème|mousse|\bkuchen|\bcake|dessert|joghurt|yogh?urt|muffin|tiramisu|grütze|waffel|obstsalat|fruit salad/i;
  if ((group === "side" || group === "other") && (sweet.test(nameDe) || sweet.test(nameEn))) group = "dessert";

  const contains: Contains[] = [];
  const map: Record<string, Contains> = { S: "pork", R: "beef", G: "poultry", F: "fish", L: "lamb", W: "game", A: "alcohol" };
  for (const i of icon) if (map[i] && !contains.includes(map[i])) contains.push(map[i]);
  const diet: Diet = icon.includes("VGN") ? "vegan" : icon.includes("VGT") ? "vegetarian" : null;

  // Ausgabe/Zeit: „EG Süd - 11:30 - 14:30 Uhr“ oder Bildschirm „Mensa Zollstock - Ausgabe 1 (links)“
  const info = f("dish_info");
  const time = info.match(/(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/);
  const infoCounter = info.replace(/[-–]?\s*\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}\s*(uhr)?/i, "").replace(/^\d+$/, "").trim().replace(/[-–\s]+$/, "");
  const screen = raw.screens?.find((s) => s.location)?.location ?? "";
  const screenCounter = screen.includes(" - ") ? screen.split(" - ").slice(1).join(" - ").replace(/\s*\(.*\)\s*$/, "") : "";

  const allergens = f("allergens_names")
    .split(/,\s*(?=\d+[a-z]?=)/)
    .map((part) => {
      const label = part.split("|").pop() ?? part;
      return ALLERGEN_SHORT.find(([rx]) => rx.test(label))?.[1] ?? null;
    })
    .filter((x, i, all): x is string => Boolean(x) && all.indexOf(x) === i);

  const sides = ["dish_2_eng", "dish_3_eng", "dish_4_eng", "dish_5_eng"].map((k) => cleanName(f(k))).filter(Boolean);

  return {
    id: raw.id,
    name: nameEn || nameDe,
    nameDe,
    location: f("location") || screen.split(" - ")[0] || "Mensa",
    counter: englishCounter(infoCounter || screenCounter) || null,
    hours: time ? `${time[1].replace(".", ":")}–${time[2].replace(".", ":")}` : null,
    group,
    diet,
    contains,
    neuland: icon.includes("NL"),
    prices: { student: raw.price && raw.price > 0 ? raw.price : euro(f("price")), staff: euro(f("price_2")), guest: euro(f("price_3")) },
    allergens,
    sides,
    image: raw.image_url || null,
    soldOut: Boolean(raw.screens?.length && raw.screens.every((s) => s.is_sold_out)),
  };
}

/** „EG Süd“ → „Ground floor south“, „Ausgabe 1“ → „Counter 1“ (Ausgaben der Mensa, App ist englisch). */
function englishCounter(s: string) {
  const words: Record<string, string> = {
    eg: "Ground floor", og: "Upper floor", mg: "Middle floor", ug: "Lower floor", süd: "south", nord: "north", ost: "east", west: "west",
    ausgabe: "Counter", mitte: "centre", links: "left", rechts: "right", foyer: "Foyer", theke: "counter",
  };
  return s
    .split(/\s+/)
    .map((w) => words[w.toLowerCase()] ?? w)
    .join(" ")
    .trim();
}

let orgId: string | null = null;
let inflight: Promise<void> | null = null;

/** Speiseplan laden: sofort aus dem Zwischenspeicher, im Hintergrund neu, wenn älter als 30 min oder von gestern. */
export function loadMensa(force = false): Promise<void> {
  if (state.status === "idle") {
    const cached = readCache();
    if (cached) set({ status: "ready", data: cached });
  }
  const data = state.data;
  const range = mensaRange();
  const fresh = data && data.from === range.from && Date.now() - data.fetchedAt < MAX_AGE && new Date(data.fetchedAt).toDateString() === new Date().toDateString();
  if (fresh && !force) return Promise.resolve();
  if (inflight) return inflight;
  if (!data) set({ status: "loading", error: null });
  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      if (!orgId) {
        const org = await rpc<{ id: string } | { id: string }[]>("public_get_organization_by_slug", { p_slug: SLUG }, ctrl.signal);
        orgId = Array.isArray(org) ? (org[0]?.id ?? null) : (org?.id ?? null);
        if (!orgId) throw new Error("no_org");
      }
      const raw = await rpc<{ date: string; dishes: RawDish[] }[]>(
        "public_get_week_menu_cached",
        { p_organization_id: orgId, p_start_date: range.from, p_end_date: range.to },
        ctrl.signal,
      );
      clearTimeout(timer);
      const days: Record<string, Dish[]> = {};
      const count = new Map<string, number>();
      for (const day of raw ?? []) {
        const list = (day.dishes ?? []).filter((d) => d.is_available !== false).map(normalizeDish).filter((d): d is Dish => d !== null);
        days[day.date] = list;
        for (const d of list) count.set(d.location, (count.get(d.location) ?? 0) + 1);
      }
      const locations = [...count.entries()]
        .sort((a, b) => Number(b[0].includes("Zülpicher")) - Number(a[0].includes("Zülpicher")) || b[1] - a[1])
        .map(([name]) => name);
      const next: MensaData = { fetchedAt: Date.now(), from: range.from, to: range.to, days, locations };
      writeCache(next);
      set({ status: "ready", data: next, error: null });
    } catch {
      set(state.data ? { status: "ready", error: "offline" } : { status: "error", error: "offline" });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function readCache(): MensaData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as MensaData) : null;
  } catch {
    return null;
  }
}

function writeCache(data: MensaData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // voll oder gesperrt: dann eben ohne Zwischenspeicher
  }
}

// --- Vorlieben (pro Mac, nur Bequemlichkeit) --------------------------------------------------------

export interface MensaPrefs {
  location: string;
  price: "student" | "staff" | "guest";
  diet: "all" | "vegetarian" | "vegan";
}
const PREFS_KEY = "studi.mensa.prefs";
export const DEFAULT_PREFS: MensaPrefs = { location: "Mensa Zülpicher Straße", price: "student", diet: "all" };

export function readPrefs(): MensaPrefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<MensaPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(p: MensaPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // egal
  }
}
