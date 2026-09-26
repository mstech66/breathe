use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

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
        use std::path::PathBuf;
        use tauri::Emitter;
        use tauri_winrt_notification::{IconCrop, Scenario, Sound, Toast};
        let app_handle = app.clone();
        let mut toast = Toast::new("com.breathe.desktop");
        toast = toast
            .title(&title)
            .text1(&body)
            .scenario(Scenario::Reminder)
            .add_button("🌸 Breathe Now", "breathe_now")
            .sound(Some(Sound::Reminder));

        let icon_path = PathBuf::from(r"D:\Projects\breathe\src-tauri\icons\128x128.png");
        if icon_path.exists() {
            toast = toast.icon(&icon_path, IconCrop::Circular, "Breathe");
        }

        toast
            .on_activated(move |action| {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![trigger_native_toast])
        .setup(|app| {
            // UNUserNotificationCenter shows nothing until the user grants permission,
            // so ask once at launch (macOS only prompts the first time).
            // Errors in `tauri dev`, where there is no .app bundle; safe to ignore.
            #[cfg(target_os = "macos")]
            tauri::async_runtime::spawn(async {
                let _ = notify_rust::request_auth().await;
            });

            let show_item = MenuItem::with_id(app, "show", "Open Breathe", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Breathe - Mindful Reminders")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
