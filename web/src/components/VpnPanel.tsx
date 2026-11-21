"use client";

// Uni-VPN-Assistent (Variante V3, dezent): kleine Zeile unten links, Klick öffnet drei Schritte.
// Was die App übernimmt: richtiges Programm und Server kennen, prüfen ob installiert, Adresse kopieren,
// Programm öffnen, Verbindung erkennen. Was der Student selbst macht: einmal installieren, einmal anmelden.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { Button, Spinner } from "./ui";
import { disconnectVpn, openMacSettings, openVpnApp, openVpnGuide, useVpn, watchVpn } from "@/lib/vpn";

// --- Fenster von überall öffnen (Seitenleiste, Hinweis bei ILIAS-Störung) ---------------

let open = false;
const listeners = new Set<() => void>();
export function openVpnDialog() {
  open = true;
  listeners.forEach((l) => l());
}
function closeVpnDialog() {
  open = false;
  listeners.forEach((l) => l());
}
const useOpen = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );

/** Zeile unten in der Seitenleiste: „Uni VPN on“ / „Uni VPN off · Connect“. */
export function VpnLine() {
  const vpn = useVpn();
  useEffect(() => watchVpn(), []);
  if (!vpn.ready) return null;
  const on = vpn.connected === true;
  return (
    <button
      onClick={openVpnDialog}
      className="no-drag mx-3 mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover"
      title={on ? "Your uni VPN is on" : "Set up or turn on your uni VPN"}
    >
      <span
        aria-hidden
        className="size-[7px] shrink-0 rounded-full"
        style={on ? { background: "var(--ok)" } : { border: "1.5px solid var(--muted)" }}
      />
      <span className="flex-1">{on ? "Uni VPN on" : vpn.installed ? "Uni VPN off" : "Uni VPN"}</span>
      <span className="underline underline-offset-2">{on ? "Manage" : vpn.installed ? "Connect" : "Set up"}</span>
    </button>
  );
}

/** Einmal in der Übersicht eingehängt; öffnet sich über openVpnDialog(). */
export function VpnDialogHost() {
  const isOpen = useOpen();
  return isOpen ? <VpnDialog onClose={closeVpnDialog} /> : null;
}

function VpnDialog({ onClose }: { onClose: () => void }) {
  const vpn = useVpn();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false); // Cisco ist offen, wir warten auf „Connect“
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => watchVpn(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const connected = vpn.connected === true;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(vpn.server);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the address and copy it by hand.");
    }
  };
  const openApp = async () => {
    setError("");
    setWaiting(true);
    const err = await openVpnApp();
    if (err) {
      setError(err);
      setWaiting(false);
    }
  };
  const disconnect = async () => {
    setError("");
    setBusy(true);
    const err = await disconnectVpn();
    setBusy(false);
    setWaiting(false);
    if (err) setError(err);
  };

  // Welcher Schritt ist dran? Fertige Schritte bekommen einen Haken. „Erlauben“ gibt es nur bei Programmen mit Systemerweiterung (Cisco).
  const needsAllow = vpn.allowed !== null;
  const allowed = vpn.allowed === true;
  const done = [vpn.installed, ...(needsAllow ? [allowed] : []), copied || connected, connected];
  const current = done.findIndex((d) => !d);
  const n = (i: number) => i + 1;
  const base = needsAllow ? 1 : 0;

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-6 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Uni VPN"
        className="w-[540px] max-w-full rounded-[14px] bg-bg shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)] outline-none"
      >
        <header className="flex items-start gap-3 px-6 pb-1 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold">Uni VPN</h2>
            <p className="mt-0.5 text-[13px] text-muted">Some uni services only work through the VPN, for example library e-books. ILIAS usually works without it.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover">
            <X size={16} aria-hidden />
          </button>
        </header>

        <ol className="mx-6 mt-3 rounded-[12px] bg-surface px-4">
          <Step n={1} done={done[0]} now={current === 0} title={vpn.installed ? `${vpn.client} is installed` : `Install ${vpn.client}`} sub={vpn.installed ? "Found on your Mac." : `${vpn.uni} uses this app. Download it from the uni page, then open the file and click through.`}>
            {!vpn.installed && (
              <Button variant="primary" onClick={openVpnGuide}>
                <ExternalLink size={13} aria-hidden /> Download
              </Button>
            )}
          </Step>
          {needsAllow && (
            <Step
              n={2}
              done={allowed}
              now={current === 1}
              title={allowed ? `${vpn.client} is allowed on your Mac` : `Allow ${vpn.client} on your Mac`}
              sub={allowed ? "macOS lets it set up the VPN." : "Your Mac asks once. Open the settings, switch the Cisco entry on and click “Allow” if a window pops up."}
            >
              {!allowed && (
                <Button variant={current === 1 ? "primary" : "secondary"} onClick={openMacSettings} disabled={!vpn.installed}>
                  <ExternalLink size={13} aria-hidden /> Open Mac settings
                </Button>
              )}
            </Step>
          )}
          <Step n={n(1 + base)} done={done[1 + base]} now={current === 1 + base} title="Server address" sub={`Paste it into ${vpn.client} the first time. After that it remembers it.`}>
            <span className="flex items-center gap-2">
              <code className="rounded-md bg-bg px-2 py-1 text-[12px] [user-select:text]">{vpn.server}</code>
              <Button onClick={() => void copy()}>
                {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? "Copied" : "Copy"}
              </Button>
            </span>
          </Step>
          <Step n={n(2 + base)} done={done[2 + base]} now={current === 2 + base} title={connected ? "Connected" : "Connect"} sub={connected ? "You’re in the uni network. Turn it off again whenever you like." : waiting ? `Waiting for you to click “Connect” in ${vpn.client}…` : `Click “Connect” in ${vpn.client}. ${vpn.login}`}>
            {connected ? (
              <Button onClick={() => void disconnect()} disabled={busy}>
                {busy && <Spinner size={12} />} Disconnect
              </Button>
            ) : waiting ? (
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner size={13} />
                <button onClick={() => void openApp()} className="underline underline-offset-2 hover:text-text">
                  Open again
                </button>
              </span>
            ) : (
              <Button variant={current === 2 + base ? "primary" : "secondary"} onClick={() => void openApp()} disabled={!vpn.installed}>
                Open {vpn.client.replace(/ Secure Client$/, "")}
              </Button>
            )}
          </Step>
        </ol>

        {error && <p role="alert" className="mx-6 mt-3 text-[13px] font-medium text-danger">{error}</p>}
        <footer className="flex items-center gap-3 px-6 pb-5 pt-4">
          <button onClick={openVpnGuide} className="text-[12px] text-muted underline underline-offset-2 hover:text-text">
            Step-by-step guide from your university
          </button>
          <span className="flex-1" />
          <Button variant={connected ? "primary" : "secondary"} onClick={onClose}>
            {connected ? "Done" : "Later"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Step({ n, done, now, title, sub, children }: { n: number; done: boolean; now: boolean; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line-soft py-3.5 first:border-t-0">
      <span
        aria-hidden
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
        style={done ? { background: "var(--ok)", color: "var(--on-solid)" } : { boxShadow: `inset 0 0 0 2px ${now ? "var(--text)" : "var(--line)"}`, color: now ? "var(--text)" : "var(--muted)" }}
      >
        {done ? <Check size={14} strokeWidth={3} className="check-pop" /> : n}
      </span>
      <span className="min-w-[200px] flex-1">
        <b className="block font-semibold">{title}</b>
        <span className="text-[13px] text-muted">{sub}</span>
      </span>
      {children}
      <span className="sr-only">{done ? "Done" : now ? "Next step" : ""}</span>
    </li>
  );
}
