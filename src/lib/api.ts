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
};
