"use client";

import { useState } from "react";
import { courses } from "@/lib/mock-data";
import { Login } from "./Login";
import { Setup } from "./Setup";
import { ImportScreen } from "./ImportScreen";
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
  const [selected, setSelected] = useState<string[]>(courses.map((c) => c.id));
  const [user, setUser] = useState("mmuster1");

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
        <Setup selected={selected} onChange={setSelected} onStart={() => setScreen("import")} />
      )}
      {screen === "import" && (
        <ImportScreen
          courseIds={selected}
          failOne={failImport}
          onDone={() => setScreen("overview")}
        />
      )}
      {screen === "overview" && (
        <Overview
          courseIds={selected}
          problem={problem}
          onProblem={setProblem}
          user={user}
          onEditCourses={() => setScreen("setup")}
          onRelogin={() => {
            setProblem("none");
            setScreen("login");
          }}
        />
      )}
      <DemoPanel
        screen={screen}
        onScreen={setScreen}
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
