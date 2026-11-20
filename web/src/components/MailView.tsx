"use client";

// Mail (Variante M2): Postfächer, Ordner und Kurse links, Liste in der Mitte, Lesebereich rechts.
// Zwei Postfächer: Gmail und die Uni-Mail. Daten: web/src/lib/mail-data.ts (heute Beispieldaten).

import { useEffect, useRef, useState } from "react";
import { Archive, FileText, Inbox, Mail, Pencil, Reply, Search, Send, X } from "lucide-react";
import { Button, Spinner, colorOf, shortOf, tone } from "./ui";
import { useApp } from "@/lib/app-store";
import {
  archiveMail,
  mailDate,
  mailDateLong,
  sendMail,
  setMailRead,
  useMail,
  type MailAccount,
  type MailAccountId,
  type MailFolder,
  type MailMessage,
} from "@/lib/mail-data";
import type { Course, CourseColor } from "@/lib/mock-data";

type Box = "all" | MailAccountId;

const FOLDERS: { id: MailFolder; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
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

export function MailView({ onOpenAccounts }: { onOpenAccounts: () => void }) {
  const app = useApp();
  const mail = useMail();
  const connected = mail.accounts.filter((a) => a.connected);

  const [box, setBox] = useState<Box>("all");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [compose, setCompose] = useState<null | { accountId: MailAccountId; to: string; subject: string; body: string }>(null);

  const courseById = (id?: string) => (id ? app.courses.find((c) => c.id === id) : undefined);

  const visibleAccounts = box === "all" ? connected.map((a) => a.id) : [box];
  const inScope = mail.messages.filter((m) => visibleAccounts.includes(m.accountId));

  const q = query.trim().toLowerCase();
  const list = inScope
    .filter((m) => m.folder === folder)
    .filter((m) => !courseId || m.courseId === courseId)
    .filter((m) => !q || [m.fromName, m.to, m.subject, m.body].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));

  const current = list.find((m) => m.id === selected) ?? list[0] ?? null;

  // Beim Öffnen einer ungelesenen Mail gilt sie als gelesen
  useEffect(() => {
    if (current?.unread) setMailRead(current.id, false);
  }, [current?.id, current?.unread]);

  const unread = (accountIds: MailAccountId[], f: MailFolder = "inbox") =>
    mail.messages.filter((m) => accountIds.includes(m.accountId) && m.folder === f && m.unread).length;
  const folderCount = (f: MailFolder) => (f === "inbox" ? unread(visibleAccounts) : f === "drafts" ? inScope.filter((m) => m.folder === "drafts").length : 0);

  // Kurse, zu denen es Mails im gewählten Postfach gibt
  const courseRows = app.courses
    .map((c) => ({
      course: c,
      total: inScope.filter((m) => m.courseId === c.id && m.folder === "inbox").length,
      unread: inScope.filter((m) => m.courseId === c.id && m.folder === "inbox" && m.unread).length,
    }))
    .filter((r) => r.total > 0);

  const startNew = () =>
    setCompose({ accountId: (box === "all" ? connected[0]?.id : box) ?? "gmail", to: "", subject: "", body: "" });
  const startReply = (m: MailMessage) =>
    setCompose({
      accountId: m.accountId,
      to: m.fromName,
      subject: m.subject.startsWith("Re: ") ? m.subject : `Re: ${m.subject}`,
      body: `\n\nOn ${mailDateLong(m.date, app.today)}, ${m.fromName} wrote:\n${m.body
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}`,
    });

  if (connected.length === 0) return <NotConnected desktop={app.mode === "desktop"} onOpenAccounts={onOpenAccounts} />;

  const title = `${FOLDERS.find((f) => f.id === folder)?.label}${box === "all" ? "" : `, ${mail.accounts.find((a) => a.id === box)?.name}`}`;

  return (
    <div className="flex h-full min-h-0">
      {/* Links: Postfächer, Ordner, Kurse */}
      <section className="flex w-[232px] shrink-0 flex-col border-r border-line bg-sidebar/60" aria-label="Mailboxes">
        <div className="drag h-[44px] shrink-0" />
        <div className="scroll flex-1 px-3 pb-3">
          <Button variant="primary" className="mb-3 w-full" onClick={startNew}>
            <Pencil size={13} aria-hidden /> New mail
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
            <Side key={f.id} active={folder === f.id} onClick={() => setFolder(f.id)} count={folderCount(f.id)} icon={<f.icon size={14} aria-hidden />}>
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
      </section>

      {/* Mitte: Liste */}
      <section className="flex w-[360px] shrink-0 flex-col border-r border-line" aria-label="Messages">
        <div className="drag h-[44px] shrink-0" />
        <div className="px-4 pb-2">
          <div className="flex items-baseline gap-2">
            <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold tracking-[-0.01em]">{title}</h1>
            {courseId && (
              <button onClick={() => setCourseId(null)} className="flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[12px] font-semibold">
                {shortOf(courseById(courseId) ?? { name: "Course" })} <X size={11} aria-hidden />
              </button>
            )}
          </div>
          <label className="no-drag mt-2 flex h-8 items-center gap-2 rounded-lg bg-surface px-2.5 shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[inset_0_0_0_2px_var(--focus)]">
            <Search size={13} className="shrink-0 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search mail"
              aria-label="Search mail"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted focus-visible:outline-none"
            />
          </label>
        </div>
        <ul className="scroll flex-1 px-2 pb-3">
          {list.length === 0 && (
            <li className="px-3 py-10 text-center text-muted">
              {query ? "No mail matches your search." : folder === "inbox" ? "Inbox zero. Nothing to read." : "Nothing here yet."}
            </li>
          )}
          {list.map((m) => (
            <MailRow
              key={m.id}
              m={m}
              active={current?.id === m.id}
              today={app.today}
              showAccount={box === "all"}
              courseColor={courseById(m.courseId) ? colorOf(courseById(m.courseId)!) : null}
              outgoing={m.folder === "sent" || m.folder === "drafts"}
              onClick={() => setSelected(m.id)}
            />
          ))}
        </ul>
      </section>

      {/* Rechts: Lesebereich */}
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Message">
        <div className="drag h-[44px] shrink-0" />
        {current ? (
          <Reader
            key={current.id}
            m={current}
            account={mail.accounts.find((a) => a.id === current.accountId)}
            course={courseById(current.courseId)}
            today={app.today}
            onReply={() => startReply(current)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted">Select a message to read it.</div>
        )}
      </section>

      {compose && <Compose draft={compose} accounts={connected} onClose={() => setCompose(null)} />}
    </div>
  );
}

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

function MailRow({
  m,
  active,
  today,
  showAccount,
  courseColor,
  outgoing,
  onClick,
}: {
  m: MailMessage;
  active: boolean;
  today: string;
  showAccount: boolean;
  courseColor: CourseColor | null;
  outgoing: boolean;
  onClick: () => void;
}) {
  const preview = m.body.replace(/\s+/g, " ").trim();
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex w-full gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors ${active ? "bg-surface shadow-[0_0_0_1px_var(--line)]" : "hover:bg-hover"}`}
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
            <span className="shrink-0 text-[12px] text-muted">{m.folder === "drafts" ? "Draft" : mailDate(m.date, today)}</span>
          </span>
          <span className={`block truncate ${m.unread ? "font-semibold" : ""}`}>{m.subject}</span>
          <span className="block truncate text-[12px] text-muted">{preview}</span>
        </span>
      </button>
    </li>
  );
}

function Reader({
  m,
  account,
  course,
  today,
  onReply,
}: {
  m: MailMessage;
  account?: MailAccount;
  course?: Course;
  today: string;
  onReply: () => void;
}) {
  const outgoing = m.folder === "sent" || m.folder === "drafts";
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
              <Reply size={13} aria-hidden /> Reply
            </Button>
            {m.folder !== "archive" && (
              <Button onClick={() => archiveMail(m.id)}>
                <Archive size={13} aria-hidden /> Archive
              </Button>
            )}
            <Button onClick={() => setMailRead(m.id, true)}>Mark unread</Button>
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
        {m.folder === "drafts" && (
          <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
            <FileText size={14} aria-hidden /> This is a draft. Editing drafts comes later.
          </p>
        )}
      </div>
    </div>
  );
}

function Compose({
  draft,
  accounts,
  onClose,
}: {
  draft: { accountId: MailAccountId; to: string; subject: string; body: string };
  accounts: MailAccount[];
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState(draft.accountId);
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
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

  const ready = to.trim().length > 0 && subject.trim().length > 0 && state === "idle";
  const send = () => {
    if (!ready) return;
    setState("sending");
    window.setTimeout(() => {
      sendMail({ accountId, to: to.trim(), subject: subject.trim(), body });
      setState("sent");
      window.setTimeout(onClose, 700);
    }, 600);
  };

  const field = "w-full bg-transparent py-2 outline-none placeholder:text-muted";
  return (
    <div
      role="dialog"
      aria-label="New mail"
      className="no-drag fixed bottom-6 right-6 z-40 w-[540px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[14px] bg-surface shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.28)]"
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
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Name or address" className={field} autoFocus={!draft.to} />
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
          className="flex h-9 items-center gap-2 rounded-[9px] bg-accent px-4 font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {state === "sending" ? <Spinner size={13} /> : null}
          {state === "sent" ? "Sent" : state === "sending" ? "Sending…" : "Send"}
          {state === "idle" && <span className="text-[12px] font-medium opacity-60">⌘↵</span>}
        </button>
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
              ? "Connecting Gmail and your university mailbox is on its way. This part of the app is not live yet."
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

