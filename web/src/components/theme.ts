// Erscheinungsbild: "system" folgt dem Mac, "light"/"dark" erzwingen es.
// Gespeichert im Browser-Speicher, gesetzt als data-theme am <html> (siehe globals.css).

export type Theme = "system" | "light" | "dark";

const KEY = "studi-theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const t = window.localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  try {
    if (t === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, t);
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neustart
  }
}

// Läuft vor dem ersten Bild (in layout.tsx), damit nichts kurz hell aufblitzt.
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
