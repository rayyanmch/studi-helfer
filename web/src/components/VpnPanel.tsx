"use client";

// Uni-VPN-Assistent (Variante V3, dezent): kleine Zeile unten links, Klick öffnet das Fenster.
// Erstes Mal: Einrichtungsschritte. Danach der Alltag: ein Knopf Connect/Disconnect.
// Bei Cisco übernimmt die App den Cisco-Schritt (Bedienungshilfen): Sie drückt „Connect“, der Student meldet sich im
// Browser an (Uni-Login, Duo), danach schließt die App den Anmelde-Tab und holt sich nach vorn. Ohne diese Erlaubnis
// (oder auf Wunsch, „Use Cisco myself“) öffnet die App Cisco, zeigt, was dran ist, und erkennt die Verbindung.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, Globe, Plug, Smartphone, X } from "lucide-react";
import { Button, Spinner } from "./ui";
import {
  allowVpnAccess,
  cancelVpn,
  connectVpn,
  disconnectVpn,
  focusApp,
  openMacSettings,
  openVpnApp,
  openVpnGuide,
  useVpn,
  watchVpn,
  type VpnStatus,
} from "@/lib/vpn";

const WAIT_SECONDS = 120; // Weg von Hand: so lange warten wir auf die Verbindung, dann gibt es einen Hinweis
const SETUP_KEY = "studi.vpnSetupDone";
const MANUAL_KEY = "studi.vpnManual"; // Student bedient Cisco lieber selbst

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
  const connecting = vpn.auto?.running === true || vpn.phase === "connecting";
  return (
    <button
      onClick={openVpnDialog}
      className="no-drag mx-3 mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-hover"
      title={on ? "Your uni VPN is on" : "Set up or turn on your uni VPN"}
    >
      <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={on ? { background: "var(--ok)" } : { border: "1.5px solid var(--muted)" }} />
      <span className="flex-1">{on ? "Uni VPN on" : connecting ? "Uni VPN connecting…" : vpn.installed ? "Uni VPN off" : "Uni VPN"}</span>
      <span className="underline underline-offset-2">{on ? "Manage" : connecting ? "Show" : vpn.installed ? "Connect" : "Set up"}</span>
    </button>
  );
}

/** Einmal in der Übersicht eingehängt; öffnet sich über openVpnDialog(). */
export function VpnDialogHost() {
  const isOpen = useOpen();
  return isOpen ? <VpnDialog onClose={closeVpnDialog} /> : null;
}

const readFlag = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (key: string, on: boolean) => {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // egal
  }
};

function VpnDialog({ onClose }: { onClose: () => void }) {
  const vpn = useVpn();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [waitingSince, setWaitingSince] = useState<number | null>(null); // Weg von Hand: Cisco ist offen
  const [attemptAt, setAttemptAt] = useState(0); // wann wir zuletzt im Hintergrund verbunden haben
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [askAccess, setAskAccess] = useState(false);
  const [manual, setManual] = useState(() => readFlag(MANUAL_KEY));
  const ref = useRef<HTMLDivElement>(null);

  const connected = vpn.connected === true;
  // Nach dem ersten erfolgreichen Verbinden (auch in einer früheren Sitzung) zeigen wir den Alltag
  const setupDone = readFlag(SETUP_KEY);
  const auto = vpn.auto;
  const running = auto?.running === true;
  const useAuto = vpn.canAuto && !manual;
  const waiting = waitingSince !== null && !connected;
  const left = waitingSince === null || !now ? WAIT_SECONDS : Math.max(0, WAIT_SECONDS - Math.floor((now - waitingSince) / 1000));
  // Fehler nur vom Versuch aus diesem Fenster, nicht von früher
  const autoError = !running && !connected && attemptAt && auto?.error && auto.since >= attemptAt ? auto.error : null;
  const showAccess = askAccess && !vpn.axTrusted;

  useEffect(() => watchVpn(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Nach dem ersten erfolgreichen Verbinden zeigen wir nur noch den Alltag (Einrichtung bleibt unter „Setup steps“)
  useEffect(() => {
    if (connected) writeFlag(SETUP_KEY, true);
  }, [connected]);

  // Uhr für die Zähler, solange etwas läuft
  useEffect(() => {
    if (!waiting && !running) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [waiting, running]);

  // Weg von Hand verbunden: unser Fenster kommt nach vorn, das VPN-Programm bleibt im Hintergrund
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

  /** Weg von Hand: VPN-Programm öffnen und auf die Verbindung warten. */
  const connectByHand = async () => {
    setError("");
    setWaitingSince(Date.now());
    const err = await openVpnApp();
    if (err) {
      setError(err);
      setWaitingSince(null);
    }
  };

  /** Im Hintergrund verbinden (fragt vorher einmal nach der Erlaubnis). */
  const connectAuto = async () => {
    setError("");
    setAskAccess(false);
    setAttemptAt(Date.now());
    const r = await connectVpn();
    if (!r.ok && r.code === "no_permission") setAskAccess(true);
  };

  const connect = () => {
    if (!useAuto) return void connectByHand();
    if (!vpn.axTrusted) return setAskAccess(true);
    void connectAuto();
  };

  // Erlaubnis gerade erteilt: gleich weiter verbinden
  const accessJustGranted = askAccess && vpn.axTrusted;
  const connectAutoRef = useRef(connectAuto);
  useEffect(() => {
    connectAutoRef.current = connectAuto;
  });
  // Nur einmal pro erteilter Erlaubnis automatisch starten (sonst Schleife, falls der Helfer sie doch nicht hat)
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!vpn.axTrusted) autoStarted.current = false;
  }, [vpn.axTrusted]);
  useEffect(() => {
    if (!accessJustGranted || autoStarted.current) return;
    const t = window.setTimeout(() => {
      autoStarted.current = true;
      void connectAutoRef.current();
    }, 300);
    return () => window.clearTimeout(t);
  }, [accessJustGranted]);

  const useCiscoMyself = () => {
    setManual(true);
    writeFlag(MANUAL_KEY, true);
    setAskAccess(false);
    void connectByHand();
  };
  const backToAuto = () => {
    setManual(false);
    writeFlag(MANUAL_KEY, false);
  };
  const setUpByHand = () => {
    setManual(true);
    writeFlag(MANUAL_KEY, true);
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
  const connectingNow = running || waiting;

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
                <b className="block font-semibold">{connected ? "Connected to the uni network" : connectingNow ? "Connecting…" : "Not connected"}</b>
                <span className="text-[13px] text-muted">{connected ? "Turn it off again whenever you like." : `${vpn.uni} · ${vpn.client}`}</span>
              </span>
              {connected ? (
                <Button onClick={() => void disconnect()} disabled={busy}>
                  {busy && <Spinner size={12} />} Disconnect
                </Button>
              ) : running ? (
                <Button onClick={() => void cancelVpn()}>Cancel</Button>
              ) : (
                <Button variant="primary" onClick={connect} disabled={waiting}>
                  {waiting && <Spinner size={12} />} Connect
                </Button>
              )}
            </div>

            {showAccess && <AccessCard vpn={vpn} onUseCisco={useCiscoMyself} />}

            {/* Im Hintergrund: was passiert gerade? */}
            {running && (
              <ol className="mt-3 rounded-[12px] bg-surface px-4">
                <AutoSteps vpn={vpn} />
              </ol>
            )}

            {/* Von Hand: was ist jetzt dran? */}
            {waiting && (
              <ol className="mt-3 rounded-[12px] bg-surface px-4">
                <Phase done={vpn.phase === "connecting"} now={vpn.phase !== "connecting"} title={`Click “Connect” in ${vpn.client}`} sub="It just opened. If it asks, sign in with your uni ID and password." />
                <Phase
                  done={false}
                  now={vpn.phase === "connecting"}
                  title={factor ? `Approve on ${factor}` : "Finish the sign-in"}
                  sub={factor ? `Your phone shows a notification from ${factor}. Tap “Approve”.` : "Complete the sign-in in the window that opened."}
                  icon={<Smartphone size={14} aria-hidden />}
                />
                <Phase done={false} now={false} title="You’re connected" sub="This window comes back to the front by itself." />
              </ol>
            )}
            {waiting && left === 0 && (
              <p className="mt-3 text-[13px] text-muted">
                Nothing yet. Check your phone, or{" "}
                <button onClick={() => void connectByHand()} className="font-semibold text-text underline underline-offset-2">
                  try again
                </button>
                .
              </p>
            )}
            {manual && vpn.canAuto && !connected && !waiting && (
              <p className="mt-3 text-[13px] text-muted">
                You connect in {vpn.client} yourself.{" "}
                <button onClick={backToAuto} className="font-semibold text-text underline underline-offset-2">
                  Let Studi-Helfer do it
                </button>
              </p>
            )}
          </div>
        ) : (
          <>
            <ol className="mx-6 mt-3 rounded-[12px] bg-surface px-4">
              {useAuto ? (
                <AutoSetupSteps vpn={vpn} connected={connected} onConnect={connect} onDisconnect={() => void disconnect()} busy={busy} />
              ) : (
                <SetupSteps vpn={vpn} copied={copied} onCopy={() => void copy()} connected={connected} waiting={waiting} onConnect={() => void connectByHand()} onDisconnect={() => void disconnect()} busy={busy} />
              )}
            </ol>
            {showAccess && (
              <div className="mx-6">
                <AccessCard vpn={vpn} onUseCisco={useCiscoMyself} />
              </div>
            )}
          </>
        )}

        {autoError && (
          <div role="alert" className="mx-6 mt-3 text-[13px]">
            <p className="font-medium text-danger">{autoError.message}</p>
            <p className="mt-1 text-muted">
              <button onClick={connect} className="font-semibold text-text underline underline-offset-2">
                Try again
              </button>{" "}
              or{" "}
              <button onClick={useCiscoMyself} className="font-semibold text-text underline underline-offset-2">
                connect in {vpn.client} yourself
              </button>
              .
            </p>
          </div>
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
          {!daily && vpn.canAuto && !connected && !running && (
            <button onClick={manual ? backToAuto : setUpByHand} className="text-[12px] text-muted underline underline-offset-2 hover:text-text">
              {manual ? "Let Studi-Helfer connect for me" : "Set up by hand instead"}
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

/** Einmal fragen: Darf Studi-Helfer Cisco für dich bedienen? */
function AccessCard({ vpn, onUseCisco }: { vpn: VpnStatus; onUseCisco: () => void }) {
  const factor = vpn.secondFactor;
  return (
    <div className="mt-3 rounded-[12px] bg-surface px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-full text-text" style={{ boxShadow: "inset 0 0 0 2px var(--text)" }}>
          <Plug size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block font-semibold">Let Studi-Helfer handle Cisco</b>
          <span className="text-[13px] text-muted">
            Then you never open Cisco yourself: you sign in in your browser{factor ? ` and confirm on ${factor}` : ""}, and Studi-Helfer closes the sign-in tab once you’re connected. Your Mac asks once: switch on “{vpn.axName ?? "Studi-Helfer"}” under Accessibility.
          </span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 pl-[38px]">
        <Button variant="primary" onClick={() => void allowVpnAccess()}>
          <ExternalLink size={13} aria-hidden /> Allow
        </Button>
        <button onClick={onUseCisco} className="text-[13px] text-muted underline underline-offset-2 hover:text-text">
          Use Cisco myself instead
        </button>
      </div>
      <p className="mt-2 pl-[38px] text-[12px] text-muted">Studi-Helfer only clicks in Cisco and closes the tab. Your password never goes through it.</p>
    </div>
  );
}

/** Verbinden über die App: Cisco starten (macht die App), im Browser anmelden (Student), verbinden. */
function AutoSteps({ vpn }: { vpn: VpnStatus }) {
  const stage = vpn.auto?.stage ?? "starting";
  const factor = vpn.secondFactor;
  const started = stage === "browser" || stage === "connecting";
  return (
    <>
      <Phase done={started} now={!started} title={`Starting ${vpn.client}`} sub="Studi-Helfer clicks “Connect” for you." busy={!started} />
      <Phase
        done={stage === "connecting"}
        now={stage === "browser"}
        title="Sign in in your browser"
        sub={`Your browser shows the uni login. Sign in with your uni ID${factor ? ` and confirm on ${factor}` : ""}.`}
        icon={<Globe size={14} aria-hidden />}
      />
      <Phase done={false} now={stage === "connecting"} title="Connecting" sub="Then the sign-in tab closes and you’re back here." busy={stage === "connecting"} />
    </>
  );
}

/** Einrichtung, wenn die App selbst verbindet: installieren, Cisco erlauben, Studi-Helfer erlauben, verbinden. */
function AutoSetupSteps({
  vpn,
  connected,
  onConnect,
  onDisconnect,
  busy,
}: {
  vpn: VpnStatus;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  const needsAllow = vpn.allowed !== null;
  const allowed = vpn.allowed === true;
  const done = [vpn.installed, ...(needsAllow ? [allowed] : []), vpn.axTrusted, connected];
  const current = done.findIndex((d) => !d);
  const base = needsAllow ? 1 : 0;
  const running = vpn.auto?.running === true;
  const stage = vpn.auto?.stage;
  const factor = vpn.secondFactor;
  return (
    <>
      <InstallStep vpn={vpn} now={current === 0} />
      {needsAllow && <AllowCiscoStep vpn={vpn} now={current === 1} />}
      <Phase
        n={2 + base}
        done={vpn.axTrusted}
        now={current === 1 + base}
        title={vpn.axTrusted ? `Studi-Helfer handles ${vpn.client}` : `Let Studi-Helfer handle ${vpn.client}`}
        sub={
          vpn.axTrusted
            ? `It clicks “Connect” for you and closes the sign-in tab afterwards.`
            : `Then you never open ${vpn.client} yourself. Your Mac asks once: switch on “${vpn.axName ?? "Studi-Helfer"}” under Accessibility.`
        }
        right={
          !vpn.axTrusted ? (
            <Button variant={current === 1 + base ? "primary" : "secondary"} onClick={() => void allowVpnAccess()} disabled={!vpn.installed}>
              <ExternalLink size={13} aria-hidden /> Allow
            </Button>
          ) : undefined
        }
      />
      <Phase
        n={3 + base}
        done={connected}
        now={current === 2 + base}
        title={connected ? "Connected" : "Connect"}
        sub={
          connected
            ? "You’re in the uni network. Turn it off again whenever you like."
            : running
              ? stage === "browser"
                ? `Sign in in your browser${factor ? ` and confirm on ${factor}` : ""}…`
                : stage === "connecting"
                  ? "Almost there…"
                  : `Starting ${vpn.client}…`
              : `One click, then sign in in your browser${factor ? ` and confirm on ${factor}` : ""}.`
        }
        right={
          connected ? (
            <Button onClick={onDisconnect} disabled={busy}>
              {busy && <Spinner size={12} />} Disconnect
            </Button>
          ) : running ? (
            <Button onClick={() => void cancelVpn()}>Cancel</Button>
          ) : (
            <Button variant={current === 2 + base ? "primary" : "secondary"} onClick={onConnect} disabled={!vpn.installed}>
              Connect
            </Button>
          )
        }
      />
    </>
  );
}

function InstallStep({ vpn, now }: { vpn: VpnStatus; now: boolean }) {
  return (
    <Phase
      n={1}
      done={vpn.installed}
      now={now}
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
  );
}

function AllowCiscoStep({ vpn, now }: { vpn: VpnStatus; now: boolean }) {
  const allowed = vpn.allowed === true;
  return (
    <Phase
      n={2}
      done={allowed}
      now={now}
      title={allowed ? `${vpn.client} is allowed on your Mac` : `Allow ${vpn.client} on your Mac`}
      sub={allowed ? "macOS lets it set up the VPN." : "Your Mac asks once. Open the settings, switch the Cisco entry on and click “Allow” if a window pops up."}
      right={
        !allowed ? (
          <Button variant={now ? "primary" : "secondary"} onClick={openMacSettings} disabled={!vpn.installed}>
            <ExternalLink size={13} aria-hidden /> Open Mac settings
          </Button>
        ) : undefined
      }
    />
  );
}

/** Einrichtung von Hand (andere VPN-Programme oder auf Wunsch): installieren, erlauben, Adresse, verbinden. */
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
  vpn: VpnStatus;
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
  return (
    <>
      <InstallStep vpn={vpn} now={current === 0} />
      {needsAllow && <AllowCiscoStep vpn={vpn} now={current === 1} />}
      <Phase
        n={2 + base}
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
        n={3 + base}
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
function Phase({
  n,
  done,
  now,
  title,
  sub,
  right,
  icon,
  busy,
}: {
  n?: number;
  done: boolean;
  now: boolean;
  title: string;
  sub: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line-soft py-3.5 first:border-t-0">
      <span
        aria-hidden
        className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
        style={done ? { background: "var(--ok)", color: "var(--on-solid)" } : { boxShadow: `inset 0 0 0 2px ${now ? "var(--text)" : "var(--line)"}`, color: now ? "var(--text)" : "var(--muted)" }}
      >
        {done ? <Check size={14} strokeWidth={3} className="check-pop" /> : now && busy ? <Spinner size={12} /> : (icon ?? n ?? "·")}
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
