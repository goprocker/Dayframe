import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  version: string;
  schemaVersion: number;
}

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
};
