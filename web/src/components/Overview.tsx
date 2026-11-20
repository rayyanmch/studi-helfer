"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  LogIn,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { Button, FileIcon, Notice, Spinner } from "./ui";
import type { Problem } from "./AppShell";
import { courses, countFiles, countNew, LAST_SYNC, type Course, type CourseFile } from "@/lib/mock-data";

const FAIL_ID = "rechnernetze";
type View = "new" | string;

export function Overview({
  courseIds,
  problem,
  onProblem,
  onRelogin,
}: {
  courseIds: string[];
  problem: Problem;
  onProblem: (p: Problem) => void;
  onRelogin: () => void;
}) {
  const list = courses.filter((c) => courseIds.includes(c.id));
  const [view, setView] = useState<View>("new");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(LAST_SYNC);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const sync = () => {
    if (syncing) return;
    setSyncing(true);
    timer.current = window.setTimeout(() => {
      setSyncing(false);
      if (problem === "courseFailed" || problem === "offline") onProblem("none");
      if (problem !== "loginExpired") setLastSync("Gerade eben");
    }, 1400);
  };

  const course = list.find((c) => c.id === view);
  const newCount = list.reduce((n, c) => n + countNew(c), 0);

  return (
    <div className="flex h-full bg-bg">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="drag h-[52px] shrink-0" />
        <nav className="scroll flex-1 px-2 pb-2" aria-label="Kurse">
          <SideItem active={view === "new"} onClick={() => setView("new")} label="Neu seit letztem Sync" count={newCount} />
          <p className="mb-1 mt-4 px-2 text-[12px] font-medium text-muted">Kurse</p>
          {list.map((c) => (
            <SideItem
              key={c.id}
              active={view === c.id}
              onClick={() => setView(c.id)}
              label={c.name}
              count={countNew(c)}
              warn={problem === "courseFailed" && c.id === FAIL_ID}
            />
          ))}
        </nav>
        <SyncStatus problem={problem} syncing={syncing} lastSync={lastSync} onSync={sync} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="drag flex h-[52px] shrink-0 items-center border-b border-line px-5">
          <h1 className="truncate text-[15px] font-semibold">{course ? course.name : "Neu seit letztem Sync"}</h1>
          {course && <span className="ml-3 truncate text-muted">{course.lecturer}</span>}
        </header>

        <div className="scroll flex-1 px-5 py-4">
          {problem === "offline" && (
            <div className="mb-4">
              <Notice
                tone="warn"
                icon={<WifiOff size={16} aria-hidden />}
                action={<Button onClick={sync}>Erneut versuchen</Button>}
              >
                Keine Verbindung. Du siehst den Stand vom letzten Sync.
              </Notice>
            </div>
          )}
          {problem === "loginExpired" && (
            <div className="mb-4">
              <Notice
                tone="warn"
                icon={<LogIn size={16} aria-hidden />}
                action={<Button onClick={onRelogin}>Neu anmelden</Button>}
              >
                Deine ILIAS-Anmeldung ist abgelaufen. Deine Dateien bleiben erhalten.
              </Notice>
            </div>
          )}
          {problem === "courseFailed" && (!course || course.id === FAIL_ID) && (
            <div className="mb-4">
              <Notice
                tone="danger"
                icon={<AlertTriangle size={16} aria-hidden />}
                action={<Button onClick={sync}>Erneut versuchen</Button>}
              >
                Rechnernetze konnte nicht synchronisiert werden. Die anderen Kurse sind aktuell.
              </Notice>
            </div>
          )}

          {course ? <CourseView course={course} /> : <NewView list={list} />}
        </div>
      </main>
    </div>
  );
}

function SideItem({
  active,
  onClick,
  label,
  count,
  warn,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left transition-colors ${
        active ? "bg-hover font-medium" : "hover:bg-hover"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {warn ? (
        <AlertTriangle size={13} className="text-danger" aria-label="Fehler" />
      ) : (
        count > 0 && <span className="text-[12px] font-medium tabular-nums text-accent">{count}</span>
      )}
    </button>
  );
}

function SyncStatus({
  problem,
  syncing,
  lastSync,
  onSync,
}: {
  problem: Problem;
  syncing: boolean;
  lastSync: string;
  onSync: () => void;
}) {
  let icon = <CheckCircle2 size={14} className="text-accent" aria-hidden />;
  let text = `Zuletzt: ${lastSync}`;
  if (syncing) {
    icon = <Spinner size={14} />;
    text = "Synchronisiere…";
  } else if (problem === "offline") {
    icon = <WifiOff size={14} className="text-warn" aria-hidden />;
    text = `Offline. Stand: ${lastSync}`;
  } else if (problem === "loginExpired") {
    icon = <LogIn size={14} className="text-warn" aria-hidden />;
    text = "Anmeldung abgelaufen";
  } else if (problem === "courseFailed") {
    icon = <AlertTriangle size={14} className="text-danger" aria-hidden />;
    text = "1 Kurs mit Fehler";
  }

  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2 text-[12px]" aria-live="polite">
        {icon}
        <span className="min-w-0 flex-1 truncate">{text}</span>
      </div>
      <Button className="mt-2.5 w-full" onClick={onSync} disabled={syncing || problem === "loginExpired"}>
        <RefreshCw size={13} aria-hidden /> Jetzt synchronisieren
      </Button>
    </div>
  );
}

function NewView({ list }: { list: Course[] }) {
  const items = list.flatMap((c) =>
    c.folders.flatMap((f) => f.files.filter((x) => x.isNew).map((x) => ({ file: x, where: `${c.name} · ${f.name}` }))),
  );
  if (items.length === 0) {
    return <p className="mt-10 text-center text-muted">Seit dem letzten Sync ist nichts Neues dazugekommen.</p>;
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {items.map(({ file, where }) => (
        <FileRow key={file.id} file={file} sub={where} />
      ))}
    </ul>
  );
}

function CourseView({ course }: { course: Course }) {
  const [closed, setClosed] = useState<string[]>([]);
  const toggle = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const n = countFiles(course);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted">
        {n} {n === 1 ? "Datei" : "Dateien"} in {course.folders.length} {course.folders.length === 1 ? "Ordner" : "Ordnern"}
      </p>
      {course.folders.map((f) => {
        const open = !closed.includes(f.id);
        return (
          <section key={f.id}>
            <button
              onClick={() => toggle(f.id)}
              aria-expanded={open}
              className="mb-1.5 flex items-center gap-1 rounded px-1 py-0.5 font-medium hover:bg-hover"
            >
              {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
              {f.name}
              <span className="ml-1 font-normal text-muted">{f.files.length}</span>
            </button>
            {open && (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {f.files.map((x) => (
                  <FileRow key={x.id} file={x} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FileRow({ file, sub }: { file: CourseFile; sub?: string }) {
  return (
    <li className="group flex h-11 items-center gap-3 px-3 hover:bg-hover focus-within:bg-hover">
      <FileIcon kind={file.kind} />
      <div className="min-w-0 flex-1">
        <p className="truncate">{file.name}</p>
        {sub && <p className="truncate text-[12px] text-muted">{sub}</p>}
      </div>
      <div className="hidden items-center gap-1.5 group-hover:flex group-focus-within:flex">
        <Button className="h-6 px-2.5">Öffnen</Button>
        <Button className="h-6 px-2.5">Im Finder zeigen</Button>
      </div>
      {file.isNew && (
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-accent">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          Neu
        </span>
      )}
      <span className="flex w-[104px] items-center justify-end gap-1 text-right text-[12px] text-muted">
        <Clock size={11} aria-hidden />
        {file.updated}
      </span>
      <span className="w-[56px] text-right text-[12px] tabular-nums text-muted">{file.size}</span>
    </li>
  );
}
