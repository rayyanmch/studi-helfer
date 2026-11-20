// Schlichtes Testfenster für window.studi. Kein Design – das macht Mika in web/.
/* global window, document, URLSearchParams */

const api = window.studi;
console.log("[test] Skript geladen, window.studi:", Boolean(api));
const $ = (id) => document.getElementById(id);
let courses = [];
let targetDir = null;

function msg(id, text, isError = false) {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("error", isError);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "onclick") node.addEventListener("click", v);
    else if (k === "checked") node.checked = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

const SEMESTER = { current: "aktuell", past: "alt", unknown: "?" };

async function refreshStatus() {
  const s = await api.getStatus();
  targetDir = s.targetDir || s.defaultTargetDir;
  $("target").textContent = targetDir;
  $("status").textContent = JSON.stringify(s, null, 2);
  $("login-box").hidden = s.loggedIn;
  $("setup-box").hidden = !s.loggedIn;
  $("sched-on").checked = Boolean(s.schedule?.enabled);
  if (s.schedule?.time) $("sched-time").value = s.schedule.time;
  renderSync(s.sync);
  return s;
}

function renderCourses() {
  const body = $("courses").querySelector("tbody");
  body.replaceChildren(
    ...courses.map((c) =>
      el(
        "tr",
        {},
        el("td", {}, el("input", { type: "checkbox", checked: c.selected, "data-id": c.id, "data-f": "selected" })),
        el("td", {}, `${c.title} `, el("code", {}, c.id)),
        el("td", {}, SEMESTER[c.semester] ?? c.semester),
        el("td", {}, el("input", { type: "checkbox", checked: c.videos, "data-id": c.id, "data-f": "videos" })),
      ),
    ),
  );
  body.querySelectorAll("input").forEach((inp) =>
    inp.addEventListener("change", () => {
      const c = courses.find((x) => x.id === inp.dataset.id);
      c[inp.dataset.f] = inp.checked;
    }),
  );
}

function renderSync(state) {
  if (!state) return;
  const lines = [];
  if (state.running) {
    lines.push(state.waitingUntil ? `Wartet bis ${new Date(state.waitingUntil * 1000).toLocaleTimeString("de-DE")}` : "Läuft …");
    for (const id of state.order || []) {
      const c = state.courses[id];
      lines.push(`${c.status.padEnd(8)} ${c.title}: ${c.added} neu, ${c.changed} geändert${c.problems.length ? " – " + c.problems[0] : ""}`);
    }
  } else {
    lines.push(`Kein Sync aktiv. Letzter Status: ${state.lastStatus ?? "–"}${state.interrupted ? " (abgebrochen)" : ""}`);
  }
  $("sync-state").textContent = lines.join("\n");
  $("sync").disabled = Boolean(state.running);
  $("cancel").disabled = !state.running;
}

async function renderFiles() {
  const list = await api.getFiles();
  const box = $("files");
  if (!list.length) {
    box.textContent = "Noch keine Dateien.";
    return;
  }
  box.replaceChildren(
    ...list.flatMap((course) => [
      el("h3", {}, `${course.name} (${course.total} Dateien)`),
      ...course.folders.flatMap((folder) => [
        el("div", { class: "meta" }, `Ordner: ${folder.name}`),
        ...folder.files.map((f) =>
          el(
            "div",
            { class: "file" },
            el("span", { class: f.isNew ? "name new" : "name" }, `${f.isNew ? "● " : ""}${f.name}`),
            el("span", { class: "meta" }, `${f.size} · ${f.updated}`),
            el("button", { onclick: () => api.openFile(f.path) }, "Öffnen"),
            el("button", { onclick: () => api.revealFile(f.path) }, "Im Finder zeigen"),
          ),
        ),
      ]),
    ]),
  );
}

async function doLogin() {
  msg("login-msg", "Melde an …");
  const res = await api.login($("username").value, $("password").value);
  $("password").value = "";
  if (res.ok) {
    msg("login-msg", `Angemeldet als ${res.username}.`);
    await refreshStatus();
  } else {
    msg("login-msg", `${res.message} (${res.code})`, true);
  }
}
$("login").addEventListener("click", doLogin);
$("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});

$("choose").addEventListener("click", async () => {
  const dir = await api.chooseFolder();
  if (dir) {
    targetDir = dir;
    $("target").textContent = dir;
  }
});

$("load-courses").addEventListener("click", async () => {
  msg("setup-msg", "Lade Kurse …");
  const res = await api.listCourses();
  if (!res.ok) return msg("setup-msg", `${res.message} (${res.code})`, true);
  courses = res.courses;
  renderCourses();
  msg("setup-msg", `${courses.length} Kurse gefunden, ${courses.filter((c) => c.selected).length} ausgewählt.`);
});

$("save-setup").addEventListener("click", async () => {
  if (!courses.length) return msg("setup-msg", "Erst Kurse laden.", true);
  const res = await api.saveSetup({ targetDir, courses });
  msg("setup-msg", res.ok ? "Gespeichert." : res.message, !res.ok);
  await refreshStatus();
});

$("sync").addEventListener("click", async () => {
  const res = await api.startSync();
  msg("sync-msg", res.ok ? "Sync gestartet." : res.message, !res.ok);
});

$("cancel").addEventListener("click", async () => {
  const res = await api.cancelSync();
  msg("sync-msg", res.ok ? "Wird abgebrochen …" : res.message, !res.ok);
});

$("sched-save").addEventListener("click", async () => {
  const res = await api.setSchedule({ enabled: $("sched-on").checked, time: $("sched-time").value });
  msg("sync-msg", res.ok ? (res.enabled ? `Täglich um ${res.time}.` : "Täglicher Sync aus.") : res.message, !res.ok);
});

$("files-reload").addEventListener("click", renderFiles);

$("logout").addEventListener("click", async () => {
  await api.logout();
  courses = [];
  renderCourses();
  await refreshStatus();
});

let wasRunning = false;
api.onSyncState((state) => {
  renderSync(state);
  if (wasRunning && !state.running) {
    renderFiles();
    refreshStatus();
  }
  wasRunning = Boolean(state.running);
});

const hinweis = new URLSearchParams(window.location.search).get("hinweis");
if (hinweis) {
  $("hinweis").hidden = false;
  $("hinweis").textContent = `${hinweis} Zeige das Testfenster. (Oberfläche starten: npm run dev in web/)`;
}

refreshStatus().then(renderFiles);
