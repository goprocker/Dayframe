import { useState } from "react";
import { Check, Clock, EyeOff, HardDrive, Pause, X } from "lucide-react";
import { api } from "../lib/api";

/** First-run screen. Tracking never starts without the explicit checkbox. */
export function Onboarding({ dataDir, onDone }: { dataDir: string; onDone: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    try {
      await api.setTrackingConsent(true);
      onDone();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-surface-2 text-accent">
            <Clock size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to Dayframe</h1>
            <p className="text-muted">See where your day went.</p>
          </div>
        </div>

        <p className="text-sm text-muted">
          Dayframe records which application is in the foreground and for how long, so you can
          see how your time was spent. Before it starts, here is exactly what that means.
        </p>

        <Section icon={<Check size={16} />} title="What is tracked">
          <li>The foreground application's name, executable path and icon</li>
          <li>When you switch apps, and how long each stays in front</li>
          <li>Idle time (no keyboard or mouse input), lock and sleep — never counted as activity</li>
        </Section>

        <Section icon={<EyeOff size={16} />} title="What is never collected">
          <li>Window titles, document names, URLs or browsing history</li>
          <li>Keystrokes, clipboard, screenshots or screen contents</li>
          <li>Nothing is sent anywhere: no account, no cloud, no telemetry</li>
        </Section>

        <Section icon={<HardDrive size={16} />} title="Where your data lives">
          <li>
            A local SQLite database on this PC:
            <code className="mt-1 block break-all rounded bg-surface-2 px-2 py-1 text-xs">
              {dataDir}\dayframe.db
            </code>
          </li>
          <li>You can exclude apps or delete any range of data in Settings</li>
        </Section>

        <Section icon={<Pause size={16} />} title="You stay in control">
          <li>Pause anytime from the dashboard or the tray icon</li>
          <li>Closing the window keeps Dayframe in the tray; quit from the tray menu</li>
          <li>You can withdraw consent in Settings, which stops tracking immediately</li>
        </Section>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--accent)]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I understand what Dayframe tracks and agree to start recording my application usage
            on this computer.
          </span>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            disabled={!agreed || busy}
            onClick={start}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Start tracking
          </button>
          <span className="flex items-center gap-1 text-xs text-muted">
            <X size={12} /> Without consent, nothing is recorded.
          </span>
        </div>
      </div>
    </div>
  );
}

function Section(props: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span className="text-accent">{props.icon}</span>
        {props.title}
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{props.children}</ul>
    </section>
  );
}
