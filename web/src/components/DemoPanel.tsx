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
        <span className="font-medium">Demo-Zustände</span>
        <button onClick={() => setOpen(false)} aria-label="Schließen" className="rounded p-0.5 hover:bg-hover">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          Bildschirm
          <select className={field} value={props.screen} onChange={(e) => props.onScreen(e.target.value as Screen)}>
            <option value="login">Login</option>
            <option value="setup">Einrichtung</option>
            <option value="import">Import</option>
            <option value="overview">Übersicht</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Login-Ergebnis
          <select className={field} value={props.loginResult} onChange={(e) => props.onLoginResult(e.target.value as LoginResult)}>
            <option value="ok">Klappt</option>
            <option value="wrong">Falsches Passwort</option>
            <option value="offline">ILIAS nicht erreichbar</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={props.failImport} onChange={(e) => props.onFailImport(e.target.checked)} className="accent-[var(--accent)]" />
          Ein Kurs schlägt beim Import fehl
        </label>
        <label className="flex flex-col gap-1">
          Problem in der Übersicht
          <select className={field} value={props.problem} onChange={(e) => props.onProblem(e.target.value as Problem)}>
            <option value="none">Keins</option>
            <option value="offline">Offline</option>
            <option value="loginExpired">Anmeldung abgelaufen</option>
            <option value="courseFailed">Kurs fehlgeschlagen</option>
          </select>
        </label>
      </div>
    </div>
  );
}
