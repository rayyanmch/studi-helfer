"use client";

// Einstellungen (⌘, oder Profilmenü): Sync-Zeitplan, Kalender (KLIPS-Stundenplan), Mac, Konto.

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarPlus, Check, FolderOpen, Trash2, X } from "lucide-react";
import { Button, Spinner, folderPlace } from "./ui";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";
import type { SyncEvery } from "@/lib/desktop";

const EVERY: [SyncEvery, string][] = [
  ["30m", "Every 30 minutes"],
  ["1h", "Every hour"],
  ["3h", "Every 3 hours"],
  ["daily", "Once a day"],
];

export function Settings({ onClose, onEditCourses, onLogout }: { onClose: () => void; onEditCourses: () => void; onLogout: () => void }) {
  const app = useApp();
  const desktop = app.mode === "desktop";
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    dialog.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-6 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="scroll max-h-[84vh] w-[560px] max-w-full rounded-[14px] bg-bg shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)] outline-none focus:outline-none focus-visible:shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)]"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between bg-bg px-6 pb-3 pt-5">
          <h2 className="text-[20px] font-bold">Settings</h2>
          <button onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="flex flex-col gap-6 px-6 pb-6">
          <Section title="Updates">
            <Row label="Get new files automatically" hint="Runs in the background, even when the app is closed.">
              <Toggle on={app.schedule.enabled} onChange={(on) => void store.setSchedule(on, app.schedule.time)} disabled={!desktop} />
            </Row>
            {app.schedule.enabled && (
              <Row label="How often">
                <select
                  value={app.schedule.every}
                  onChange={(e) => void store.setSchedule(true, app.schedule.time, e.target.value as SyncEvery)}
                  disabled={!desktop}
                  aria-label="How often to get new files"
                  className="h-8 rounded-lg bg-surface px-2 shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                >
                  {EVERY.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Row>
            )}
            {app.schedule.enabled && app.schedule.every === "daily" && (
              <Row label="Time">
                <input
                  type="time"
                  value={app.schedule.time}
                  onChange={(e) => e.target.value && void store.setSchedule(true, e.target.value)}
                  disabled={!desktop}
                  className="h-8 rounded-lg bg-surface px-2 shadow-[inset_0_0_0_1px_var(--line)] outline-none"
                />
              </Row>
            )}
            <Row label="Last update" hint={app.lastSync}>
              <Button onClick={() => void store.syncNow()} disabled={!desktop || Boolean(app.job?.running)}>
                {app.job?.running ? "Updating…" : "Get new files now"}
              </Button>
            </Row>
          </Section>

          <Calendars />

          <Section title="Mac">
            <Row label="Notifications" hint="When new files arrive (“3 new files in BWL”).">
              <Toggle on={app.notifications} onChange={(on) => void store.setNotifications(on)} disabled={!desktop} />
            </Row>
            <Row label="Open at login" hint="Starts quietly in the background.">
              <Toggle on={app.launchAtLogin} onChange={(on) => void store.setLaunchAtLogin(on)} disabled={!desktop} />
            </Row>
            <Row label="Folder" hint={`Your files are in ${folderPlace(app.targetDir)}.`}>
              <Button onClick={() => store.revealFile(app.targetPath ?? undefined)} disabled={!desktop}>
                <FolderOpen size={14} aria-hidden /> Show in Finder
              </Button>
            </Row>
          </Section>

          <Section title="Account">
            <Row label={app.user ? `Signed in as ${app.user}` : "Not signed in"} hint="University of Cologne · Your password stays in your Mac’s Keychain.">
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    onClose();
                    onEditCourses();
                  }}
                >
                  Change courses
                </Button>
                <Button
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="text-danger"
                >
                  Sign out
                </Button>
              </div>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-muted">{title}</h3>
      <div className="flex flex-col divide-y divide-[var(--line)] rounded-[12px] bg-surface">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block truncate text-[12px] text-muted">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className="relative inline-flex cursor-default items-center">
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] peer-disabled:opacity-45 ${
          on ? "bg-accent" : "bg-line"
        }`}
      >
        <span className={`absolute top-[2px] size-[18px] rounded-full bg-white shadow-sm transition-[left] duration-200 ${on ? "left-[18px]" : "left-[2px]"}`} />
      </span>
    </label>
  );
}

function Calendars() {
  const app = useApp();
  const desktop = app.mode === "desktop";
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("KLIPS timetable");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    const res = await store.addCalendar(url, name);
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Added. ${res.count} ${res.count === 1 ? "event" : "events"} found and sorted into your courses.` });
      setUrl("");
      setAdding(false);
    } else {
      setMsg({ ok: false, text: res.message ?? "That did not work." });
    }
  };

  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-muted">Calendars</h3>
      <div className="rounded-[12px] bg-surface">
        <p className="px-4 pb-1 pt-3 text-[13px] text-muted">
          ILIAS only knows dates your lecturers enter there. Add your timetable to see all lectures and tutorials: in KLIPS, open your calendar, choose
          “Export / Subscribe” and copy the link. Google and Apple calendar links work too. Anything missing? Use “Add event” in the week view or on a course page.
        </p>
        <ul className="divide-y divide-[var(--line)]">
          {app.calendars.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              {c.ok === false ? <AlertCircle size={15} className="text-danger" aria-hidden /> : <Check size={15} className="text-ok" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.name}</span>
                <span className="block truncate text-[12px] text-muted">{c.ok === false ? c.error : `${c.count} events`}</span>
              </span>
              <button onClick={() => void store.removeCalendar(c.id)} aria-label={`Remove ${c.name}`} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-danger">
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void add();
            }}
            className="flex flex-col gap-2 border-t border-line px-4 py-3"
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… or webcal://…"
              aria-label="Calendar link"
              autoFocus
              className="h-9 rounded-lg bg-bg px-3 outline-none focus:shadow-[inset_0_0_0_2px_var(--focus)]"
            />
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Name"
                className="h-9 min-w-0 flex-1 rounded-lg bg-bg px-3 outline-none focus:shadow-[inset_0_0_0_2px_var(--focus)]"
              />
              <Button type="button" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!url.trim() || busy}>
                {busy ? (
                  <>
                    <Spinner size={12} /> Checking…
                  </>
                ) : (
                  "Add"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="border-t border-line px-4 py-2.5">
            <Button onClick={() => setAdding(true)} disabled={!desktop}>
              <CalendarPlus size={14} aria-hidden /> Add calendar
            </Button>
          </div>
        )}
        {msg && (
          <p role="status" className={`px-4 pb-3 text-[13px] ${msg.ok ? "text-ok" : "text-danger"}`}>
            {msg.text}
          </p>
        )}
        {app.hiddenEvents.length > 0 && (
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
            <span className="min-w-0 flex-1 text-[13px] text-muted">
              {app.hiddenEvents.length} hidden {app.hiddenEvents.length === 1 ? "event" : "events or series"}
            </span>
            <Button onClick={() => void store.hideEvent("*", false)}>Show all again</Button>
          </div>
        )}
      </div>
    </section>
  );
}
