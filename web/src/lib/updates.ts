"use client";

// Update-Knopf: neueste Fassung der Mac-App von GitHub holen (desktop/lib/updater.js).
// Nur in der fertigen App. Im Browser und in der Entwicklung (npm start) gibt es keine Updates.

import { useEffect, useState } from "react";
import { getDesktop } from "./desktop";

export interface BuildInfo {
  sha: string;
  committedAt: string; // ISO
  message: string; // erste Zeile der Commit-Nachricht (deutsch)
}

export interface UpdateState {
  /** dev = Entwicklung (npm start), dort kommt der neue Stand per git */
  status: "dev" | "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "error";
  current: BuildInfo | null;
  latest: (BuildInfo & { zip: string; size: number }) | null;
  progress: { received: number; total: number; etaSeconds: number | null } | null;
  checkedAt: number | null;
  /** Fehlertext (englisch), auch bei "available", wenn der Download abbrach */
  message: string | null;
  /** vom Knopf ausgelöst: dann auch „up to date“ und Fehler zeigen; automatische Prüfungen nur bei neuer Fassung */
  manual: boolean;
}

export interface UpdateApi {
  getState(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  /** Lädt, tauscht das .app aus und startet die App neu. */
  install(): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  onState(callback: (state: UpdateState) => void): () => void;
}

declare module "./desktop" {
  interface StudiDesktop {
    /** fehlt in älteren Fassungen der App */
    updates?: UpdateApi;
  }
}

export function getUpdater(): UpdateApi | null {
  return getDesktop()?.updates ?? null;
}

/** Aktueller Update-Stand; null im Browser oder in alten App-Fassungen. */
export function useUpdate(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const updater = getUpdater();
    if (!updater) return;
    let alive = true;
    updater.getState().then((s) => alive && setState(s));
    const off = updater.onState((s) => setState(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}

/** „a1b2c3d · Nov 21, 2:05 PM“ */
export function versionLabel(info: BuildInfo | null): string {
  if (!info) return "";
  const d = new Date(info.committedAt);
  const when = Number.isNaN(d.getTime())
    ? ""
    : ` · ${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  return `${info.sha.slice(0, 7)}${when}`;
}
