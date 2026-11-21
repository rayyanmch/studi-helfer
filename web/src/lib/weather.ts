"use client";

// Wetter für die Stadt der Uni (Startseite „Today“): Open-Meteo, kostenlos, ohne Schlüssel, Abruf direkt aus der
// Oberfläche wie bei der Mensa. Geschickt werden nur die Koordinaten der Uni, nichts über die Person.
// Zwischengespeichert im Browser-Speicher; neu nach 30 Minuten. Ohne Netz bleibt der letzte Stand (oder nichts).

import { useSyncExternalStore } from "react";
import { UNI } from "./places";

export const CITY = UNI.id === "koeln" ? "Cologne" : UNI.name;

export interface WeatherHour {
  time: string; // "2026-11-21T14:00" (Ortszeit der Uni)
  temp: number;
  code: number; // WMO-Code
  rain: number; // Regenwahrscheinlichkeit in %
  mm: number; // Niederschlag in mm
  day: boolean;
}

export interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
  rain: number; // höchste Regenwahrscheinlichkeit in %
  sunrise: string; // "07:58"
  sunset: string;
}

export interface Weather {
  fetchedAt: number;
  now: { temp: number; feels: number; code: number; wind: number; day: boolean };
  hours: WeatherHour[];
  days: WeatherDay[];
}

type State = { status: "idle" | "loading" | "ready" | "error"; data: Weather | null };

const KEY = "studi.weather";
const FRESH = 30 * 60_000;
let state: State = { status: "idle", data: null };
const listeners = new Set<() => void>();
const SERVER: State = { status: "idle", data: null };

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useWeather(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
}

let inflight: Promise<void> | null = null;

export function loadWeather(force = false): Promise<void> {
  if (!state.data) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null") as Weather | null;
      if (saved?.now && Array.isArray(saved.hours)) set({ data: saved, status: "ready" });
    } catch {
      // kein Speicher
    }
  }
  if (!force && state.data && Date.now() - state.data.fetchedAt < FRESH) return Promise.resolve();
  if (inflight) return inflight;
  set({ status: state.data ? "ready" : "loading" });
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${UNI.lat}&longitude=${UNI.lon}` +
    "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day" +
    "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
    "&timezone=Europe%2FBerlin&forecast_days=6";
  inflight = fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => {
      const h = j.hourly;
      const d = j.daily;
      const data: Weather = {
        fetchedAt: Date.now(),
        now: {
          temp: Math.round(j.current.temperature_2m),
          feels: Math.round(j.current.apparent_temperature),
          code: j.current.weather_code,
          wind: Math.round(j.current.wind_speed_10m),
          day: j.current.is_day === 1,
        },
        hours: (h.time as string[]).map((time, i) => ({
          time,
          temp: Math.round(h.temperature_2m[i]),
          code: h.weather_code[i],
          rain: h.precipitation_probability[i] ?? 0,
          mm: h.precipitation[i] ?? 0,
          day: h.is_day[i] === 1,
        })),
        days: (d.time as string[]).map((date, i) => ({
          date,
          code: d.weather_code[i],
          max: Math.round(d.temperature_2m_max[i]),
          min: Math.round(d.temperature_2m_min[i]),
          rain: d.precipitation_probability_max[i] ?? 0,
          sunrise: String(d.sunrise[i]).slice(11, 16),
          sunset: String(d.sunset[i]).slice(11, 16),
        })),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        // egal
      }
      set({ data, status: "ready" });
    })
    .catch(() => set({ status: state.data ? "ready" : "error" }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "showers" | "snow" | "storm";

/** WMO-Wettercode → einfache Art und englischer Text. */
export function sky(code: number): { sky: Sky; label: string } {
  if (code === 0) return { sky: "clear", label: "Clear" };
  if (code <= 2) return { sky: "partly", label: code === 1 ? "Mostly clear" : "Partly cloudy" };
  if (code === 3) return { sky: "cloudy", label: "Cloudy" };
  if (code === 45 || code === 48) return { sky: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { sky: "drizzle", label: "Drizzle" };
  if ((code >= 61 && code <= 67) || code === 80) return { sky: code === 80 ? "showers" : "rain", label: code === 80 ? "Showers" : code >= 65 ? "Heavy rain" : "Rain" };
  if (code === 81 || code === 82) return { sky: "showers", label: "Heavy showers" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { sky: "snow", label: "Snow" };
  if (code >= 95) return { sky: "storm", label: "Thunderstorm" };
  return { sky: "cloudy", label: "Cloudy" };
}

export const wet = (code: number) => ["drizzle", "rain", "showers", "storm"].includes(sky(code).sky);

/** Erste Stunde mit wahrscheinlichem Regen (≥ 50 %) in einem Zeitraum, z. B. „heute bis 20 Uhr“. */
export function firstRain(hours: WeatherHour[], from: string, to: string): WeatherHour | null {
  return hours.find((h) => h.time >= from && h.time <= to && (h.rain >= 50 || h.mm >= 0.3)) ?? null;
}
