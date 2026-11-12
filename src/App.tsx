import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { api, type AppInfo, type TrackerState } from "./lib/api";

// Foundation shell: proves the frontend ↔ Rust ↔ SQLite path works and
// exposes a temporary tracking toggle until onboarding consent (chunk 4).
// The real dashboard replaces this in chunk 3.
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [tracker, setTracker] = useState<TrackerState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.appInfo().then(setInfo).catch((e) => setError(String(e)));
    api.trackerState().then(setTracker).catch(() => {});
    const un = api.onTrackerState(setTracker);
    return () => {
      un.then((f) => f());
    };
  }, []);

  const btn =
    "rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm hover:text-accent";

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-surface-2 text-accent">
          <Clock size={20} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Dayframe</h1>
      </div>
      <p className="text-muted">See where your day went.</p>
      <div className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-muted">
        {error
          ? `Backend error: ${error}`
          : info
            ? `v${info.version} · database schema v${info.schemaVersion}`
            : "Connecting…"}
      </div>
      {tracker && (
        <div className="flex flex-col items-center gap-2 text-sm">
          <div className="text-muted">
            Tracking:{" "}
            <span className="text-fg">
              {!tracker.consented ? "off" : tracker.status ?? "starting"}
            </span>
            {tracker.appName && <> · {tracker.appName}</>}
          </div>
          <div className="flex gap-2">
            <button
              className={btn}
              onClick={() => api.setTrackingConsent(!tracker.consented)}
            >
              {tracker.consented ? "Disable tracking" : "Enable tracking (dev)"}
            </button>
            {tracker.consented && (
              <button
                className={btn}
                onClick={() => api.setTrackingPaused(!tracker.paused)}
              >
                {tracker.paused ? "Resume" : "Pause"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
