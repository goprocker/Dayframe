import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AppInfo {
  version: string;
  schemaVersion: number;
}

export type TrackerStatus =
  | "active"
  | "idle"
  | "paused"
  | "locked"
  | "excluded"
  | "unknown";

export interface TrackerState {
  status: TrackerStatus | null;
  consented: boolean;
  paused: boolean;
  appName: string | null;
  sessionStartMs: number | null;
}

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
  trackerState: () => invoke<TrackerState>("tracker_state"),
  setTrackingConsent: (consented: boolean) =>
    invoke<void>("set_tracking_consent", { consented }),
  setTrackingPaused: (paused: boolean) =>
    invoke<void>("set_tracking_paused", { paused }),
  onTrackerState: (cb: (s: TrackerState) => void): Promise<UnlistenFn> =>
    listen<TrackerState>("tracker://state", (e) => cb(e.payload)),
};

export interface AppUsage {
  appId: number;
  name: string;
  category: string;
  seconds: number;
  sessions: number;
}

export interface DaySummary {
  from: number;
  to: number;
  totalSeconds: number;
  switches: number;
  longest: { appId: number; name: string; seconds: number; start: number } | null;
  apps: AppUsage[];
  hourly: number[];
  timeline: { appId: number; start: number; end: number }[];
}

export const stats = {
  day: (from: number, to: number) =>
    invoke<DaySummary>("day_summary", { from, to }),
  rangeTotals: (bounds: number[]) =>
    invoke<number[]>("range_totals", { bounds }),
  icons: () => invoke<Record<string, string>>("app_icons"),
  range: (bounds: number[]) => invoke<RangeSummary>("range_summary", { bounds }),
};

export interface RangeSummary {
  totalSeconds: number;
  activeDays: number;
  days: { from: number; totalSeconds: number; categories: Record<string, number> }[];
  categories: { name: string; seconds: number }[];
  apps: AppUsage[];
  hourOfDay: number[];
}

export const widget = {
  setEnabled: (enabled: boolean) => invoke<void>("set_widget_enabled", { enabled }),
  setExpanded: (expanded: boolean) => invoke<void>("set_widget_expanded", { expanded }),
  savePosition: (x: number, y: number) => invoke<void>("save_widget_position", { x, y }),
  openDashboard: () => invoke<void>("open_dashboard"),
};

export type Theme = "system" | "dark" | "light";

export interface Settings {
  consented: boolean;
  theme: Theme;
  idleThresholdMinutes: number;
  autostart: boolean;
  widget: boolean;
  dataDir: string;
  version: string;
  categories: string[];
}

export interface AppRow {
  id: number;
  name: string;
  path: string;
  category: string;
  excluded: boolean;
  firstSeenAt: number;
}

export const settings = {
  get: () => invoke<Settings>("get_settings"),
  setTheme: (theme: Theme) => invoke<void>("set_theme", { theme }),
  setIdleThreshold: (minutes: number) =>
    invoke<void>("set_idle_threshold", { minutes }),
  setAutostart: (enabled: boolean) =>
    invoke<void>("set_autostart", { enabled }),
  listApps: () => invoke<AppRow[]>("list_apps"),
  setAppExcluded: (id: number, excluded: boolean) =>
    invoke<void>("set_app_excluded", { id, excluded }),
  setAppCategory: (id: number, category: string) =>
    invoke<void>("set_app_category", { id, category }),
  deleteRange: (from: number, to: number) =>
    invoke<void>("delete_range", { from, to }),
  deleteAll: () => invoke<void>("delete_all_data"),
  onTheme: (cb: (theme: Theme) => void): Promise<UnlistenFn> =>
    listen<Theme>("theme", (e) => cb(e.payload)),
  onNavigate: (cb: (view: string) => void): Promise<UnlistenFn> =>
    listen<string>("navigate", (e) => cb(e.payload)),
};

/** Apply a theme to <html>; "system" follows the OS preference. */
export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
