//! Activity tracking. `engine` is the pure state machine, `win` samples the
//! Windows foreground/idle/lock state, and this module runs the 1 s loop that
//! feeds samples to the engine and applies its actions to SQLite.

pub mod engine;
pub mod win;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{db, AppState};
use engine::{Action, Engine, Sample, Status};

pub const TICK: Duration = Duration::from_secs(1);
pub const DEFAULT_IDLE_MS: i64 = 5 * 60 * 1000;

/// Shared controls the UI (and later the tray) flip; the loop reads them.
#[derive(Default)]
pub struct Control {
    pub consented: AtomicBool,
    pub paused: AtomicBool,
    /// Settings or exclusions changed: reload them on the next tick.
    pub reload: AtomicBool,
    pub stop: AtomicBool,
    pub snapshot: Mutex<Snapshot>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub status: Option<Status>,
    pub consented: bool,
    pub paused: bool,
    pub app_name: Option<String>,
    pub session_start_ms: Option<i64>,
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn load_settings(conn: &rusqlite::Connection, e: &mut Engine) {
    e.idle_threshold_ms = db::get_setting(conn, "idle_threshold_ms")
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .filter(|v: &i64| *v >= 60_000)
        .unwrap_or(DEFAULT_IDLE_MS);
    e.excluded = db::excluded_keys(conn)
        .unwrap_or_default()
        .into_iter()
        .collect();
}

/// Persists engine actions. Holds the id of the open DB session.
struct Writer {
    session_id: Option<i64>,
    app_name: Option<String>,
}

impl Writer {
    fn apply(&mut self, conn: &rusqlite::Connection, actions: Vec<Action>) {
        for a in actions {
            let r = match a {
                Action::Open { app, start_ms } => db::upsert_app(conn, &app, start_ms)
                    .and_then(|id| db::open_session(conn, id, start_ms))
                    .map(|sid| {
                        self.session_id = Some(sid);
                        self.app_name = Some(app.display_name);
                    }),
                Action::Checkpoint { end_ms } => match self.session_id {
                    Some(id) => db::set_session_end(conn, id, end_ms),
                    None => Ok(()),
                },
                Action::Close { end_ms } => {
                    self.app_name = None;
                    match self.session_id.take() {
                        Some(id) => db::set_session_end(conn, id, end_ms),
                        None => Ok(()),
                    }
                }
            };
            if let Err(e) = r {
                log::error!("tracker db write failed: {e}");
            }
        }
    }
}

pub fn spawn(app: AppHandle, ctl: Arc<Control>) -> thread::JoinHandle<()> {
    thread::Builder::new()
        .name("dayframe-tracker".into())
        .spawn(move || run(app, ctl))
        .expect("spawn tracker thread")
}

fn run(app: AppHandle, ctl: Arc<Control>) {
    let mut engine = Engine::new(DEFAULT_IDLE_MS);
    let mut writer = Writer {
        session_id: None,
        app_name: None,
    };
    let mut sampler = win::Sampler::default();
    let state = app.state::<AppState>();
    if let Ok(conn) = state.db.lock() {
        load_settings(&conn, &mut engine);
    }
    let mut last_emit: Option<Snapshot> = None;

    loop {
        let stopping = ctl.stop.load(Ordering::SeqCst);
        let consented = ctl.consented.load(Ordering::SeqCst);
        engine.paused = ctl.paused.load(Ordering::SeqCst);

        let actions = if stopping || !consented {
            engine.flush(now_ms())
        } else {
            if ctl.reload.swap(false, Ordering::SeqCst) {
                if let Ok(conn) = state.db.lock() {
                    load_settings(&conn, &mut engine);
                }
            }
            let sample = Sample {
                now_ms: now_ms(),
                app: sampler.foreground_app(),
                idle_ms: win::idle_ms(),
                locked: win::is_locked(),
            };
            engine.tick(&sample)
        };

        if !actions.is_empty() {
            if let Ok(conn) = state.db.lock() {
                writer.apply(&conn, actions);
            }
        }

        let snap = Snapshot {
            status: consented.then(|| engine.status()),
            consented,
            paused: engine.paused,
            app_name: writer.app_name.clone(),
            session_start_ms: engine.current().map(|(_, s)| s),
        };
        if last_emit.as_ref().map(|l| serde_json::to_value(l).ok())
            != Some(serde_json::to_value(&snap).ok())
        {
            let _ = app.emit("tracker://state", &snap);
            last_emit = Some(snap.clone());
        }
        if let Ok(mut s) = ctl.snapshot.lock() {
            *s = snap;
        }

        if stopping {
            break;
        }
        thread::sleep(TICK);
    }
}
