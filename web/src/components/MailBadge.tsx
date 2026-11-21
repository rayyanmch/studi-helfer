"use client";

// Roter Hinweis an einem Termin (weiße Zahl im roten Kreis, wie bei App-Symbolen): es gibt Mails zu genau diesem
// Termin (lib/event-mail.ts). Überfahren zeigt Betreff, Absender und was sich ändert; Klick öffnet die Mail.
// Die Karte hängt am Fenster (Portal), damit sie nicht vom Kalender abgeschnitten wird.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail } from "lucide-react";
import { openMail } from "@/lib/mail-data";
import { EVENT_MAIL_LABEL, topKind, type EventMail } from "@/lib/event-mail";

export const BADGE_RED = "#ff3b30";

/** Abgesagter Termin (laut Mail): gestreift mit gestricheltem Rand in der Kursfarbe, bleibt lesbar. */
export function cancelledStyle(solid: string, soft: string): React.CSSProperties {
  return {
    background: `repeating-linear-gradient(135deg, ${soft} 0 6px, transparent 6px 11px)`,
    outline: `1.5px dashed ${solid}`,
    outlineOffset: -1.5,
  };
}

function when(iso: string) {
  const d = new Date(`${iso}:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + `, ${iso.slice(11, 16)}`;
}

function firstLine(body: string) {
  const text = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">") && !/^(hallo|hello|hi|liebe|lieber|dear|sehr geehrte)/i.test(l))
    .join(" ");
  return text.length > 140 ? `${text.slice(0, 138)}…` : text;
}

export function MailBadge({ mails, className = "", small = false }: { mails: EventMail[]; className?: string; small?: boolean }) {
  const [open, setOpen] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay: number) => {
    clear();
    timer.current = window.setTimeout(() => ref.current && setOpen(ref.current.getBoundingClientRect()), delay);
  };
  const hide = (delay: number) => {
    clear();
    timer.current = window.setTimeout(() => setOpen(null), delay);
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const away = () => setOpen(null);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", away, true);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);
  if (!mails.length) return null;

  const kind = topKind(mails);
  const label = mails.length === 1 ? `${EVENT_MAIL_LABEL[kind]}: mail “${mails[0].mail.subject}”. Open the mail` : `${mails.length} mails about this event. Open the newest`;
  const width = 290;
  const left = open ? Math.max(12, Math.min(window.innerWidth - width - 12, open.left - 12)) : 0;
  const below = open ? open.bottom + 8 + 200 < window.innerHeight : true;

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(null);
          openMail(mails[0].mail.id);
        }}
        onMouseEnter={() => show(120)}
        onMouseLeave={() => hide(160)}
        onFocus={() => show(0)}
        onBlur={() => hide(160)}
        className={`press z-10 grid place-items-center rounded-full font-bold leading-none tabular-nums text-white ${small ? "h-4 min-w-4 px-1 text-[10px]" : "h-[18px] min-w-[18px] px-[5px] text-[11px]"} ${className}`}
        style={{ background: BADGE_RED, boxShadow: "0 0 0 2px var(--surface), 0 2px 5px rgba(0,0,0,0.22)" }}
      >
        {mails.length}
      </button>
      {open &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={clear}
            onMouseLeave={() => hide(160)}
            className="mail-tip fixed z-[80] rounded-[12px] bg-surface p-1.5 text-[13px] text-text shadow-[0_0_0_1px_var(--line),0_12px_32px_rgba(0,0,0,0.18)]"
            style={{
              width,
              left,
              ...(below ? { top: open.bottom + 8 } : { bottom: window.innerHeight - open.top + 8 }),
              transformOrigin: below ? "top left" : "bottom left",
            }}
          >
            {mails.slice(0, 3).map(({ mail: m, kind: k }) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setOpen(null);
                  openMail(m.id);
                }}
                className="block w-full rounded-[8px] px-2.5 py-2 text-left hover:bg-hover"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: k === "cancelled" ? BADGE_RED : k === "info" ? "var(--muted)" : "var(--warn)" }}>
                  <Mail size={12} aria-hidden /> {EVENT_MAIL_LABEL[k]}
                  {m.unread && <span className="size-1.5 rounded-full" style={{ background: BADGE_RED }} aria-label="unread" />}
                </span>
                <span className="mt-0.5 block font-semibold leading-snug">{m.subject || "(no subject)"}</span>
                <span className="block text-[12px] text-muted">
                  {m.fromName || m.fromAddress} · {when(m.date)}
                </span>
                {firstLine(m.body) && <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-muted">{firstLine(m.body)}</span>}
              </button>
            ))}
            <p className="px-2.5 pb-1 pt-0.5 text-[11px] text-muted">{mails.length > 3 ? `${mails.length - 3} more · ` : ""}Click to open in Mail</p>
          </div>,
          document.body,
        )}
    </>
  );
}
