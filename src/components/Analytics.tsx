import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { stats, type RangeSummary } from "../lib/api";
import { appColor, categoryColor } from "../lib/colors";
import { dayBoundsList, formatDuration, startOfDay } from "../lib/time";

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

const axis = { fontSize: 11, fill: "var(--text-muted)" };
const tooltipStyle = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--text)",
  },
  itemStyle: { color: "var(--text)" },
  labelStyle: { color: "var(--text-muted)" },
  cursor: { fill: "var(--surface-2)" },
};
const hours = (s: number) => Math.round((s / 3600) * 10) / 10;
const fmt = (v: unknown) => formatDuration(Number(v) * 3600);

export function Analytics({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState<Range>(7);
  const [data, setData] = useState<RangeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    stats
      .range(dayBoundsList(startOfDay(new Date()), range))
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [range]);

  const cats = data?.categories.map((c) => c.name) ?? [];
  const daily = useMemo(
    () =>
      data?.days.map((d) => ({
        label: new Date(d.from).toLocaleDateString([], {
          weekday: range === 7 ? "short" : undefined,
          day: "numeric",
          month: range === 7 ? undefined : "short",
        }),
        ...Object.fromEntries(Object.entries(d.categories).map(([k, v]) => [k, hours(v)])),
      })) ?? [],
    [data, range],
  );
  const hourly = useMemo(
    () =>
      data?.hourOfDay.map((s, h) => ({
        label: String(h).padStart(2, "0"),
        // Average per active day, so ranges compare fairly.
        value: hours(s / Math.max(1, data.activeDays)),
      })) ?? [],
    [data],
  );
  const topApps = data?.apps.slice(0, 10).map((a) => ({ ...a, value: hours(a.seconds) })) ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
        <header className="flex items-center gap-2">
          <button
            onClick={onBack}
            aria-label="Back to dashboard"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg font-semibold">Analytics</h1>
          <div className="ml-auto flex rounded-lg border border-line bg-surface p-0.5 text-sm">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 ${
                  r === range ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {r} days
              </button>
            ))}
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
            Couldn't load data: {error}
          </div>
        )}

        {!data ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : data.totalSeconds === 0 ? (
          <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-line p-10 text-center text-muted">
            No activity in the last {range} days.
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Total" value={formatDuration(data.totalSeconds)} />
              <Tile
                label="Daily average"
                value={formatDuration(data.totalSeconds / Math.max(1, data.activeDays))}
                sub={`over ${data.activeDays} active day${data.activeDays === 1 ? "" : "s"}`}
              />
              <Tile label="Top category" value={data.categories[0]?.name ?? "—"} />
              <Tile label="Top app" value={data.apps[0]?.name ?? "—"} />
            </section>

            <Card title="Daily time by category">
              <div className="h-60">
                <ResponsiveContainer>
                  <BarChart data={daily} margin={{ left: -16, right: 4, top: 4 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} unit="h" />
                    <Tooltip {...tooltipStyle} formatter={fmt} />
                    {cats.map((c, i) => (
                      <Bar
                        key={c}
                        dataKey={c}
                        stackId="day"
                        fill={categoryColor(c)}
                        radius={i === cats.length - 1 ? [3, 3, 0, 0] : 0}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid gap-5 md:grid-cols-2">
              <Card title="By category">
                <div className="flex items-center gap-4">
                  <div className="size-40 shrink-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={data.categories}
                          dataKey="seconds"
                          nameKey="name"
                          innerRadius="60%"
                          outerRadius="100%"
                          stroke="var(--surface)"
                          isAnimationActive={false}
                        >
                          {data.categories.map((c) => (
                            <Cell key={c.name} fill={categoryColor(c.name)} />
                          ))}
                        </Pie>
                        <Tooltip
                          {...tooltipStyle}
                          formatter={(v) => formatDuration(Number(v))}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                    {data.categories.map((c) => (
                      <li key={c.name} className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ background: categoryColor(c.name) }}
                        />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="tabular-nums text-muted">
                          {Math.round((c.seconds / data.totalSeconds) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              <Card title="Average by hour of day">
                <div className="h-40">
                  <ResponsiveContainer>
                    <BarChart data={hourly} margin={{ left: -16, right: 4, top: 4 }}>
                      <XAxis
                        dataKey="label"
                        tick={axis}
                        tickLine={false}
                        axisLine={false}
                        interval={3}
                      />
                      <YAxis tick={axis} tickLine={false} axisLine={false} unit="h" />
                      <Tooltip {...tooltipStyle} formatter={fmt} labelFormatter={(l) => `${l}:00`} />
                      <Bar
                        dataKey="value"
                        name="Average"
                        fill="var(--accent)"
                        radius={[2, 2, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <Card title="Top applications">
              <div style={{ height: topApps.length * 30 + 10 }}>
                <ResponsiveContainer>
                  <BarChart data={topApps} layout="vertical" margin={{ left: 0, right: 12 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip {...tooltipStyle} formatter={fmt} />
                    <Bar dataKey="value" name="Time" radius={3} isAnimationActive={false}>
                      {topApps.map((a) => (
                        <Cell key={a.appId} fill={appColor(a.appId)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
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

function Tile(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{props.label}</div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums">{props.value}</div>
      {props.sub && <div className="truncate text-xs text-muted">{props.sub}</div>}
    </div>
  );
}
