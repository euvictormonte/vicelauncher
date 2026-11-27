//! Who Neves Launcher is and where it talks to: one place for the names, links
//! and folders, so a fork only has to change this file.

/// The launcher's name, in the title bar, the folders and the updater.
pub const NAME: &str = "Neves Launcher";
/// Who makes it.
pub const TEAM: &str = "Neves Launcher team";
/// The site the launcher belongs to.
pub const SITE: &str = "https://viportlive.com";
pub const SITE_LABEL: &str = "viportlive.com";
/// The launcher's own code and releases on GitHub (`owner/name`).
pub const REPOSITORY: &str = "euvictormonte/vicelauncher";
pub const SOURCE_URL: &str = "https://github.com/euvictormonte/vicelauncher";
/// The release download the updater looks for.
pub const RELEASE_ASSET: &str = "Neves Launcher.exe";

/// Where the list of projects comes from, tried in order: VIPortLive's
/// launcher feed (PortWatch's tracker with VIPortLive's corrections and
/// hidden entries applied), then PortWatch's own file if VIPortLive is down.
pub const PROJECT_SOURCES: &[(&str, &str)] = &[
    ("VIPortLive", "https://viportlive.com/api/launcher"),
    ("PortWatch", "https://portwatch-vi.xyz/data/tracker.json"),
];

/// The folder under %LOCALAPPDATA% (projects, pictures) and %APPDATA% (settings).
pub const FOLDER: &str = "Neves Launcher";
/// The launcher's earlier names: settings are carried over from these and
/// already installed projects are found there (see `migrate_old_folders`).
pub const LEGACY_FOLDERS: &[&str] = &["VILauncher", "Mandyhub", "VI Launcher"];

/// %LOCALAPPDATA% (projects, pictures): on other systems, while developing,
/// the platform's own data folder.
pub fn local_base() -> std::path::PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(Into::into)
        .unwrap_or_else(data_base)
}

/// %APPDATA% (settings): on other systems, the platform's own data folder.
pub fn roaming_base() -> std::path::PathBuf {
    std::env::var_os("APPDATA")
        .map(Into::into)
        .unwrap_or_else(data_base)
}

fn data_base() -> std::path::PathBuf {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    if cfg!(target_os = "macos") {
        return home
            .map(|h| h.join("Library").join("Application Support"))
            .unwrap_or_else(|| ".".into());
    }
    std::env::var_os("XDG_DATA_HOME")
        .map(Into::into)
        .or_else(|| home.map(|h| h.join(".local").join("share")))
        .unwrap_or_else(|| ".".into())
}

/// What the launcher calls itself to web servers.
pub const USER_AGENT: &str = concat!("NevesLauncher/", env!("CARGO_PKG_VERSION"));
