//! The player's own pictures behind each project's page: jpg or png files in
//! `%LOCALAPPDATA%\Neves Launcher\backgrounds` (the old Mandyhub folder's are
//! used while this one is empty). None ship with the launcher.

use std::path::{Path, PathBuf};

pub fn folder() -> PathBuf {
    crate::brand::local_base()
        .join(crate::brand::FOLDER)
        .join("backgrounds")
}

/// At most 24 pictures, by name.
pub fn pictures() -> Vec<PathBuf> {
    let mut files = in_folder(&folder());
    if files.is_empty() {
        let base = crate::brand::local_base();
        files = crate::brand::LEGACY_FOLDERS
            .iter()
            .map(|name| in_folder(&base.join(name).join("backgrounds")))
            .find(|found| !found.is_empty())
            .unwrap_or_default();
    }
    files.truncate(24);
    files
}

fn in_folder(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|d| d.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    files.retain(|f| {
        let e = f
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        e == "jpg" || e == "jpeg" || e == "png" || e == "webp"
    });
    files.sort();
    files
}
