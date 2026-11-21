"use client";

// Mail (Variante M2): Postfächer, Ordner und Kurse links, Liste in der Mitte, Lesebereich rechts.
// Zwei Postfächer: Gmail und die Uni-Mail. Daten: web/src/lib/mail-data.ts (heute Beispieldaten).

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Archive, BellOff, Calendar, CalendarPlus, Check, Clock, FileText, Inbox, Keyboard, Mail, Paperclip, Pencil, Reply, Search, Send, Undo2, X } from "lucide-react";
import { Button, Spinner, colorOf, shortOf, tone } from "./ui";
import { openNewEvent } from "./EventDialog";
import { openFile, revealFile, useApp } from "@/lib/app-store";
import {
  UNDO_SECONDS,
  archiveMail,
  archiveSender,
  ignoreEvent,
  mailDate,
  mailDateLong,
  queueSend,
  saveAttachment,
  setMailRead,
  snoozeMail,
  undoSend,
  unsnoozeMail,
  unsubscribeMail,
  useMail,
  type MailAccount,
  type MailAccountId,
  type MailFolder,
  type MailMessage,
  type Outbox,
} from "@/lib/mail-data";
import { findEvent, guessCourse, parseSearch, snoozeLabel, snoozeOptions, snoozePhrase, stamp, weekStart, type FoundEvent, type SnoozeOption } from "@/lib/mail-tools";
import { matches, searchTerms } from "@/lib/search";
import type { Course, CourseColor } from "@/lib/mock-data";

type Box = "all" | MailAccountId;
type FolderId = MailFolder | "snoozed";
type Draft = { accountId: MailAccountId; to: string; subject: string; body: string; threadId?: string; inReplyTo?: string };
type Toast = { text: string; undo?: () => void; error?: boolean; action?: { label: string; run: () => void } };

const FOLDERS: { id: FolderId; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "drafts", label: "Drafts", icon: Pencil },
  { id: "sent", label: "Sent", icon: Send },
  { id: "archive", label: "Archive", icon: Archive },
];

// Jedes Postfach hat eine eigene Farbe und einen Buchstaben, damit man sie in „All inboxes“ unterscheidet.
const ACCOUNT_LOOK: Record<MailAccountId, { color: CourseColor; letter: string }> = {
  gmail: { color: "rose", letter: "G" },
  uni: { color: "blue", letter: "U" },
};

export function AccountChip({ id, size = 18 }: { id: MailAccountId; size?: number }) {
  const look = ACCOUNT_LOOK[id];
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[5px] font-bold"
      style={{ width: size, height: size, fontSize: size * 0.58, background: tone(look.color, "soft"), color: tone(look.color, "ink") }}
    >
      {look.letter}
    </span>
  );
}

// Breite der Spalten (zum Ziehen); gemerkt pro Mac
interface Panes {
  side: number;
  list: number;
}
const DEFAULT_PANES: Panes = { side: 232, list: 360 };
const SIDE_RANGE: [number, number] = [190, 320];
const LIST_RANGE: [number, number] = [270, 560];
const PANES_KEY = "studi.mailPanes";
const clampTo = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));

function loadPanes(): Panes {
  try {
    const p = JSON.parse(window.localStorage.getItem(PANES_KEY) ?? "null") as Partial<Panes> | null;
    if (p) return { side: clampTo(Number(p.side) || DEFAULT_PANES.side, SIDE_RANGE), list: clampTo(Number(p.list) || DEFAULT_PANES.list, LIST_RANGE) };
  } catch {
    // egal
  }
  return DEFAULT_PANES;
}

function savePanes(p: Panes) {
  try {
    window.localStorage.setItem(PANES_KEY, JSON.stringify(p));
  } catch {
    // ohne Speicher gilt die Breite nur bis zum Neustart
  }
}

/** Griff zwischen zwei Spalten: ziehen, mit Pfeiltasten verstellen oder doppelklicken (zurücksetzen). */
function Splitter({
  label,
  value,
  range,
  onChange,
  onCommit,
  onReset,
}: {
  label: string;
  value: number;
  range: [number, number];
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  onReset: () => void;
}) {
  const start = useRef<{ x: number; v: number } | null>(null);
  const [active, setActive] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={range[0]}
      aria-valuemax={range[1]}
      aria-valuenow={value}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ohne Zeiger-Fang geht das Ziehen trotzdem, nur nicht außerhalb des Fensters
        }
        start.current = { x: e.clientX, v: value };
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (start.current) onChange(clampTo(start.current.v + e.clientX - start.current.x, range));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const v = clampTo(start.current.v + e.clientX - start.current.x, range);
        start.current = null;
        setActive(false);
        onCommit(v);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const v = clampTo(value + (e.key === "ArrowRight" ? step : -step), range);
          onChange(v);
          onCommit(v);
        }
      }}
      className="no-drag group/split absolute -right-[4px] top-0 z-20 flex h-full w-[8px] cursor-col-resize justify-center outline-none"
    >
      <span className={`h-full w-[2px] rounded-full transition-colors ${active ? "bg-[var(--focus)]" : "bg-transparent group-hover/split:bg-[var(--focus)] group-focus-visible/split:bg-[var(--focus)]"}`} />
    </div>
  );
}

let composeUid = 0;
const nextUid = () => ++composeUid;

export function MailView({ onOpenAccounts }: { onOpenAccounts: () => void }) {
  const app = useApp();
  const mail = useMail();
  const connected = mail.accounts.filter((a) => a.connected);

  const [box, setBox] = useState<Box>("all");
  const [folder, setFolder] = useState<FolderId>("inbox");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fUnread, setFUnread] = useState(false);
  const [fAttach, setFAttach] = useState(false);
  const [fWeek, setFWeek] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [compose, setCompose] = useState<null | (Draft & { uid: number })>(null);
  const [swipe, setSwipe] = useState<null | { id: string; opts: SnoozeOption[] }>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [unsubBusy, setUnsubBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [panes, setPanes] = useState(loadPanes);
  const resetPane = (which: keyof Panes) => {
    const next = { ...panes, [which]: DEFAULT_PANES[which] };
    setPanes(next);
    savePanes(next);
  };

  const courseById = (id?: string) => (id ? app.courses.find((c) => c.id === id) : undefined);
  // Kurs einer Mail: vom Postfach gesetzt oder per Regeln erkannt (Absender = Dozent, Kursname im Betreff …)
  const courses = app.courses.filter((c) => !c.semester || c.semester === "current");
  const courseOf = (m: MailMessage) => m.courseId ?? guessCourse(m, courses) ?? undefined;

  const visibleAccounts = box === "all" ? connected.map((a) => a.id) : [box];
  const inScope = mail.messages.filter((m) => visibleAccounts.includes(m.accountId));
  const snoozedAt = (id: string) => mail.snoozed[id];

  // Suche: Text plus Befehle (from:, is:unread, has:attachment) und die Filter-Knöpfe
  const parsed = parseSearch(query);
  const wantUnread = parsed.unread || fUnread;
  const wantAttach = parsed.attachment || fAttach;
  const searching = Boolean(parsed.text || parsed.from || wantUnread || wantAttach || fWeek);
  const terms = searchTerms(parsed.text);
  const monday = weekStart(app.today);

  const list = inScope
    .filter((m) => {
      if (searching) return true; // Suche geht durch alle Ordner
      if (folder === "snoozed") return Boolean(snoozedAt(m.id)) && m.folder === "inbox";
      if (folder === "inbox") return m.folder === "inbox" && !snoozedAt(m.id);
      return m.folder === folder;
    })
    .filter((m) => !courseId || courseOf(m) === courseId)
    .filter((m) => !parsed.text || matches(terms, m.fromName, m.fromAddress, m.to, m.subject, m.body))
    .filter((m) => !parsed.from || `${m.fromName} ${m.fromAddress}`.toLowerCase().includes(parsed.from.toLowerCase()))
    .filter((m) => !wantUnread || m.unread)
    .filter((m) => !wantAttach || (m.attachments?.length ?? 0) > 0)
    .filter((m) => !fWeek || m.date.slice(0, 10) >= monday)
    .sort((a, b) => (!searching && folder === "snoozed" ? (snoozedAt(a.id) ?? "").localeCompare(snoozedAt(b.id) ?? "") : b.date.localeCompare(a.date)));

  const current = list.find((m) => m.id === selected) ?? list[0] ?? null;

  // Beim Öffnen einer ungelesenen Mail gilt sie als gelesen
  useEffect(() => {
    if (current?.unread) setMailRead(current.id, false);
  }, [current?.id, current?.unread]);

  // Meldung unten links verschwindet nach 6 Sekunden
  useEffect(() => {
    if (!toast || toast.error) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const unread = (accountIds: MailAccountId[]) =>
    mail.messages.filter((m) => accountIds.includes(m.accountId) && m.folder === "inbox" && m.unread && !mail.snoozed[m.id]).length;
  const folderCount = (f: FolderId) =>
    f === "inbox"
      ? unread(visibleAccounts)
      : f === "drafts"
        ? inScope.filter((m) => m.folder === "drafts").length
        : f === "snoozed"
          ? inScope.filter((m) => m.folder === "inbox" && mail.snoozed[m.id]).length
          : 0;

  // Kurse, zu denen es Mails im gewählten Postfach gibt
  const courseRows = app.courses
    .map((c) => ({
      course: c,
      total: inScope.filter((m) => courseOf(m) === c.id && m.folder === "inbox").length,
      unread: inScope.filter((m) => courseOf(m) === c.id && m.folder === "inbox" && m.unread && !mail.snoozed[m.id]).length,
    }))
    .filter((r) => r.total > 0);

  // Auch in Kursen: Dateien und Fristen, die zur Suche passen
  const courseHits = parsed.text
    ? {
        files: app.courses.flatMap((c) => c.folders.flatMap((f) => f.files)).filter((f) => matches(terms, f.name)),
        deadlines: app.deadlines.filter((d) => matches(terms, d.title)),
      }
    : { files: [], deadlines: [] };

  const startNew = () => setCompose({ uid: nextUid(), accountId: (box === "all" ? connected[0]?.id : box) ?? "gmail", to: "", subject: "", body: "" });
  const startReply = (m: MailMessage) =>
    setCompose({
      uid: nextUid(),
      accountId: m.accountId,
      to: m.fromAddress || m.fromName,
      threadId: m.threadId,
      inReplyTo: m.messageIdHeader,
      subject: m.subject.startsWith("Re: ") ? m.subject : `Re: ${m.subject}`,
      body: `\n\nOn ${mailDateLong(m.date, app.today)}, ${m.fromName} wrote:\n${m.body
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}`,
    });

  // Nach dem Weglegen einer Mail die nächste in der Liste öffnen
  const selectNeighbor = (m: MailMessage) => {
    const i = list.findIndex((x) => x.id === m.id);
    setSelected((list[i + 1] ?? list[i - 1])?.id ?? null);
  };

  const doArchive = (m: MailMessage) => {
    selectNeighbor(m);
    archiveMail(m.id);
  };
  const doSnooze = (m: MailMessage, until: string) => {
    selectNeighbor(m);
    snoozeMail(m.id, until);
    setSwipe(null);
    setSnoozeOpen(false);
    setToast({ text: `Snoozed until ${snoozeLabel(until, app.today)}`, undo: () => unsnoozeMail(m.id) });
  };
  const doBringBack = (m: MailMessage) => {
    unsnoozeMail(m.id);
    setToast({ text: "Back in your inbox." });
  };
  const doArchiveSender = (m: MailMessage) => {
    if (!m.fromAddress) return;
    const n = archiveSender(m.fromAddress);
    setToast({ text: `Archived ${n} ${n === 1 ? "mail" : "mails"} from ${m.fromName}.` });
  };
  const doUnsubscribe = async (m: MailMessage) => {
    if (unsubBusy || !m.unsubscribe) return;
    setUnsubBusy(true);
    const res = await unsubscribeMail(m);
    setUnsubBusy(false);
    if (res.error) setToast({ text: res.error, error: true });
    else setToast({ text: res.opened ? "The unsubscribe page is open in your browser. Finish it there." : `Unsubscribed from ${m.fromName}.` });
  };
  const doSaveAttachment = async (m: MailMessage, index: number, course: Course) => {
    const res = await saveAttachment(m, index, course);
    if (res.error || !res.path) {
      setToast({ text: res.error ?? "Could not save the file.", error: true });
      return false;
    }
    const path = res.path;
    setToast({
      text: `Saved to ${shortOf(course)} › Mail attachments`,
      action: app.mode === "desktop" ? { label: "Show in Finder", run: () => revealFile(path) } : undefined,
    });
    return true;
  };
  const doAddEvent = (m: MailMessage, ev: FoundEvent) =>
    openNewEvent({
      title: m.subject.replace(/^((re|fw|fwd|aw|wg):\s*)+/i, ""),
      date: ev.date,
      start: ev.start,
      end: ev.end,
      location: ev.location,
      moduleId: courseOf(m) ?? null,
      kind: "termin",
    });
  const eventOf = (m: MailMessage) => (m.folder === "sent" || m.folder === "drafts" || mail.ignoredEvents.includes(m.id) ? null : findEvent(m.subject, m.body, m.date.slice(0, 10)));

  // „Undo“ beim Senden: Mail kommt als offenes Schreibfenster zurück
  const undoNow = () => {
    const back = undoSend();
    if (back) setCompose({ uid: nextUid(), ...back });
  };

  // Tastenkürzel (Übersicht: Taste ? oder Knopf unten links)
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const typing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "z") {
      if (typing || !mail.outbox) return;
      e.preventDefault();
      undoNow();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || typing || compose || shortcuts) return;
    const m = current;
    const idx = m ? list.findIndex((x) => x.id === m.id) : -1;
    const inInbox = Boolean(m && m.folder === "inbox");
    switch (e.key) {
      case "?":
        e.preventDefault();
        setShortcuts(true);
        break;
      case "/":
        e.preventDefault();
        searchRef.current?.focus();
        break;
      case "j":
        if (list[idx + 1]) setSelected(list[idx + 1].id);
        break;
      case "k":
        if (idx > 0) setSelected(list[idx - 1].id);
        break;
      case "c":
        e.preventDefault();
        startNew();
        break;
      case "r":
        if (m && m.folder !== "sent" && m.folder !== "drafts") {
          e.preventDefault();
          startReply(m);
        }
        break;
      case "e":
        if (m && m.folder !== "archive" && m.folder !== "sent" && m.folder !== "drafts") doArchive(m);
        break;
      case "E":
        if (m && inInbox) doArchiveSender(m);
        break;
      case "h":
        if (m && inInbox) setSnoozeOpen((o) => !o);
        break;
      case "u":
        if (m && m.folder !== "sent" && m.folder !== "drafts") setMailRead(m.id, true);
        break;
      case "U":
        if (m?.unsubscribe && !mail.unsubscribed.includes(m.fromAddress.toLowerCase())) void doUnsubscribe(m);
        break;
      case "d": {
        const ev = m ? eventOf(m) : null;
        if (m && ev) doAddEvent(m, ev);
        break;
      }
      case "Escape":
        if (snoozeOpen) setSnoozeOpen(false);
        else if (swipe) setSwipe(null);
        else if (toast) setToast(null);
        break;
    }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (connected.length === 0) return <NotConnected desktop={app.mode === "desktop"} onOpenAccounts={onOpenAccounts} />;

  const title = searching ? "Search" : `${FOLDERS.find((f) => f.id === folder)?.label}${box === "all" ? "" : `, ${mail.accounts.find((a) => a.id === box)?.name}`}`;
  const chipStyle = "no-drag flex h-[26px] items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition-colors";

  return (
    <div className="flex h-full min-h-0">
      {/* Links: Postfächer, Ordner, Kurse */}
      <section className="relative flex shrink-0 flex-col border-r border-line bg-sidebar/60" style={{ width: panes.side }} aria-label="Mailboxes">
        <Splitter
          label="Resize mailboxes"
          value={panes.side}
          range={SIDE_RANGE}
          onChange={(side) => setPanes((p) => ({ ...p, side }))}
          onCommit={(side) => savePanes({ ...panes, side })}
          onReset={() => resetPane("side")}
        />
        <div className="drag h-[44px] shrink-0" />
        <div className="scroll flex-1 px-3 pb-3">
          <Button variant="primary" className="mb-3 w-full" onClick={startNew}>
            <Pencil size={13} aria-hidden /> New mail <span className="text-[11px] font-medium opacity-60">C</span>
          </Button>

          <p className="mb-1 mt-1 px-2.5 text-[12px] text-muted">Mailboxes</p>
          <Side active={box === "all"} onClick={() => setBox("all")} count={unread(connected.map((a) => a.id))} icon={<Mail size={14} aria-hidden />}>
            All inboxes
          </Side>
          {mail.accounts.map((a) => (
            <Side
              key={a.id}
              active={box === a.id}
              onClick={() => (a.connected ? setBox(a.id) : onOpenAccounts())}
              count={a.connected ? unread([a.id]) : 0}
              icon={<AccountChip id={a.id} size={16} />}
              muted={!a.connected}
              hint={a.connected ? undefined : "Connect"}
            >
              {a.name}
            </Side>
          ))}

          <p className="mb-1 mt-4 px-2.5 text-[12px] text-muted">Folders</p>
          {FOLDERS.map((f) => (
            <Side
              key={f.id}
              active={folder === f.id && !searching}
              onClick={() => {
                setFolder(f.id);
                setQuery("");
                setFUnread(false);
                setFAttach(false);
                setFWeek(false);
              }}
              count={folderCount(f.id)}
              icon={<f.icon size={14} aria-hidden style={f.id === "snoozed" && !(folder === f.id && !searching) ? { color: tone("ochre", "ink") } : undefined} />}
            >
              {f.label}
            </Side>
          ))}

          {courseRows.length > 0 && (
            <>
              <p className="mb-1 mt-4 px-2.5 text-[12px] text-muted">Courses</p>
              {courseRows.map(({ course, unread: n }) => {
                const on = courseId === course.id;
                return (
                  <button
                    key={course.id}
                    onClick={() => {
                      setCourseId(on ? null : course.id);
                      setFolder("inbox");
                    }}
                    aria-pressed={on}
                    className={`flex min-h-[30px] w-full items-center gap-2.5 rounded-lg px-2.5 py-1 text-left leading-snug transition-colors ${
                      on ? "bg-hover font-semibold" : "hover:bg-hover"
                    }`}
                  >
                    <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: tone(colorOf(course)) }} />
                    <span className="min-w-0 flex-1 truncate">{shortOf(course)}</span>
                    {n > 0 && <span className="text-[12px] tabular-nums text-muted">{n}</span>}
                  </button>
                );
              })}
            </>
          )}
        </div>
        <div className="border-t border-line-soft px-3 py-2">
          <button onClick={() => setShortcuts(true)} className="no-drag flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-muted transition-colors hover:bg-hover">
            <Keyboard size={14} aria-hidden /> <span className="flex-1">Keyboard shortcuts</span>
            <kbd className="font-sans text-[12px]">?</kbd>
          </button>
        </div>
      </section>

      {/* Mitte: Liste */}
      <section className="relative flex min-w-[260px] shrink flex-col border-r border-line" style={{ width: panes.list }} aria-label="Messages">
        <Splitter
          label="Resize message list"
          value={panes.list}
          range={LIST_RANGE}
          onChange={(list) => setPanes((p) => ({ ...p, list }))}
          onCommit={(list) => savePanes({ ...panes, list })}
          onReset={() => resetPane("list")}
        />
        <div className="drag h-[44px] shrink-0" />
        <div className="px-4 pb-2">
          <div className="flex items-baseline gap-2">
            <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold tracking-[-0.01em]">{title}</h1>
            {searching && <span className="shrink-0 text-[12px] text-muted">{list.length} {list.length === 1 ? "result" : "results"}</span>}
            {courseId && !searching && (
              <button onClick={() => setCourseId(null)} className="flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[12px] font-semibold">
                {shortOf(courseById(courseId) ?? { name: "Course" })} <X size={11} aria-hidden />
              </button>
            )}
          </div>
          <label className="no-drag mt-2 flex h-8 items-center gap-2 rounded-lg bg-surface px-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
            <Search size={13} className="shrink-0 text-muted" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search mail"
              aria-label="Search mail"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted focus-visible:outline-none"
            />
            {!searchFocus && !query && <kbd className="font-sans text-[12px] text-muted">/</kbd>}
          </label>
          {(searchFocus || searching) && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Search filters">
              {[
                { on: wantUnread, label: "Unread", toggle: () => setFUnread((v) => !v), locked: parsed.unread },
                { on: wantAttach, label: "Has attachment", toggle: () => setFAttach((v) => !v), locked: parsed.attachment },
                { on: fWeek, label: "This week", toggle: () => setFWeek((v) => !v), locked: false },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={c.locked ? undefined : c.toggle}
                  aria-pressed={c.on}
                  className={`${chipStyle} ${c.on ? "" : "bg-surface shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover"}`}
                  style={c.on ? { background: tone("blue", "soft"), color: tone("blue", "ink") } : undefined}
                >
                  {c.label}
                </button>
              ))}
              {parsed.from && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQuery((q) => q.replace(/\bfrom:\S+/i, "").replace(/\s+/g, " ").trim())}
                  className={chipStyle}
                  style={{ background: tone("blue", "soft"), color: tone("blue", "ink") }}
                >
                  From: {parsed.from} <X size={11} aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
        {[mail.google.error, mail.uni.error].filter(Boolean).map((error) => (
          <p key={error} role="alert" className="mx-4 mb-2 rounded-lg bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">
            {error}
          </p>
        ))}
        <ul className="scroll flex-1 px-2 pb-3">
          {list.length === 0 && (
            <li className="px-3 py-10 text-center text-muted">
              {searching ? "No mail matches your search." : folder === "inbox" ? "Inbox zero. Nothing to read." : folder === "snoozed" ? "Nothing snoozed." : "Nothing here yet."}
            </li>
          )}
          {list.map((m) => (
            <MailRow
              key={m.id}
              m={m}
              active={current?.id === m.id}
              today={app.today}
              showAccount={box === "all"}
              courseColor={courseById(courseOf(m)) ? colorOf(courseById(courseOf(m))!) : null}
              outgoing={m.folder === "sent" || m.folder === "drafts"}
              snoozedUntil={snoozedAt(m.id)}
              swipeOpts={swipe?.id === m.id ? swipe.opts : null}
              eventShort={eventOf(m)?.short}
              folderTag={searching && m.folder !== "inbox" ? m.folder : null}
              onClick={() => {
                setSelected(m.id);
                setSwipe(null);
                setSnoozeOpen(false);
              }}
              onSwipe={(open) => setSwipe(open ? { id: m.id, opts: snoozeOptions(new Date()) } : null)}
              onSnooze={(o) => doSnooze(m, o.when)}
            />
          ))}
          {(courseHits.files.length > 0 || courseHits.deadlines.length > 0) && (
            <li className="mx-1 mt-3 rounded-[10px] bg-surface p-3 shadow-[inset_0_0_0_1px_var(--line)]">
              <p className="mb-1.5 text-[12px] text-muted">
                Also in your courses: {courseHits.files.length} {courseHits.files.length === 1 ? "file" : "files"}, {courseHits.deadlines.length}{" "}
                {courseHits.deadlines.length === 1 ? "deadline" : "deadlines"}
              </p>
              <ul className="space-y-0.5">
                {courseHits.files.slice(0, 3).map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => openFile(f.path, f.id)}
                      disabled={app.mode !== "desktop" || !f.path}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-hover disabled:hover:bg-transparent"
                    >
                      <FileText size={14} className="shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    </button>
                  </li>
                ))}
                {courseHits.deadlines.slice(0, 3).map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-1.5 py-1">
                    <Calendar size={14} className="shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="shrink-0 text-[12px] text-muted">{mailDate(`${d.date}T00:00`, app.today)}</span>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      </section>

      {/* Rechts: Lesebereich */}
      <section className="flex min-w-[420px] flex-1 flex-col" aria-label="Message">
        <div className="drag h-[44px] shrink-0" />
        {current ? (
          <Reader
            key={current.id}
            m={current}
            account={mail.accounts.find((a) => a.id === current.accountId)}
            course={courseById(courseOf(current))}
            today={app.today}
            snoozedUntil={snoozedAt(current.id)}
            snoozeOpen={snoozeOpen}
            onSnoozeOpen={setSnoozeOpen}
            event={eventOf(current)}
            senderCount={mail.messages.filter((x) => x.fromAddress && x.fromAddress.toLowerCase() === current.fromAddress.toLowerCase() && x.folder !== "sent").length}
            senderInbox={mail.messages.filter((x) => x.folder === "inbox" && x.fromAddress && x.fromAddress.toLowerCase() === current.fromAddress.toLowerCase()).length}
            unsubscribed={mail.unsubscribed.includes(current.fromAddress.toLowerCase())}
            unsubBusy={unsubBusy}
            onReply={() => startReply(current)}
            onArchive={() => doArchive(current)}
            onSnooze={(until) => doSnooze(current, until)}
            onBringBack={() => doBringBack(current)}
            onArchiveSender={() => doArchiveSender(current)}
            onUnsubscribe={() => void doUnsubscribe(current)}
            onAddEvent={(ev) => doAddEvent(current, ev)}
            onIgnoreEvent={() => ignoreEvent(current.id)}
            courses={courses}
            onSaveAttachment={(i, c) => doSaveAttachment(current, i, c)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted">Select a message to read it.</div>
        )}
      </section>

      {compose && <Compose key={compose.uid} draft={compose} accounts={connected} onClose={() => setCompose(null)} />}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
      <Toasts
        outbox={mail.outbox}
        toast={toast}
        onUndoSend={undoNow}
        onDismissToast={() => setToast(null)}
        onDiscardFailed={() => void undoSend()}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Meldungen unten links

function Toasts({
  outbox,
  toast,
  onUndoSend,
  onDismissToast,
  onDiscardFailed,
}: {
  outbox: Outbox | null;
  toast: Toast | null;
  onUndoSend: () => void;
  onDismissToast: () => void;
  onDiscardFailed: () => void;
}) {
  const shell = "toast no-drag fixed bottom-6 left-6 z-[60] w-[380px] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl bg-accent text-on-accent shadow-[0_16px_40px_rgba(0,0,0,0.3)]";
  if (outbox) {
    const failed = outbox.status === "failed";
    const who = outbox.mail.to.length > 32 ? `${outbox.mail.to.slice(0, 30)}…` : outbox.mail.to;
    return (
      <div role="status" className={shell}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          {failed ? <X size={18} aria-hidden /> : outbox.status === "sending" ? <Spinner size={16} /> : <Check size={18} className="text-[#8fd6a5]" aria-hidden />}
          <span className="min-w-0 flex-1 truncate font-semibold" title={failed ? outbox.error : undefined}>
            {failed ? `Could not send to ${who}. ${outbox.error}` : outbox.status === "sending" ? `Sending to ${who}…` : `Mail sent to ${who}`}
          </span>
          {outbox.status === "waiting" && (
            <>
              <button onClick={onUndoSend} className="rounded-md px-1 font-bold underline underline-offset-2 hover:opacity-80">
                Undo
              </button>
              <kbd className="font-sans text-[12px] opacity-60">⌘Z</kbd>
            </>
          )}
          {failed && (
            <>
              <button onClick={onUndoSend} className="rounded-md px-1 font-bold underline underline-offset-2 hover:opacity-80">
                Edit
              </button>
              <button onClick={onDiscardFailed} aria-label="Discard" className="rounded-md p-1 opacity-70 hover:opacity-100">
                <X size={14} aria-hidden />
              </button>
            </>
          )}
        </div>
        {outbox.status === "waiting" && (
          <div className="h-[3px] bg-[color-mix(in_srgb,currentColor_20%,transparent)]">
            <div key={outbox.id} className="h-full bg-[#8fd6a5]" style={{ animation: `toast-run ${UNDO_SECONDS}s linear forwards` }} />
          </div>
        )}
      </div>
    );
  }
  if (!toast) return null;
  return (
    <div role={toast.error ? "alert" : "status"} className={shell}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        {toast.error ? <X size={18} aria-hidden /> : <Check size={18} className="text-[#8fd6a5]" aria-hidden />}
        <span className="min-w-0 flex-1 font-semibold">{toast.text}</span>
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.run();
              onDismissToast();
            }}
            className="shrink-0 rounded-md px-1 font-bold underline underline-offset-2 hover:opacity-80"
          >
            {toast.action.label}
          </button>
        )}
        {toast.undo && (
          <button
            onClick={() => {
              toast.undo?.();
              onDismissToast();
            }}
            className="rounded-md px-1 font-bold underline underline-offset-2 hover:opacity-80"
          >
            Undo
          </button>
        )}
        {toast.error && (
          <button onClick={onDismissToast} aria-label="Dismiss" className="rounded-md p-1 opacity-70 hover:opacity-100">
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Seitenleiste

function Side({
  active,
  onClick,
  count = 0,
  icon,
  muted,
  hint,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  icon: React.ReactNode;
  muted?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex h-[32px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors ${
        active ? "bg-accent font-semibold text-on-accent" : muted ? "text-muted hover:bg-hover" : "hover:bg-hover"
      }`}
    >
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-[12px] font-semibold text-[var(--focus)]">{hint}</span>}
      {count > 0 && <span className={`text-[12px] tabular-nums ${active ? "opacity-80" : "text-muted"}`}>{count}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ Liste

const SWIPE_W = 252;

function MailRow({
  m,
  active,
  today,
  showAccount,
  courseColor,
  outgoing,
  snoozedUntil,
  swipeOpts,
  eventShort,
  folderTag,
  onClick,
  onSwipe,
  onSnooze,
}: {
  m: MailMessage;
  active: boolean;
  today: string;
  showAccount: boolean;
  courseColor: CourseColor | null;
  outgoing: boolean;
  snoozedUntil?: string;
  swipeOpts: SnoozeOption[] | null;
  eventShort?: string;
  folderTag: string | null;
  onClick: () => void;
  onSwipe: (open: boolean) => void;
  onSnooze: (o: SnoozeOption) => void;
}) {
  const preview = m.body.replace(/\s+/g, " ").trim();
  const acc = useRef(0);
  const canSnooze = m.folder === "inbox" && !snoozedUntil;
  const amber = { background: tone("ochre", "soft"), color: tone("ochre", "ink") };

  // Mit zwei Fingern nach links wischen (Trackpad) zeigt die Zeiten zum Wiederkommen
  const onWheel = (e: React.WheelEvent) => {
    if (!canSnooze || Math.abs(e.deltaX) < 4 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    acc.current += e.deltaX;
    if (acc.current > 90) {
      acc.current = 0;
      onSwipe(true);
    } else if (acc.current < -90) {
      acc.current = 0;
      onSwipe(false);
    }
  };

  return (
    <li className="group relative overflow-hidden rounded-[10px]" onWheel={onWheel} onMouseLeave={() => {
        acc.current = 0;
      }}>
      {swipeOpts && (
        <div role="group" aria-label="Snooze until" className="absolute inset-y-0 right-0 flex items-center gap-1.5 pl-3 pr-2" style={{ width: SWIPE_W, ...amber }}>
          <Clock size={15} aria-hidden className="shrink-0" />
          {swipeOpts.slice(0, 3).map((o) => (
            <button key={o.id} onClick={() => onSnooze(o)} title={`${o.label}, ${o.hint}`} className="rounded-lg bg-surface px-2.5 py-1.5 text-[12px] font-bold transition-opacity hover:opacity-80">
              {o.short}
            </button>
          ))}
          <button onClick={() => onSwipe(false)} aria-label="Cancel" className="ml-auto rounded-md p-1 opacity-70 hover:opacity-100">
            <X size={13} aria-hidden />
          </button>
        </div>
      )}
      <button
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        style={{ transform: swipeOpts ? `translateX(-${SWIPE_W}px)` : undefined, transitionTimingFunction: "var(--ease-out)" }}
        className={`relative flex w-full gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-[transform,background-color] duration-200 ${
          active ? "bg-surface shadow-[0_0_0_1px_var(--line)]" : swipeOpts ? "bg-surface" : "hover:bg-hover"
        }`}
      >
        <span
          aria-label={m.unread ? "Unread" : undefined}
          className="mt-[7px] size-2 shrink-0 rounded-full"
          style={{ background: m.unread ? (courseColor ? tone(courseColor) : "var(--accent)") : "transparent" }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate ${m.unread ? "font-bold" : "font-medium"}`}>
              {outgoing ? `To: ${m.to || "(no recipient)"}` : m.fromName}
            </span>
            {showAccount && <AccountChip id={m.accountId} size={15} />}
            {snoozedUntil ? (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={amber}>
                Back {snoozeLabel(snoozedUntil, today)}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] text-muted">{m.folder === "drafts" ? "Draft" : mailDate(m.date, today)}</span>
            )}
          </span>
          <span className={`block truncate ${m.unread ? "font-semibold" : ""}`}>{m.subject}</span>
          <span className="flex items-center gap-2 text-[12px] text-muted">
            <span className="min-w-0 flex-1 truncate">{preview}</span>
            {folderTag && <span className="shrink-0 rounded bg-hover px-1.5 capitalize">{folderTag}</span>}
            {(m.attachments?.length ?? 0) > 0 && <Paperclip size={12} className="shrink-0" aria-label="Has attachment" />}
            {eventShort && (
              <span className="flex shrink-0 items-center gap-1 font-semibold" style={{ color: tone("ochre", "ink") }}>
                <Calendar size={12} aria-hidden /> {eventShort}
              </span>
            )}
          </span>
        </span>
      </button>
      {canSnooze && !swipeOpts && (
        <button
          onClick={() => onSwipe(true)}
          aria-label="Snooze"
          title="Snooze"
          className="absolute bottom-2 right-2 hidden size-6 items-center justify-center rounded-md bg-surface text-muted shadow-[0_0_0_1px_var(--line)] hover:text-text group-focus-within:flex group-hover:flex"
        >
          <Clock size={13} aria-hidden />
        </button>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ Zeiten zum Wiederkommen

function SnoozeMenu({ onPick, onClose }: { onPick: (when: string) => void; onClose: () => void }) {
  const [state] = useState(() => {
    const now = new Date();
    return { opts: snoozeOptions(now), min: stamp(now) };
  });
  const [custom, setCustom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, [onClose]);

  const item = "flex h-[34px] w-full items-center gap-2.5 rounded-[7px] px-3 text-left font-medium hover:bg-hover";
  return (
    <div ref={ref} role="menu" aria-label="Snooze until" className="absolute left-0 top-full z-30 mt-1.5 w-[280px] rounded-xl bg-surface p-1.5 shadow-[0_0_0_1px_var(--line),0_16px_40px_rgba(0,0,0,0.16)]">
      {state.opts.map((o) => (
        <button key={o.id} role="menuitem" onClick={() => onPick(o.when)} className={item}>
          <Clock size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="flex-1">{o.label}</span>
          <span className="text-[12px] text-muted">{o.hint}</span>
        </button>
      ))}
      <div className="my-1.5 h-px bg-line-soft" />
      {custom ? (
        <label className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-muted">
          <span className="shrink-0">Pick</span>
          <input
            type="datetime-local"
            min={state.min}
            autoFocus
            onChange={(e) => e.target.value && onPick(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-bg px-2 py-1 text-text shadow-[inset_0_0_0_1px_var(--line)]"
          />
        </label>
      ) : (
        <button role="menuitem" onClick={() => setCustom(true)} className={item}>
          <Calendar size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="flex-1">Pick date and time…</span>
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Anhang speichern

/** Anhang: Klick öffnet „Save to course folder“, der erkannte Kurs steht oben. */
function AttachmentChip({ name, courses, suggested, onSave }: { name: string; courses: Course[]; suggested?: Course; onSave: (c: Course) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ busy: boolean; saved: Course | null }>({ busy: false, saved: null });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const list = suggested ? [suggested, ...courses.filter((c) => c.id !== suggested.id)] : courses;
  const save = async (c: Course) => {
    setOpen(false);
    setState({ busy: true, saved: null });
    const ok = await onSave(c);
    setState({ busy: false, saved: ok ? c : null });
  };

  return (
    <div ref={ref} className="relative max-w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Save to a course folder"
        className="press flex max-w-full items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-left text-[13px] shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover"
      >
        {state.busy ? <Spinner size={13} /> : state.saved ? <Check size={13} className="shrink-0 text-ok" aria-hidden /> : <Paperclip size={13} className="shrink-0 text-muted" aria-hidden />}
        <span className="truncate">{name}</span>
        <span className="shrink-0 text-[12px] font-semibold text-muted">
          {state.saved ? `in ${shortOf(state.saved)}` : suggested ? `Save to ${shortOf(suggested)}` : "Save"}
        </span>
      </button>
      {open && (
        <div role="menu" aria-label="Save to course folder" className="absolute left-0 top-full z-30 mt-1.5 w-[260px] rounded-xl bg-surface p-1.5 shadow-[0_0_0_1px_var(--line),0_16px_40px_rgba(0,0,0,0.16)]">
          <p className="px-3 pb-1 pt-1.5 text-[12px] text-muted">Save to course folder</p>
          {list.length === 0 && <p className="px-3 py-2 text-[13px] text-muted">No courses yet.</p>}
          {list.map((c) => (
            <button key={c.id} role="menuitem" onClick={() => void save(c)} className="flex h-[34px] w-full items-center gap-2.5 rounded-[7px] px-3 text-left hover:bg-hover">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: tone(colorOf(c)) }} />
              <span className="min-w-0 flex-1 truncate font-medium">{shortOf(c)}</span>
              {c.id === suggested?.id && <span className="text-[11px] font-semibold text-muted">Suggested</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Lesebereich

const Key = ({ children }: { children: React.ReactNode }) => <kbd className="font-sans text-[11px] font-medium opacity-60">{children}</kbd>;

function Reader({
  m,
  account,
  course,
  today,
  snoozedUntil,
  snoozeOpen,
  onSnoozeOpen,
  event,
  senderCount,
  senderInbox,
  unsubscribed,
  unsubBusy,
  onReply,
  onArchive,
  onSnooze,
  onBringBack,
  onArchiveSender,
  onUnsubscribe,
  onAddEvent,
  onIgnoreEvent,
  courses,
  onSaveAttachment,
}: {
  m: MailMessage;
  account?: MailAccount;
  course?: Course;
  today: string;
  snoozedUntil?: string;
  snoozeOpen: boolean;
  onSnoozeOpen: (open: boolean) => void;
  event: FoundEvent | null;
  senderCount: number;
  senderInbox: number;
  unsubscribed: boolean;
  unsubBusy: boolean;
  onReply: () => void;
  onArchive: () => void;
  onSnooze: (until: string) => void;
  onBringBack: () => void;
  onArchiveSender: () => void;
  onUnsubscribe: () => void;
  onAddEvent: (ev: FoundEvent) => void;
  onIgnoreEvent: () => void;
  courses: Course[];
  onSaveAttachment: (index: number, course: Course) => Promise<boolean>;
}) {
  const outgoing = m.folder === "sent" || m.folder === "drafts";
  const amber = { background: tone("ochre", "soft"), color: tone("ochre", "ink") };
  return (
    <div className="scroll flex-1 px-8 pb-10">
      <div className="mx-auto max-w-[640px]">
        <div className="flex flex-wrap items-center gap-2">
          {account && (
            <span className="flex items-center gap-1.5 rounded-full bg-hover py-0.5 pl-1 pr-2.5 text-[12px] font-semibold">
              <AccountChip id={account.id} size={16} /> {account.name}
            </span>
          )}
          {course && (
            <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: tone(colorOf(course), "soft"), color: tone(colorOf(course), "ink") }}>
              {shortOf(course)}
            </span>
          )}
        </div>
        {!outgoing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={onReply}>
              <Reply size={13} aria-hidden /> Reply <Key>R</Key>
            </Button>
            {m.folder !== "archive" && (
              <Button onClick={onArchive}>
                <Archive size={13} aria-hidden /> Archive <Key>E</Key>
              </Button>
            )}
            {m.folder === "inbox" && (
              <div className="relative">
                <Button onClick={() => onSnoozeOpen(!snoozeOpen)} aria-haspopup="menu" aria-expanded={snoozeOpen}>
                  <Clock size={13} aria-hidden /> Snooze <Key>H</Key>
                </Button>
                {snoozeOpen && <SnoozeMenu onPick={onSnooze} onClose={() => onSnoozeOpen(false)} />}
              </div>
            )}
            <Button onClick={() => setMailRead(m.id, true)}>
              Mark unread <Key>U</Key>
            </Button>
          </div>
        )}

        {snoozedUntil && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[10px] px-3.5 py-2.5 font-semibold" style={amber}>
            <Clock size={16} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">Comes back to your inbox {snoozePhrase(snoozedUntil, today)}</span>
            <button onClick={() => onSnoozeOpen(!snoozeOpen)} className="underline underline-offset-2 hover:opacity-80">
              Change
            </button>
            <button onClick={onBringBack} className="underline underline-offset-2 hover:opacity-80">
              Bring back now
            </button>
            {snoozeOpen && (
              <div className="relative w-full">
                <SnoozeMenu onPick={onSnooze} onClose={() => onSnoozeOpen(false)} />
              </div>
            )}
          </div>
        )}

        {m.unsubscribe && !outgoing && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[10px] px-3.5 py-2.5" style={{ background: tone("blue", "soft"), color: tone("blue", "ink") }}>
            <BellOff size={16} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">
              <b className="font-semibold">Newsletter from {m.fromName}.</b> {senderCount} {senderCount === 1 ? "mail" : "mails"} from this sender.
            </span>
            {unsubscribed ? (
              <span className="flex items-center gap-1 font-semibold">
                <Check size={14} aria-hidden /> Unsubscribed
              </span>
            ) : (
              <Button onClick={onUnsubscribe} disabled={unsubBusy}>
                {unsubBusy && <Spinner size={12} />} Unsubscribe <Key>⇧U</Key>
              </Button>
            )}
            {senderInbox > 1 && (
              <Button onClick={onArchiveSender}>
                Archive all {senderInbox} <Key>⇧E</Key>
              </Button>
            )}
          </div>
        )}

        <h2 className="mt-4 text-[26px] font-bold leading-tight tracking-[-0.015em]">{m.subject}</h2>
        <p className="mt-1.5 text-muted">
          {outgoing ? (
            <>To {m.to || "(no recipient)"}</>
          ) : (
            <>
              <span className="font-semibold text-text">{m.fromName}</span> &lt;{m.fromAddress}&gt;
            </>
          )}
          {" · "}
          {mailDateLong(m.date, today)}
        </p>
        <div className="mt-6 whitespace-pre-wrap text-[15px] leading-[1.65] [user-select:text]">{m.body}</div>

        {(m.attachments?.length ?? 0) > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {m.attachments!.map((name, i) => (
              <AttachmentChip key={`${m.id}-${i}`} name={name} courses={courses} suggested={course} onSave={(c) => onSaveAttachment(i, c)} />
            ))}
          </div>
        )}

        {event && (
          <div className="mt-6 flex flex-wrap items-center gap-3.5 rounded-xl bg-surface p-3.5 shadow-[inset_0_0_0_1px_var(--line)]">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px]" style={amber}>
              <CalendarPlus size={20} aria-hidden />
            </span>
            <span className="min-w-[200px] flex-1">
              <b className="block font-semibold">Looks like an event</b>
              <span className="text-[13px] text-muted">{event.label}</span>
            </span>
            <Button variant="primary" onClick={() => onAddEvent(event)}>
              Add to calendar <Key>D</Key>
            </Button>
            <Button onClick={onIgnoreEvent}>Ignore</Button>
          </div>
        )}

        {m.folder === "drafts" && (
          <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
            <FileText size={14} aria-hidden /> This is a draft. Editing drafts comes later.
          </p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Tastenkürzel

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "?") && onClose();
    window.addEventListener("keydown", esc);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const group = (title: string, rows: [string, string[]][]) => (
    <div>
      <p className="pb-1 pt-3 text-[12px] text-muted first:pt-0">{title}</p>
      {rows.map(([label, keys]) => (
        <div key={label} className="flex items-center gap-1 py-[5px]">
          <span className="flex-1">{label}</span>
          {keys.map((k) => (
            <kbd key={k} className="flex h-6 min-w-6 items-center justify-center rounded-md bg-bg px-1.5 font-sans text-[12px] font-bold shadow-[inset_0_0_0_1px_var(--line)]">
              {k}
            </kbd>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-6 pt-[9vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="w-[620px] max-w-full rounded-[14px] bg-bg px-7 pb-6 pt-5 shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)] outline-none">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">Keyboard shortcuts</h2>
          <span className="text-[12px] text-muted">press ? any time</span>
          <button onClick={onClose} aria-label="Close" className="ml-3 flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-10">
          <div>
            {group("Read", [
              ["Next mail", ["J"]],
              ["Previous mail", ["K"]],
              ["Search mail", ["/"]],
              ["Show this list", ["?"]],
            ])}
            {group("Write", [
              ["New mail", ["C"]],
              ["Reply", ["R"]],
              ["Send", ["⌘", "↵"]],
              ["Undo send (10 seconds)", ["⌘", "Z"]],
            ])}
          </div>
          <div>
            {group("Sort", [
              ["Archive", ["E"]],
              ["Snooze", ["H"]],
              ["Mark unread", ["U"]],
              ["Archive all from sender", ["⇧", "E"]],
              ["Unsubscribe from newsletter", ["⇧", "U"]],
            ])}
            {group("Events", [["Add date from mail to calendar", ["D"]]])}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Schreiben

function Compose({
  draft,
  accounts,
  onClose,
}: {
  draft: Draft;
  accounts: MailAccount[];
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(draft.accountId);
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    const el = draft.to ? bodyRef.current : null;
    if (el) {
      el.focus();
      el.setSelectionRange(0, 0);
    }
    return () => window.removeEventListener("keydown", esc);
  }, [draft.to, onClose]);

  const ready = to.trim().length > 0 && subject.trim().length > 0;
  // Die Mail wartet im Ausgang noch 10 Sekunden („Undo“ unten links), dann geht sie raus
  const send = () => {
    if (!ready) return;
    if (!/^[^\s@;,]+@[^\s@;,]+(\s*[;,]\s*[^\s@;,]+@[^\s@;,]+)*$/.test(to.trim())) {
      setError("Please enter a full email address, like name@example.com.");
      return;
    }
    queueSend({ accountId, to: to.trim(), subject: subject.trim(), body, threadId: draft.threadId, inReplyTo: draft.inReplyTo });
    onClose();
  };

  const field = "w-full bg-transparent py-2 outline-none placeholder:text-muted";
  return (
    <div
      role="dialog"
      aria-label="New mail"
      className="sheet-in no-drag fixed bottom-6 right-6 z-40 w-[540px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[14px] bg-surface shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.28)]"
      onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && send()}
    >
      <div className="flex items-center bg-accent px-4 py-2.5 text-on-accent">
        <b className="flex-1 font-semibold">{subject.startsWith("Re: ") ? "Reply" : "New mail"}</b>
        <button onClick={onClose} aria-label="Close" className="flex size-6 items-center justify-center rounded-md opacity-80 hover:opacity-100">
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="px-4">
        <div className="flex items-center gap-2 border-b border-line-soft">
          <span className="w-14 text-muted">From</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value as MailAccountId)}
            className="min-w-0 flex-1 bg-transparent py-2 outline-none"
            aria-label="Send from"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.address})
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 border-b border-line-soft">
          <span className="w-14 text-muted">To</span>
          <input
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setError("");
            }}
            placeholder="Name or address"
            className={field}
            autoFocus={!draft.to}
          />
        </label>
        <label className="flex items-center gap-2 border-b border-line-soft">
          <span className="w-14 text-muted">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </label>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Message"
          className="block h-[200px] w-full resize-none bg-transparent py-3 outline-none [user-select:text]"
        />
      </div>
      <div className="flex items-center gap-3 border-t border-line-soft px-4 py-2.5">
        <button
          onClick={send}
          disabled={!ready}
          className="press flex h-9 items-center gap-2 rounded-[9px] bg-accent px-4 font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send size={13} aria-hidden /> Send
          <span className="text-[12px] font-medium opacity-60">⌘↵</span>
        </button>
        {error ? (
          <span role="alert" className="min-w-0 flex-1 truncate text-[12px] font-medium text-danger" title={error}>
            {error}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <Undo2 size={12} aria-hidden /> You can undo for {UNDO_SECONDS} seconds
          </span>
        )}
        <span className="flex-1" />
        <button onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-hover">
          Discard
        </button>
      </div>
    </div>
  );
}

function NotConnected({ desktop, onOpenAccounts }: { desktop: boolean; onOpenAccounts: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="drag h-[52px] shrink-0" />
      <div className="flex flex-1 items-start justify-center px-6 pt-[10vh]">
        <div className="w-[420px] max-w-full text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-[14px] bg-surface shadow-[0_0_0_1px_var(--line)]">
            <Mail size={22} aria-hidden />
          </span>
          <h1 className="mt-4 text-[24px] font-bold tracking-[-0.02em]">Your mail, next to your courses</h1>
          <p className="mt-1.5 text-muted">
            {desktop
              ? "Connect Gmail or your university mailbox to read and write mail here. University mail uses your ILIAS login."
              : "Connect your Gmail and your university mailbox to read and write mail here."}
          </p>
          <Button variant="primary" className="mt-5 h-10 px-5 text-[14px]" onClick={onOpenAccounts}>
            Open accounts
          </Button>
        </div>
      </div>
    </div>
  );
}
