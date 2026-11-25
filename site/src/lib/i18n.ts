// Alle Texte der Website in beiden Sprachen. Die Mockups der App bleiben englisch,
// weil die App englisch ist; übersetzt wird nur, was die Website selbst sagt.

export type Lang = "en" | "de";

const en = {
  meta: {
    title: "Ordo: uni, sorted",
    description:
      "Ordo puts your ILIAS and Moodle files, deadlines and exams on your Mac, sorted and on time. Sign in once with your uni account.",
    og: "New slides land in the right folder on your Mac. Deadlines land in your week.",
  },
  nav: {
    home: "/",
    other: { label: "Deutsch", href: "/de", lang: "de" as Lang },
    download: "Download for Mac",
    appStore: "Mac App Store",
    linksLabel: "Sections",
    links: [
      { id: "files", label: "Files" },
      { id: "deadlines", label: "Deadlines" },
      { id: "reminders", label: "Reminders" },
      { id: "setup", label: "Setup" },
    ],
  },
  hero: {
    first: "Uni,",
    word: "sorted",
    size: "text-[clamp(76px,13.6vw,188px)]",
    sub: "New slides land in the right folder on your Mac. Deadlines land in your week. You stop digging through ILIAS and Moodle.",
    note: "For Macs with Apple silicon. Works with ILIAS and Moodle.",
  },
  stage: {
    in: "In",
    platform: "Learning platform",
    onMac: "On your Mac",
    caption: "Sorted at 07:00, while you were asleep. Spotlight finds them too.",
  },
  fine: {
    title: "Then it reads the fine print.",
    lead: "Ordo finds deadlines and exam dates in your course calendar and inside your exercise sheets, and puts them into your week. Every date says where it was found.",
  },
  week: {
    title: "Your week, at one glance.",
    lead: "Lectures, deadlines and exams in your course colours. Free days shrink so busy ones get the room. Tick off what you have handed in.",
  },
  reminders: {
    title: "And taps you on the shoulder.",
    lead: "The evening before a deadline and three hours before. A week before each exam, with a nudge to register, because being in the course is not enough.",
  },
  everyday: {
    title: "And the things you check ten times a day.",
    items: [
      { title: "Mail", text: "Uni mail and Gmail in one inbox. Mails from your lecturers show their course." },
      { title: "Mensa", text: "Today's menu with photos. Vegan and vegetarian at a glance." },
      { title: "Study", text: "Flashcards and one-page study sheets made from your own slides." },
      { title: "Places", text: "Libraries that are open right now and the walk to your lecture hall." },
    ],
  },
  stop: {
    title: "Things you can stop doing",
    lines: [
      { text: "Checking for new slides.", note: "Ordo fetches them every morning, even when it is closed." },
      { text: "Downloading Blatt_04 (2).pdf.", note: "Files land on your Mac, one folder per course." },
      { text: "Copying deadlines into a calendar.", note: "Found in your course calendar and inside your sheets." },
      { text: "Missing the exam registration.", note: "Ordo asks weeks ahead whether you registered." },
    ],
  },
  setup: {
    title: "Set up once. Then forget about it.",
    steps: [
      {
        title: "Sign in with your uni account.",
        text: "The same login as ILIAS or Moodle. Your password goes into your Mac's Keychain and nowhere else.",
      },
      {
        title: "Tap your courses.",
        text: "Ordo suggests this semester's courses. Lecture, exercise and your group become one course.",
      },
      {
        title: "That's it.",
        text: "Files and deadlines stay up to date on their own. The first download tells you how long it will take.",
      },
    ],
  },
  privacy: {
    strong: "Your password stays on your Mac.",
    rest: "Deadlines are found without AI. Files only leave your Mac when you ask for study help.",
  },
  download: {
    title: "Ordo for Mac",
    lead: "Sign in with your uni account, tap your courses, done. Ordo keeps itself up to date.",
    note: "For Macs with Apple silicon. Works with ILIAS and Moodle.",
  },
  footer: { made: "Made by two students in Cologne.", privacy: "Privacy", imprint: "Imprint", contact: "Contact" },
};

export type Dict = typeof en;

const de: Dict = {
  meta: {
    title: "Ordo: Uni, sortiert",
    description:
      "Ordo legt deine Dateien, Fristen und Klausuren aus ILIAS und Moodle auf deinen Mac, sortiert und rechtzeitig. Einmal mit dem Uni-Konto anmelden.",
    og: "Neue Folien landen im richtigen Ordner auf deinem Mac. Fristen landen in deiner Woche.",
  },
  nav: {
    home: "/de",
    other: { label: "English", href: "/", lang: "en" },
    download: "Für Mac laden",
    appStore: "Mac App Store",
    linksLabel: "Abschnitte",
    links: [
      { id: "files", label: "Dateien" },
      { id: "deadlines", label: "Fristen" },
      { id: "reminders", label: "Erinnerungen" },
      { id: "setup", label: "Einrichtung" },
    ],
  },
  hero: {
    first: "Uni,",
    word: "sortiert",
    size: "text-[clamp(68px,11.4vw,158px)]",
    sub: "Neue Folien landen im richtigen Ordner auf deinem Mac. Fristen landen in deiner Woche. Du musst dich nicht mehr durch ILIAS und Moodle klicken.",
    note: "Für Macs mit Apple Silicon. Funktioniert mit ILIAS und Moodle.",
  },
  stage: {
    in: "In",
    platform: "Lernplattform",
    onMac: "Auf deinem Mac",
    caption: "Um 07:00 sortiert, während du noch geschlafen hast. Spotlight findet sie auch.",
  },
  fine: {
    title: "Dann liest es das Kleingedruckte.",
    lead: "Ordo findet Abgabetermine und Klausurdaten im Kurskalender und in deinen Übungsblättern und trägt sie in deine Woche ein. Bei jedem Termin steht, wo er gefunden wurde.",
  },
  week: {
    title: "Deine Woche auf einen Blick.",
    lead: "Vorlesungen, Abgaben und Klausuren in den Farben deiner Kurse. Freie Tage werden schmal, damit volle Tage Platz haben. Was du abgegeben hast, hakst du ab.",
  },
  reminders: {
    title: "Und tippt dir auf die Schulter.",
    lead: "Am Abend vor einer Abgabe und drei Stunden vorher. Eine Woche vor jeder Klausur, mit der Frage, ob du angemeldet bist. Im Kurs eingetragen zu sein, reicht nämlich nicht.",
  },
  everyday: {
    title: "Und alles, wo du zehnmal am Tag nachschaust.",
    items: [
      { title: "Mail", text: "Uni-Mail und Gmail in einem Postfach. Mails deiner Dozenten zeigen ihren Kurs." },
      { title: "Mensa", text: "Der Speiseplan von heute mit Fotos. Vegan und vegetarisch auf einen Blick." },
      { title: "Lernen", text: "Karteikarten und einseitige Lernzettel aus deinen eigenen Folien." },
      { title: "Orte", text: "Bibliotheken, die gerade offen haben, und der Weg zu deinem Hörsaal." },
    ],
  },
  stop: {
    title: "Was du dir sparen kannst",
    lines: [
      { text: "Nach neuen Folien suchen.", note: "Ordo holt sie jeden Morgen, auch wenn die App zu ist." },
      { text: "Blatt_04 (2).pdf herunterladen.", note: "Dateien landen auf deinem Mac, ein Ordner pro Kurs." },
      { text: "Fristen in den Kalender abtippen.", note: "Gefunden im Kurskalender und in deinen Blättern." },
      { text: "Die Klausuranmeldung verpassen.", note: "Ordo fragt Wochen vorher, ob du angemeldet bist." },
    ],
  },
  setup: {
    title: "Einmal einrichten. Dann vergessen.",
    steps: [
      {
        title: "Mit dem Uni-Konto anmelden.",
        text: "Dieselbe Anmeldung wie bei ILIAS oder Moodle. Dein Passwort liegt im Schlüsselbund deines Macs und nirgends sonst.",
      },
      {
        title: "Kurse antippen.",
        text: "Ordo schlägt die Kurse dieses Semesters vor. Vorlesung, Übung und deine Gruppe werden zu einem Kurs.",
      },
      {
        title: "Fertig.",
        text: "Dateien und Fristen bleiben von selbst aktuell. Beim ersten Laden siehst du, wie lange es dauert.",
      },
    ],
  },
  privacy: {
    strong: "Dein Passwort bleibt auf deinem Mac.",
    rest: "Fristen findet Ordo ohne KI. Dateien verlassen deinen Mac nur, wenn du Lernhilfe möchtest.",
  },
  download: {
    title: "Ordo für Mac",
    lead: "Mit dem Uni-Konto anmelden, Kurse antippen, fertig. Ordo hält sich selbst aktuell.",
    note: "Für Macs mit Apple Silicon. Funktioniert mit ILIAS und Moodle.",
  },
  footer: { made: "Gemacht von zwei Studierenden in Köln.", privacy: "Datenschutz", imprint: "Impressum", contact: "Kontakt" },
};

export const dict: Record<Lang, Dict> = { en, de };

// Gemerkte Sprachwahl (nur für den Hinweis „Auch auf Deutsch“)
export const LANG_KEY = "ordo.lang";
export function rememberLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
}
