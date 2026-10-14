use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WindowEvent,
};

const TRAY_ID: &str = "main";
const POPOVER: &str = "tray";

/// Whether closing the window hides Breathe to the tray (true) or quits (false).
/// The frontend sets this from the "When I close the window" setting.
struct CloseToTray(AtomicBool);

/// When the popover last hid itself after losing focus. Clicking the tray icon
/// while the popover is open first blurs it (hiding it), then delivers the click;
/// this lets that click close the popover instead of reopening it.
struct PopoverHiddenAt(Mutex<Option<Instant>>);

fn show_main_window(app: &AppHandle) {
    hide_popover(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_popover(app: &AppHandle) {
    if let Some(popover) = app.get_webview_window(POPOVER) {
        let _ = popover.hide();
    }
}

/// Tray icon click: open the popover, or close it if it's already open.
fn toggle_popover(app: &AppHandle, click: PhysicalPosition<f64>) {
    let Some(popover) = app.get_webview_window(POPOVER) else { return };

    if popover.is_visible().unwrap_or(false) {
        let _ = popover.hide();
        return;
    }
    let just_hidden = app
        .state::<PopoverHiddenAt>()
        .0
        .lock()
        .map(|t| t.map_or(false, |at| at.elapsed() < Duration::from_millis(300)))
        .unwrap_or(false);
    if just_hidden {
        return;
    }
    show_popover_at(app, click);
}

/// Main window closed to the tray: open the popover by the tray icon so it's
/// clear Breathe is still running and where to find it.
fn show_popover_at_tray(app: &AppHandle) {
    let anchor = app
        .tray_by_id(TRAY_ID)
        .and_then(|tray| tray.rect().ok().flatten())
        .map(|rect| {
            let scale = app
                .primary_monitor()
                .ok()
                .flatten()
                .map_or(1.0, |m| m.scale_factor());
            let pos = rect.position.to_physical::<f64>(scale);
            let size = rect.size.to_physical::<f64>(scale);
            PhysicalPosition::new(pos.x + size.width / 2.0, pos.y + size.height / 2.0)
        })
        .or_else(|| {
            // No icon position on this platform: use the bottom-right corner
            let monitor = app.primary_monitor().ok().flatten()?;
            let area = monitor.work_area();
            Some(PhysicalPosition::new(
                (area.position.x + area.size.width as i32) as f64 - 40.0,
                (area.position.y + area.size.height as i32) as f64,
            ))
        });
    if let Some(point) = anchor {
        show_popover_at(app, point);
    }
}

/// Opens the popover just above the given point (or below it when the taskbar or
/// menu bar is at the top of the screen), kept inside the screen's work area.
fn show_popover_at(app: &AppHandle, click: PhysicalPosition<f64>) {
    let Some(popover) = app.get_webview_window(POPOVER) else { return };

    let size = popover.outer_size().unwrap_or(tauri::PhysicalSize::new(340, 404));
    let (w, h) = (size.width as f64, size.height as f64);
    let monitor = app
        .monitor_from_point(click.x, click.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());

    let gap = 12.0;
    let (mut x, mut y) = (click.x - w / 2.0, click.y - h - gap);
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let (left, top) = (area.position.x as f64, area.position.y as f64);
        let (right, bottom) = (left + area.size.width as f64, top + area.size.height as f64);
        if click.y < top + (bottom - top) / 2.0 {
            y = top + gap; // taskbar / menu bar at the top
        } else {
            y = bottom - h - gap;
        }
        x = x.clamp(left + gap, (right - w - gap).max(left + gap));
    }

    let _ = popover.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    let _ = popover.show();
    let _ = popover.set_focus();
    let _ = app.emit("popover-opened", ());
}

/// Called by buttons in the tray popover; same actions as the tray menu.
#[tauri::command]
fn tray_action(app: AppHandle, action: String) {
    run_tray_action(&app, &action);
}

fn run_tray_action(app: &AppHandle, action: &str) {
    match action {
        "show" => show_main_window(app),
        "hide" => hide_popover(app),
        "quit" => app.exit(0),
        // Actions that need the main window open
        "breathe" | "settings" => {
            show_main_window(app);
            let _ = app.emit("tray-action", action);
        }
        // Actions that work quietly in the background
        "toggle-pause" | "break-now" | "start" | "snooze-15" | "snooze-30" | "snooze-60" => {
            let _ = app.emit("tray-action", action);
        }
        _ => {}
    }
}

/// Shows a system notification. Errors are returned to the frontend so failures
/// are visible instead of silently dropped.
#[tauri::command]
async fn trigger_native_toast(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri::path::BaseDirectory;
        use tauri_winrt_notification::{IconCrop, Scenario, Sound, Toast};
        let app_handle = app.clone();
        // Installer builds register "com.breathe.desktop" through their Start menu
        // shortcut. A Microsoft Store (MSIX) install must use its package identity.
        let app_id = store_package_family()
            .map(|family| format!("{family}!App"))
            .unwrap_or_else(|| "com.breathe.desktop".to_string());
        let mut toast = Toast::new(&app_id);
        toast = toast
            .title(&title)
            .text1(&body)
            .scenario(Scenario::Reminder)
            .add_button("🌸 Breathe Now", "breathe_now")
            .sound(Some(Sound::Reminder));

        // Bundled with the app (see bundle.resources in tauri.conf.json)
        if let Ok(icon_path) = app.path().resolve("icons/128x128.png", BaseDirectory::Resource) {
            if icon_path.exists() {
                toast = toast.icon(&icon_path, IconCrop::Circular, "Breathe");
            }
        }

        toast
            .on_activated(move |action| {
                show_main_window(&app_handle);
                if let Some(act) = action {
                    if act == "breathe_now" {
                        let _ = app_handle.emit("trigger-breathe-now", ());
                    }
                }
                Ok(())
            })
            .show()
            .map_err(|e| format!("Windows couldn't show the notification: {e}"))?;
    }

    // macOS: call notify-rust (UNUserNotificationCenter backend) directly rather than
    // through the plugin, which discards errors.
    #[cfg(target_os = "macos")]
    {
        let _ = &app;
        // Returns immediately once the user has answered the permission prompt.
        let granted = notify_rust::request_auth()
            .await
            .map_err(|e| format!("Couldn't request notification permission: {e}"))?;
        if !granted {
            return Err("macOS isn't allowing notifications from Breathe. Check System Settings → Notifications → Breathe.".into());
        }

        notify_rust::Notification::new()
            .summary(&title)
            .body(&body)
            .sound_name("Glass") // built-in system sound; silent without one
            .show_async()
            .await
            .map_err(|e| format!("macOS refused the notification: {e}"))?;
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Keeps the tray tooltip in step with the timer ("Breathe · break in 12 min").
#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(text)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_close_to_tray(state: tauri::State<'_, CloseToTray>, enabled: bool) {
    state.0.store(enabled, Ordering::Relaxed);
}

/// Package family name when running as a Microsoft Store (MSIX) install, else None.
///
/// Store apps run from `...\WindowsApps\<PackageFullName>\`, where the full name is
/// `Name_Version_Arch_ResourceId_PublisherId`. The family name is `Name_PublisherId`.
/// Package names can't contain underscores, so splitting on `_` is safe.
fn store_package_family() -> Option<String> {
    if !cfg!(windows) {
        return None;
    }
    let exe = std::env::current_exe().ok()?;
    package_family_from_path(&exe)
}

fn package_family_from_path(exe: &std::path::Path) -> Option<String> {
    let mut parts = exe.components().map(|c| c.as_os_str().to_string_lossy().to_string());
    parts.find(|p| p.eq_ignore_ascii_case("WindowsApps"))?;
    let full_name = parts.next()?;
    let pieces: Vec<&str> = full_name.split('_').collect();
    if pieces.len() != 5 || pieces[0].is_empty() || pieces[4].is_empty() {
        return None;
    }
    Some(format!("{}_{}", pieces[0], pieces[4]))
}

/// Tells the frontend whether this is the Microsoft Store build. Store builds can't
/// use the launch-at-login plugin (Windows manages it under Settings → Apps → Startup).
#[tauri::command]
fn is_store_package() -> bool {
    store_package_family().is_some()
}

/// Opens Windows Settings → Apps → Startup, where Store apps are switched on at login.
#[tauri::command]
fn open_startup_settings() -> Result<(), String> {
    tauri_plugin_opener::open_url("ms-settings:startupapps", None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::package_family_from_path;
    use std::path::Path;

    #[test]
    fn reads_family_name_from_store_install_path() {
        let p = Path::new(r"C:\Program Files\WindowsApps\12345Manthan.Breathe_1.1.0.0_x64__abcd1234efgh5\Breathe.exe");
        // On Linux the backslashes aren't separators, so test with forward slashes too.
        let q = Path::new("/Program Files/WindowsApps/12345Manthan.Breathe_1.1.0.0_x64__abcd1234efgh5/Breathe.exe");
        for path in [p, q] {
            if let Some(family) = package_family_from_path(path) {
                assert_eq!(family, "12345Manthan.Breathe_abcd1234efgh5");
                return;
            }
        }
        panic!("no family name parsed");
    }

    #[test]
    fn ignores_normal_installs() {
        let p = Path::new("/Program Files/Breathe/Breathe.exe");
        assert_eq!(package_family_from_path(p), None);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(CloseToTray(AtomicBool::new(true)))
        .manage(PopoverHiddenAt(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            trigger_native_toast,
            set_tray_tooltip,
            set_close_to_tray,
            tray_action,
            is_store_package,
            open_startup_settings
        ])
        .setup(|app| {
            // UNUserNotificationCenter shows nothing until the user grants permission,
            // so ask once at launch (macOS only prompts the first time).
            // Errors in `tauri dev`, where there is no .app bundle; safe to ignore.
            #[cfg(target_os = "macos")]
            tauri::async_runtime::spawn(async {
                let _ = notify_rust::request_auth().await;
            });

            let open_item = MenuItem::with_id(app, "show", "Open Breathe", true, None::<&str>)?;
            let breathe_item = MenuItem::with_id(app, "breathe", "Take a breath", true, None::<&str>)?;
            let pause_item = MenuItem::with_id(app, "toggle-pause", "Pause / resume", true, None::<&str>)?;
            let break_item = MenuItem::with_id(app, "break-now", "Start break now", true, None::<&str>)?;
            let snooze_menu = Submenu::with_items(
                app,
                "Snooze reminders",
                true,
                &[
                    &MenuItem::with_id(app, "snooze-15", "15 minutes", true, None::<&str>)?,
                    &MenuItem::with_id(app, "snooze-30", "30 minutes", true, None::<&str>)?,
                    &MenuItem::with_id(app, "snooze-60", "1 hour", true, None::<&str>)?,
                ],
            )?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Breathe", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &PredefinedMenuItem::separator(app)?,
                    &breathe_item,
                    &pause_item,
                    &break_item,
                    &snooze_menu,
                    &PredefinedMenuItem::separator(app)?,
                    &settings_item,
                    &quit_item,
                ],
            )?;

            let _tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Breathe")
                .on_menu_event(|app, event| run_tray_action(app, event.id.as_ref()))
                .on_tray_icon_event(|tray, event| match event {
                    // Left click: the quick popover. Right click: the menu.
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } => toggle_popover(tray.app_handle(), position),
                    TrayIconEvent::DoubleClick { .. } => show_main_window(tray.app_handle()),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == POPOVER {
                match event {
                    WindowEvent::Focused(false) => {
                        let _ = window.hide();
                        if let Ok(mut at) = window.state::<PopoverHiddenAt>().0.lock() {
                            *at = Some(Instant::now());
                        }
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    _ => {}
                }
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let to_tray = window
                    .state::<CloseToTray>()
                    .0
                    .load(Ordering::Relaxed);
                if to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                    show_popover_at_tray(window.app_handle());
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
