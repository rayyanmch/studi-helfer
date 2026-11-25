// Node-Auflöser für den Prüfstand: TS-Dateien in web/src/lib importieren einander ohne Endung („./doctype“).
// Next.js löst das selbst auf, Node nicht; hier wird „.ts“ ergänzt, wenn die Datei ohne Endung fehlt.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw err;
  }
}
