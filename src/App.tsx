import { useCallback, useEffect, useState } from "react";
import { api, applyTheme, settings, type Settings as SettingsData } from "./lib/api";
import { Dashboard } from "./components/Dashboard";
import { Onboarding } from "./components/Onboarding";
import { Settings } from "./components/Settings";

type View = "dashboard" | "settings";

export default function App() {
  const [cfg, setCfg] = useState<SettingsData | null>(null);
  const [consented, setConsented] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("dashboard");

  const refresh = useCallback(() => {
    settings.get().then((s) => {
      setCfg(s);
      setConsented(s.consented);
      applyTheme(s.theme);
    });
  }, []);

  useEffect(() => {
    refresh();
    const un = settings.onNavigate((v) => {
      if (v === "settings" || v === "dashboard") setView(v);
    });
    // Consent can change from Settings; keep the gate in sync with the tracker.
    const un2 = api.onTrackerState((t) => setConsented(t.consented));
    return () => {
      un.then((f) => f());
      un2.then((f) => f());
    };
  }, [refresh]);

  // Follow OS theme changes while set to "system".
  useEffect(() => {
    if (cfg?.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [cfg?.theme]);

  if (!cfg || consented === null) return null;

  if (!consented) {
    return (
      <Onboarding
        dataDir={cfg.dataDir}
        onDone={() => {
          setConsented(true);
          setView("dashboard");
        }}
      />
    );
  }

  return view === "settings" ? (
    <Settings
      initial={cfg}
      onBack={() => {
        refresh();
        setView("dashboard");
      }}
      onChanged={() => {}}
    />
  ) : (
    <Dashboard onOpenSettings={() => setView("settings")} />
  );
}
