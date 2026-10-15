//! Sending events to AnalyticsTrend from a Rust app, over HTTP, with no SDK.

mod analytics;

use std::env;
use std::path::PathBuf;
use std::process::exit;

fn main() {
    let Ok(write_key) = env::var("ANALYTICSTREND_WRITE_KEY") else {
        eprintln!("Set ANALYTICSTREND_WRITE_KEY to your project's write key.");
        exit(1);
    };
    let endpoint = env::var("ANALYTICSTREND_ENDPOINT").unwrap_or_else(|_| "https://analyticstrend.com/v1/collect".to_string());

    // Kept beside the program here; a real app keeps it in its data directory.
    let id_file = PathBuf::from(".analyticstrend-id");
    let mut analytics = analytics::Analytics::new(&write_key, &endpoint, id_file, "1.0.0", "example-rust-1.0.0");
    analytics.track("app_opened");
    analytics.track("note_created");

    match analytics.flush() {
        Ok((status, body)) => println!("{status} {body}"),
        Err(error) => {
            eprintln!("Could not send: {error}");
            exit(1);
        }
    }
}
