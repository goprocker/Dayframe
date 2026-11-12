# Dayframe — Session Handoff

_Last updated: 2026-11-12 · Chunk 6 in progress (release build, docs, guide)_

Dayframe is a privacy-first Windows desktop time tracker: Tauri 2 + React/TypeScript + Rust + SQLite. Tagline: **See where your day went.**

Repo: https://github.com/goprocker/Dayframe

## Status

| Chunk | Scope | State |
|---|---|---|
| 1 | Foundation: scaffold, SQLite schema, tracking engine, app shell | **Done** (verified below) |
| 2 | Real Windows tracking (Win32 sampler + background thread) | **Done** (verified below) |
| 3 | Dashboard on real data (stats, icons, timeline) | **Done** (verified below) |
| 4 | Tray, onboarding + consent, settings | **Done** (verified below) |
| 5 | Floating widget, analytics charts | **Done** (verified below) |
| 6 | Release: perf measurement, NSIS installer, README/ARCHITECTURE | **In progress** |

Full plan: see "Chunks" below.

## What exists

```
dayframe/
  app-icon.svg              source for `npx tauri icon`
  index.html, vite.config.ts (port 1420), tsconfig.json
  src/
    main.tsx, App.tsx       foundation shell: calls `app_info`, shows version + schema version
    index.css               Tailwind v4 + design tokens (dark default, light via data-theme)
    lib/api.ts              typed invoke wrappers
  src-tauri/
    Cargo.toml              crate `dayframe`, lib `dayframe_lib`
    tauri.conf.json         identifier com.dayframe.app, NSIS target, strict CSP
    capabilities/default.json
    icons/                  generated
    src/
      main.rs, lib.rs       opens DB in app data dir, runs recovery, `app_info` command
      db.rs                 migrations + queries (see below)
      categories.rs         exe name → default category
      tracker/engine.rs     pure tracking state machine
      tracker/mod.rs
```

### Tracking engine (`src-tauri/src/tracker/engine.rs`)
Pure, no I/O. Input `Sample { now_ms, app, idle_ms, locked }` each tick → output `Action::{Open, Checkpoint, Close}`.
- App switch → close old at `now`, open new at `now` (no overlap).
- Idle ≥ threshold (default 5 min) → close at `now - idle_ms` (idle time never counted).
- Gap between ticks > 15 s (sleep/hibernate/suspend) or clock moves backwards → close at last tick.
- Locked / paused / excluded / no foreground app → close at `now`.
- Checkpoint every 30 s → a crash loses at most 30 s.

### Database (`src-tauri/src/db.rs`)
- File: `%APPDATA%\com.dayframe.app\dayframe.db`, WAL mode, foreign keys on.
- Migrations in `MIGRATIONS` array, tracked via `PRAGMA user_version`. Append only.
- v1 tables: `applications` (exe_key unique, display_name, executable_path, category, excluded, icon_png, first_seen_at), `activity_sessions` (UTC ms start/end, duration_seconds, optional project_id, CHECK end ≥ start), `projects`, `settings`. Indexes on started_at, ended_at, application_id.
- Sessions are always stored closed (`ended_at` = last checkpoint), so crash recovery just normalises durations.
- `intervals(from, to)` clips sessions to a window — this is how midnight boundaries are handled.
- `delete_range` trims/splits sessions straddling the range edges.

## Verification done (Chunk 1)
- `cargo test` (in `src-tauri/`): **17 passed, 0 failed** — engine (switching, idle, below-threshold, sleep gap, lock, exclusions, pause/resume, checkpoints, clock backwards), db (migrations idempotent, upsert, clipping, end ≥ start, crash recovery, delete_range, settings), categories.
- `npm run build` (tsc + vite): passes.
- **Not yet verified:** `npm run tauri dev` launching the window (run was interrupted). Do this first next session.
- Expected warnings: dead-code warnings for db/engine functions not wired up until Chunk 2.

## Chunk 2 — what was added
- `tracker/win.rs`: foreground exe via `GetForegroundWindow` → `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` → `QueryFullProcessImageNameW`; display name from version `FileDescription` (cached), fallback exe stem; inaccessible → key `::protected`, "Protected application". Idle via `GetLastInputInfo`/`GetTickCount` (wrap-safe). Locked = `OpenInputDesktop` fails or desktop name ≠ "Default".
- `tracker/mod.rs`: `Control` (atomics: consented, paused, reload, stop + last `Snapshot`), 1 s thread applying engine actions to DB, emits `tracker://state` only on change. Settings read: `idle_threshold_ms` (≥ 60 s), excluded apps; set `reload` to re-read.
- `lib.rs`: commands `tracker_state`, `set_tracking_consent` (persists `tracking_consented`), `set_tracking_paused`; on `RunEvent::Exit` sets stop and joins the thread → open session flushed.
- Shell UI: temporary "Enable tracking (dev)" / Pause toggle + live status. Remove when onboarding lands (chunk 4).
- Fullscreen detection deferred to chunk 5 (widget).

## Verification done (Chunk 2)
- `cargo test`: **20 passed** (3 new in `win.rs`: stem fallback, notepad FileDescription, idle ≥ 0).
- `npm run build` passes. `npm run tauri dev` launches; DB created in `%APPDATA%\com.dayframe.app`.
- **Not yet verified:** clicking Enable and watching sessions land for real apps; CPU/RAM measurement (do at start of chunk 3).

## Chunk 3 — what was added
- `stats.rs`: pure `summarize()` → total, per-app usage (seconds, sessions), switches, longest merged block, hourly buckets, timeline (same-app blocks merged when gap ≤ 2 s). Caller passes local-midnight bounds; bucket count = range hours (23/25 on DST days). `range_totals(bounds)` for the 7-day strip.
- `icons.rs`: `ExtractIconExW` → `GetIconInfo`/`GetDIBits` → RGBA PNG; cached in `applications.icon_png` (empty blob = none, not retried).
- Commands: `day_summary(from,to)` (≤ 26 h), `range_totals(bounds)`, `app_icons` (base64 by app id; extraction outside DB lock).
- UI: `components/Dashboard.tsx` (header with date nav/picker + tracker pill with pause and temporary enable, tiles, timeline, app list with icons/bars, hourly bars, clickable 7-day strip, empty states), `Timeline.tsx` (hover detail), `AppIcon.tsx`; `lib/time.ts` (local-day bounds, formatting) with vitest tests; `lib/colors.ts`. Today refreshes every 30 s only while visible.

## Verification done (Chunk 3)
- `cargo test`: **27 passed** (stats incl. midnight split + DST bucket counts; notepad icon extraction).
- `npx vitest run`: 3 passed. `npm run build` passes. `npm run tauri dev` launches without panics (~32 MB RAM).
- **Not yet verified by eye:** dashboard with real tracked data, icon rendering, light theme. Do this first in chunk 4.

## Chunk 4 — what was added
- `tray.rs`: tray menu Open / Pause-Resume / Settings / Quit; left click opens; `tray::sync` updates pause label + tooltip. Settings item emits `navigate` = "settings".
- `lib.rs`: single-instance plugin (first), autostart plugin with `--minimized`; window starts hidden (`visible: false`) and is shown unless minimized; close → hide to tray.
- `settings.rs`: get_settings, consent, pause, theme, idle threshold (1–120 min), autostart, list/exclude/categorise apps, delete_range, delete_all_data.
- Deletion safety: delete commands set `Control::reopen` under the DB lock; the loop then forgets the open session (`Engine::forget`) so deleted time is never resurrected by a checkpoint.
- UI: `Onboarding.tsx` (explicit checkbox consent, real DB path), `Settings.tsx` (two-step inline confirms, no native dialogs), `App.tsx` consent gate + view switch + theme (follows OS on "system"). Temporary dev enable button removed.
- Widget toggle in tray/settings deferred to chunk 5 with the widget itself.

## Verification done (Chunk 4)
- `cargo test`: 27 passed. `npm run build` + `npx vitest run` (3) pass.
- `npm run tauri dev`: window "Dayframe" shown, ~32 MB, no panics.
- Gotcha: killing a dev run can leave `msedgewebview2.exe` holding the data folder → next launch panics with WebView2 `0x800700AA`. Kill those processes before relaunching.
- **Not yet verified by hand:** tray menu clicks, close-to-tray, autostart toggle, second-instance focus, onboarding → dashboard flow, delete range/all, light theme.

## Chunk 5 — what was added
- `widget.rs`: `widget` window built on demand (transparent, undecorated, no shadow, always-on-top, skip taskbar, 248×44 collapsed / 280×236 expanded). Saved position (`widget_position`, physical px) reused only if it is on a connected monitor, else top-right of primary. `widget_enabled` setting; `apply()` shows only when enabled and no fullscreen app is in front. Commands `set_widget_enabled` (async: window creation from a sync command deadlocks on Windows), `set_widget_expanded`, `save_widget_position`, `open_dashboard`.
- `win.rs::foreground_is_fullscreen`: foreground rect covers its monitor; desktop/shell (`Progman`, `WorkerW`) excluded. Sampled in the tracker loop only while the widget is enabled.
- Tray gets Show/Hide widget; Settings gets a widget toggle. `set_theme` emits `theme` so both windows follow.
- `stats::summarize_range` + `range_summary(bounds)` (≤ 92 days): per-day category totals, category/app totals, hour-of-day via `chrono::Local` (DST-correct).
- UI: `main.tsx` picks root by window label (widget vs app). `Widget.tsx` (drag via `startDragging`, live h:mm:ss counter only while active, today + top 3 when expanded, debounced position save). `Analytics.tsx` (7/14/30 days: tiles, stacked daily bars by category, category donut, average-by-hour, top 10 apps) lazy-loaded so Recharts (~112 KB gz) stays out of the dashboard/widget bundles. Capability adds `widget` window + `core:window:allow-start-dragging`.

## Verification done (Chunk 5)
- `cargo test`: **30 passed** (range merge, local-hour mapping, position parsing).
- `npm run build` + `npx vitest run` (3) pass. `npm run tauri dev` launches, ~32 MB, no panics.
- **Not yet verified by hand:** widget (off by default — turn on in tray/Settings): drag + position restore, expand/collapse, hide on fullscreen video/game, transparency corners; analytics charts with real data in both themes; tray widget label.

## Chunk 6 — progress
- `npm run tauri build` succeeds: `Dayframe_0.1.0_x64-setup.exe` 1.94 MiB, `dayframe.exe` 4.6 MB (release, LTO, stripped). No warnings (`db::all_settings` is now test-only).
- `README.md` and `ARCHITECTURE.md` added.
- Project guide: `docs/guide/guide.html` → `Dayframe-Guide.pdf` (23 pages, A4, same format as the Islet guide). Section 03 uses real screenshots from `docs/guide/img/`.
- Screenshot harness `docs/guide/shots/`: `shot.html`/`shot.tsx` render the real components with `@tauri-apps/api/mocks` and a sample working day (never real user data — the PDF is public); `icons.ts` = icons extracted from local exes; `take.sh` drives headless Edge at 2x against the Vite dev server and crops widget shots to 248×44 / 280×236. Not part of the app build (`tsc` only covers `src`).
- Rebuild guide: `npm run dev` → `bash docs/guide/shots/take.sh` (if UI changed) → `msedge --headless=new --no-pdf-header-footer --virtual-time-budget=3000 --print-to-pdf=Dayframe-Guide.pdf file:///…/docs/guide/guide.html`. Check overflow with `--dump-dom --window-size=794,1123` and read `body[data-free]` (px free above each footer; negative = overflow).
- **Still to do:** measure release-build CPU/RAM over a real session; install the NSIS build on a clean user and run the manual checks from chunks 4–5.

## Next steps (Chunk 6)
Perf measurement, NSIS build, README + ARCHITECTURE (see below).

## Remaining chunks
- **3** `stats.rs` (day summary, switches, longest session, hourly, 7-day; tests incl. midnight), `icons.rs` (ExtractIconEx → PNG cached in DB), dashboard UI: overview tiles, app list with icons/bars, day timeline with hover, date picker, empty state. Refresh only while visible.
- **4** Tray (open, widget toggle, pause/resume, settings, quit), close → hide to tray, single-instance; onboarding (what's tracked, never collected, storage location, pause, open dashboard + explicit consent); settings (theme, idle threshold, autostart, widget, exclusions, categories, delete range/all, privacy text, version).
- **5** Widget window (transparent, always-on-top, draggable pill, expand/collapse, pause, saved position, hide in fullscreen); analytics (hourly, 7-day, category/app breakdown with Recharts).
- **6** Perf measurement, `npm run tauri build` (NSIS), README + ARCHITECTURE.md.

## Known simplifications (document in README)
- Sleep/resume detected by tick gaps, not power broadcast messages.
- Lock detected by input-desktop check, not WTS session notifications.
- `projects` table exists; project assignment UI deferred.
- No window titles, URLs, keystrokes or screenshots are ever collected.

## Commands
```sh
npm install
npm run build          # typecheck + frontend build
npm run tauri dev      # run app
cd src-tauri && cargo test
```

## Git history (main, latest first)
```
4ccab6c  docs(guide): replace UI mock-ups with real screenshots
97e5272  docs: add Dayframe project guide PDF
8346f12  docs: add README and architecture notes
6e48dbe  chore(db): compile all_settings only for tests
6efa682  docs: update session handoff for chunk 5
5df31b5  feat(ui): add floating widget and analytics view
dd2f385  feat: add floating widget window and range analytics commands
```
Earlier (chunks 1–4):
```
dc79a96  chore: scaffold frontend tooling
3427c28  chore: scaffold Tauri 2 crate and app config
2825c04  feat(tracker): add pure tracking state machine
30d2606  feat(db): add SQLite schema, migrations and queries
e371771  feat: add application shell wired to SQLite
c6bb40e  docs: add session handoff for chunk 1
```
History was rewritten and force-pushed once (to remove AI co-author trailers and re-time commits). Anyone with an older clone should re-clone or `git reset --hard origin/main`.

## Conventions
- Conventional Commit subject + detailed body derived from the actual diff; one logical change per commit.
- **No AI attribution**: no `Co-Authored-By: Claude` or "generated with" lines in commits or PRs. Author is the repo owner only.
- **Commit timing**: commits are spaced out (not all within seconds) and dated on the day the work is done; never future-dated.
- Stop after each chunk for review; update this file at the end of every chunk.
- Toolchain at handoff: Node 24, Rust 1.99, Windows 11.
