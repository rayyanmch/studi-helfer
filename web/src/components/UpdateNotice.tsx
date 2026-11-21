"use client";

// Kleines Fenster oben rechts für den Update-Knopf: neue Fassung, Download mit Restzeit, Fehler.
// Automatische Prüfungen melden sich nur, wenn es etwas Neues gibt; „Check for updates“ zeigt jeden Ausgang.

import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, X } from "lucide-react";
import { Button, Spinner } from "./ui";
import { getUpdater, useUpdate, versionLabel, type UpdateState } from "@/lib/updates";

function mb(bytes: number) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

function eta(seconds: number | null) {
  if (seconds === null) return "estimating time…";
  if (seconds < 10) return "almost done";
  if (seconds < 60) return "less than a minute left";
  const min = Math.round(seconds / 60);
  return `about ${min} min left`;
}

function ago(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function UpdateNotice() {
  const state = useUpdate();
  // „Later“ blendet genau diese Fassung aus; eine noch neuere meldet sich wieder.
  const [dismissed, setDismissed] = useState<{ sha: string; at: number | null } | null>(null);
  const [closedAt, setClosedAt] = useState<number | null>(null);

  // „You're up to date“ verschwindet nach ein paar Sekunden von selbst.
  useEffect(() => {
    if (state?.status !== "current" || !state.manual) return;
    const t = setTimeout(() => setClosedAt(state.checkedAt), 4000);
    return () => clearTimeout(t);
  }, [state?.status, state?.manual, state?.checkedAt]);

  if (!state || !visible(state, dismissed, closedAt)) return null;
  const updater = getUpdater();
  const close = () => setClosedAt(state.checkedAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-drag absolute right-5 top-[60px] z-40 w-[300px] rounded-[12px] bg-surface p-3.5 shadow-[0_0_0_1px_var(--line),0_14px_34px_rgba(0,0,0,0.16)]"
    >
      {state.status === "checking" && (
        <p className="flex items-center gap-2 font-medium">
          <Spinner /> Checking for updates…
        </p>
      )}

      {state.status === "current" && (
        <p className="flex items-center gap-2 font-medium">
          <Check size={15} className="text-muted" aria-hidden /> You’re up to date
        </p>
      )}

      {state.status === "error" && (
        <>
          <Header title="Couldn’t update" onClose={close} />
          <p className="mt-1 text-[13px] text-danger">{state.message}</p>
          <div className="mt-3 flex justify-end">
            <Button onClick={() => void updater?.check()}>Try again</Button>
          </div>
        </>
      )}

      {state.status === "available" && state.latest && (
        <>
          <Header title="New version available" onClose={() => setDismissed({ sha: state.latest!.sha, at: state.checkedAt })} />
          <p className="mt-1 line-clamp-2 text-[13px] text-muted" title={state.latest.message}>
            {state.latest.message || state.latest.sha.slice(0, 7)}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {ago(state.latest.committedAt)}
            {state.latest.size ? ` · ${mb(state.latest.size)}` : ""}
          </p>
          {state.message && <p className="mt-2 text-[13px] text-danger">{state.message}</p>}
          {/* Unsignierte App: nach jedem Update fragt macOS einmal nach dem Schlüsselbund (siehe NOTIZEN). */}
          <p className="mt-2 text-[12px] text-muted">
            After the update, your Mac may ask once to use the saved ILIAS password. Enter your Mac password and click “Always Allow”.
          </p>
          <div className="mt-3 flex justify-end gap-1.5">
            <Button variant="plain" onClick={() => setDismissed({ sha: state.latest!.sha, at: state.checkedAt })}>
              Later
            </Button>
            <Button variant="primary" onClick={() => void updater?.install()}>
              <ArrowDownToLine size={14} aria-hidden />
              {state.message ? "Try again" : "Update and restart"}
            </Button>
          </div>
        </>
      )}

      {state.status === "downloading" && (
        <>
          <p className="font-semibold">Downloading update…</p>
          <Progress state={state} />
        </>
      )}

      {state.status === "installing" && (
        <>
          <p className="flex items-center gap-2 font-semibold">
            <Spinner /> Installing…
          </p>
          <p className="mt-1 text-[13px] text-muted">Studi-Helfer restarts in a moment.</p>
        </>
      )}
    </div>
  );
}

function visible(s: UpdateState, dismissed: { sha: string; at: number | null } | null, closedAt: number | null) {
  switch (s.status) {
    case "available":
      // Ausgeblendet bleibt sie, bis jemand selbst wieder nachsieht oder es eine noch neuere gibt.
      return !(dismissed && dismissed.sha === s.latest?.sha && (!s.manual || dismissed.at === s.checkedAt));
    case "downloading":
    case "installing":
      return true;
    case "checking":
      return s.manual;
    case "current":
    case "error":
      return s.manual && closedAt !== s.checkedAt;
    default:
      return false;
  }
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="font-semibold">{title}</p>
      <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-0.5 rounded-md p-1 text-muted hover:bg-hover">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function Progress({ state }: { state: UpdateState }) {
  const p = state.progress;
  const share = p && p.total ? Math.min(1, p.received / p.total) : 0;
  return (
    <>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-muted tabular-nums">
        {p ? `${mb(p.received)}${p.total ? ` of ${mb(p.total)}` : ""} · ${eta(p.etaSeconds)}` : "Starting…"}
      </p>
    </>
  );
}

/** Eintrag im Menü oben links: „Check for updates“ und darunter die eigene Fassung. Nur in der Mac-App. */
export function UpdateMenuItem({ className, onDone }: { className: string; onDone: () => void }) {
  const state = useUpdate();
  if (!state) return null;
  if (state.status === "dev") {
    return (
      <>
        <div className="my-1 h-px bg-line" />
        <p className="px-2.5 py-1.5 text-[12px] text-muted">Development build, updates come via git</p>
      </>
    );
  }
  const busy = state.status === "checking" || state.status === "downloading" || state.status === "installing";
  return (
    <>
      <div className="my-1 h-px bg-line" />
      <button
        role="menuitem"
        disabled={busy}
        className={`${className} disabled:opacity-45`}
        onClick={() => {
          onDone();
          void getUpdater()?.check();
        }}
      >
        {state.status === "available" ? "Update available…" : "Check for updates"}
      </button>
      {state.current && (
        <p className="px-2.5 pb-1 text-[12px] text-muted tabular-nums" title={state.current.message}>
          Version {versionLabel(state.current)}
        </p>
      )}
    </>
  );
}
