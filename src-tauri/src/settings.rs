//! Settings, consent, exclusions, categories and data deletion commands.

use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::categories::CATEGORIES;
use crate::{db, tray, AppState};

pub const CONSENT_KEY: &str = "tracking_consented";
pub const THEME_KEY: &str = "theme";
pub const IDLE_KEY: &str = "idle_threshold_ms";
pub const AUTOSTART_INIT_KEY: &str = "autostart_initialized";

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub consented: bool,
    pub theme: String,
    pub idle_threshold_minutes: i64,
    pub autostart: bool,
    pub widget: bool,
    pub data_dir: String,
    pub version: String,
    pub categories: Vec<String>,
}

#[tauri::command]
pub fn get_settings(app: AppHandle, state: State<'_, AppState>) -> CmdResult<SettingsView> {
    let conn = state.db.lock().map_err(err)?;
    let get = |k: &str| db::get_setting(&conn, k).ok().flatten();
    let idle_ms = get(IDLE_KEY)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(crate::tracker::DEFAULT_IDLE_MS);
    Ok(SettingsView {
        consented: get(CONSENT_KEY).as_deref() == Some("1"),
        theme: get(THEME_KEY).unwrap_or_else(|| "system".into()),
        idle_threshold_minutes: idle_ms / 60_000,
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        widget: get(crate::widget::ENABLED_KEY).as_deref() == Some("1"),
        data_dir: app
            .path()
            .app_data_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        version: env!("CARGO_PKG_VERSION").into(),
        categories: CATEGORIES.iter().map(|s| s.to_string()).collect(),
    })
}

#[tauri::command]
pub fn set_tracking_consent(
    app: AppHandle,
    state: State<'_, AppState>,
    consented: bool,
) -> CmdResult<()> {
    {
        let conn = state.db.lock().map_err(err)?;
        db::set_setting(&conn, CONSENT_KEY, if consented { "1" } else { "0" }).map_err(err)?;
    }
    state.tracker.consented.store(consented, Ordering::SeqCst);
    tray::sync(&app);
    Ok(())
}

#[tauri::command]
pub fn set_tracking_paused(app: AppHandle, state: State<'_, AppState>, paused: bool) {
    state.tracker.paused.store(paused, Ordering::SeqCst);
    tray::sync(&app);
}

#[tauri::command]
pub fn set_theme(app: AppHandle, state: State<'_, AppState>, theme: String) -> CmdResult<()> {
    if !matches!(theme.as_str(), "system" | "dark" | "light") {
        return Err("invalid theme".into());
    }
    {
        let conn = state.db.lock().map_err(err)?;
        db::set_setting(&conn, THEME_KEY, &theme).map_err(err)?;
    }
    // The widget window follows the dashboard's theme.
    let _ = app.emit("theme", &theme);
    Ok(())
}

#[tauri::command]
pub fn set_idle_threshold(state: State<'_, AppState>, minutes: i64) -> CmdResult<()> {
    if !(1..=120).contains(&minutes) {
        return Err("idle threshold must be 1–120 minutes".into());
    }
    let conn = state.db.lock().map_err(err)?;
    db::set_setting(&conn, IDLE_KEY, &(minutes * 60_000).to_string()).map_err(err)?;
    state.tracker.reload.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> CmdResult<()> {
    let al = app.autolaunch();
    if enabled {
        al.enable().map_err(err)
    } else {
        al.disable().map_err(err)
    }
}

#[tauri::command]
pub fn list_apps(state: State<'_, AppState>) -> CmdResult<Vec<db::AppRow>> {
    let conn = state.db.lock().map_err(err)?;
    db::list_apps(&conn).map_err(err)
}

#[tauri::command]
pub fn set_app_excluded(state: State<'_, AppState>, id: i64, excluded: bool) -> CmdResult<()> {
    let conn = state.db.lock().map_err(err)?;
    db::set_app_excluded(&conn, id, excluded).map_err(err)?;
    state.tracker.reload.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn set_app_category(state: State<'_, AppState>, id: i64, category: String) -> CmdResult<()> {
    if !CATEGORIES.contains(&category.as_str()) {
        return Err("unknown category".into());
    }
    let conn = state.db.lock().map_err(err)?;
    db::set_app_category(&conn, id, &category).map_err(err)
}

/// Bring the open session row up to `now` so a deletion sees all live time.
/// Returns its start time.
fn checkpoint_live(
    conn: &rusqlite::Connection,
    state: &AppState,
    now: i64,
) -> CmdResult<Option<i64>> {
    let id = state.tracker.live_session.load(Ordering::SeqCst);
    if id == 0 {
        return Ok(None);
    }
    db::set_session_end(conn, id, now).map_err(err)?;
    db::session_start(conn, id).map_err(err)
}

fn reopen(state: &AppState, at: i64) {
    state.tracker.reopen_at.store(at, Ordering::SeqCst);
    state.tracker.reopen.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn delete_range(state: State<'_, AppState>, from: i64, to: i64) -> CmdResult<()> {
    if to <= from {
        return Err("invalid range".into());
    }
    let conn = state.db.lock().map_err(err)?;
    let now = crate::tracker::now_ms();
    let live = checkpoint_live(&conn, &state, now)?;
    db::delete_range(&conn, from, to).map_err(err)?;
    // Only a deletion touching the live session changes its row.
    if live.is_some_and(|start| from < now && to > start) {
        reopen(&state, now);
    }
    Ok(())
}

#[tauri::command]
pub fn delete_all_data(state: State<'_, AppState>) -> CmdResult<()> {
    let conn = state.db.lock().map_err(err)?;
    let now = crate::tracker::now_ms();
    checkpoint_live(&conn, &state, now)?;
    db::delete_all(&conn).map_err(err)?;
    reopen(&state, now);
    state.tracker.reload.store(true, Ordering::SeqCst);
    Ok(())
}
