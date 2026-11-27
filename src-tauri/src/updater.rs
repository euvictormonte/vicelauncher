use crate::notify::Ctx;
use serde::Deserialize;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::time::Duration;

use crate::brand::{RELEASE_ASSET as ASSET, REPOSITORY};

pub const RELEASES: &str = "https://github.com/euvictormonte/vilauncher/releases";
const MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Deserialize)]
pub struct Release {
    pub tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    size: u64,
    digest: Option<String>,
}

pub struct DownloadedUpdate {
    pub path: PathBuf,
    size: u64,
    digest: String,
}

#[derive(Default)]
pub enum State {
    #[default]
    Idle,
    Checking,
    Current,
    Available(Release),
    Downloading,
    Downloaded(DownloadedUpdate),
    Failed(String),
}

#[derive(Default)]
pub struct Updater {
    pub state: State,
    pub restart_requested: bool,
    pub restart_error: Option<String>,
    result: Option<Receiver<Result<State, String>>>,
}

impl Updater {
    pub fn poll(&mut self) {
        let Some(result) = &self.result else { return };
        self.state = match result.try_recv() {
            Ok(Ok(state)) => state,
            Ok(Err(error)) => State::Failed(error),
            Err(mpsc::TryRecvError::Empty) => return,
            Err(mpsc::TryRecvError::Disconnected) => {
                State::Failed("Update task stopped unexpectedly.".into())
            }
        };
        self.result = None;
    }

    pub fn check(&mut self, ctx: &Ctx) {
        self.restart_requested = false;
        self.restart_error = None;
        self.start(ctx, State::Checking, check_release);
    }

    pub fn download(&mut self, ctx: &Ctx) {
        let State::Available(release) = std::mem::take(&mut self.state) else {
            return;
        };
        self.restart_requested = true;
        self.restart_error = None;
        self.start(ctx, State::Downloading, move || {
            download_release(&release).map(State::Downloaded)
        });
    }

    fn start(
        &mut self,
        ctx: &Ctx,
        state: State,
        task: impl FnOnce() -> Result<State, String> + Send + 'static,
    ) {
        self.state = state;
        let (send, receive) = mpsc::channel();
        self.result = Some(receive);
        let ctx = ctx.clone();
        std::thread::spawn(move || {
            let _ = send.send(task());
            ctx.request_repaint();
        });
    }
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .user_agent(crate::brand::USER_AGENT)
        .build()
}

fn version(tag: &str) -> Option<[u32; 3]> {
    let mut parts = tag.strip_prefix('v').unwrap_or(tag).split('.');
    let mut version = [0; 3];
    for number in &mut version {
        let part = parts.next()?;
        if part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        *number = part.parse().ok()?;
    }
    parts.next().is_none().then_some(version)
}

fn check_release() -> Result<State, String> {
    let url = format!("https://api.github.com/repos/{REPOSITORY}/releases/latest");
    let response = agent()
        .get(&url)
        .set("Accept", "application/vnd.github+json")
        .call();
    let release: Release = match response {
        Ok(response) => response.into_json().map_err(|error| error.to_string())?,
        Err(ureq::Error::Status(404, _)) => return Ok(State::Current),
        Err(error) => return Err(error.to_string()),
    };
    let available =
        version(&release.tag_name).ok_or("The release tag is not a supported version.")?;
    let current = version(env!("CARGO_PKG_VERSION")).ok_or("The installed version is invalid.")?;
    // A fork must not offer an upstream release that does not ship its own executable.
    let has_launcher = release.assets.iter().any(|asset| asset.name == ASSET);
    if available > current && has_launcher {
        Ok(State::Available(release))
    } else {
        Ok(State::Current)
    }
}

fn download_release(release: &Release) -> Result<DownloadedUpdate, String> {
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == ASSET)
        .ok_or_else(|| format!("This release has no {ASSET} download."))?;
    let digest = asset
        .digest
        .as_deref()
        .and_then(|digest| digest.strip_prefix("sha256:"))
        .ok_or("GitHub did not provide a SHA-256 checksum for the executable.")?;
    if asset.size == 0 || asset.size > MAX_BYTES {
        return Err("The executable size is outside the supported limit.".into());
    }
    let url = format!("{RELEASES}/download/{}/{ASSET}", release.tag_name);
    let response = agent()
        .get(&url)
        .call()
        .map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(asset.size + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if !matches_asset(&bytes, asset.size, digest) {
        return Err("The download did not match GitHub’s size and SHA-256 checksum.".into());
    }
    let folder = crate::default_workspace()
        .join("updates")
        .join(&release.tag_name);
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let temporary = folder.join(format!("{ASSET}.{}.tmp", std::process::id()));
    let executable = folder.join(ASSET);
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary, &executable) {
        let _ = fs::remove_file(temporary);
        return Err(error.to_string());
    }
    Ok(DownloadedUpdate {
        path: executable,
        size: asset.size,
        digest: digest.to_owned(),
    })
}

pub fn restart_with(update: &DownloadedUpdate) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let staged = executable.with_extension(format!("neves-launcher-{}.tmp", std::process::id()));
    let backup = executable.with_extension("neves-launcher-previous.exe");
    let source = fs::File::open(&update.path)
        .map_err(|error| format!("Could not open the downloaded update: {error}"))?;
    let mut bytes = Vec::new();
    source
        .take(update.size + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if !matches_asset(&bytes, update.size, &update.digest) {
        return Err(
            "The downloaded update changed on disk. Check for updates and download it again."
                .into(),
        );
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged)
        .map_err(|error| format!("Could not stage the update beside Neves Launcher: {error}"))?;
    let write_result = file.write_all(&bytes).and_then(|_| file.sync_all());
    drop(file);
    let result = (|| -> Result<(), String> {
        write_result.map_err(|error| format!("Could not save the staged update: {error}"))?;
        match fs::remove_file(&backup) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Could not remove the previous update backup: {error}"
                ))
            }
        }
        fs::rename(&executable, &backup)
            .map_err(|error| format!("Could not move the running launcher aside: {error}"))?;
        let restore = |message: String| match fs::rename(&backup, &executable) {
            Ok(()) => message,
            Err(error) => format!(
                "{message} Could not restore the previous version: {error}. Backup: {}",
                backup.display()
            ),
        };
        fs::rename(&staged, &executable)
            .map_err(|error| restore(format!("Could not put the update in place: {error}")))?;
        if let Err(error) = std::process::Command::new(&executable).spawn() {
            return Err(restore(format!("Could not start the new version: {error}")));
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&staged);
    }
    result
}

fn matches_asset(bytes: &[u8], size: u64, sha256: &str) -> bool {
    let actual = ring::digest::digest(&ring::digest::SHA256, bytes);
    let actual: String = actual
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    bytes.len() as u64 == size && actual.eq_ignore_ascii_case(sha256)
}

#[cfg(test)]
#[test]
fn release_links_follow_the_brand() {
    assert_eq!(
        RELEASES,
        format!("https://github.com/{REPOSITORY}/releases")
    );
    assert_eq!(RELEASES, format!("{}/releases", crate::brand::SOURCE_URL));
}

#[cfg(test)]
#[test]
fn compares_stable_versions_numerically() {
    assert!(version("v0.10.0") > version("0.2.0"));
    assert_eq!(version("v0.2.0"), version("0.2.0"));
    assert!(version("v0.3.0-beta").is_none());
    assert!(version("v0.3.0/other").is_none());
}

#[cfg(test)]
#[test]
fn rejects_changed_or_truncated_downloads() {
    let known = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    assert!(matches_asset(b"abc", 3, known));
    assert!(!matches_asset(b"abd", 3, known));
    assert!(!matches_asset(b"abc", 4, known));
}
