use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

#[tauri::command]
fn trigger_native_toast(app: tauri::AppHandle, title: String, body: String) {
    #[cfg(windows)]
    {
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

        let _ = toast
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
            .show();
    }

    #[cfg(not(windows))]
    {
        use tauri_plugin_notification::NotificationExt;
        let builder = app.notification().builder().title(title).body(body);

        // macOS notifications are silent unless a sound name is given.
        // "Glass" is a built-in system sound (/System/Library/Sounds).
        #[cfg(target_os = "macos")]
        let builder = builder.sound("Glass");

        let _ = builder.show();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![trigger_native_toast])
        .setup(|app| {
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
