mod categories;
mod db;
mod icons;
mod settings;
mod stats;
mod tracker;
mod tray;

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tauri::{Manager, RunEvent, WindowEvent};

use tracker::{Control, Snapshot};

const MINIMIZED_ARG: &str = "--minimized";

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub tracker: Arc<Control>,
    pub tracker_thread: Mutex<Option<std::thread::JoinHandle<()>>>,
}

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

pub fn run() {
    let app = tauri::Builder::default()
        // Must be first: a second launch focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_ARG]),
        ))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("dayframe.db"))?;
            db::recover(&conn)?;
            let ctl = Arc::new(Control::default());
            let consented = db::get_setting(&conn, settings::CONSENT_KEY)?.as_deref() == Some("1");
            ctl.consented.store(consented, Ordering::SeqCst);
            app.manage(AppState {
                db: Mutex::new(conn),
                tracker: ctl.clone(),
                tracker_thread: Mutex::new(None),
            });
            let handle = tracker::spawn(app.handle().clone(), ctl);
            *app.state::<AppState>().tracker_thread.lock().unwrap() = Some(handle);
            tray::build(app.handle())?;
            // Autostart launches straight to the tray.
            if !std::env::args().any(|a| a == MINIMIZED_ARG) {
                tray::show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the dashboard keeps tracking running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            tracker_state,
            day_summary,
            range_totals,
            app_icons,
            settings::get_settings,
            settings::set_tracking_consent,
            settings::set_tracking_paused,
            settings::set_theme,
            settings::set_idle_threshold,
            settings::set_autostart,
            settings::list_apps,
            settings::set_app_excluded,
            settings::set_app_category,
            settings::delete_range,
            settings::delete_all_data
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
