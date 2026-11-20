"use client";

import { useRef, useState } from "react";
import { GraduationCap, Lock, WifiOff } from "lucide-react";
import { Button, Notice, Spinner, Stage } from "./ui";
import type { LoginResult } from "./AppShell";

type Status = "idle" | "loading" | "wrong" | "offline";

export function Login({ result, onSuccess }: { result: LoginResult; onSuccess: () => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | undefined>(undefined);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (result === "ok") onSuccess();
      else setStatus(result === "wrong" ? "wrong" : "offline");
    }, 1100);
  };

  const loading = status === "loading";

  return (
    <Stage width={340}>
      <div className="mt-[6vh] flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-on-accent">
          <GraduationCap size={26} strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight">Mit ILIAS verbinden</h1>
        <p className="mt-1 text-muted">Melde dich mit deiner Uni-Kennung an.</p>
      </div>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-3">
        {status === "wrong" && (
          <Notice tone="danger" icon={<Lock size={16} aria-hidden />}>
            Kennung oder Passwort stimmt nicht.
          </Notice>
        )}
        {status === "offline" && (
          <Notice tone="warn" icon={<WifiOff size={16} aria-hidden />}>
            ILIAS ist gerade nicht erreichbar. Versuche es gleich noch einmal.
          </Notice>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Uni-Kennung</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            placeholder="z. B. mmuster1"
            disabled={loading}
            className="h-8 rounded-md border border-line bg-bg px-2.5 outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Passwort</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
            className="h-8 rounded-md border border-line bg-bg px-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
          />
        </label>

        <Button type="submit" variant="primary" className="mt-1 h-8" disabled={loading}>
          {loading ? (
            <>
              <Spinner /> Verbinde…
            </>
          ) : (
            "Anmelden"
          )}
        </Button>
      </form>

      <p className="mt-5 flex items-start justify-center gap-1.5 text-center text-[12px] text-muted">
        <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
        Deine Zugangsdaten bleiben im Schlüsselbund deines Macs.
      </p>
    </Stage>
  );
}
