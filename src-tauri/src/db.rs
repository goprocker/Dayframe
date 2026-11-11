//! SQLite persistence: versioned migrations, interval storage, settings.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;

use crate::categories::guess_category;
use crate::tracker::engine::ForegroundApp;

pub type Result<T> = rusqlite::Result<T>;

/// Ordered migrations. Never edit an applied migration; append a new one.
const MIGRATIONS: &[&str] = &[
    // v1
    r#"
    CREATE TABLE applications (
        id              INTEGER PRIMARY KEY,
        exe_key         TEXT NOT NULL UNIQUE,
        display_name    TEXT NOT NULL,
        executable_path TEXT NOT NULL,
        category        TEXT NOT NULL DEFAULT 'Other',
        excluded        INTEGER NOT NULL DEFAULT 0,
        icon_png        BLOB,
        first_seen_at   INTEGER NOT NULL
    );
    CREATE TABLE projects (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        color      TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE activity_sessions (
        id               INTEGER PRIMARY KEY,
        application_id   INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        started_at       INTEGER NOT NULL,
        ended_at         INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL,
        project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        CHECK (ended_at >= started_at)
    );
    CREATE INDEX idx_sessions_started ON activity_sessions(started_at);
    CREATE INDEX idx_sessions_ended   ON activity_sessions(ended_at);
    CREATE INDEX idx_sessions_app     ON activity_sessions(application_id);
    CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
];

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 3000;",
    )
}

pub fn schema_version(conn: &Connection) -> Result<i64> {
    conn.query_row("PRAGMA user_version", [], |r| r.get(0))
}

pub fn migrate(conn: &Connection) -> Result<()> {
    let current = schema_version(conn)? as usize;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))?;
        tx.commit()?;
    }
    Ok(())
}

/// Repair anything a crash may have left behind. Sessions are always stored
/// closed (ended_at = last checkpoint), so this only normalises durations.
pub fn recover(conn: &Connection) -> Result<usize> {
    conn.execute(
        "UPDATE activity_sessions
            SET duration_seconds = (ended_at - started_at) / 1000
          WHERE duration_seconds != (ended_at - started_at) / 1000",
        [],
    )
}

// ---------------------------------------------------------------- applications

pub fn upsert_app(conn: &Connection, app: &ForegroundApp, now_ms: i64) -> Result<i64> {
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM applications WHERE exe_key = ?1",
            [&app.key],
            |r| r.get::<_, i64>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO applications (exe_key, display_name, executable_path, category, first_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            app.key,
            app.display_name,
            app.exe_path,
            guess_category(&app.key),
            now_ms
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppRow {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub category: String,
    pub excluded: bool,
    pub first_seen_at: i64,
}

pub fn list_apps(conn: &Connection) -> Result<Vec<AppRow>> {
    let mut st = conn.prepare(
        "SELECT id, display_name, executable_path, category, excluded, first_seen_at
           FROM applications ORDER BY display_name COLLATE NOCASE",
    )?;
    let rows = st.query_map([], |r| {
        Ok(AppRow {
            id: r.get(0)?,
            name: r.get(1)?,
            path: r.get(2)?,
            category: r.get(3)?,
            excluded: r.get::<_, i64>(4)? != 0,
            first_seen_at: r.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn excluded_keys(conn: &Connection) -> Result<Vec<String>> {
    let mut st = conn.prepare("SELECT exe_key FROM applications WHERE excluded = 1")?;
    let rows = st.query_map([], |r| r.get(0))?;
    rows.collect()
}

pub fn set_app_excluded(conn: &Connection, id: i64, excluded: bool) -> Result<()> {
    conn.execute(
        "UPDATE applications SET excluded = ?2 WHERE id = ?1",
        params![id, excluded as i64],
    )?;
    Ok(())
}

pub fn set_app_category(conn: &Connection, id: i64, category: &str) -> Result<()> {
    conn.execute(
        "UPDATE applications SET category = ?2 WHERE id = ?1",
        params![id, category],
    )?;
    Ok(())
}

// -------------------------------------------------------------------- sessions

pub fn open_session(conn: &Connection, app_id: i64, start_ms: i64) -> Result<i64> {
    conn.execute(
        "INSERT INTO activity_sessions (application_id, started_at, ended_at, duration_seconds)
         VALUES (?1, ?2, ?2, 0)",
        params![app_id, start_ms],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn set_session_end(conn: &Connection, id: i64, end_ms: i64) -> Result<()> {
    conn.execute(
        "UPDATE activity_sessions
            SET ended_at = MAX(started_at, ?2),
                duration_seconds = (MAX(started_at, ?2) - started_at) / 1000
          WHERE id = ?1",
        params![id, end_ms],
    )?;
    Ok(())
}

/// A session clipped to a query window.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Interval {
    pub app_id: i64,
    pub start: i64,
    pub end: i64,
}

/// Sessions overlapping `[from, to)`, clipped to the window, ordered by start.
pub fn intervals(conn: &Connection, from: i64, to: i64) -> Result<Vec<Interval>> {
    let mut st = conn.prepare_cached(
        "SELECT application_id, MAX(started_at, ?1), MIN(ended_at, ?2)
           FROM activity_sessions
          WHERE started_at < ?2 AND ended_at > ?1
          ORDER BY started_at",
    )?;
    let rows = st.query_map(params![from, to], |r| {
        Ok(Interval {
            app_id: r.get(0)?,
            start: r.get(1)?,
            end: r.get(2)?,
        })
    })?;
    rows.collect()
}

/// Remove tracked time inside `[from, to)`. Sessions straddling a boundary are
/// trimmed, so time outside the range is preserved.
pub fn delete_range(conn: &Connection, from: i64, to: i64) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    // Sessions covering the whole range: keep a tail copy, then trim to a head.
    tx.execute(
        "INSERT INTO activity_sessions (application_id, started_at, ended_at, duration_seconds, project_id)
         SELECT application_id, ?2, ended_at, (ended_at - ?2) / 1000, project_id
           FROM activity_sessions WHERE started_at < ?1 AND ended_at > ?2",
        params![from, to],
    )?;
    tx.execute(
        "DELETE FROM activity_sessions WHERE started_at >= ?1 AND ended_at <= ?2",
        params![from, to],
    )?;
    tx.execute(
        "UPDATE activity_sessions SET ended_at = ?1, duration_seconds = (?1 - started_at) / 1000
          WHERE started_at < ?1 AND ended_at > ?1",
        params![from],
    )?;
    tx.execute(
        "UPDATE activity_sessions SET started_at = ?2, duration_seconds = (ended_at - ?2) / 1000
          WHERE started_at >= ?1 AND started_at < ?2 AND ended_at > ?2",
        params![from, to],
    )?;
    tx.commit()
}

pub fn delete_all(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "BEGIN; DELETE FROM activity_sessions; DELETE FROM applications; COMMIT; VACUUM;",
    )
}

// -------------------------------------------------------------------- settings

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
        r.get(0)
    })
    .optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn all_settings(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut st = conn.prepare("SELECT key, value FROM settings")?;
    let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(n: &str) -> ForegroundApp {
        ForegroundApp {
            key: format!("c:\\{n}.exe"),
            exe_path: format!("C:\\{n}.exe"),
            display_name: n.into(),
        }
    }

    fn spans(c: &Connection) -> Vec<(i64, i64)> {
        intervals(c, 0, i64::MAX)
            .unwrap()
            .iter()
            .map(|i| (i.start, i.end))
            .collect()
    }

    #[test]
    fn migrations_apply_once_and_are_idempotent() {
        let c = open_in_memory().unwrap();
        assert_eq!(schema_version(&c).unwrap(), MIGRATIONS.len() as i64);
        migrate(&c).unwrap();
        assert_eq!(schema_version(&c).unwrap(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn upsert_is_stable_and_categorises() {
        let c = open_in_memory().unwrap();
        let a = upsert_app(&c, &app("code"), 0).unwrap();
        assert_eq!(a, upsert_app(&c, &app("code"), 5).unwrap());
        assert_eq!(list_apps(&c).unwrap()[0].category, "Development");
    }

    #[test]
    fn sessions_clip_to_window() {
        let c = open_in_memory().unwrap();
        let a = upsert_app(&c, &app("code"), 0).unwrap();
        let s = open_session(&c, a, 1_000).unwrap();
        set_session_end(&c, s, 10_000).unwrap();
        assert_eq!(
            intervals(&c, 5_000, 20_000).unwrap(),
            vec![Interval {
                app_id: a,
                start: 5_000,
                end: 10_000
            }]
        );
        assert!(intervals(&c, 10_000, 20_000).unwrap().is_empty());
    }

    #[test]
    fn end_never_precedes_start() {
        let c = open_in_memory().unwrap();
        let a = upsert_app(&c, &app("code"), 0).unwrap();
        let s = open_session(&c, a, 10_000).unwrap();
        set_session_end(&c, s, 5_000).unwrap();
        assert!(spans(&c).iter().all(|(s, e)| e >= s)); // clamped, never negative
    }

    #[test]
    fn crash_recovery_keeps_last_checkpoint() {
        let dir = std::env::temp_dir().join(format!("dayframe-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");
        {
            let c = open(&path).unwrap();
            let a = upsert_app(&c, &app("code"), 0).unwrap();
            let s = open_session(&c, a, 0).unwrap();
            set_session_end(&c, s, 30_000).unwrap();
            // simulated crash: session never explicitly closed
        }
        let c = open(&path).unwrap();
        recover(&c).unwrap();
        assert_eq!(spans(&c), vec![(0, 30_000)]);
        drop(c);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_range_trims_and_splits() {
        let c = open_in_memory().unwrap();
        let a = upsert_app(&c, &app("code"), 0).unwrap();
        let mk = |s, e| {
            let id = open_session(&c, a, s).unwrap();
            set_session_end(&c, id, e).unwrap();
        };
        mk(0, 300_000); // covers whole range -> split
        mk(10_000, 30_000); // before range -> kept
        mk(50_000, 60_000); // inside -> removed
        mk(150_000, 250_000); // straddles end -> head trimmed
        delete_range(&c, 40_000, 200_000).unwrap();
        assert_eq!(
            spans(&c),
            vec![
                (0, 40_000),
                (10_000, 30_000),
                (200_000, 250_000),
                (200_000, 300_000)
            ]
        );
    }

    #[test]
    fn settings_roundtrip() {
        let c = open_in_memory().unwrap();
        set_setting(&c, "k", "1").unwrap();
        set_setting(&c, "k", "2").unwrap();
        assert_eq!(get_setting(&c, "k").unwrap().as_deref(), Some("2"));
        assert_eq!(all_settings(&c).unwrap().len(), 1);
    }
}
