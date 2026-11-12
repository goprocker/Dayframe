import { useState } from "react";
import type { DaySummary } from "../lib/api";
import { appColor } from "../lib/colors";
import { formatClock, formatDuration } from "../lib/time";

/** Horizontal day strip: one coloured block per merged session. */
export function Timeline({
  day,
  names,
}: {
  day: DaySummary;
  names: Map<number, string>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const span = day.to - day.from;
  const pct = (t: number) => ((t - day.from) / span) * 100;
  const hours = day.hourly.length;
  const b = hover !== null ? day.timeline[hover] : null;

  return (
    <div>
      <div
        className="relative h-10 overflow-hidden rounded-lg bg-surface-2"
        onMouseLeave={() => setHover(null)}
      >
        {day.timeline.map((blk, i) => (
          <div
            key={i}
            className="absolute inset-y-0 transition-opacity"
            style={{
              left: `${pct(blk.start)}%`,
              width: `max(${pct(blk.end) - pct(blk.start)}%, 1px)`,
              background: appColor(blk.appId),
              opacity: hover === null || hover === i ? 1 : 0.45,
            }}
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        {[0, 6, 12, 18].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
        <span>{String(hours).padStart(2, "0")}:00</span>
      </div>
      <div className="mt-2 h-5 text-sm text-muted">
        {b ? (
          <>
            <span className="text-fg">{names.get(b.appId) ?? "Unknown"}</span>
            {" · "}
            {formatClock(b.start)}–{formatClock(b.end)}
            {" · "}
            {formatDuration((b.end - b.start) / 1000)}
          </>
        ) : (
          "Hover the timeline to see sessions."
        )}
      </div>
    </div>
  );
}
