# Dayframe — Session Handoff

_Last updated: 2026-11-12 · end of Chunk 1 (Foundation)_

Dayframe is a privacy-first Windows desktop time tracker: Tauri 2 + React/TypeScript + Rust + SQLite. Tagline: **See where your day went.**

Repo: https://github.com/goprocker/Dayframe

## Status

| Chunk | Scope | State |
|---|---|---|
| 1 | Foundation: scaffold, SQLite schema, tracking engine, app shell | **Done** (verified below) |
| 2 | Real Windows tracking (Win32 sampler + background thread) | Next |
| 3 | Dashboard on real data (stats, icons, timeline) | Not started |
| 4 | Tray, onboarding + consent, settings | Not started |
| 5 | Floating widget, analytics charts | Not started |
| 6 | Release: perf measurement, NSIS installer, README/ARCHITECTURE | Not started |

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

## Next steps (Chunk 2 — real tracking)
1. Run `npm run tauri dev`; confirm window shows "v0.1.0 · database schema v1" and DB file is created.
2. `tracker/win.rs`: `GetForegroundWindow` → `GetWindowThreadProcessId` → `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` → `QueryFullProcessImageNameW`; display name from version info `FileDescription`, fallback exe stem; inaccessible process → "Protected application". `GetLastInputInfo` for idle. Lock via `OpenInputDesktop` failing / non-"Default" desktop. Fullscreen check (for widget later).
3. `tracker/mod.rs`: 1 s thread, apply engine actions to DB (`upsert_app`, `open_session`, `set_session_end`), emit `tracker://state` event, flush on quit.
4. Tracking stays off until onboarding consent (`settings.tracking_consented = "1"`). For Chunk 2 testing, add a temporary enable path.
5. Verify with real apps; measure CPU/RAM in Task Manager.

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

## Conventions
- Conventional Commit subjects with a detailed body; one logical change per commit.
- Toolchain at handoff: Node 24, Rust 1.99, Windows 11.
