"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { LoginResult, Problem, Screen } from "./AppShell";

// Nur zum Vorführen der Zustände. Vor der echten App einfach aus AppShell entfernen.
export function DemoPanel(props: {
  screen: Screen;
  onScreen: (s: Screen) => void;
  problem: Problem;
  onProblem: (p: Problem) => void;
  loginResult: LoginResult;
  onLoginResult: (r: LoginResult) => void;
  failImport: boolean;
  onFailImport: (b: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="no-drag fixed bottom-3 right-3 z-50 flex h-7 items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 text-[12px] text-muted shadow-sm hover:bg-hover"
      >
        <SlidersHorizontal size={12} aria-hidden /> Demo
      </button>
    );
  }

  const field = "h-7 rounded-md border border-line bg-bg px-1.5 text-[12px]";
  return (
    <div className="no-drag fixed bottom-3 right-3 z-50 w-[230px] rounded-lg border border-line bg-bg p-3 text-[12px] shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Demo states</span>
        <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-0.5 hover:bg-hover">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          Screen
          <select className={field} value={props.screen} onChange={(e) => props.onScreen(e.target.value as Screen)}>
            <option value="login">Login</option>
            <option value="setup">Setup</option>
            <option value="import">Import</option>
            <option value="overview">Overview</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Login result
          <select className={field} value={props.loginResult} onChange={(e) => props.onLoginResult(e.target.value as LoginResult)}>
            <option value="ok">Works</option>
            <option value="wrong">Wrong password</option>
            <option value="offline">ILIAS unreachable</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={props.failImport} onChange={(e) => props.onFailImport(e.target.checked)} className="accent-[var(--accent)]" />
          One course fails during import
        </label>
        <label className="flex flex-col gap-1">
          Problem in overview
          <select className={field} value={props.problem} onChange={(e) => props.onProblem(e.target.value as Problem)}>
            <option value="none">None</option>
            <option value="offline">Offline</option>
            <option value="loginExpired">Session expired</option>
            <option value="courseFailed">Course failed</option>
          </select>
        </label>
      </div>
    </div>
  );
}
