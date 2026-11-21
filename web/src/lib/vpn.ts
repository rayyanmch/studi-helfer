"use client";

// Uni-VPN-Assistent: Zustand (welches Programm, installiert, verbunden). Mac-App: desktop/lib/vpn.js,
// im Browser Beispieldaten. Die App verbindet nicht selbst, sie zeigt den Weg und erkennt, wann es geklappt hat.

import { useSyncExternalStore } from "react";
import { getDesktop } from "./desktop";

export interface VpnStatus {
  uni: string;
  client: string; // „Cisco Secure Client“
  server: string; // „vpngate.uni-koeln.de“
  guide: string; // offizielle Anleitung der Uni (mit Download)
  login: string; // womit man sich anmeldet
  installed: boolean;
  allowed: boolean | null; // Systemerweiterung in den Mac-Einstellungen erlaubt? null = nicht nötig
  connected: boolean | null; // null = das Programm verrät es nicht
  phase: "connected" | "connecting" | "disconnected" | null; // „connecting“ = die Anmeldung läuft (z. B. Duo)
  secondFactor: string | null; // „Duo Mobile“: Bestätigung auf dem Handy bei jeder Anmeldung
  ready: boolean;
}

interface VpnApi {
  status(): Promise<{ ok: true } & Omit<VpnStatus, "ready">>;
  open(): Promise<{ ok: boolean; message?: string }>;
  disconnect(): Promise<{ ok: boolean; message?: string }>;
  guide(): Promise<{ ok: true }>;
  settings(): Promise<{ ok: true }>;
  front(): Promise<{ ok: true }>;
}

declare module "./desktop" {
  interface StudiDesktop {
    /** fehlt in älteren Fassungen der App */
    vpn?: VpnApi;
  }
}

const DEMO: VpnStatus = {
  uni: "University of Cologne",
  client: "Cisco Secure Client",
  server: "vpngate.uni-koeln.de",
  guide: "https://rrzk.uni-koeln.de/en/internet-access-web/network-access/vpn/cisco-secure-client-fuer-mac",
  login: "Your uni ID and password, the same as for ILIAS.",
  installed: true,
  allowed: false,
  connected: false,
  phase: "disconnected",
  secondFactor: "Duo Mobile",
  ready: true,
};

let state: VpnStatus = { ...DEMO, ready: false };
const listeners = new Set<() => void>();
const set = (next: Partial<VpnStatus>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const api = () => getDesktop()?.vpn ?? null;

export async function refreshVpn() {
  const v = api();
  if (!v) {
    if (!state.ready) set({ ...DEMO });
    return;
  }
  try {
    const r = await v.status();
    if (r?.ok) set({ ...r, ready: true });
  } catch {
    // nächster Versuch beim nächsten Takt
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
let fastUsers = 0;
/** Nachsehen: normal alle 30 s, solange das Fenster offen ist alle 3 s (damit „Connected“ sofort erscheint). */
export function watchVpn(fast = false): () => void {
  if (fast) fastUsers += 1;
  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => void refreshVpn(), fastUsers > 0 ? 3000 : 30_000);
  };
  void refreshVpn();
  restart();
  return () => {
    if (fast) fastUsers = Math.max(0, fastUsers - 1);
    restart();
  };
}

export function useVpn(): VpnStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/** Öffnet das VPN-Programm. Im Browser: spielt den Ablauf vor (Anmeldung läuft, dann verbunden). */
export async function openVpnApp(): Promise<string | null> {
  const v = api();
  if (!v) {
    setTimeout(() => set({ phase: "connecting" }), 1500);
    setTimeout(() => set({ connected: true, phase: "connected" }), 4500);
    return null;
  }
  const r = await v.open();
  return r.ok ? null : (r.message ?? "Could not open the VPN app.");
}

/** Trennt die VPN-Verbindung. Gibt einen Fehlertext zurück oder null. */
export async function disconnectVpn(): Promise<string | null> {
  const v = api();
  if (!v) {
    await new Promise((r) => setTimeout(r, 600));
    set({ connected: false, phase: "disconnected" });
    return null;
  }
  const r = await v.disconnect();
  await refreshVpn();
  return r.ok ? null : (r.message ?? "Could not disconnect.");
}

/** Holt unser Fenster nach vorn, wenn das VPN-Programm es verdeckt hat. */
export function focusApp() {
  void api()?.front();
}

/** Öffnet die Mac-Einstellungen („Erlauben“ für die VPN-Erweiterung). Im Browser: tut so, als wäre es erlaubt. */
export function openMacSettings() {
  const v = api();
  if (v) void v.settings();
  else setTimeout(() => set({ allowed: true }), 1500);
}

export function openVpnGuide() {
  const v = api();
  if (v) void v.guide();
  else window.open(state.guide, "_blank", "noopener");
}
