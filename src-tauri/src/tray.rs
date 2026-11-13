//! System tray: open dashboard, pause/resume, widget, settings, quit. Closing the main
//! window hides it here instead of quitting.

use std::sync::atomic::Ordering;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::widget::WidgetState;
use crate::AppState;

pub struct TrayItems {
    pause: MenuItem<Wry>,
    widget: MenuItem<Wry>,
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Dayframe", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause tracking", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "Show widget", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Dayframe", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &pause,
            &widget,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    app.manage(Mutex::new(TrayItems {
        pause: pause.clone(),
        widget: widget.clone(),
    }));

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Dayframe")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "open" => show_main(app),
            "pause" => {
                let ctl = &app.state::<AppState>().tracker;
                let paused = !ctl.paused.load(Ordering::SeqCst);
                ctl.paused.store(paused, Ordering::SeqCst);
                sync(app);
            }
            "widget" => {
                let on = app.state::<WidgetState>().enabled.load(Ordering::SeqCst);
                if let Err(e) = crate::widget::set_enabled(app, !on) {
                    log::error!("toggle widget: {e}");
                }
            }
            "settings" => {
                show_main(app);
                let _ = app.emit("navigate", "settings");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = ev
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    sync(app);
    Ok(())
}

/// Reflect pause/consent state in the tray menu and tooltip.
pub fn sync(app: &AppHandle) {
    let ctl = &app.state::<AppState>().tracker;
    let consented = ctl.consented.load(Ordering::SeqCst);
    let paused = ctl.paused.load(Ordering::SeqCst);
    if let Some(items) = app.try_state::<Mutex<TrayItems>>() {
        if let Ok(items) = items.lock() {
            let _ = items.pause.set_enabled(consented);
            let _ = items.pause.set_text(if paused {
                "Resume tracking"
            } else {
                "Pause tracking"
            });
            let shown = app
                .try_state::<WidgetState>()
                .is_some_and(|w| w.enabled.load(Ordering::SeqCst));
            let _ = items
                .widget
                .set_text(if shown { "Hide widget" } else { "Show widget" });
        }
    }
    if let Some(tray) = app.tray_by_id("main") {
        let tip = match (consented, paused) {
            (false, _) => "Dayframe · tracking off",
            (true, true) => "Dayframe · paused",
            (true, false) => "Dayframe · tracking",
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}
