// Renders real Dayframe screens with a mocked Tauri backend and sample data,
// for the guide's screenshots. Not part of the app bundle.
// Usage (vite dev server): /docs/guide/shots/shot.html?view=dashboard&theme=dark
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../../src/index.css";
import { applyTheme, type Theme } from "../../../src/lib/api";
import { ICONS } from "./icons";

const q = new URLSearchParams(location.search);
const view = q.get("view") ?? "dashboard";
const theme = (q.get("theme") ?? "dark") as Theme;
const isWidget = view.startsWith("widget");

const APPS = [
  { id: 1, key: "code", name: "Visual Studio Code", category: "Development", path: "C:\\Users\\you\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe" },
  { id: 2, key: "chrome", name: "Google Chrome", category: "Browsing", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
  { id: 3, key: "outlook", name: "Microsoft Outlook", category: "Communication", path: "C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE" },
  { id: 4, key: "word", name: "Microsoft Word", category: "Productivity", path: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE" },
  { id: 5, key: "pwsh", name: "Windows PowerShell", category: "Development", path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" },
  { id: 6, key: "excel", name: "Microsoft Excel", category: "Productivity", path: "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE" },
  { id: 7, key: "spotify", name: "Spotify", category: "Entertainment", path: "C:\\Users\\you\\AppData\\Roaming\\Spotify\\Spotify.exe" },
  { id: 8, key: "edge", name: "Microsoft Edge", category: "Browsing", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
  { id: 9, key: "explorer", name: "Windows Explorer", category: "System", path: "C:\\Windows\\explorer.exe" },
  { id: 10, key: "notepad", name: "Notepad", category: "Productivity", path: "C:\\Windows\\System32\\notepad.exe" },
];
const byId = new Map(APPS.map((a) => [a.id, a]));

// A plausible working day: [appId, start "HH:MM", end "HH:MM"].
const DAY: [number, string, string][] = [
  [3, "08:42", "08:58"], [2, "08:58", "09:12"], [1, "09:12", "10:31"], [5, "10:31", "10:44"],
  [1, "10:44", "11:20"], [2, "11:20", "11:41"], [3, "11:41", "11:52"], [1, "11:52", "12:30"],
  [7, "13:18", "13:31"], [4, "13:31", "14:22"], [2, "14:22", "14:40"], [6, "14:40", "15:05"],
  [1, "15:05", "16:23"], [9, "16:23", "16:29"], [5, "16:29", "16:47"], [8, "16:47", "17:02"],
  [1, "17:02", "17:48"], [10, "17:48", "17:55"], [3, "17:55", "18:12"], [2, "18:12", "18:26"],
];

const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const at = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return midnight.getTime() + (h * 60 + m) * 60_000; };

function daySummary(from: number, to: number, scale = 1) {
  const today = from === midnight.getTime();
  const shift = from - midnight.getTime();
  const iv = DAY.map(([id, s, e]) => ({ appId: id, start: at(s) + shift, end: at(s) + shift + (at(e) - at(s)) * scale }));
  const usage = new Map<number, { seconds: number; sessions: number }>();
  const hourly = Array(24).fill(0);
  for (const i of iv) {
    const u = usage.get(i.appId) ?? { seconds: 0, sessions: 0 };
    u.seconds += (i.end - i.start) / 1000; u.sessions += 1; usage.set(i.appId, u);
    for (let t = i.start; t < i.end; ) {
      const b = Math.floor((t - from) / 3_600_000); const be = from + (b + 1) * 3_600_000; const se = Math.min(i.end, be);
      hourly[b] += (se - t) / 1000; t = se;
    }
  }
  const apps = [...usage].map(([id, u]) => ({ appId: id, name: byId.get(id)!.name, category: byId.get(id)!.category, seconds: Math.round(u.seconds), sessions: u.sessions })).sort((a, b) => b.seconds - a.seconds);
  const longest = iv.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  const total = apps.reduce((s, a) => s + a.seconds, 0);
  return {
    from, to, totalSeconds: today ? total : total, switches: iv.length - 1,
    longest: { appId: longest.appId, name: byId.get(longest.appId)!.name, seconds: (longest.end - longest.start) / 1000, start: longest.start },
    apps, hourly: hourly.map(Math.round), timeline: iv,
  };
}

// Day-to-day variation for the week strip and analytics.
const FACTORS = [0.92, 1.05, 0.81, 1.1, 0.97, 0.35, 0.18, 0.88, 1.02, 0.95, 1.08, 0.9, 0.3, 0.12];
const factor = (from: number) => {
  const n = Math.round((midnight.getTime() - from) / 86_400_000);
  return n === 0 ? 1 : FACTORS[(n - 1) % FACTORS.length];
};

function rangeSummary(bounds: number[]) {
  const days = bounds.slice(0, -1).map((f, i) => daySummary(f, bounds[i + 1], factor(f)));
  const apps = new Map<number, any>(); const cats = new Map<string, number>(); const hod = Array(24).fill(0);
  const outDays = days.map((d) => {
    const c: Record<string, number> = {};
    for (const a of d.apps) {
      c[a.category] = (c[a.category] ?? 0) + a.seconds;
      cats.set(a.category, (cats.get(a.category) ?? 0) + a.seconds);
      const u = apps.get(a.appId) ?? { ...a, seconds: 0, sessions: 0 };
      u.seconds += a.seconds; u.sessions += a.sessions; apps.set(a.appId, u);
    }
    d.hourly.forEach((s, h) => (hod[h] += s));
    return { from: d.from, totalSeconds: d.totalSeconds, categories: c };
  });
  return {
    totalSeconds: days.reduce((s, d) => s + d.totalSeconds, 0),
    activeDays: days.filter((d) => d.totalSeconds > 0).length,
    days: outDays,
    categories: [...cats].map(([name, seconds]) => ({ name, seconds })).sort((a, b) => b.seconds - a.seconds),
    apps: [...apps.values()].sort((a, b) => b.seconds - a.seconds),
    hourOfDay: hod,
  };
}

const CATEGORIES = ["Development", "Browsing", "Communication", "Design", "Productivity", "Entertainment", "System", "Other"];

mockWindows(isWidget ? "widget" : "main");
mockIPC(
  (cmd, args: any) => {
    switch (cmd) {
      case "get_settings":
        return { consented: view !== "onboarding", theme, idleThresholdMinutes: 5, autostart: true, widget: true, dataDir: "C:\\Users\\you\\AppData\\Roaming\\com.dayframe.app", version: "0.1.0", categories: CATEGORIES };
      case "tracker_state":
        return { status: "active", consented: true, paused: false, appName: "Visual Studio Code", sessionStartMs: Date.now() - (24 * 60 + 7) * 1000 };
      case "day_summary":
        return daySummary(args.from, args.to, factor(args.from));
      case "range_totals":
        return (args.bounds as number[]).slice(0, -1).map((f, i) => daySummary(f, args.bounds[i + 1], factor(f)).totalSeconds);
      case "range_summary":
        return rangeSummary(args.bounds);
      case "app_icons":
        return Object.fromEntries(APPS.map((a) => [a.id, ICONS[a.key]]));
      case "list_apps":
        return APPS.map((a) => ({ id: a.id, name: a.name, path: a.path, category: a.category, excluded: a.id === 7, firstSeenAt: 0 }));
      case "app_info":
        return { version: "0.1.0", schemaVersion: 1 };
      default:
        return null;
    }
  },
  { shouldMockEvents: true },
);

applyTheme(theme);
if (isWidget) {
  // Headless browsers won't open a window this small, so pin the root to the
  // real widget size (248×44 collapsed, 280×236 expanded) and crop later.
  document.documentElement.classList.add("widget");
  const open = view === "widget-open";
  Object.assign(document.getElementById("root")!.style, {
    width: open ? "280px" : "248px",
    height: open ? "236px" : "44px",
  });
}

async function main() {
  const root = createRoot(document.getElementById("root")!);
  if (view === "dashboard") {
    const { Dashboard } = await import("../../../src/components/Dashboard");
    root.render(<Dashboard onOpenSettings={() => {}} onOpenAnalytics={() => {}} />);
  } else if (view === "analytics") {
    const { Analytics } = await import("../../../src/components/Analytics");
    root.render(<Analytics onBack={() => {}} />);
  } else if (view === "settings") {
    const { Settings } = await import("../../../src/components/Settings");
    const { settings } = await import("../../../src/lib/api");
    root.render(<Settings initial={await settings.get()} onBack={() => {}} onChanged={() => {}} />);
  } else if (view === "onboarding") {
    const { Onboarding } = await import("../../../src/components/Onboarding");
    root.render(<Onboarding dataDir="C:\Users\you\AppData\Roaming\com.dayframe.app" onDone={() => {}} />);
  } else {
    const { Widget } = await import("../../../src/components/Widget");
    root.render(<Widget />);
    if (view === "widget-open") {
      setTimeout(() => (document.querySelector('button[aria-label="Expand"]') as HTMLButtonElement)?.click(), 300);
    }
  }
}
main();
