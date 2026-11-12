# Dayframe

**See where your day went.**

Dayframe is a privacy-first time tracker for Windows. It records which application is in the foreground and for how long, and shows you your day as a timeline, per-app totals and trends. Everything stays in a local SQLite file on your machine. Nothing is uploaded.

## Features

- **Automatic tracking** of the foreground application, sampled once a second.
- **Idle aware**: after a configurable idle threshold (default 5 minutes) time stops counting from the moment input stopped. Lock screen, sleep and hibernate are never counted.
- **Dashboard**: active time, apps used, app switches, longest session, a day timeline with hover details, per-app breakdown with icons, hourly bars and a clickable 7-day strip. Browse any past day.
- **Analytics**: 7 / 14 / 30-day views with daily time by category, category share, average by hour of day and top applications.
- **Floating widget**: a small always-on-top pill with the current app and session time, pause/resume and a quick today summary. Hides itself while a fullscreen app is in front.
- **Tray app**: closing the window keeps tracking in the tray; pause/resume, widget toggle, settings and quit from the tray menu. Optional start with Windows (starts minimized).
- **Control over your data**: exclude apps, recategorise apps, delete a date range or everything.
- Dark and light themes, or follow Windows.

## Privacy

Dayframe only starts tracking after you give explicit consent on first launch, and you can withdraw it at any time in Settings.

**Collected:** the executable path and file description of the foreground app, start and end times, and idle/lock state.

**Never collected:** window titles, URLs, document names, keystrokes, mouse positions, screenshots or screen contents.

Data lives in `%APPDATA%\com.dayframe.app\dayframe.db`. There is no network code and no telemetry; the Content Security Policy only allows local resources.

## Install

Download the `Dayframe_<version>_x64-setup.exe` installer from the landing page or Releases and run it. The installer is per-user and does not need administrator rights. WebView2 is required (preinstalled on Windows 10/11; the installer fetches it if missing).

## Build from source

Requirements: Windows 10/11, Node.js 20+, Rust (stable, MSVC toolchain), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev      # run in development
npm run tauri build    # release build + NSIS installer in src-tauri/target/release/bundle/nsis/
```

Tests:

```sh
cd src-tauri && cargo test   # tracking engine, database, stats, Windows sampler
npx vitest run               # frontend time helpers
```

## Known limitations

- Windows only.
- Sleep/resume is detected from gaps between tracker ticks (> 15 s), not from power broadcast messages.
- Lock is detected by checking the input desktop, not via WTS session notifications.
- Elevated or protected processes cannot be inspected and are recorded as "Protected application".
- Fullscreen detection compares the foreground window with its monitor; borderless windows that exactly cover a monitor also count as fullscreen.
- Projects exist in the database schema but there is no UI to assign them yet.

If port 1420 is already in use, an old Vite dev server is still running; see [Troubleshooting](https://github.com/goprocker/Dayframe/wiki/Troubleshooting).

## Landing page

The marketing site is in [`landing/`](landing/) (Vite, plain HTML/CSS/JS, deployable to Vercel). It hosts the installer download, a product video and a changelog page.

```sh
cd landing && npm install && npm run dev   # http://localhost:5180
```

See [landing/README.md](landing/README.md) and [landing/CHANGELOG.md](landing/CHANGELOG.md).

## Documentation

- [Wiki](https://github.com/goprocker/Dayframe/wiki): installation, usage, privacy, building, architecture, landing page, troubleshooting.
- [ARCHITECTURE.md](ARCHITECTURE.md): technical design.
- [Dayframe-Guide.pdf](Dayframe-Guide.pdf): illustrated project guide.

## Tech

Tauri 2 · Rust · SQLite (rusqlite, bundled) · React 19 · TypeScript · Tailwind CSS 4 · Recharts
