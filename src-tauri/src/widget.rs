//! Floating widget: a small transparent, always-on-top window showing the
//! current app and session time. Hidden while a fullscreen app has focus.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::{db, tray, AppState};

pub const LABEL: &str = "widget";
pub const ENABLED_KEY: &str = "widget_enabled";
pub const POS_KEY: &str = "widget_position";

const COLLAPSED: (f64, f64) = (248.0, 44.0);
const EXPANDED: (f64, f64) = (280.0, 236.0);
const MARGIN: i32 = 24;

#[derive(Default)]
pub struct WidgetState {
    pub enabled: AtomicBool,
    fullscreen: AtomicBool,
}

fn size(expanded: bool) -> Size {
    let (w, h) = if expanded { EXPANDED } else { COLLAPSED };
    Size::Logical(LogicalSize::new(w, h))
}

fn parse_pos(v: &str) -> Option<(i32, i32)> {
    let (x, y) = v.split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

/// Saved position if it is still on a connected monitor, else top-right of
/// the primary monitor.
fn initial_position(app: &AppHandle) -> Option<PhysicalPosition<i32>> {
    let saved = app
        .state::<AppState>()
        .db
        .lock()
        .ok()
        .and_then(|c| db::get_setting(&c, POS_KEY).ok().flatten())
        .and_then(|v| parse_pos(&v));
    let monitors = app.available_monitors().unwrap_or_default();
    if let Some((x, y)) = saved {
        let visible = monitors.iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            x >= p.x && y >= p.y && x < p.x + s.width as i32 && y < p.y + s.height as i32
        });
        if visible {
            return Some(PhysicalPosition::new(x, y));
        }
    }
    let m = app.primary_monitor().ok().flatten()?;
    let w = (COLLAPSED.0 * m.scale_factor()) as i32;
    let margin = (MARGIN as f64 * m.scale_factor()) as i32;
    Some(PhysicalPosition::new(
        m.position().x + m.size().width as i32 - w - margin,
        m.position().y + margin,
    ))
}

fn ensure(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Dayframe widget")
        .inner_size(COLLAPSED.0, COLLAPSED.1)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .build()?;
    if let Some(p) = initial_position(app) {
        let _ = w.set_position(Position::Physical(p));
    }
    Ok(w)
}

/// Show or hide the widget from the enabled flag and fullscreen state.
/// Must not be called from a synchronous command (window creation would
/// deadlock on Windows); setup, async commands, tray and the tracker
/// thread are fine.
pub fn apply(app: &AppHandle) {
    let st = app.state::<WidgetState>();
    let enabled = st.enabled.load(Ordering::SeqCst);
    let show = enabled && !st.fullscreen.load(Ordering::SeqCst);
    if show {
        match ensure(app) {
            Ok(w) => {
                let _ = w.show();
            }
            Err(e) => log::error!("widget window failed: {e}"),
        }
    } else if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::set_setting(&conn, ENABLED_KEY, if enabled { "1" } else { "0" })
            .map_err(|e| e.to_string())?;
    }
    app.state::<WidgetState>()
        .enabled
        .store(enabled, Ordering::SeqCst);
    apply(app);
    tray::sync(app);
    Ok(())
}

/// Called by the tracker loop when fullscreen state changes.
pub fn set_fullscreen(app: &AppHandle, fullscreen: bool) {
    let st = app.state::<WidgetState>();
    if st.fullscreen.swap(fullscreen, Ordering::SeqCst) != fullscreen {
        apply(app);
    }
}

#[tauri::command]
pub async fn set_widget_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    set_enabled(&app, enabled)
}

#[tauri::command]
pub fn set_widget_expanded(app: AppHandle, expanded: bool) -> Result<(), String> {
    let w = app.get_webview_window(LABEL).ok_or("widget not open")?;
    w.set_size(size(expanded)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_widget_position(
    state: tauri::State<'_, AppState>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, POS_KEY, &format!("{x},{y}")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_dashboard(app: AppHandle) {
    tray::show_main(&app);
}

#[cfg(test)]
mod tests {
    use super::parse_pos;

    #[test]
    fn parses_saved_position() {
        assert_eq!(parse_pos("10,-20"), Some((10, -20)));
        assert_eq!(parse_pos(" 5 , 6 "), Some((5, 6)));
        assert_eq!(parse_pos("nope"), None);
        assert_eq!(parse_pos("1,x"), None);
    }
}
