// electron-builder lässt node_modules in extraResources weg. Der Next-Standalone-Server braucht sie,
// deshalb kopiert dieser Hook build-resources/ui vollständig nach <App>/Contents/Resources/ui.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const target = path.join(context.appOutDir, appName, "Contents", "Resources", "ui");
  const source = path.join(__dirname, "..", "build-resources", "ui");
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => !path.basename(src).startsWith(".env"),
  });
  if (!fs.existsSync(path.join(target, "node_modules", "next"))) {
    throw new Error("UI-Server unvollständig: node_modules/next fehlt");
  }
};
