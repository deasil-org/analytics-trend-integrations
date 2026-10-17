//! Sending events to AnalyticsTrend over HTTP, with no SDK: a queue of events,
//! an anonymous id kept in a file, and a send that retries with the same body.

use std::fs;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

/// The system this runs on, as one of the collector's families. A native
/// app's User-Agent names none, so the app says it: never a version or a model.
pub fn os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "ios" => "iOS",
        "android" => "Android",
        _ => "Linux",
    }
}

pub fn device_type() -> &'static str {
    match std::env::consts::OS {
        "ios" | "android" => "mobile",
        _ => "desktop",
    }
}

pub struct Analytics {
    write_key: String,
    endpoint: String,
    id_file: PathBuf,
    app_version: String,
    client_version: String,
    queue: Vec<Value>,
}

impl Analytics {
    pub fn new(write_key: &str, endpoint: &str, id_file: PathBuf, app_version: &str, client_version: &str) -> Self {
        Analytics {
            write_key: write_key.to_string(),
            endpoint: endpoint.to_string(),
            id_file,
            app_version: app_version.to_string(),
            client_version: client_version.to_string(),
            queue: Vec::new(),
        }
    }

    /// One random id per user, made once and kept. Never an email address, an
    /// account id or a device identifier.
    pub fn anonymous_id(&self) -> String {
        if let Ok(id) = fs::read_to_string(&self.id_file) {
            if !id.trim().is_empty() {
                return id.trim().to_string();
            }
        }
        let id = Uuid::new_v4().to_string();
        if let Some(dir) = self.id_file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(&self.id_file, &id);
        id
    }

    /// Each event gets its own id when it happens, so a retry sends the same ids.
    pub fn track(&mut self, name: &str) {
        self.queue.push(json!({
            "id": Uuid::new_v4().to_string(),
            "name": name,
            "ts": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        }));
    }

    /// A screen as it appears, by the name you give it: never a person's name,
    /// a note's title or an id.
    pub fn screen(&mut self, name: &str) {
        self.queue.push(json!({
            "id": Uuid::new_v4().to_string(),
            "name": "screen_view",
            "ts": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
            "props": { "$screen": name },
        }));
    }

    pub fn batch(&self) -> Value {
        json!({
            "writeKey": self.write_key,
            "client": "app",
            "clientVersion": self.client_version,
            "appVersion": self.app_version,
            "anonymousId": self.anonymous_id(),
            "os": os(),
            "deviceType": device_type(),
            "events": self.queue,
        })
    }

    /// Sends the queue as one batch. A network error or a 5xx is retried with
    /// the same body; a 4xx is not, since sending it again would not help.
    pub fn flush(&mut self) -> Result<(u16, String), String> {
        if self.queue.is_empty() {
            return Ok((204, String::new()));
        }
        let body = self.batch().to_string();
        let delays = [500, 1000, 2000];
        let mut attempt = 0;
        loop {
            let result = ureq::post(&self.endpoint).set("content-type", "application/json").send_string(&body);
            let retry = match &result {
                Ok(_) => false,
                Err(ureq::Error::Status(code, _)) => *code >= 500,
                Err(ureq::Error::Transport(_)) => true,
            };
            if !retry || attempt == delays.len() {
                return match result {
                    Ok(response) => {
                        self.queue.clear();
                        Ok((response.status(), response.into_string().unwrap_or_default()))
                    }
                    Err(ureq::Error::Status(code, response)) => Ok((code, response.into_string().unwrap_or_default())),
                    Err(error) => Err(error.to_string()),
                };
            }
            sleep(Duration::from_millis(delays[attempt]));
            attempt += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn analytics(dir: &std::path::Path) -> Analytics {
        Analytics::new("wk_example", "http://localhost:1/v1/collect", dir.join("id"), "2.3.0", "example-rust-1.0.0")
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("analyticstrend-{name}-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn sends_as_an_app_with_its_version() {
        let dir = scratch("batch");
        let mut analytics = analytics(&dir);
        analytics.track("app_opened");
        let batch = analytics.batch();
        assert_eq!(batch["client"], "app");
        assert_eq!(batch["appVersion"], "2.3.0");
        assert_eq!(batch["events"][0]["name"], "app_opened");
        assert_eq!(batch["os"], os());
        assert_eq!(batch["deviceType"], "desktop");
    }

    #[test]
    fn sends_a_screen_view_with_its_screen() {
        let dir = scratch("screen");
        let mut analytics = analytics(&dir);
        analytics.screen("Notes");
        let batch = analytics.batch();
        assert_eq!(batch["events"][0]["name"], "screen_view");
        assert_eq!(batch["events"][0]["props"]["$screen"], "Notes");
    }

    #[test]
    fn makes_the_anonymous_id_once_and_keeps_it() {
        let dir = scratch("id");
        let first = analytics(&dir).anonymous_id();
        let second = analytics(&dir).anonymous_id();
        assert_eq!(first, second);
        assert!(Uuid::parse_str(&first).is_ok());
    }

    #[test]
    fn a_retry_sends_the_same_body() {
        let dir = scratch("retry");
        let mut analytics = analytics(&dir);
        analytics.track("app_opened");
        assert_eq!(analytics.batch(), analytics.batch());
    }
}
