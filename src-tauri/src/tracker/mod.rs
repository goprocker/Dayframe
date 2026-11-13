//! Activity tracking. `engine` is the pure state machine, `win` samples the
//! Windows foreground/idle/lock state, and this module runs the 1 s loop that
//! feeds samples to the engine and applies its actions to SQLite.

pub mod engine;
pub mod win;

use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::{db, AppState};
use engine::{Action, Engine, ForegroundApp, Sample, Status};

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
    /// Set while holding the DB lock after a deletion split or removed the
    /// open session row (which was first checkpointed to `reopen_at`): the
    /// tracker continues in a fresh row from `reopen_at`.
    pub reopen: AtomicBool,
    pub reopen_at: AtomicI64,
    /// Row id of the open session, or 0. Written by the tracker under the DB
    /// lock so deletion commands can checkpoint it first.
    pub live_session: AtomicI64,
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
    /// The last database write failed; activity is not being saved.
    pub storage_error: bool,
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
#[derive(Default)]
struct Writer {
    session_id: Option<i64>,
    app_name: Option<String>,
    /// An Open the engine accepted but the DB rejected; retried on the next
    /// checkpoint/close so a transient failure does not lose the session.
    pending: Option<(ForegroundApp, i64)>,
    failed: bool,
}

impl Writer {
    fn reset(&mut self) {
        self.session_id = None;
        self.app_name = None;
        self.pending = None;
    }

    fn open(
        &mut self,
        conn: &rusqlite::Connection,
        app: ForegroundApp,
        start_ms: i64,
    ) -> rusqlite::Result<()> {
        let r = db::upsert_app(conn, &app, start_ms)
            .and_then(|id| db::open_session(conn, id, start_ms));
        match r {
            Ok(sid) => {
                self.session_id = Some(sid);
                self.app_name = Some(app.display_name);
                self.pending = None;
                Ok(())
            }
            Err(e) => {
                self.pending = Some((app, start_ms));
                Err(e)
            }
        }
    }

    /// Ensure the session row exists (retrying a failed Open), then set its end.
    fn end(&mut self, conn: &rusqlite::Connection, end_ms: i64) -> rusqlite::Result<()> {
        if self.session_id.is_none() {
            if let Some((app, start)) = self.pending.take() {
                self.open(conn, app, start)?;
            }
        }
        match self.session_id {
            Some(id) => db::set_session_end(conn, id, end_ms),
            None => Ok(()),
        }
    }

    fn apply(&mut self, conn: &rusqlite::Connection, actions: Vec<Action>) {
        for a in actions {
            let r = match a {
                Action::Open { app, start_ms } => {
                    self.reset();
                    self.open(conn, app, start_ms)
                }
                Action::Checkpoint { end_ms } => self.end(conn, end_ms),
                Action::Close { end_ms } => {
                    let r = self.end(conn, end_ms);
                    self.reset();
                    r
                }
                Action::TrimAfter { cutoff_ms } => db::trim_after(conn, cutoff_ms),
            };
            self.failed = r.is_err();
            if let Err(e) = r {
                log::error!("tracker db write failed: {e}");
            }
        }
    }
}

/// Actions computed before a deletion target the old (now split/removed)
/// row, which the deletion already checkpointed. Keep only their cutoffs, as
/// trims that never extend a row, and continue the current app in a fresh
/// row from the deletion time.
fn reconcile_after_delete(engine: &mut Engine, actions: Vec<Action>, at_ms: i64) -> Vec<Action> {
    let mut out: Vec<Action> = actions
        .into_iter()
        .filter_map(|a| match a {
            Action::Close { end_ms } | Action::TrimAfter { cutoff_ms: end_ms }
                if end_ms < at_ms =>
            {
                Some(Action::TrimAfter { cutoff_ms: end_ms })
            }
            _ => None,
        })
        .collect();
    out.extend(engine.restart(at_ms));
    out
}

pub fn spawn(app: AppHandle, ctl: Arc<Control>) -> thread::JoinHandle<()> {
    thread::Builder::new()
        .name("dayframe-tracker".into())
        .spawn(move || run(app, ctl))
        .expect("spawn tracker thread")
}

fn run(app: AppHandle, ctl: Arc<Control>) {
    let mut engine = Engine::new(DEFAULT_IDLE_MS);
    let mut writer = Writer::default();
    let mut sampler = win::Sampler::default();
    let state = app.state::<AppState>();
    if let Ok(conn) = state.db.lock() {
        load_settings(&conn, &mut engine);
    }
    let mut last_emit: Option<Snapshot> = None;
    let widget = app.state::<crate::widget::WidgetState>();

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

        if !actions.is_empty() || ctl.reopen.load(Ordering::SeqCst) {
            if let Ok(conn) = state.db.lock() {
                // Checked under the lock so no write can land between a
                // delete and this reset.
                let actions = if ctl.reopen.swap(false, Ordering::SeqCst) {
                    writer.reset();
                    reconcile_after_delete(
                        &mut engine,
                        actions,
                        ctl.reopen_at.load(Ordering::SeqCst),
                    )
                } else {
                    actions
                };
                writer.apply(&conn, actions);
                ctl.live_session
                    .store(writer.session_id.unwrap_or(0), Ordering::SeqCst);
            }
        }

        let snap = Snapshot {
            status: consented.then(|| engine.status()),
            consented,
            paused: engine.paused,
            app_name: writer.app_name.clone(),
            session_start_ms: engine.current().map(|(_, s)| s),
            storage_error: writer.failed,
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
        // Only sample fullscreen while the widget is on; the widget module
        // ignores repeats.
        let fullscreen = widget.enabled.load(Ordering::SeqCst) && win::foreground_is_fullscreen();
        crate::widget::set_fullscreen(&app, fullscreen);
        thread::sleep(TICK);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn app(name: &str) -> ForegroundApp {
        ForegroundApp {
            key: format!("c:\\apps\\{name}.exe"),
            exe_path: format!("C:\\Apps\\{name}.exe"),
            display_name: name.into(),
        }
    }

    fn sample(ms: i64) -> Sample {
        Sample {
            now_ms: ms,
            app: Some(app("a")),
            idle_ms: 0,
            locked: false,
        }
    }

    fn spans(conn: &rusqlite::Connection) -> Vec<(i64, i64)> {
        db::intervals(conn, 0, i64::MAX / 2)
            .unwrap()
            .into_iter()
            .filter(|i| i.end > i.start)
            .map(|i| (i.start, i.end))
            .collect()
    }

    #[test]
    fn failed_open_recovers_once_writes_succeed() {
        let conn = db::open(Path::new(":memory:")).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER fail_open BEFORE INSERT ON activity_sessions
             BEGIN SELECT RAISE(FAIL, 'simulated disk full'); END;",
        )
        .unwrap();
        let mut e = Engine::new(DEFAULT_IDLE_MS);
        let mut w = Writer::default();
        w.apply(&conn, e.tick(&sample(0)));
        assert!(w.failed && w.session_id.is_none());
        conn.execute_batch("DROP TRIGGER fail_open;").unwrap();
        for t in 1..=600 {
            w.apply(&conn, e.tick(&sample(t * 1000)));
        }
        assert!(!w.failed);
        assert_eq!(spans(&conn), vec![(0, 600_000)]);
    }

    #[test]
    fn repeated_open_failures_do_not_duplicate() {
        let conn = db::open(Path::new(":memory:")).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER fail_open BEFORE INSERT ON activity_sessions
             BEGIN SELECT RAISE(FAIL, 'x'); END;",
        )
        .unwrap();
        let mut e = Engine::new(DEFAULT_IDLE_MS);
        let mut w = Writer::default();
        for t in 0..=90 {
            w.apply(&conn, e.tick(&sample(t * 1000)));
        }
        assert!(w.failed);
        conn.execute_batch("DROP TRIGGER fail_open;").unwrap();
        for t in 91..=120 {
            w.apply(&conn, e.tick(&sample(t * 1000)));
        }
        assert_eq!(spans(&conn), vec![(0, 120_000)]);
    }

    /// Mirrors settings::delete_range followed by the tracker loop ordering.
    fn run_delete(from: i64, to: i64, at: i64) -> Vec<(i64, i64)> {
        let conn = db::open(Path::new(":memory:")).unwrap();
        let mut e = Engine::new(DEFAULT_IDLE_MS);
        let mut w = Writer::default();
        for t in 100..=145 {
            w.apply(&conn, e.tick(&sample(t * 1000)));
        }
        // Command: checkpoint live row, delete, decide on reopen.
        let id = w.session_id.unwrap();
        db::set_session_end(&conn, id, at).unwrap();
        let start = db::session_start(&conn, id).unwrap().unwrap();
        db::delete_range(&conn, from, to).unwrap();
        let reopen = from < at && to > start;
        // Loop: the tick was generated before the reopen flag was consumed.
        let acts = e.tick(&sample(146_000));
        let acts = if reopen {
            w.reset();
            reconcile_after_delete(&mut e, acts, at)
        } else {
            acts
        };
        w.apply(&conn, acts);
        w.apply(&conn, e.tick(&sample(147_000)));
        w.apply(&conn, e.flush(150_000));
        spans(&conn)
    }

    #[test]
    fn deleting_unrelated_past_range_keeps_live_time() {
        assert_eq!(run_delete(0, 50_000, 145_500), vec![(100_000, 150_000)]);
    }

    #[test]
    fn deleting_inside_live_session_removes_exactly_that_range() {
        assert_eq!(
            run_delete(110_000, 120_000, 145_500),
            vec![(100_000, 110_000), (120_000, 145_500), (145_500, 150_000)]
        );
    }

    #[test]
    fn delete_all_does_not_restore_old_activity() {
        let conn = db::open(Path::new(":memory:")).unwrap();
        let mut e = Engine::new(DEFAULT_IDLE_MS);
        let mut w = Writer::default();
        for t in 100..=145 {
            w.apply(&conn, e.tick(&sample(t * 1000)));
        }
        db::set_session_end(&conn, w.session_id.unwrap(), 145_500).unwrap();
        db::delete_all(&conn).unwrap();
        let acts = e.tick(&sample(146_000));
        w.reset();
        w.apply(&conn, reconcile_after_delete(&mut e, acts, 145_500));
        w.apply(&conn, e.flush(150_000));
        assert_eq!(spans(&conn), vec![(145_500, 150_000)]);
    }
}
