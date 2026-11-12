import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  Pause,
  Play,
  Repeat,
  Timer,
} from "lucide-react";
import { api, stats, type DaySummary, type TrackerState } from "../lib/api";
import { appColor } from "../lib/colors";
import {
  addDays,
  dayBounds,
  dayBoundsList,
  formatDayLabel,
  formatDuration,
  isSameDay,
  startOfDay,
} from "../lib/time";
import { AppIcon } from "./AppIcon";
import { Timeline } from "./Timeline";

const REFRESH_MS = 30_000;

const STATUS_LABEL: Record<string, string> = {
  active: "Tracking",
  idle: "Idle",
  paused: "Paused",
  locked: "Locked",
  excluded: "Excluded app",
  unknown: "Waiting",
};

export function Dashboard() {
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [day, setDay] = useState<DaySummary | null>(null);
  const [week, setWeek] = useState<number[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [tracker, setTracker] = useState<TrackerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iconsRef = useRef(icons);
  iconsRef.current = icons;
  const isToday = isSameDay(date, new Date());

  const load = useCallback(async () => {
    try {
      const [from, to] = dayBounds(date);
      const [d, w] = await Promise.all([
        stats.day(from, to),
        stats.rangeTotals(dayBoundsList(date, 7)),
      ]);
      setDay(d);
      setWeek(w);
      setError(null);
      if (d.apps.some((a) => !(String(a.appId) in iconsRef.current))) {
        stats.icons().then(setIcons).catch(() => {});
      }
    } catch (e) {
      setError(String(e));
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh today's view periodically, but only while the window is visible.
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isToday, load]);

  useEffect(() => {
    api.trackerState().then(setTracker).catch(() => {});
    const un = api.onTrackerState(setTracker);
    return () => {
      un.then((f) => f());
    };
  }, []);

  const names = useMemo(
    () => new Map(day?.apps.map((a) => [a.appId, a.name]) ?? []),
    [day],
  );
  const maxApp = day?.apps[0]?.seconds ?? 0;
  const maxHour = Math.max(1, ...(day?.hourly ?? [0]));
  const maxWeek = Math.max(1, ...week);
  const weekDays = dayBoundsList(date, 7)
    .slice(0, 7)
    .map((t) => new Date(t));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-surface-2 text-accent">
              <Clock size={16} />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Dayframe</h1>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <IconBtn label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft size={16} />
            </IconBtn>
            <input
              type="date"
              className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
              value={toInputValue(date)}
              max={toInputValue(new Date())}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split("-").map(Number);
                if (y) setDate(new Date(y, m - 1, d));
              }}
              aria-label="Pick a day"
            />
            <IconBtn
              label="Next day"
              disabled={isToday}
              onClick={() => setDate(addDays(date, 1))}
            >
              <ChevronRight size={16} />
            </IconBtn>
            {!isToday && (
              <button
                className="ml-1 rounded-lg px-2 py-1 text-sm text-accent hover:bg-surface-2"
                onClick={() => setDate(startOfDay(new Date()))}
              >
                Today
              </button>
            )}
          </div>
          <TrackerPill tracker={tracker} />
        </header>

        <h2 className="text-2xl font-semibold">{formatDayLabel(date)}</h2>

        {error && (
          <div className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
            Couldn't load data: {error}
          </div>
        )}

        {!day ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : day.totalSeconds === 0 ? (
          <EmptyState tracker={tracker} isToday={isToday} />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile
                icon={<Clock size={14} />}
                label="Active time"
                value={formatDuration(day.totalSeconds)}
              />
              <Tile
                icon={<LayoutGrid size={14} />}
                label="Apps used"
                value={String(day.apps.length)}
              />
              <Tile
                icon={<Repeat size={14} />}
                label="App switches"
                value={String(day.switches)}
              />
              <Tile
                icon={<Timer size={14} />}
                label="Longest session"
                value={day.longest ? formatDuration(day.longest.seconds) : "—"}
                sub={day.longest?.name}
              />
            </section>

            <Card title="Timeline">
              <Timeline day={day} names={names} />
            </Card>

            <div className="grid gap-5 md:grid-cols-[3fr_2fr]">
              <Card title="Applications">
                <ul className="flex flex-col gap-3">
                  {day.apps.map((a) => (
                    <li key={a.appId} className="flex items-center gap-3">
                      <AppIcon appId={a.appId} name={a.name} icon={icons[a.appId]} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate">{a.name}</span>
                          <span className="shrink-0 tabular-nums text-muted">
                            {formatDuration(a.seconds)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(a.seconds / Math.max(1, maxApp)) * 100}%`,
                              background: appColor(a.appId),
                            }}
                          />
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {a.category} · {a.sessions} session{a.sessions === 1 ? "" : "s"} ·{" "}
                          {Math.round((a.seconds / Math.max(1, day.totalSeconds)) * 100)}%
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="flex flex-col gap-5">
                <Card title="By hour">
                  <div className="flex h-24 items-end gap-[2px]">
                    {day.hourly.map((s, h) => (
                      <div
                        key={h}
                        className="flex-1 rounded-sm bg-accent"
                        style={{
                          height: `${Math.max(2, (s / maxHour) * 100)}%`,
                          opacity: s ? 1 : 0.15,
                        }}
                        title={`${String(h).padStart(2, "0")}:00 · ${formatDuration(s)}`}
                      />
                    ))}
                  </div>
                </Card>
                <Card title="Last 7 days">
                  <div className="flex h-24 items-end gap-2">
                    {week.map((s, i) => (
                      <button
                        key={i}
                        className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                        onClick={() => setDate(weekDays[i])}
                        title={`${weekDays[i].toLocaleDateString()} · ${formatDuration(s)}`}
                      >
                        <div
                          className={`w-full rounded-sm ${
                            i === 6 ? "bg-accent" : "bg-line group-hover:bg-muted"
                          }`}
                          style={{ height: `${Math.max(3, (s / maxWeek) * 100)}%` }}
                        />
                        <span className="text-[10px] text-muted">
                          {weekDays[i].toLocaleDateString([], { weekday: "narrow" })}
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function toInputValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function IconBtn(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Tile(props: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {props.icon}
        {props.label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{props.value}</div>
      {props.sub && <div className="truncate text-xs text-muted">{props.sub}</div>}
    </div>
  );
}

function TrackerPill({ tracker }: { tracker: TrackerState | null }) {
  if (!tracker) return null;
  if (!tracker.consented) {
    return (
      <button
        className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm hover:text-accent"
        onClick={() => api.setTrackingConsent(true)}
      >
        Enable tracking (dev)
      </button>
    );
  }
  const status = tracker.status ?? "unknown";
  const dot =
    status === "active"
      ? "bg-emerald-400"
      : status === "paused"
        ? "bg-amber-400"
        : "bg-zinc-500";
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="max-w-48 truncate">
        {STATUS_LABEL[status]}
        {status === "active" && tracker.appName ? ` · ${tracker.appName}` : ""}
      </span>
      <button
        aria-label={tracker.paused ? "Resume tracking" : "Pause tracking"}
        title={tracker.paused ? "Resume tracking" : "Pause tracking"}
        className="text-muted hover:text-fg"
        onClick={() => api.setTrackingPaused(!tracker.paused)}
      >
        {tracker.paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
    </div>
  );
}

function EmptyState({ tracker, isToday }: { tracker: TrackerState | null; isToday: boolean }) {
  let msg = "No activity was recorded on this day.";
  if (isToday) {
    msg = !tracker?.consented
      ? "Tracking is off. Enable it to start seeing where your day goes."
      : "Nothing yet today. Keep working and your apps will appear here.";
  }
  return (
    <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-line p-10 text-center">
      <div>
        <Clock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-muted">{msg}</p>
      </div>
    </div>
  );
}
