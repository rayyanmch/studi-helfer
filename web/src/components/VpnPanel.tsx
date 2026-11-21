"use client";

// Uni-VPN-Assistent (Variante V3, dezent): kleine Zeile unten links, Klick öffnet das Fenster.
// Erstes Mal: vier Einrichtungsschritte. Danach der Alltag: Connect, Bestätigung auf dem Handy (Duo), Disconnect,
// alles hier im Fenster. Verbunden wird im VPN-Programm der Uni (die Anmeldung mit Duo kann nur dieses),
// die App öffnet es, zeigt, was als Nächstes dran ist, und holt sich danach selbst wieder nach vorn.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, Smartphone, X } from "lucide-react";
import { Button, Spinner } from "./ui";
import { disconnectVpn, focusApp, openMacSettings, openVpnApp, openVpnGuide, useVpn, watchVpn } from "@/lib/vpn";

const WAIT_SECONDS = 120; // so lange warten wir auf die Bestätigung, dann gibt es einen Hinweis
const SETUP_KEY = "studi.vpnSetupDone";

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
      <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={on ? { background: "var(--ok)" } : { border: "1.5px solid var(--muted)" }} />
      <span className="flex-1">{on ? "Uni VPN on" : vpn.phase === "connecting" ? "Uni VPN connecting…" : vpn.installed ? "Uni VPN off" : "Uni VPN"}</span>
      <span className="underline underline-offset-2">{on ? "Manage" : vpn.installed ? "Connect" : "Set up"}</span>
    </button>
  );
}

/** Einmal in der Übersicht eingehängt; öffnet sich über openVpnDialog(). */
export function VpnDialogHost() {
  const isOpen = useOpen();
  return isOpen ? <VpnDialog onClose={closeVpnDialog} /> : null;
}

const readSetupDone = () => {
  try {
    return window.localStorage.getItem(SETUP_KEY) === "1";
  } catch {
    return false;
  }
};

function VpnDialog({ onClose }: { onClose: () => void }) {
  const vpn = useVpn();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [waitingSince, setWaitingSince] = useState<number | null>(null); // Cisco ist offen, wir warten auf die Verbindung
  const [left, setLeft] = useState(WAIT_SECONDS);
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const connected = vpn.connected === true;
  // Nach dem ersten erfolgreichen Verbinden (auch in einer früheren Sitzung) zeigen wir den Alltag
  const setupDone = readSetupDone();
  const connecting = vpn.phase === "connecting";
  const waiting = waitingSince !== null && !connected;

  useEffect(() => watchVpn(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Nach dem ersten erfolgreichen Verbinden zeigen wir nur noch den Alltag (Einrichtung bleibt unter „Setup steps“)
  useEffect(() => {
    if (!connected) return;
    try {
      window.localStorage.setItem(SETUP_KEY, "1");
    } catch {
      // egal
    }
  }, [connected]);

  // Zeitlimit zählen, solange wir warten
  useEffect(() => {
    if (waitingSince === null || connected) return;
    const t = window.setInterval(() => setLeft(Math.max(0, WAIT_SECONDS - Math.floor((Date.now() - waitingSince) / 1000))), 1000);
    return () => window.clearInterval(t);
  }, [waitingSince, connected]);

  // Verbunden: unser Fenster kommt nach vorn, das VPN-Programm bleibt im Hintergrund
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (waitingSince !== null) wasWaiting.current = true;
    if (connected && wasWaiting.current) {
      wasWaiting.current = false;
      focusApp();
    }
  }, [connected, waitingSince]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(vpn.server);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the address and copy it by hand.");
    }
  };
  const connect = async () => {
    setError("");
    setLeft(WAIT_SECONDS);
    setWaitingSince(Date.now());
    const err = await openVpnApp();
    if (err) {
      setError(err);
      setWaitingSince(null);
    }
  };
  const disconnect = async () => {
    setError("");
    setBusy(true);
    const err = await disconnectVpn();
    setBusy(false);
    setWaitingSince(null);
    if (err) setError(err);
  };

  const daily = (setupDone || connected) && !showSetup && vpn.installed;
  const factor = vpn.secondFactor;

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

        {daily ? (
          <div className="mx-6 mt-3">
            {/* Zustand und der eine große Knopf */}
            <div className="flex items-center gap-3 rounded-[12px] bg-surface px-4 py-3.5">
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={connected ? { background: "var(--ok)" } : { border: "2px solid var(--muted)" }} />
              <span className="min-w-0 flex-1">
                <b className="block font-semibold">{connected ? "Connected to the uni network" : waiting ? "Connecting…" : "Not connected"}</b>
                <span className="text-[13px] text-muted">{connected ? "Turn it off again whenever you like." : `${vpn.uni} · ${vpn.client}`}</span>
              </span>
              {connected ? (
                <Button onClick={() => void disconnect()} disabled={busy}>
                  {busy && <Spinner size={12} />} Disconnect
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void connect()} disabled={waiting}>
                  {waiting && <Spinner size={12} />} Connect
                </Button>
              )}
            </div>

            {/* Während der Anmeldung: was ist jetzt dran? */}
            {waiting && (
              <ol className="mt-3 rounded-[12px] bg-surface px-4">
                <Phase done={connecting} now={!connecting} title={`Click “Connect” in ${vpn.client}`} sub="It just opened. If it asks, sign in with your uni ID and password." />
                <Phase
                  done={false}
                  now={connecting}
                  title={factor ? `Approve on ${factor}` : "Finish the sign-in"}
                  sub={factor ? `Your phone shows a notification from ${factor}. Tap “Approve”.` : "Complete the sign-in in the window that opened."}
                  icon={<Smartphone size={14} aria-hidden />}
                  right={connecting ? <span className="text-[12px] tabular-nums text-muted">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span> : undefined}
                />
                <Phase done={false} now={false} title="You’re connected" sub="This window comes back to the front by itself." />
              </ol>
            )}
            {waiting && left === 0 && (
              <p className="mt-3 text-[13px] text-muted">
                Nothing yet. Check your phone, or{" "}
                <button onClick={() => void connect()} className="font-semibold text-text underline underline-offset-2">
                  try again
                </button>
                .
              </p>
            )}
          </div>
        ) : (
          <ol className="mx-6 mt-3 rounded-[12px] bg-surface px-4">
            <SetupSteps vpn={vpn} copied={copied} onCopy={() => void copy()} connected={connected} waiting={waiting} onConnect={() => void connect()} onDisconnect={() => void disconnect()} busy={busy} />
          </ol>
        )}

        {error && (
          <p role="alert" className="mx-6 mt-3 text-[13px] font-medium text-danger">
            {error}
          </p>
        )}
        <footer className="flex items-center gap-3 px-6 pb-5 pt-4">
          <button onClick={openVpnGuide} className="text-[12px] text-muted underline underline-offset-2 hover:text-text">
            Guide from your university
          </button>
          {(setupDone || connected) && vpn.installed && (
            <button onClick={() => setShowSetup((v) => !v)} className="text-[12px] text-muted underline underline-offset-2 hover:text-text">
              {daily ? "Setup steps" : "Back"}
            </button>
          )}
          <span className="flex-1" />
          <Button variant={connected ? "primary" : "secondary"} onClick={onClose}>
            {connected ? "Done" : "Close"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function SetupSteps({
  vpn,
  copied,
  onCopy,
  connected,
  waiting,
  onConnect,
  onDisconnect,
  busy,
}: {
  vpn: ReturnType<typeof useVpn>;
  copied: boolean;
  onCopy: () => void;
  connected: boolean;
  waiting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  const needsAllow = vpn.allowed !== null;
  const allowed = vpn.allowed === true;
  const done = [vpn.installed, ...(needsAllow ? [allowed] : []), copied || connected, connected];
  const current = done.findIndex((d) => !d);
  const base = needsAllow ? 1 : 0;
  const n = (i: number) => i + 1;
  return (
    <>
      <Phase
        n={1}
        done={done[0]}
        now={current === 0}
        title={vpn.installed ? `${vpn.client} is installed` : `Install ${vpn.client}`}
        sub={vpn.installed ? "Found on your Mac." : `${vpn.uni} uses this app. Download it from the uni page, then open the file and click through.`}
        right={
          !vpn.installed ? (
            <Button variant="primary" onClick={openVpnGuide}>
              <ExternalLink size={13} aria-hidden /> Download
            </Button>
          ) : undefined
        }
      />
      {needsAllow && (
        <Phase
          n={2}
          done={allowed}
          now={current === 1}
          title={allowed ? `${vpn.client} is allowed on your Mac` : `Allow ${vpn.client} on your Mac`}
          sub={allowed ? "macOS lets it set up the VPN." : "Your Mac asks once. Open the settings, switch the Cisco entry on and click “Allow” if a window pops up."}
          right={
            !allowed ? (
              <Button variant={current === 1 ? "primary" : "secondary"} onClick={openMacSettings} disabled={!vpn.installed}>
                <ExternalLink size={13} aria-hidden /> Open Mac settings
              </Button>
            ) : undefined
          }
        />
      )}
      <Phase
        n={n(1 + base)}
        done={done[1 + base]}
        now={current === 1 + base}
        title="Server address"
        sub={`Paste it into ${vpn.client} the first time. After that it remembers it.`}
        right={
          <span className="flex items-center gap-2">
            <code className="rounded-md bg-bg px-2 py-1 text-[12px] [user-select:text]">{vpn.server}</code>
            <Button onClick={onCopy}>
              {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? "Copied" : "Copy"}
            </Button>
          </span>
        }
      />
      <Phase
        n={n(2 + base)}
        done={done[2 + base]}
        now={current === 2 + base}
        title={connected ? "Connected" : "Connect"}
        sub={
          connected
            ? "You’re in the uni network. Turn it off again whenever you like."
            : waiting
              ? `Click “Connect” in ${vpn.client}${vpn.secondFactor ? `, then approve on ${vpn.secondFactor}` : ""}…`
              : `Click “Connect” in ${vpn.client}.${vpn.secondFactor ? ` Then approve on ${vpn.secondFactor} on your phone.` : ""}`
        }
        right={
          connected ? (
            <Button onClick={onDisconnect} disabled={busy}>
              {busy && <Spinner size={12} />} Disconnect
            </Button>
          ) : waiting ? (
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <Spinner size={13} />
              <button onClick={onConnect} className="underline underline-offset-2 hover:text-text">
                Open again
              </button>
            </span>
          ) : (
            <Button variant={current === 2 + base ? "primary" : "secondary"} onClick={onConnect} disabled={!vpn.installed}>
              Open {vpn.client.replace(/ Secure Client$/, "")}
            </Button>
          )
        }
      />
    </>
  );
}

/** Ein Schritt: Kreis mit Zahl oder Haken, Titel, Erklärung, optional etwas rechts. */
function Phase({ n, done, now, title, sub, right, icon }: { n?: number; done: boolean; now: boolean; title: string; sub: string; right?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line-soft py-3.5 first:border-t-0">
      <span
        aria-hidden
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
        style={done ? { background: "var(--ok)", color: "var(--on-solid)" } : { boxShadow: `inset 0 0 0 2px ${now ? "var(--text)" : "var(--line)"}`, color: now ? "var(--text)" : "var(--muted)" }}
      >
        {done ? <Check size={14} strokeWidth={3} className="check-pop" /> : (icon ?? n ?? "·")}
      </span>
      <span className="min-w-[200px] flex-1">
        <b className="block font-semibold">{title}</b>
        <span className="text-[13px] text-muted">{sub}</span>
      </span>
      {right}
      <span className="sr-only">{done ? "Done" : now ? "Next step" : ""}</span>
    </li>
  );
}
