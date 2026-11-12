import { describe, expect, it } from "vitest";
import { addDays, dayBounds, dayBoundsList, formatDuration } from "./time";

describe("time helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(3_725)).toBe("1h 02m");
  });

  it("day bounds start at local midnight and span one day", () => {
    const d = new Date(2026, 10, 12, 15, 30);
    const [from, to] = dayBounds(d);
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(to).getDate()).toBe(13);
  });

  it("builds ascending bounds for n days ending on d", () => {
    const d = new Date(2026, 10, 12, 9);
    const b = dayBoundsList(d, 7);
    expect(b).toHaveLength(8);
    expect(b[7]).toBe(addDays(new Date(2026, 10, 12), 1).getTime());
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]);
  });
});
