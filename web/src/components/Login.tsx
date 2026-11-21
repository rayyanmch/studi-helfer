"use client";

import { useRef, useState } from "react";
import { AlertCircle, Lock, WifiOff } from "lucide-react";
import { Spinner } from "./ui";
import type { LoginResult } from "./AppShell";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";

type Status = "idle" | "loading" | "wrong" | "offline" | "error";

// Seite, auf der ILIAS selbst „Passwort vergessen“ anbietet.
const ILIAS_LOGIN = "https://www.ilias.uni-koeln.de/ilias/login.php";
const FIRST_STEPS = "https://studierende.uni-koeln.de/erstsemester/erste_schritte/index_ger.html";

const field =
  "h-11 w-full rounded-[10px] bg-bg px-3.5 outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_2px_var(--focus)] disabled:opacity-60";

export function Login({ result, onSuccess }: { result: LoginResult; onSuccess: (user: string) => void }) {
  const app = useApp();
  const [user, setUser] = useState(app.mode === "desktop" ? (app.user ?? "") : "");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const passRef = useRef<HTMLInputElement>(null);

  const loading = status === "loading";
  const ready = user.trim().length > 0 && pass.length > 0 && !loading;

  const wrongPassword = () => {
    // Falsches Passwort: Feld leeren und direkt wieder hineinspringen
    setStatus("wrong");
    setPass("");
    window.setTimeout(() => passRef.current?.focus(), 0);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setStatus("loading");
    if (app.mode === "desktop") {
      // Echte Anmeldung: Passwort geht nur an den Hintergrundteil und landet im Schlüsselbund.
      const res = await store.login(user.trim(), pass);
      if (res.ok) return onSuccess(user.trim());
      if (res.reason === "wrong") return wrongPassword();
      setErrorText(res.message);
      setStatus(res.reason === "offline" ? "offline" : "error");
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (result === "ok") return onSuccess(user.trim());
      if (result === "wrong") return wrongPassword();
      setStatus("offline");
    }, 1100);
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="drag h-[52px] shrink-0" />
      <div className="scroll flex flex-1 justify-center px-6 pb-10">
        <div className="mt-[9vh] w-[340px] max-w-full text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-256.png" alt="" width={72} height={72} className="mx-auto size-[72px]" draggable={false} />
          <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-[-0.02em]">Sign in with your uni login</h1>
          <p className="mt-1.5 text-balance text-muted">Ordo gets your course files and deadlines from ILIAS for you.</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-2.5 text-left" noValidate>
            <label className="sr-only" htmlFor="kennung">
              University ID
            </label>
            <input
              id="kennung"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="University ID, e.g. mmuster1"
              disabled={loading}
              className={field}
            />
            <label className="sr-only" htmlFor="passwort">
              Password
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
              placeholder="Password"
              disabled={loading}
              aria-invalid={status === "wrong"}
              aria-describedby={status === "wrong" || status === "offline" || status === "error" ? "login-fehler" : undefined}
              className={`${field} ${status === "wrong" ? "shadow-[inset_0_0_0_2px_var(--danger)]" : ""}`}
            />

            {status === "wrong" && (
              <p id="login-fehler" role="alert" className="flex items-start gap-1.5 px-1 text-[13px] font-medium text-danger">
                <AlertCircle size={14} className="mt-[3px] shrink-0" aria-hidden /> Wrong ID or password. Use the same login as for ILIAS.
              </p>
            )}
            {status === "offline" && (
              <p id="login-fehler" role="alert" className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-warn">
                <WifiOff size={14} aria-hidden /> ILIAS is not responding. Try again in a moment.
              </p>
            )}
            {status === "error" && (
              <p id="login-fehler" role="alert" className="flex items-start gap-1.5 px-1 text-[13px] font-medium text-danger">
                <AlertCircle size={14} className="mt-[3px] shrink-0" aria-hidden /> {errorText}
              </p>
            )}

            <button
              type="submit"
              disabled={!ready}
              className="no-drag mt-1 flex h-11 items-center justify-center gap-2 rounded-[10px] bg-accent text-[14px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-35"
            >
              {loading ? (
                <>
                  <Spinner /> Connecting to ILIAS…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <a
            href={ILIAS_LOGIN}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded font-semibold text-[var(--focus)] hover:underline"
          >
            Forgot password?
          </a>
          {/* Erstis müssen ihren Uni-Account erst in KLIPS freischalten (Link in der Einschreibungs-Mail), sonst klappt kein Login */}
          <p className="mt-2 text-[13px] text-muted">
            New student?{" "}
            <a href={FIRST_STEPS} target="_blank" rel="noopener noreferrer" className="rounded font-semibold text-[var(--focus)] hover:underline">
              Activate your uni account first
            </a>
          </p>

          <p className="mt-10 flex items-center justify-center gap-1.5 text-[12px] text-muted">
            <Lock size={12} className="shrink-0" aria-hidden /> Your password stays on this Mac and only goes to ILIAS.
          </p>
        </div>
      </div>
    </div>
  );
}
