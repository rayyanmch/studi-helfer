"use client";

import { useRef, useState } from "react";
import { AlertCircle, Lock, WifiOff } from "lucide-react";
import { Spinner } from "./ui";
import type { LoginResult } from "./AppShell";

type Status = "idle" | "loading" | "wrong" | "offline";

// Seite, auf der ILIAS selbst „Passwort vergessen“ anbietet.
const ILIAS_LOGIN = "https://www.ilias.uni-koeln.de/ilias/login.php";

const field =
  "h-11 w-full rounded-[10px] bg-bg px-3.5 outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--focus)] disabled:opacity-60";

export function Login({ result, onSuccess }: { result: LoginResult; onSuccess: (user: string) => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | undefined>(undefined);
  const passRef = useRef<HTMLInputElement>(null);

  const loading = status === "loading";
  const ready = user.trim().length > 0 && pass.length > 0 && !loading;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setStatus("loading");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (result === "ok") return onSuccess(user.trim());
      setStatus(result === "wrong" ? "wrong" : "offline");
      if (result === "wrong") {
        // Falsches Passwort: Feld leeren und direkt wieder hineinspringen
        setPass("");
        window.setTimeout(() => passRef.current?.focus(), 0);
      }
    }, 1100);
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="drag h-[52px] shrink-0" />
      <div className="scroll flex flex-1 justify-center px-6 pb-10">
        <div className="mt-[9vh] w-[340px] max-w-full text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-256.png" alt="" width={72} height={72} className="mx-auto size-[72px]" draggable={false} />
          <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-[-0.02em]">Bei ILIAS anmelden</h1>
          <p className="mt-1 text-muted">Mit deiner Uni-Kennung</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-2.5 text-left" noValidate>
            <label className="sr-only" htmlFor="kennung">
              Uni-Kennung
            </label>
            <input
              id="kennung"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              placeholder="Uni-Kennung"
              disabled={loading}
              className={field}
            />
            <label className="sr-only" htmlFor="passwort">
              Passwort
            </label>
            <input
              id="passwort"
              ref={passRef}
              type="password"
              value={pass}
              onChange={(e) => {
                setPass(e.target.value);
                if (status === "wrong") setStatus("idle");
              }}
              autoComplete="current-password"
              placeholder="Passwort"
              disabled={loading}
              aria-invalid={status === "wrong"}
              aria-describedby={status === "wrong" || status === "offline" ? "login-fehler" : undefined}
              className={`${field} ${status === "wrong" ? "shadow-[inset_0_0_0_2px_var(--danger)]" : ""}`}
            />

            {status === "wrong" && (
              <p id="login-fehler" role="alert" className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-danger">
                <AlertCircle size={14} aria-hidden /> Kennung oder Passwort stimmt nicht.
              </p>
            )}
            {status === "offline" && (
              <p id="login-fehler" role="alert" className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-warn">
                <WifiOff size={14} aria-hidden /> ILIAS antwortet gerade nicht. Versuch es gleich noch mal.
              </p>
            )}

            <button
              type="submit"
              disabled={!ready}
              className="no-drag mt-1 flex h-11 items-center justify-center gap-2 rounded-[10px] bg-accent text-[14px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-35"
            >
              {loading ? (
                <>
                  <Spinner /> Verbinde mit ILIAS…
                </>
              ) : (
                "Anmelden"
              )}
            </button>
          </form>

          <a
            href={ILIAS_LOGIN}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded font-semibold text-[var(--focus)] hover:underline"
          >
            Passwort vergessen?
          </a>

          <p className="mt-10 flex items-center justify-center gap-1.5 whitespace-nowrap text-[12px] text-muted">
            <Lock size={12} aria-hidden /> Deine Zugangsdaten bleiben im Schlüsselbund deines Macs.
          </p>
        </div>
      </div>
    </div>
  );
}
