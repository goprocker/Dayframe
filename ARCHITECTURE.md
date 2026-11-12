# Architecture

Dayframe is a Tauri 2 app: a Rust core that samples Windows, runs a tracking state machine and owns a SQLite database, plus a React frontend rendered in WebView2 for two windows (dashboard and widget).

```
 Win32 (foreground, idle, lock, fullscreen)
        │ every 1 s
        ▼
 tracker thread ──► Engine (pure state machine) ──► Actions ──► SQLite
        │                                                     ▲
        └─ emits "tracker://state" on change                  │
                         │                                    │
                         ▼                                    │
   React: Dashboard · Analytics · Settings · Widget ── invoke ┘
```

## Rust core (`src-tauri/src`)

| Module | Responsibility |
|---|---|
| `lib.rs` | App setup: single-instance, autostart, DB open + recovery, managed state, tracker thread, tray, widget, commands, clean shutdown. |
| `tracker/engine.rs` | Pure state machine. No I/O; fully unit-tested. |
| `tracker/win.rs` | Win32 sampling: foreground exe path + description, idle time, lock state, fullscreen. Never reads window titles. |
| `tracker/mod.rs` | 1 s loop: sample → engine → write actions under the DB lock; publishes a `Snapshot`. |
| `db.rs` | Migrations (`PRAGMA user_version`, append-only), queries, interval clipping, range deletion. |
| `stats.rs` | Pure aggregation: day summary, hourly buckets, timeline merge, range analytics. |
| `icons.rs` | Executable icon → PNG, cached in the database. |
| `categories.rs` | Default category from executable name. |
| `settings.rs` | Settings, consent, exclusions, categories, deletion commands. |
| `tray.rs` | Tray menu and tooltip state. |
| `widget.rs` | Widget window lifecycle, position, fullscreen hiding. |

### Tracking engine

Input each tick: `Sample { now_ms, app, idle_ms, locked }`. Output: `Open`, `Checkpoint` or `Close` actions.

- App switch: close the old session and open the new one at the same instant, so sessions never overlap.
- Idle ≥ threshold: close at `now - idle_ms`, so idle time is never counted.
- Gap between ticks > 15 s or the clock moves backwards (sleep, hibernate, suspend): close at the last tick.
- Locked, paused, excluded app or no foreground app: close at `now`.
- Checkpoint every 30 s, so a crash loses at most 30 s.

Sessions are stored already closed (`ended_at` is the last checkpoint). Crash recovery only normalises durations on startup.

When data is deleted, the delete command sets `Control::reopen` while holding the DB lock. The tracker then forgets its open session instead of extending a row that may no longer exist, so deleted time is never resurrected.

### Data model

- `applications`: one row per executable (`exe_key` unique), display name, path, category, excluded flag, cached icon.
- `activity_sessions`: `started_at` / `ended_at` in UTC milliseconds, `CHECK (ended_at >= started_at)`, indexed on both ends and on application.
- `projects`: reserved for later.
- `settings`: key/value (consent, theme, idle threshold, widget enabled/position).

### Time and day boundaries

All stored times are UTC milliseconds. The frontend computes local midnights and passes them as bounds, so DST days (23/25 h) and time zones are handled where the local calendar is known. `db::intervals(from, to)` clips sessions to the window, which splits sessions that cross midnight. Range analytics map hour buckets to the local hour of day with `chrono::Local`.

## Frontend (`src`)

- `main.tsx` chooses the root by window label: `Widget` for the `widget` window, otherwise `App`.
- `App.tsx`: consent gate (Onboarding), then Dashboard / Analytics / Settings. Analytics is lazy-loaded so Recharts is not in the main bundle.
- `lib/api.ts`: typed wrappers around Tauri commands and events.
- The dashboard refreshes every 30 s only while visible; the widget fetches day totals only while expanded.

## Windows and processes

- `main`: dashboard. Starts hidden; shown unless launched with `--minimized` (autostart). Closing hides it to the tray.
- `widget`: transparent, undecorated, always-on-top, skip-taskbar. Created on demand. Hidden while a fullscreen app has focus.
- Single instance: a second launch focuses the running one.
- On quit the tracker thread is stopped and joined, closing the open session at quit time.

## Security

- Strict CSP: only local resources and IPC; no network.
- Capabilities grant `core:default` plus window dragging, scoped to the two app windows.
- Tracking requires stored explicit consent.
