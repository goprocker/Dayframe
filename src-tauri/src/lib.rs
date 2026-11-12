mod categories;
mod db;
mod icons;
mod stats;
mod tracker;

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tauri::{Manager, RunEvent};

use tracker::{Control, Snapshot};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub tracker: Arc<Control>,
    pub tracker_thread: Mutex<Option<std::thread::JoinHandle<()>>>,
}

const CONSENT_KEY: &str = "tracking_consented";

#[tauri::command]
fn app_info(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let version = db::schema_version(&conn).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "schemaVersion": version,
    }))
}

#[tauri::command]
fn tracker_state(state: tauri::State<'_, AppState>) -> Result<Snapshot, String> {
    Ok(state
        .tracker
        .snapshot
        .lock()
        .map_err(|e| e.to_string())?
        .clone())
}

/// Records explicit consent. Until onboarding lands (chunk 4) the shell
/// exposes this as a temporary toggle so tracking can be tested.
#[tauri::command]
fn set_tracking_consent(state: tauri::State<'_, AppState>, consented: bool) -> Result<(), String> {
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::set_setting(&conn, CONSENT_KEY, if consented { "1" } else { "0" })
            .map_err(|e| e.to_string())?;
    }
    state.tracker.consented.store(consented, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn day_summary(
    state: tauri::State<'_, AppState>,
    from: i64,
    to: i64,
) -> Result<stats::DaySummary, String> {
    if to <= from || to - from > 26 * 3_600_000 {
        return Err("invalid day range".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    stats::day_summary(&conn, from, to).map_err(|e| e.to_string())
}

/// Totals for consecutive ranges, e.g. 8 local midnights → 7 day totals.
#[tauri::command]
fn range_totals(state: tauri::State<'_, AppState>, bounds: Vec<i64>) -> Result<Vec<i64>, String> {
    if bounds.len() > 400 || bounds.windows(2).any(|w| w[1] <= w[0]) {
        return Err("invalid bounds".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    stats::range_totals(&conn, &bounds).map_err(|e| e.to_string())
}

/// Icons as base64 PNG keyed by app id. Missing icons are extracted first
/// (outside the DB lock) and cached.
#[tauri::command]
fn app_icons(
    state: tauri::State<'_, AppState>,
) -> Result<std::collections::HashMap<i64, String>, String> {
    use base64::Engine as _;
    let missing = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::apps_without_icon(&conn).map_err(|e| e.to_string())?
    };
    if !missing.is_empty() {
        let extracted: Vec<(i64, Vec<u8>)> = missing
            .into_iter()
            .map(|(id, path)| (id, icons::extract_png(&path).unwrap_or_default()))
            .collect();
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        for (id, png) in extracted {
            db::set_app_icon(&conn, id, &png).map_err(|e| e.to_string())?;
        }
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(db::app_icons(&conn)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(id, png)| (id, base64::engine::general_purpose::STANDARD.encode(png)))
        .collect())
}

#[tauri::command]
fn set_tracking_paused(state: tauri::State<'_, AppState>, paused: bool) {
    state.tracker.paused.store(paused, Ordering::SeqCst);
}

pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("dayframe.db"))?;
            db::recover(&conn)?;
            let ctl = Arc::new(Control::default());
            let consented = db::get_setting(&conn, CONSENT_KEY)?.as_deref() == Some("1");
            ctl.consented.store(consented, Ordering::SeqCst);
            app.manage(AppState {
                db: Mutex::new(conn),
                tracker: ctl.clone(),
                tracker_thread: Mutex::new(None),
            });
            let handle = tracker::spawn(app.handle().clone(), ctl);
            *app.state::<AppState>().tracker_thread.lock().unwrap() = Some(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            tracker_state,
            set_tracking_consent,
            set_tracking_paused,
            day_summary,
            range_totals,
            app_icons
        ])
        .build(tauri::generate_context!())
        .expect("error while building Dayframe");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            // Close the open session so nothing past quit time is counted.
            let state = app.state::<AppState>();
            state.tracker.stop.store(true, Ordering::SeqCst);
            if let Some(h) = state.tracker_thread.lock().ok().and_then(|mut t| t.take()) {
                let _ = h.join();
            }
        }
    });
}
