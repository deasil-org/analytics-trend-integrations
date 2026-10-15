//! A Tauri 2 app sending events to AnalyticsTrend from its Rust side, over
//! HTTP, with no SDK. The page calls the `track` command; the command queues
//! the event and sends the queue.

mod analytics;

use std::sync::Mutex;

use analytics::Analytics;
use tauri::{Manager, State};

struct Tracker(Mutex<Analytics>);

// Off the main thread, so a slow network never blocks the window.
#[tauri::command(async)]
fn track(name: String, tracker: State<Tracker>) -> Result<String, String> {
    let mut analytics = tracker.0.lock().map_err(|error| error.to_string())?;
    analytics.track(&name);
    analytics.flush().map(|(status, body)| format!("{status} {body}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // The write key is public by design: a shipped app can carry it as a constant.
            let write_key = std::env::var("ANALYTICSTREND_WRITE_KEY").unwrap_or_default();
            let endpoint = std::env::var("ANALYTICSTREND_ENDPOINT")
                .unwrap_or_else(|_| "https://analyticstrend.com/v1/collect".to_string());
            // The anonymous id lives in the app's own data directory.
            let id_file = app.path().app_data_dir()?.join("analyticstrend-id");
            let version = app.package_info().version.to_string();
            let analytics = Analytics::new(&write_key, &endpoint, id_file, &version, "example-tauri-1.0.0");
            app.manage(Tracker(Mutex::new(analytics)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![track])
        .run(tauri::generate_context!())
        .expect("the app could not start");
}
