import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronDown, ChevronUp, LayoutDashboard, Pause, Play } from "lucide-react";
import {
  api,
  applyTheme,
  settings,
  stats,
  widget,
  type DaySummary,
  type TrackerState,
} from "../lib/api";
import { appColor } from "../lib/colors";
import { dayBounds, formatDuration } from "../lib/time";

const SUMMARY_MS = 30_000;

/** Elapsed h:mm:ss for the live session counter. */
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
}

const LABEL: Record<string, string> = {
  idle: "Idle",
  paused: "Paused",
  locked: "Locked",
  excluded: "Excluded app",
  unknown: "Waiting",
};

export function Widget() {
  const [tracker, setTracker] = useState<TrackerState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    settings.get().then((s) => applyTheme(s.theme)).catch(() => {});
    api.trackerState().then(setTracker).catch(() => {});
    const subs = [api.onTrackerState(setTracker), settings.onTheme(applyTheme)];

    // Persist the position once a drag settles.
    let t: ReturnType<typeof setTimeout> | undefined;
    const moved = getCurrentWindow().onMoved(({ payload }) => {
      clearTimeout(t);
      t = setTimeout(() => widget.savePosition(payload.x, payload.y), 600);
    });
    return () => {
      clearTimeout(t);
      [...subs, moved].forEach((u) => u.then((f) => f()));
    };
  }, []);

  const active = tracker?.status === "active" && tracker.sessionStartMs != null;

  // Tick the session counter only while something is being timed.
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // Today's totals are only needed in the expanded view.
  useEffect(() => {
    if (!expanded) return;
    const load = () => {
      const [from, to] = dayBounds(new Date());
      stats.day(from, to).then(setDay).catch(() => {});
    };
    load();
    const id = setInterval(load, SUMMARY_MS);
    return () => clearInterval(id);
  }, [expanded]);

  const toggle = async () => {
    const next = !expanded;
    // Grow the window before showing content; shrink after hiding it.
    if (next) await widget.setExpanded(true).catch(() => {});
    setExpanded(next);
    if (!next) await widget.setExpanded(false).catch(() => {});
  };

  const drag = (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  const status = tracker?.consented ? (tracker.status ?? "unknown") : "off";
  const dot =
    status === "active" ? "bg-emerald-400" : status === "paused" ? "bg-amber-400" : "bg-zinc-500";
  const title = active
    ? (tracker!.appName ?? "Tracking")
    : status === "off"
      ? "Tracking off"
      : LABEL[status];

  return (
    <div
      onMouseDown={drag}
      className={`flex h-full flex-col overflow-hidden border border-line bg-surface/95 text-fg ${
        expanded ? "rounded-2xl" : "rounded-full"
      }`}
    >
      <div className="flex h-[42px] shrink-0 items-center gap-2 pl-4 pr-1.5">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
        {active && (
          <span className="shrink-0 text-sm tabular-nums text-muted">
            {clock((now - tracker!.sessionStartMs!) / 1000)}
          </span>
        )}
        {tracker?.consented && (
          <Btn
            label={tracker.paused ? "Resume tracking" : "Pause tracking"}
            onClick={() => api.setTrackingPaused(!tracker.paused)}
          >
            {tracker.paused ? <Play size={14} /> : <Pause size={14} />}
          </Btn>
        )}
        <Btn label={expanded ? "Collapse" : "Expand"} onClick={toggle}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Btn>
      </div>

      {expanded && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-line px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">Today</span>
            <span className="text-lg font-semibold tabular-nums">
              {day ? formatDuration(day.totalSeconds) : "—"}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {day?.apps.slice(0, 3).map((a) => (
              <li key={a.appId} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2 shrink-0 rounded-sm"
                  style={{ background: appColor(a.appId) }}
                />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="tabular-nums text-muted">{formatDuration(a.seconds)}</span>
              </li>
            ))}
            {day && day.apps.length === 0 && (
              <li className="text-xs text-muted">Nothing tracked yet today.</li>
            )}
          </ul>
          <button
            onClick={() => widget.openDashboard()}
            className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-1.5 text-xs hover:text-accent"
          >
            <LayoutDashboard size={13} /> Open dashboard
          </button>
        </div>
      )}
    </div>
  );
}

function Btn(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
    >
      {props.children}
    </button>
  );
}
