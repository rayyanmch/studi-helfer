"use client";

import { useEffect, useState } from "react";
import * as store from "@/lib/app-store";
import { useApp } from "@/lib/app-store";
import { Login } from "./Login";
import { Setup } from "./Setup";
import { Overview } from "./Overview";
import { DemoPanel } from "./DemoPanel";
import { UpdateNotice } from "./UpdateNotice";
import { EventDialogHost } from "./EventDialog";

export type Screen = "login" | "setup" | "import" | "overview";
export type Problem = store.Problem;
export type LoginResult = "ok" | "wrong" | "offline";

export function AppShell() {
  const app = useApp();
  // Auch nach einem Neuladen des Stores (Entwicklung) wieder starten
  useEffect(() => {
    if (app.mode === "loading") void store.initApp();
  }, [app.mode]);

  // Bis klar ist, ob Browser (Beispieldaten) oder Mac-App (echte Daten): leere Fläche statt Aufblitzen.
  if (app.mode === "loading") return <div className="h-full bg-bg" />;
  const first: Screen = app.mode === "desktop" ? (!app.loggedIn ? "login" : !app.configured ? "setup" : "overview") : "login";
  return <Shell first={first} />;
}

function Shell({ first }: { first: Screen }) {
  const app = useApp();
  const desktop = app.mode === "desktop";
  const [screen, setScreen] = useState<Screen>(first);
  // Nur für das Demo-Fenster im Browser
  const [demoProblem, setDemoProblem] = useState<Problem>("none");
  const [loginResult, setLoginResult] = useState<LoginResult>("ok");
  const [failImport, setFailImport] = useState(false);
  const [importRun, setImportRun] = useState(0);

  const problem = desktop ? app.problem : demoProblem;
  const user = app.user ?? "";

  // Erster Import läuft im Hintergrund, die Übersicht ist sofort da (Variante A2)
  const startImport = async (videos = false) => {
    if (desktop) {
      const res = await store.startImport(videos);
      if (!res.ok) return res.message ?? "Could not start.";
    }
    setImportRun((n) => n + 1);
    setScreen("overview");
    return null;
  };
  const goTo = (s: Screen) => (s === "import" ? void startImport() : setScreen(s));

  return (
    <>
      {screen === "login" && <Login result={loginResult} onSuccess={() => setScreen(desktop && app.configured ? "overview" : "setup")} />}
      {screen === "setup" && (
        <Setup
          selected={app.setupSelected}
          onChange={store.setSetupSelected}
          onStart={startImport}
          onCancel={desktop && app.configured ? () => setScreen("overview") : undefined}
        />
      )}
      {screen === "overview" && (
        <Overview
          courseIds={desktop ? app.courses.map((c) => c.id) : app.setupSelected}
          problem={problem}
          onProblem={desktop ? () => {} : setDemoProblem}
          user={user}
          onEditCourses={() => setScreen("setup")}
          importRun={importRun}
          failImport={failImport}
          onRelogin={() => {
            setDemoProblem("none");
            setScreen("login");
          }}
          onLogout={async () => {
            await store.logout();
            setDemoProblem("none");
            setScreen("login");
          }}
        />
      )}
      {screen === "overview" && <EventDialogHost />}
      {desktop && <UpdateNotice />}
      {!desktop && (
        <DemoPanel
          screen={screen}
          onScreen={goTo}
          problem={demoProblem}
          onProblem={setDemoProblem}
          loginResult={loginResult}
          onLoginResult={setLoginResult}
          failImport={failImport}
          onFailImport={setFailImport}
        />
      )}
    </>
  );
}
