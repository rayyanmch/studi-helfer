// Study places: Bibliotheken, Cafés und Mensen rund um die Uni aus OpenStreetMap (kostenlos, keine eigene Schnittstelle).
// Schicht 1 des Plans: gilt für jede Uni, sobald ihre Lage bekannt ist. „Jetzt offen“ rechnet die App selbst aus den
// Öffnungszeiten. „Typisch für diese Zeit“ ist eine Schätzung nach Art des Ortes, KEINE Live-Zahl; echte Zahlen
// (Uni-Daten, Meldungen von Studenten) kommen später als eigene Quellen dazu.

export type PlaceKind = "library" | "cafe" | "canteen";

export interface Place {
  id: string; // "node/123"
  kind: PlaceKind;
  name: string;
  lat: number;
  lon: number;
  hours: string | null; // OpenStreetMap-Schreibweise, z. B. "Mo-Fr 08:00-22:00"
  wifi: boolean | null; // null = nicht eingetragen
  outlets: boolean | null;
  website: string | null;
  address: string | null;
  meters: number;
  walkMin: number;
}

import koelnSnapshot from "./places-koeln.json";
import { getDesktop } from "./desktop";

declare module "./desktop" {
  interface StudiDesktop {
    /** fehlt in älteren Fassungen der App */
    places?: { fetch(query: string): Promise<{ ok: true; data: { elements?: unknown[] } } | { ok: false; message: string }> };
  }
}

export interface UniSpot {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Unis, deren Lage die App kennt. Neue Uni = eine Zeile. */
export const UNI: UniSpot = { id: "koeln", name: "University of Cologne", lat: 50.9283, lon: 6.9285 };
export const RADIUS = 1500;

const CACHE_KEY = "studi.places.v1";
const CACHE_DAYS = 7;

export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function toPlace(e: OsmElement, uni: UniSpot): Place | null {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  const name = t.name?.trim();
  if (!name || lat === undefined || lon === undefined) return null;
  const kind: PlaceKind | null = t.amenity === "library" ? "library" : t.amenity === "cafe" ? "cafe" : t.amenity === "canteen" ? "canteen" : null;
  if (!kind) return null;
  const meters = Math.round(haversine(uni.lat, uni.lon, lat, lon));
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  return {
    id: `${e.type}/${e.id}`,
    kind,
    name,
    lat,
    lon,
    hours: t.opening_hours ?? null,
    wifi: t.internet_access === "wlan" || t.internet_access === "yes" ? true : t.internet_access === "no" ? false : null,
    outlets: t.power_supply === "yes" || t.power_supply === "outlets" ? true : t.power_supply === "no" ? false : null,
    website: t.website ?? t["contact:website"] ?? null,
    address: street || null,
    meters,
    walkMin: Math.max(1, Math.round(meters / 80)),
  };
}

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

/** Sofort verfügbarer Stand: zwischengespeicherte Liste, sonst die mitgelieferte (nur für Köln). */
export function startPlaces(uni: UniSpot = UNI): Place[] {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { uni: string; places: Place[] };
      if (c.uni === uni.id && c.places.length) return c.places;
    }
  } catch {
    // egal
  }
  return uni.id === UNI.id ? (koelnSnapshot as Place[]) : [];
}

/** Lädt die Orte (7 Tage zwischengespeichert, bei Fehler gilt der letzte Stand). */
export async function loadPlaces(uni: UniSpot = UNI): Promise<{ places: Place[]; error: string | null; stale: boolean }> {
  let cached: { at: number; uni: string; places: Place[] } | null = null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {
    cached = null;
  }
  if (cached && cached.uni === uni.id && Date.now() - cached.at < CACHE_DAYS * 86_400_000) return { places: cached.places, error: null, stale: false };

  const around = `around:${RADIUS},${uni.lat},${uni.lon}`;
  const query = `[out:json][timeout:25];(nwr(${around})[amenity=library];nwr(${around})[amenity=cafe];nwr(${around})[amenity=canteen];);out center tags 600;`;
  const parse = (data: { elements?: unknown[] }) => ((data.elements ?? []) as OsmElement[]).map((e) => toPlace(e, uni)).filter((p): p is Place => p !== null);
  let places: Place[] | null = null;
  try {
    // Mac-App: die App holt es selbst (mit ehrlicher Kennung), im Browser direkt
    const viaApp = getDesktop()?.places;
    if (viaApp) {
      const r = await viaApp.fetch(query);
      if (r.ok) places = parse(r.data);
    } else {
      for (const url of ENDPOINTS) {
        try {
          const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
          if (!res.ok) continue;
          places = parse((await res.json()) as { elements?: unknown[] });
          break;
        } catch {
          // nächster Server
        }
      }
    }
  } catch {
    places = null;
  }
  if (places && places.length > 0) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), uni: uni.id, places }));
    } catch {
      // egal
    }
    return { places, error: null, stale: false };
  }
  // Kein Netz oder der Dienst ist überlastet: letzter Stand, sonst die mitgelieferte Liste
  if (cached && cached.uni === uni.id) return { places: cached.places, error: null, stale: true };
  if (uni.id === UNI.id) return { places: koelnSnapshot as Place[], error: null, stale: true };
  return { places: [], error: "Could not load places. Check your internet connection and try again.", stale: false };
}

// ------------------------------------------------------------------ Öffnungszeiten (einfacher Teil der OSM-Schreibweise)

const DAY_CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Rule {
  days: Set<number>;
  spans: [number, number][]; // Minuten ab Mitternacht, Ende kann > 1440 sein (nach Mitternacht)
}

function parseDays(spec: string): Set<number> | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (!p) return null;
    if (p === "PH" || p === "SH") continue; // Feiertage und Ferien: kennen wir nicht, die Wochentage daneben gelten trotzdem
    const range = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(p);
    if (range) {
      const a = DAY_CODES.indexOf(range[1]);
      const b = DAY_CODES.indexOf(range[2]);
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
    } else {
      const i = DAY_CODES.indexOf(p);
      if (i < 0) return null; // „PH“, „SH“, Wochen im Monat … verstehen wir nicht
      out.add(i);
    }
  }
  return out;
}

function parseHours(hours: string): Rule[] | null {
  const text = hours.trim();
  if (text === "24/7") return [{ days: new Set([0, 1, 2, 3, 4, 5, 6]), spans: [[0, 1440]] }];
  const rules: Rule[] = [];
  for (const raw of text.split(";")) {
    const r = raw.trim();
    if (!r) continue;
    const m = /^((?:[A-Z][a-zH](?:-[A-Z][a-z])?)(?:\s*,\s*[A-Z][a-zH](?:-[A-Z][a-z])?)*)?\s*(.*)$/.exec(r);
    if (!m) continue;
    const days = m[1] ? parseDays(m[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) continue;
    if (days.size === 0) continue; // nur Feiertage
    const times = m[2].trim();
    if (/^(off|closed)$/i.test(times)) {
      rules.push({ days, spans: [] });
      continue;
    }
    const spans: [number, number][] = [];
    let ok = true;
    for (const t of times.split(",")) {
      const mm = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/.exec(t.trim());
      if (!mm) {
        ok = false;
        break;
      }
      const start = +mm[1] * 60 + +mm[2];
      let end = +mm[3] * 60 + +mm[4];
      if (end <= start) end += 1440;
      spans.push([start, end]);
    }
    if (ok && spans.length) rules.push({ days, spans });
  }
  return rules.length ? rules : null;
}

const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface OpenState {
  open: boolean | null; // null = Zeiten nicht eingetragen oder nicht lesbar
  until: string | null; // "22:00" wenn offen
  opens: string | null; // „Tue 09:00“ wenn geschlossen
}

/** Spannen pro Wochentag (spätere Regeln überschreiben frühere, wie in OSM). */
function spansPerDay(rules: Rule[]): [number, number][][] {
  const perDay: [number, number][][] = Array.from({ length: 7 }, () => []);
  for (const r of rules) for (const d of r.days) perDay[d] = r.spans;
  return perDay;
}

export function openState(hours: string | null, now: Date): OpenState {
  if (!hours) return { open: null, until: null, opens: null };
  const rules = parseHours(hours);
  if (!rules) return { open: null, until: null, opens: null };
  const perDay = spansPerDay(rules);
  const today = (now.getDay() + 6) % 7;
  const minute = now.getHours() * 60 + now.getMinutes();
  // Heute und der Rest von gestern (Öffnungszeiten über Mitternacht)
  for (const [s, e] of perDay[today]) if (minute >= s && minute < e) return { open: true, until: e - s >= 1440 ? null : hhmm(e), opens: null };
  for (const [s, e] of perDay[(today + 6) % 7]) if (e > 1440 && minute < e - 1440 && s >= 0) return { open: true, until: hhmm(e), opens: null };
  for (let i = 0; i < 7; i++) {
    const d = (today + i) % 7;
    const next = perDay[d].map(([s]) => s).filter((s) => i > 0 || s > minute).sort((a, b) => a - b)[0];
    if (next !== undefined) return { open: false, until: null, opens: i === 0 ? hhmm(next) : `${DAY_NAMES[d]} ${hhmm(next)}` };
  }
  return { open: false, until: null, opens: null };
}

/** Öffnungszeiten als Zeilen („Mon–Fri“, „08:00–22:00“) für die Ort-Karte. */
export function hoursRows(hours: string | null): { label: string; value: string }[] | null {
  if (!hours) return null;
  const rules = parseHours(hours);
  if (!rules) return null;
  const perDay = spansPerDay(rules);
  const text = (d: number) => (perDay[d].length ? perDay[d].map(([s, e]) => (e - s >= 1440 ? "24 hours" : `${hhmm(s)}–${hhmm(e)}`)).join(", ") : "closed");
  const rows: { label: string; value: string }[] = [];
  let start = 0;
  for (let d = 1; d <= 7; d++) {
    if (d === 7 || text(d) !== text(start)) {
      rows.push({ label: d - 1 === start ? DAY_NAMES[start] : `${DAY_NAMES[start]}–${DAY_NAMES[d - 1]}`, value: text(start) });
      start = d;
    }
  }
  return rows;
}

// ------------------------------------------------------------------ „Typisch für diese Zeit“ (Schätzung, keine Live-Zahl)

/** Wie voll ist es erfahrungsgemäß? 0–100, nach Art des Ortes, Wochentag und Stunde. */
export function typicalBusy(kind: PlaceKind, dayIdx: number, hour: number): number {
  const weekend = dayIdx >= 5;
  const curve = (peaks: [number, number, number][], base: number) => {
    let v = base;
    for (const [h, w, a] of peaks) v = Math.max(v, base + a * Math.exp(-((hour - h) ** 2) / (2 * w * w)));
    return v;
  };
  let v: number;
  if (kind === "library") v = weekend ? curve([[14, 3, 40]], 10) : curve([[11, 2.5, 55], [15, 3, 55]], 12);
  else if (kind === "canteen") v = weekend ? 5 : curve([[12.7, 1, 85]], 6);
  else v = weekend ? curve([[11, 2, 55], [15, 2.5, 45]], 15) : curve([[9, 1.3, 45], [13, 1.8, 50], [16, 1.8, 30]], 12);
  return Math.round(Math.min(95, v));
}

export type Level = "quiet" | "some" | "busy";
export const levelOf = (pct: number): Level => (pct < 35 ? "quiet" : pct < 65 ? "some" : "busy");
export const LEVEL_TEXT: Record<Level, string> = { quiet: "Usually quiet", some: "Usually some seats", busy: "Usually busy" };

export const KIND_LABEL: Record<PlaceKind, string> = { library: "Library", cafe: "Café", canteen: "Canteen" };
