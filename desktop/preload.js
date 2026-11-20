// Brücke zwischen Oberfläche und Hintergrundteil. Stellt window.studi bereit.
// Typen und Beschreibung: web/src/lib/desktop.ts. Hier nichts anderes freigeben.

const { contextBridge, ipcRenderer } = require("electron");

const call =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("studi", {
  isDesktop: true,
  getStatus: call("studi:getStatus"),
  login: call("studi:login"),
  logout: call("studi:logout"),
  listCourses: call("studi:listCourses"),
  saveSetup: call("studi:saveSetup"),
  chooseFolder: call("studi:chooseFolder"),
  startSync: call("studi:startSync"),
  cancelSync: call("studi:cancelSync"),
  getSyncState: call("studi:getSyncState"),
  getRuns: call("studi:getRuns"),
  getFiles: call("studi:getFiles"),
  openFile: call("studi:openFile"),
  revealFile: call("studi:revealFile"),
  setSchedule: call("studi:setSchedule"),
  getDoneDeadlines: call("studi:getDoneDeadlines"),
  setDeadlineDone: call("studi:setDeadlineDone"),
  onSyncState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("studi:syncState", listener);
    return () => ipcRenderer.removeListener("studi:syncState", listener);
  },
});
