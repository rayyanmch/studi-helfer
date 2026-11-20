"use client";

// Accounts (Variante A2): ILIAS, Google (Gmail + Kalender) und Uni-Mail verbinden oder trennen.
// Verbinden ist freiwillig, die App funktioniert auch ohne Google.

import { useEffect, useRef, useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { Button, Spinner } from "./ui";
import { AccountChip } from "./MailView";
import { useApp } from "@/lib/app-store";
import { connectAccount, disconnectAccount, useMail, type MailAccountId } from "@/lib/mail-data";

export function Accounts({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const mail = useMail();
  const desktop = app.mode === "desktop";
  const dialog = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<MailAccountId | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    dialog.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // Vorschau: „Anmelden“ dauert kurz, dann ist das Konto verbunden. Später: echte Anmeldung bei Google bzw. der Uni.
  const connect = (id: MailAccountId) => {
    setBusy(id);
    window.setTimeout(() => {
      connectAccount(id);
      setBusy(null);
    }, 900);
  };

  const gmail = mail.accounts.find((a) => a.id === "gmail");
  const uni = mail.accounts.find((a) => a.id === "uni");

  return (
    <div className="no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-6 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Accounts"
        className="w-[520px] max-w-full rounded-[14px] bg-bg shadow-[0_0_0_1px_var(--line),0_24px_60px_rgba(0,0,0,0.25)] outline-none focus:outline-none"
      >
        <header className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-[20px] font-bold">Accounts</h2>
          <button onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="px-6 pb-6">
          <ul className="divide-y divide-line-soft rounded-[12px] bg-surface px-4">
            <Row
              icon={<span className="flex size-[34px] items-center justify-center rounded-lg bg-[var(--c-blue-soft)] text-[14px] font-bold text-[var(--c-blue-ink)]">I</span>}
              title="ILIAS"
              sub={app.user ? `${app.user}, University of Cologne` : "University of Cologne"}
              right={app.loggedIn || !desktop ? <Connected /> : <span className="text-[12px] text-muted">Not signed in</span>}
            />
            <Row
              icon={<AccountChip id="gmail" size={34} />}
              title="Google"
              sub={gmail?.connected ? `${gmail.address}, Gmail and Calendar` : "Gmail and Calendar, read and write mail"}
              right={
                gmail?.connected ? (
                  <div className="flex items-center gap-3">
                    <Connected />
                    <button onClick={() => disconnectAccount("gmail")} className="rounded-md px-1.5 py-1 text-[12px] font-semibold text-danger hover:bg-danger-soft">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <ConnectButton busy={busy === "gmail"} disabled={desktop} onClick={() => connect("gmail")} />
                )
              }
            />
            <Row
              icon={<AccountChip id="uni" size={34} />}
              title="University mail"
              sub={uni?.connected ? uni.address : "Your student mailbox at the University of Cologne"}
              right={
                uni?.connected ? (
                  <div className="flex items-center gap-3">
                    <Connected />
                    <button onClick={() => disconnectAccount("uni")} className="rounded-md px-1.5 py-1 text-[12px] font-semibold text-danger hover:bg-danger-soft">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <ConnectButton busy={busy === "uni"} disabled={desktop} onClick={() => connect("uni")} />
                )
              }
            />
          </ul>
          {desktop && <p className="mt-3 text-[12px] text-muted">Connecting Google and the university mailbox is not live yet. The buttons work in the browser preview.</p>}
          <p className="mt-4 flex items-start gap-2 text-[12px] text-muted">
            <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>Your mail and your login stay on your Mac. Nothing is sent to a server or to an AI. You can disconnect at any time.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub: string; right: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3.5">
      {icon}
      <span className="min-w-0 flex-1">
        <b className="block font-semibold">{title}</b>
        <span className="block truncate text-[12px] text-muted">{sub}</span>
      </span>
      {right}
    </li>
  );
}

function Connected() {
  return (
    <span className="flex items-center gap-1 text-[12px] font-semibold text-ok">
      <Check size={13} strokeWidth={3} aria-hidden /> Connected
    </span>
  );
}

function ConnectButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button onClick={onClick} disabled={busy || disabled}>
      {busy ? (
        <>
          <Spinner size={12} /> Connecting…
        </>
      ) : (
        "Connect"
      )}
    </Button>
  );
}
