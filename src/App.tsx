import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { api, type AppInfo } from "./lib/api";

// Foundation shell: proves the frontend ↔ Rust ↔ SQLite path works.
// The real dashboard replaces this in chunk 3.
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.appInfo().then(setInfo).catch((e) => setError(String(e)));
  }, []);

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
    </main>
  );
}
