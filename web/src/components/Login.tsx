"use client";

import { useRef, useState } from "react";
import { Lock, WifiOff } from "lucide-react";
import { Button, Notice, Spinner, Stage } from "./ui";
import type { LoginResult } from "./AppShell";

type Status = "idle" | "loading" | "wrong" | "offline";

const field =
  "h-9 rounded-lg border border-line bg-surface px-3 outline-none placeholder:text-muted focus:border-[var(--focus)] disabled:opacity-60";

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
    <Stage width={380}>
      <div className="mt-[7vh]">
        <Logo />
        <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-[-0.02em]">Mit ILIAS verbinden</h1>
        <p className="mt-1.5 text-muted">Melde dich mit deiner Uni-Kennung an. Danach holt die App deine Kurse auf den Mac.</p>
      </div>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-4 rounded-[14px] bg-surface p-5">
        {status === "wrong" && (
          <Notice tone="danger" icon={<Lock size={16} aria-hidden />}>
            Kennung oder Passwort stimmt nicht.
          </Notice>
        )}
        {status === "offline" && (
          <Notice tone="warn" icon={<WifiOff size={16} aria-hidden />}>
            ILIAS antwortet gerade nicht. Versuch es in ein paar Minuten noch mal.
          </Notice>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Uni-Kennung</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            placeholder="z. B. mmuster1"
            disabled={loading}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Passwort</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
            className={field}
          />
        </label>

        <Button type="submit" variant="primary" className="mt-1 h-10 text-[14px]" disabled={loading}>
          {loading ? (
            <>
              <Spinner /> Verbinde mit ILIAS…
            </>
          ) : (
            "Anmelden"
          )}
        </Button>
      </form>

      <p className="mt-4 flex items-center gap-2 px-1 text-[12px] text-muted">
        <Lock size={12} className="shrink-0" aria-hidden />
        Deine Zugangsdaten bleiben im Schlüsselbund deines Macs.
      </p>
    </Stage>
  );
}

// Kleines Zeichen: ein Wochenstreifen aus fünf Kursfarben.
function Logo() {
  const colors = ["blue", "orange", "green", "plum", "ochre"];
  return (
    <div className="flex h-11 w-11 items-end gap-[3px] rounded-xl bg-accent p-2" aria-hidden>
      {colors.map((c, i) => (
        <span key={c} className="flex-1 rounded-[2px]" style={{ background: `var(--c-${c})`, height: `${[60, 85, 45, 100, 70][i]}%` }} />
      ))}
    </div>
  );
}
