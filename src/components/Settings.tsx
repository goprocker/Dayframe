import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  api,
  applyTheme,
  settings as sapi,
  widget,
  type AppRow,
  type Settings as SettingsData,
  type Theme,
} from "../lib/api";
import { addDays, startOfDay } from "../lib/time";

export function Settings({
  initial,
  onBack,
  onChanged,
}: {
  initial: SettingsData;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [s, setS] = useState(initial);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    sapi.listApps().then(setApps).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    try {
      await fn();
      if (ok) setMsg(ok);
      onChanged();
    } catch (e) {
      setMsg(`Error: ${e}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <header className="flex items-center gap-2">
          <button
            onClick={onBack}
            aria-label="Back to dashboard"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
          {msg && <span className="ml-auto text-sm text-muted">{msg}</span>}
        </header>

        <Card title="Appearance">
          <Row label="Theme">
            <Segmented
              value={s.theme}
              options={[
                ["system", "System"],
                ["dark", "Dark"],
                ["light", "Light"],
              ]}
              onChange={(theme) =>
                run(async () => {
                  await sapi.setTheme(theme as Theme);
                  applyTheme(theme as Theme);
                  setS({ ...s, theme: theme as Theme });
                })
              }
            />
          </Row>
        </Card>

        <Card title="Tracking">
          <Row
            label="Idle threshold"
            hint="After this long without keyboard or mouse input, time stops counting from the moment input stopped."
          >
            <select
              className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-sm"
              value={s.idleThresholdMinutes}
              onChange={(e) => {
                const m = Number(e.target.value);
                run(async () => {
                  await sapi.setIdleThreshold(m);
                  setS({ ...s, idleThresholdMinutes: m });
                }, "Idle threshold saved");
              }}
            >
              {[1, 2, 3, 5, 10, 15, 30].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Row>
          <Row
            label="Floating widget"
            hint="A small always-on-top pill with the current app and session time. Hidden while a fullscreen app is in front."
          >
            <Toggle
              checked={s.widget}
              onChange={(v) =>
                run(async () => {
                  await widget.setEnabled(v);
                  setS({ ...s, widget: v });
                })
              }
            />
          </Row>
          <Row label="Start with Windows" hint="Starts minimized to the tray.">
            <Toggle
              checked={s.autostart}
              onChange={(v) =>
                run(async () => {
                  await sapi.setAutostart(v);
                  setS({ ...s, autostart: v });
                })
              }
            />
          </Row>
          <Row
            label="Tracking consent"
            hint="Withdrawing consent stops tracking immediately. Existing data is kept until you delete it."
          >
            <ConfirmButton
              label="Withdraw consent"
              confirmLabel="Stop tracking?"
              onConfirm={() =>
                run(async () => {
                  await api.setTrackingConsent(false);
                })
              }
            />
          </Row>
        </Card>

        <Card title="Applications">
          <p className="mb-3 text-xs text-muted">
            Excluded apps are never recorded. Categories are used in analytics.
          </p>
          {apps.length === 0 ? (
            <p className="text-sm text-muted">No applications seen yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate ${a.excluded ? "text-muted line-through" : ""}`}>
                      {a.name}
                    </div>
                    <div className="truncate text-[11px] text-muted">{a.path}</div>
                  </div>
                  <select
                    className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs"
                    value={a.category}
                    onChange={(e) => {
                      const category = e.target.value;
                      run(async () => {
                        await sapi.setAppCategory(a.id, category);
                        setApps(apps.map((x) => (x.id === a.id ? { ...x, category } : x)));
                      });
                    }}
                  >
                    {s.categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <Toggle
                      checked={a.excluded}
                      onChange={(excluded) =>
                        run(async () => {
                          await sapi.setAppExcluded(a.id, excluded);
                          setApps(apps.map((x) => (x.id === a.id ? { ...x, excluded } : x)));
                        })
                      }
                    />
                    Exclude
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Data">
          <DeleteRange onDelete={(from, to) => run(() => sapi.deleteRange(from, to), "Range deleted")} />
          <Row label="Delete all data" hint="Removes every session and application. Settings are kept.">
            <ConfirmButton
              label="Delete everything"
              confirmLabel="Really delete all?"
              onConfirm={() =>
                run(async () => {
                  await sapi.deleteAll();
                  setApps([]);
                }, "All data deleted")
              }
            />
          </Row>
          <Row label="Storage location">
            <code className="break-all text-xs text-muted">{s.dataDir}\dayframe.db</code>
          </Row>
        </Card>

        <Card title="Privacy">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Only the foreground app's name, path and icon, plus timing, are recorded.</li>
            <li>Window titles, URLs, keystrokes, clipboard and screen contents are never collected.</li>
            <li>Everything stays in the local database above. Nothing leaves this PC.</li>
          </ul>
        </Card>

        <p className="pb-4 text-center text-xs text-muted">Dayframe v{s.version}</p>
      </div>
    </div>
  );
}

function DeleteRange({ onDelete }: { onDelete: (from: number, to: number) => void }) {
  const today = toInput(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const parse = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const valid = from && to && parse(from) <= parse(to);
  return (
    <Row label="Delete a date range" hint="Both days included.">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          max={today}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs"
        />
        <span className="text-xs text-muted">to</span>
        <input
          type="date"
          value={to}
          max={today}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs"
        />
        <ConfirmButton
          label="Delete"
          confirmLabel="Confirm delete"
          disabled={!valid}
          onConfirm={() =>
            onDelete(
              startOfDay(parse(from)).getTime(),
              addDays(startOfDay(parse(to)), 1).getTime(),
            )
          }
        />
      </div>
    </Row>
  );
}

function toInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Two-step destructive button; avoids native confirm() dialogs. */
function ConfirmButton(props: {
  label: string;
  confirmLabel: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      disabled={props.disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          props.onConfirm();
        } else setArmed(true);
      }}
      className={`rounded-lg border px-3 py-1 text-xs disabled:opacity-40 ${
        armed
          ? "border-red-500 bg-red-500 text-white"
          : "border-line bg-surface-2 text-red-400 hover:border-red-500"
      }`}
    >
      {armed ? props.confirmLabel : props.label}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Segmented(props: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg border border-line bg-surface-2 p-0.5">
      {props.options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => props.onChange(v)}
          className={`rounded-md px-3 py-1 text-xs ${
            props.value === v ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm">{props.label}</div>
        {props.hint && <div className="max-w-md text-xs text-muted">{props.hint}</div>}
      </div>
      {props.children}
    </div>
  );
}
