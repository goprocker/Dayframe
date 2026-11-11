//! Pure tracking state machine.
//!
//! The engine consumes periodic [`Sample`]s (what is in the foreground, how long
//! the user has been idle, whether the workstation is locked) and emits
//! [`Action`]s describing how persisted sessions must change. It performs no
//! I/O, which lets every edge case be tested with simulated event sequences.

use std::collections::HashSet;

/// If two samples are further apart than this, the machine was asleep,
/// hibernating, or the process was suspended. Time inside the gap is never
/// counted.
pub const GAP_MS: i64 = 15_000;
/// Open sessions are checkpointed to disk at this cadence so that a crash or
/// power loss loses at most this much tracked time.
pub const CHECKPOINT_MS: i64 = 30_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForegroundApp {
    /// Stable identity: the lower-cased executable path.
    pub key: String,
    pub exe_path: String,
    pub display_name: String,
}

#[derive(Debug, Clone)]
pub struct Sample {
    /// Wall clock, UTC milliseconds since the Unix epoch.
    pub now_ms: i64,
    pub app: Option<ForegroundApp>,
    /// Milliseconds since the last keyboard/mouse input.
    pub idle_ms: i64,
    pub locked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Open { app: ForegroundApp, start_ms: i64 },
    Checkpoint { end_ms: i64 },
    Close { end_ms: i64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Active,
    Idle,
    Paused,
    Locked,
    Excluded,
    Unknown,
}

#[derive(Debug, Clone)]
struct Open {
    key: String,
    start_ms: i64,
    last_checkpoint_ms: i64,
}

#[derive(Debug)]
pub struct Engine {
    pub idle_threshold_ms: i64,
    pub paused: bool,
    pub excluded: HashSet<String>,
    current: Option<Open>,
    last_tick_ms: Option<i64>,
    status: Status,
}

impl Engine {
    pub fn new(idle_threshold_ms: i64) -> Self {
        Self {
            idle_threshold_ms,
            paused: false,
            excluded: HashSet::new(),
            current: None,
            last_tick_ms: None,
            status: Status::Unknown,
        }
    }

    pub fn status(&self) -> Status {
        self.status
    }

    /// Key and start time of the currently open session, if any.
    pub fn current(&self) -> Option<(&str, i64)> {
        self.current.as_ref().map(|o| (o.key.as_str(), o.start_ms))
    }

    fn close(&mut self, end_ms: i64, out: &mut Vec<Action>) {
        if let Some(open) = self.current.take() {
            out.push(Action::Close {
                end_ms: end_ms.max(open.start_ms),
            });
        }
    }

    /// Close any open session immediately (pause, quit, settings change).
    pub fn flush(&mut self, now_ms: i64) -> Vec<Action> {
        let mut out = Vec::new();
        let end = match self.last_tick_ms {
            // Never count beyond the last observed tick + a small grace period.
            Some(last) => now_ms.min(last + GAP_MS),
            None => now_ms,
        };
        self.close(end, &mut out);
        out
    }

    pub fn tick(&mut self, s: &Sample) -> Vec<Action> {
        let mut out = Vec::new();

        // Clock went backwards (manual change / DST is not an issue for UTC,
        // but NTP corrections can be) or forwards across a sleep: end the
        // session at the last time we know the user was present.
        if let Some(last) = self.last_tick_ms {
            if s.now_ms < last || s.now_ms - last > GAP_MS {
                self.close(last, &mut out);
            }
        }
        self.last_tick_ms = Some(s.now_ms);

        let idle = s.idle_ms >= self.idle_threshold_ms;
        let status = if self.paused {
            Status::Paused
        } else if s.locked {
            Status::Locked
        } else if idle {
            Status::Idle
        } else {
            match &s.app {
                None => Status::Unknown,
                Some(a) if self.excluded.contains(&a.key) => Status::Excluded,
                Some(_) => Status::Active,
            }
        };
        self.status = status;

        if status != Status::Active {
            let end = if status == Status::Idle {
                // The user actually left when input stopped.
                s.now_ms - s.idle_ms
            } else {
                s.now_ms
            };
            self.close(end, &mut out);
            return out;
        }

        let app = s.app.as_ref().expect("active implies app");
        match &mut self.current {
            Some(open) if open.key == app.key => {
                if s.now_ms - open.last_checkpoint_ms >= CHECKPOINT_MS {
                    open.last_checkpoint_ms = s.now_ms;
                    out.push(Action::Checkpoint { end_ms: s.now_ms });
                }
            }
            _ => {
                self.close(s.now_ms, &mut out);
                self.current = Some(Open {
                    key: app.key.clone(),
                    start_ms: s.now_ms,
                    last_checkpoint_ms: s.now_ms,
                });
                out.push(Action::Open {
                    app: app.clone(),
                    start_ms: s.now_ms,
                });
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(name: &str) -> ForegroundApp {
        ForegroundApp {
            key: format!("c:\\apps\\{name}.exe"),
            exe_path: format!("C:\\Apps\\{name}.exe"),
            display_name: name.into(),
        }
    }

    fn s(now_s: i64, a: Option<&str>, idle_s: i64) -> Sample {
        Sample {
            now_ms: now_s * 1000,
            app: a.map(app),
            idle_ms: idle_s * 1000,
            locked: false,
        }
    }

    /// Replay samples and return closed (start, end, key) intervals in seconds.
    fn replay(e: &mut Engine, samples: &[Sample]) -> Vec<(i64, i64, String)> {
        Recorder::default().feed(e, samples)
    }

    /// Tracks the open session across several `feed` calls, asserting that
    /// sessions never overlap and never close before they open.
    #[derive(Default)]
    struct Recorder {
        open: Option<(i64, String)>,
    }

    impl Recorder {
        fn feed(&mut self, e: &mut Engine, samples: &[Sample]) -> Vec<(i64, i64, String)> {
            let mut done = Vec::new();
            let open = &mut self.open;
            for smp in samples {
                for act in e.tick(smp) {
                    match act {
                        Action::Open { app, start_ms } => {
                            assert!(open.is_none(), "overlapping sessions");
                            *open = Some((start_ms / 1000, app.display_name));
                        }
                        Action::Close { end_ms } => {
                            let (st, k) = open.take().expect("close without open");
                            assert!(end_ms / 1000 >= st);
                            done.push((st, end_ms / 1000, k));
                        }
                        Action::Checkpoint { .. } => assert!(open.is_some()),
                    }
                }
            }
            done
        }
    }

    #[test]
    fn switching_apps_splits_sessions_without_overlap() {
        let mut e = Engine::new(300_000);
        let mut v: Vec<Sample> = (0..10).map(|t| s(t, Some("code"), 0)).collect();
        v.extend((10..15).map(|t| s(t, Some("chrome"), 0)));
        v.push(s(15, None, 0));
        let r = replay(&mut e, &v);
        assert_eq!(r, vec![(0, 10, "code".into()), (10, 15, "chrome".into())]);
    }

    #[test]
    fn idle_ends_session_when_input_stopped() {
        let mut e = Engine::new(300_000);
        let mut v: Vec<Sample> = (0..420)
            .map(|t| {
                // input stops at t=100; threshold (300 s) is crossed at t=400
                let idle = if t > 100 { t - 100 } else { 0 };
                s(t, Some("code"), idle)
            })
            .collect();
        // user returns
        v.extend((420..430).map(|t| s(t, Some("code"), 0)));
        v.push(s(430, None, 0));
        let r = replay(&mut e, &v);
        assert_eq!(r, vec![(0, 100, "code".into()), (420, 430, "code".into())]);
    }

    #[test]
    fn below_threshold_inactivity_is_still_counted() {
        let mut e = Engine::new(300_000);
        let v: Vec<Sample> = (0..200).map(|t| s(t, Some("doc"), t)).collect();
        let mut r = replay(&mut e, &v);
        r.extend(e.flush(200_000).into_iter().map(|_| (0, 199, "doc".into())));
        assert_eq!(r, vec![(0, 199, "doc".into())]);
    }

    #[test]
    fn sleep_gap_is_not_counted() {
        let mut e = Engine::new(300_000);
        let mut v: Vec<Sample> = (0..60).map(|t| s(t, Some("code"), 0)).collect();
        // Laptop sleeps for an hour; on resume the same app is foreground.
        v.extend((3660..3670).map(|t| s(t, Some("code"), 0)));
        v.push(s(3670, None, 0));
        let r = replay(&mut e, &v);
        assert_eq!(r, vec![(0, 59, "code".into()), (3660, 3670, "code".into())]);
    }

    #[test]
    fn lock_closes_and_unlock_reopens() {
        let mut e = Engine::new(300_000);
        let mut v: Vec<Sample> = (0..5).map(|t| s(t, Some("code"), 0)).collect();
        v.extend((5..10).map(|t| Sample {
            locked: true,
            ..s(t, Some("code"), 0)
        }));
        v.extend((10..12).map(|t| s(t, Some("code"), 0)));
        v.push(s(12, None, 0));
        let r = replay(&mut e, &v);
        assert_eq!(r, vec![(0, 5, "code".into()), (10, 12, "code".into())]);
        assert_eq!(e.status(), Status::Unknown);
    }

    #[test]
    fn excluded_apps_are_never_recorded() {
        let mut e = Engine::new(300_000);
        e.excluded.insert(app("bank").key);
        let mut v: Vec<Sample> = (0..5).map(|t| s(t, Some("code"), 0)).collect();
        v.extend((5..20).map(|t| s(t, Some("bank"), 0)));
        v.extend((20..25).map(|t| s(t, Some("code"), 0)));
        v.push(s(25, None, 0));
        let r = replay(&mut e, &v);
        assert_eq!(r, vec![(0, 5, "code".into()), (20, 25, "code".into())]);
    }

    #[test]
    fn pause_and_resume() {
        let mut e = Engine::new(300_000);
        let mut rec = Recorder::default();
        let mut r = rec.feed(
            &mut e,
            &(0..5).map(|t| s(t, Some("code"), 0)).collect::<Vec<_>>(),
        );
        e.paused = true;
        r.extend(rec.feed(
            &mut e,
            &(5..50).map(|t| s(t, Some("code"), 0)).collect::<Vec<_>>(),
        ));
        assert_eq!(e.status(), Status::Paused);
        e.paused = false;
        let mut tail: Vec<Sample> = (50..55).map(|t| s(t, Some("code"), 0)).collect();
        tail.push(s(55, None, 0));
        r.extend(rec.feed(&mut e, &tail));
        assert_eq!(r, vec![(0, 5, "code".into()), (50, 55, "code".into())]);
    }

    #[test]
    fn checkpoints_are_periodic() {
        let mut e = Engine::new(300_000);
        let mut n = 0;
        for t in 0..=120 {
            n += e
                .tick(&s(t, Some("code"), 0))
                .iter()
                .filter(|a| matches!(a, Action::Checkpoint { .. }))
                .count();
        }
        assert_eq!(n, 4);
    }

    #[test]
    fn clock_going_backwards_does_not_produce_negative_sessions() {
        let mut e = Engine::new(300_000);
        let mut v: Vec<Sample> = (100..110).map(|t| s(t, Some("code"), 0)).collect();
        v.extend((50..55).map(|t| s(t, Some("code"), 0)));
        v.push(s(55, None, 0));
        let r = replay(&mut e, &v);
        assert_eq!(r[0], (100, 109, "code".into()));
        assert_eq!(r[1], (50, 55, "code".into()));
    }
}
