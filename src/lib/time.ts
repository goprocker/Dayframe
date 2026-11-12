/** Local-calendar helpers. All timestamps are UTC milliseconds. */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** [from, to) for the local day containing `d` (23/25 h on DST days). */
export function dayBounds(d: Date): [number, number] {
  const s = startOfDay(d);
  return [s.getTime(), addDays(s, 1).getTime()];
}

/** n+1 local midnights ending with the day after `d`: n day ranges. */
export function dayBoundsList(d: Date, n: number): number[] {
  const end = addDays(startOfDay(d), 1);
  return Array.from({ length: n + 1 }, (_, i) =>
    addDays(end, i - n).getTime(),
  );
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayLabel(d: Date, today = new Date()): string {
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, addDays(today, -1))) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
