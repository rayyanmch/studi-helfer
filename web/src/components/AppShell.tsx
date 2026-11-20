"use client";

import { useState } from "react";
import { courses } from "@/lib/mock-data";
import { Login } from "./Login";
import { Setup } from "./Setup";
import { Overview } from "./Overview";
import { DemoPanel } from "./DemoPanel";

export type Screen = "login" | "setup" | "import" | "overview";
export type Problem = "none" | "offline" | "loginExpired" | "courseFailed";
export type LoginResult = "ok" | "wrong" | "offline";

export function AppShell() {
  const [screen, setScreen] = useState<Screen>("login");
  const [problem, setProblem] = useState<Problem>("none");
  const [loginResult, setLoginResult] = useState<LoginResult>("ok");
  const [failImport, setFailImport] = useState(false);
  const [selected, setSelected] = useState<string[]>(courses.filter((c) => c.semester !== "past").map((c) => c.id));
  const [user, setUser] = useState("mmuster1");
  const [importRun, setImportRun] = useState(0);

  // Erster Import läuft im Hintergrund, die Übersicht ist sofort da (Variante A2)
  const startImport = () => {
    setImportRun((n) => n + 1);
    setScreen("overview");
  };
  const goTo = (s: Screen) => (s === "import" ? startImport() : setScreen(s));

  return (
    <>
      {screen === "login" && (
        <Login
          result={loginResult}
          onSuccess={(u) => {
            setUser(u);
            setScreen("setup");
          }}
        />
      )}
      {screen === "setup" && (
        <Setup selected={selected} onChange={setSelected} onStart={startImport} />
      )}
      {screen === "overview" && (
        <Overview
          courseIds={selected}
          problem={problem}
          onProblem={setProblem}
          user={user}
          onEditCourses={() => setScreen("setup")}
          importRun={importRun}
          failImport={failImport}
          onRelogin={() => {
            setProblem("none");
            setScreen("login");
          }}
        />
      )}
      <DemoPanel
        screen={screen}
        onScreen={goTo}
        problem={problem}
        onProblem={setProblem}
        loginResult={loginResult}
        onLoginResult={setLoginResult}
        failImport={failImport}
        onFailImport={setFailImport}
      />
    </>
  );
}
