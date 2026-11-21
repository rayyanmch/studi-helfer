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
  getDeadlines: call("studi:getDeadlines"),
  refreshDeadlines: call("studi:refreshDeadlines"),
  getDoneDeadlines: call("studi:getDoneDeadlines"),
  setDeadlineDone: call("studi:setDeadlineDone"),
  refreshAiDeadlines: call("studi:refreshAiDeadlines"),
  renameModule: call("studi:renameModule"),
  setModuleColor: call("studi:setModuleColor"),
  setSlotChoice: call("studi:setSlotChoice"),
  getCustomEvents: call("studi:getCustomEvents"),
  saveCustomEvent: call("studi:saveCustomEvent"),
  deleteCustomEvent: call("studi:deleteCustomEvent"),
  setEventHidden: call("studi:setEventHidden"),
  mensaThumb: call("studi:mensaThumb"),
  markSeen: call("studi:markSeen"),
  setNotifications: call("studi:setNotifications"),
  setLaunchAtLogin: call("studi:setLaunchAtLogin"),
  getCalendars: call("studi:getCalendars"),
  addCalendar: call("studi:addCalendar"),
  removeCalendar: call("studi:removeCalendar"),
  openIlias: call("studi:openIlias"),
  onCommand(callback) {
    const listener = (_event, cmd) => callback(cmd);
    ipcRenderer.on("studi:command", listener);
    return () => ipcRenderer.removeListener("studi:command", listener);
  },
  // Update-Knopf (desktop/lib/updater.js, Typen in web/src/lib/updates.ts)
  updates: {
    getState: call("studi:getUpdateState"),
    check: call("studi:checkForUpdate"),
    install: call("studi:installUpdate"),
    onState(callback) {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("studi:updateState", listener);
      return () => ipcRenderer.removeListener("studi:updateState", listener);
    },
  },
  // Google-Konto (desktop/lib/google.js, Typen in web/src/lib/google.ts)
  google: {
    status: call("studi:google:status"),
    connect: call("studi:google:connect"),
    disconnect: call("studi:google:disconnect"),
    events: call("studi:google:events"),
    mails: call("studi:google:mails"),
    modify: call("studi:google:modify"),
    send: call("studi:google:send"),
  },
  // Uni-Postfach mit dem ILIAS-Login (desktop/lib/unimail.js, Typen in web/src/lib/google.ts)
  unimail: {
    status: call("studi:unimail:status"),
    connect: call("studi:unimail:connect"),
    disconnect: call("studi:unimail:disconnect"),
    mails: call("studi:unimail:mails"),
    modify: call("studi:unimail:modify"),
    send: call("studi:unimail:send"),
  },
  // Lernbereich (desktop/lib/study.js, Typen in web/src/lib/study.ts)
  study: {
    status: call("studi:study:status"),
    get: call("studi:study:get"),
    analyze: call("studi:study:analyze"),
    cancel: call("studi:study:cancel"),
    review: call("studi:study:review"),
    resetCards: call("studi:study:resetCards"),
    sheets: call("studi:study:sheets"),
    createSheet: call("studi:study:createSheet"),
    deleteSheet: call("studi:study:deleteSheet"),
    openSheet: call("studi:study:openSheet"),
    sheetState: call("studi:study:sheetState"),
    weekTitles: call("studi:study:weekTitles"),
    suspend: call("studi:study:suspend"),
    exportAnki: call("studi:study:exportAnki"),
    onState(callback) {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("studi:study:state", listener);
      return () => ipcRenderer.removeListener("studi:study:state", listener);
    },
  },
  // Newsletter abbestellen (desktop/lib/mailtools.js)
  mailtools: {
    unsubscribe: call("studi:mail:unsubscribe"),
    saveAttachment: call("studi:mail:saveAttachment"),
  },
  onDeadlinesChanged(callback) {
    const listener = () => callback();
    ipcRenderer.on("studi:deadlinesChanged", listener);
    return () => ipcRenderer.removeListener("studi:deadlinesChanged", listener);
  },
  onSyncState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("studi:syncState", listener);
    return () => ipcRenderer.removeListener("studi:syncState", listener);
  },
});
