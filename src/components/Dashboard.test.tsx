import { afterEach, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setters: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [typeof initial === "function" ? initial() : initial, setter];
  },
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current }),
}));

vi.mock("../lib/api", () => ({
  api: {},
  stats: { day: vi.fn(), rangeTotals: vi.fn(), icons: vi.fn() },
}));

import { Dashboard } from "./Dashboard";
import { stats } from "../lib/api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  hooks.effects.length = 0;
  hooks.setters.length = 0;
});

test("older refresh cannot replace newer dashboard data or errors", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  let rejectOld!: (error: Error) => void;
  vi.mocked(stats.day).mockReturnValueOnce(new Promise((_, reject) => {
    rejectOld = reject;
  }));
  const latest = { apps: [], totalSeconds: 42 } as unknown as Awaited<ReturnType<typeof stats.day>>;
  vi.mocked(stats.day).mockResolvedValueOnce(latest);
  vi.mocked(stats.rangeTotals).mockResolvedValue([42]);
  Dashboard({ onOpenSettings: vi.fn(), onOpenAnalytics: vi.fn() });
  const cleanup = hooks.effects[0]();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(hooks.setters[1]).toHaveBeenLastCalledWith(latest);
  rejectOld(new Error("old request failed"));
  await vi.advanceTimersByTimeAsync(0);
  expect(hooks.setters[5]).toHaveBeenLastCalledWith(null);
  if (cleanup) cleanup();
});

test("date effect cleanup ignores pending responses", async () => {
  vi.stubGlobal("document", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  let resolve!: (value: Awaited<ReturnType<typeof stats.day>>) => void;
  vi.mocked(stats.day).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  vi.mocked(stats.rangeTotals).mockResolvedValue([]);
  Dashboard({ onOpenSettings: vi.fn(), onOpenAnalytics: vi.fn() });
  const cleanup = hooks.effects[0]();
  if (cleanup) cleanup();
  resolve({ apps: [] } as unknown as Awaited<ReturnType<typeof stats.day>>);
  await Promise.resolve();
  await Promise.resolve();
  expect(hooks.setters[1]).toHaveBeenCalledTimes(1);
  expect(hooks.setters[1]).toHaveBeenCalledWith(null);
});
