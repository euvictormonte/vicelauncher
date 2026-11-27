//! The player's settings on disk: `%APPDATA%\Neves Launcher\settings.json`.
//! The first time, the settings of the launcher's earlier versions are read
//! instead (eframe kept them in `data\app.ron`; `migrate_old_folders`
//! copied Mandyhub's folder over).

use crate::launcher::Saved;
use std::path::PathBuf;

fn folder() -> PathBuf {
    crate::brand::roaming_base().join(crate::brand::FOLDER)
}

pub(crate) fn file() -> PathBuf {
    folder().join("settings.json")
}

pub fn load() -> Saved {
    if let Ok(text) = std::fs::read_to_string(file()) {
        if let Ok(saved) = serde_json::from_str(&text) {
            return saved;
        }
    }
    legacy().unwrap_or_default()
}

/// eframe's store: a RON map whose "app" entry is the settings, as RON text.
fn legacy() -> Option<Saved> {
    for path in [
        folder().join("data").join("app.ron"),
        folder().join("app.ron"),
    ] {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let map: std::collections::HashMap<String, String> = ron::from_str(&text).ok()?;
        return ron::from_str(map.get("app")?).ok();
    }
    None
}

/// Writes the settings when they changed since the last write (a new file, then a rename).
pub fn save(saved: &Saved, last: &mut String) {
    let Ok(json) = serde_json::to_string_pretty(saved) else {
        return;
    };
    if json == *last {
        return;
    }
    let _ = std::fs::create_dir_all(folder());
    let temporary = file().with_extension("json.tmp");
    if std::fs::write(&temporary, &json)
        .and_then(|_| std::fs::rename(&temporary, file()))
        .is_ok()
    {
        *last = json;
    }
}
