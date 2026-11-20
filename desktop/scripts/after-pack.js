// electron-builder lässt node_modules in extraResources weg. Der Next-Standalone-Server braucht sie,
// deshalb kopiert dieser Hook build-resources/ui vollständig nach <App>/Contents/Resources/ui.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

/** Stand des Builds für den Update-Knopf (lib/updater.js): Commit, Zeit, Nachricht. */
function buildInfo() {
  const git = (...args) => {
    try {
      return execFileSync("git", args, { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };
  const sha = process.env.GITHUB_SHA || git("rev-parse", "HEAD") || "unknown";
  return {
    sha,
    committedAt: git("log", "-1", "--format=%cI", sha) || new Date().toISOString(),
    message: git("log", "-1", "--format=%s", sha),
    builtAt: new Date().toISOString(),
    // Lokaler Build mit nicht committeten Änderungen
    dirty: !process.env.CI && git("status", "--porcelain") !== "",
  };
}

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
  const resources = path.join(context.appOutDir, appName, "Contents", "Resources");
  fs.writeFileSync(path.join(resources, "build-info.json"), JSON.stringify(buildInfo(), null, 2));
  if (!fs.existsSync(path.join(target, "node_modules", "next"))) {
    throw new Error("UI-Server unvollständig: node_modules/next fehlt");
  }
};
