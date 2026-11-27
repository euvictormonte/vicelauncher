//! What differs between Windows and Linux, in one place: the name of the
//! programs a build makes, where game folders are searched for, free disk
//! space, opening links and folders, stopping a game and the programs it
//! started, the local time, and running a Windows program on Linux (through
//! umu-run or Wine).

use std::path::{Component, Path, PathBuf};
use std::process::Command;

/// `victory.exe` on Windows, `victory` elsewhere: what `cargo build -p victory` makes.
pub(crate) fn victory_exe() -> String {
    format!("victory{}", std::env::consts::EXE_SUFFIX)
}

/// The name of this system, as the window shows it ("windows", "linux", "macos").
pub(crate) fn os() -> &'static str {
    std::env::consts::OS
}

/// The target a Windows-only project is built for on Linux, with cargo-xwin.
pub(crate) const WINDOWS_TARGET: &str = "x86_64-pc-windows-msvc";

/// Whether a Cargo workspace asks for a Windows target (its rust-toolchain file or
/// .cargo/config names one): on Linux it is then built for Windows and run through Wine.
pub(crate) fn wants_windows_target(workspace: &Path) -> bool {
    if cfg!(windows) {
        return false;
    }
    [
        "rust-toolchain.toml",
        "rust-toolchain",
        ".cargo/config.toml",
        ".cargo/config",
    ]
    .iter()
    .filter_map(|file| std::fs::read_to_string(workspace.join(file)).ok())
    .any(|text| text.contains("pc-windows-msvc"))
}

/// Whether a program is a Windows program (by its name): on Linux it then runs through Wine.
pub(crate) fn is_windows_program(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
}

// ---------- folders and drives ----------

/// The folders a game folder can be on, searched a few levels down: every drive on
/// Windows; on Linux the home folder, its Steam and Games folders, and every mounted disk.
pub(crate) fn search_roots() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        (b'C'..=b'Z')
            .map(|letter| PathBuf::from(format!("{}:\\", letter as char)))
            .filter(|root| root.is_dir())
            .collect()
    }
    #[cfg(not(windows))]
    {
        let mut roots = Vec::new();
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            for sub in [
                ".local/share/Steam/steamapps/common",
                ".steam/steam/steamapps/common",
                ".var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common",
                "Games",
            ] {
                roots.push(home.join(sub));
            }
            roots.push(home);
        }
        roots.extend(mounted_disks());
        roots.retain(|root| root.is_dir());
        roots.dedup();
        roots
    }
}

/// Where removable and extra disks are mounted on Linux: one folder per disk.
#[cfg(not(windows))]
fn mount_parents() -> Vec<PathBuf> {
    let user = std::env::var("USER").unwrap_or_default();
    let mut parents = vec![PathBuf::from("/mnt"), PathBuf::from("/media")];
    if !user.is_empty() {
        parents.push(PathBuf::from("/run/media").join(&user));
        parents.push(PathBuf::from("/media").join(&user));
    }
    parents
}

/// Every disk folder under the mount places (`/run/media/<user>/<disk>`, `/mnt/<disk>`...).
#[cfg(not(windows))]
fn mounted_disks() -> Vec<PathBuf> {
    let mut disks = Vec::new();
    for parent in mount_parents() {
        for entry in std::fs::read_dir(&parent).into_iter().flatten().flatten() {
            let path = entry.path();
            // /media/<user> is itself a parent, not a disk.
            if entry.file_type().is_ok_and(|t| t.is_dir())
                && !mount_parents().contains(&path)
            {
                disks.push(path);
            }
        }
    }
    disks
}

/// The disk a folder is on and the rest of its path: `E:\` and `Games\Scarlett` for
/// `E:\Games\Scarlett`; `/run/media/me/SSD` and `Games/Scarlett` on Linux.
/// None for a folder that is not on a removable disk (or a drive root itself).
pub(crate) fn split_disk(path: &Path) -> Option<(PathBuf, PathBuf)> {
    #[cfg(windows)]
    {
        let root: PathBuf = path.components().take(2).collect();
        let tail: PathBuf = path
            .components()
            .skip_while(|c| matches!(c, Component::Prefix(_) | Component::RootDir))
            .collect();
        matches!(path.components().next(), Some(Component::Prefix(_)))
            .then_some(())
            .filter(|_| !tail.as_os_str().is_empty())
            .map(|_| (root, tail))
    }
    #[cfg(not(windows))]
    {
        for parent in mount_parents() {
            if let Ok(rest) = path.strip_prefix(&parent) {
                let mut parts = rest.components();
                let Some(Component::Normal(disk)) = parts.next() else {
                    continue;
                };
                let tail: PathBuf = parts.collect();
                // /media/<user>/<disk> is matched by its longer parent instead.
                if mount_parents().contains(&parent.join(disk)) || tail.as_os_str().is_empty() {
                    continue;
                }
                return Some((parent.join(disk), tail));
            }
        }
        None
    }
}

/// The same folder on every other disk that is connected now (for a disk whose
/// letter or mount name changed).
pub(crate) fn same_folder_on_other_disks(path: &Path) -> Vec<PathBuf> {
    let Some((_, tail)) = split_disk(path) else {
        return Vec::new();
    };
    #[cfg(windows)]
    let disks = search_roots();
    #[cfg(not(windows))]
    let disks = mounted_disks();
    disks.into_iter().map(|disk| disk.join(&tail)).collect()
}

/// Whether the disk a folder is on is connected. A folder not on a removable disk counts as connected.
pub(crate) fn disk_connected(path: &Path) -> bool {
    match split_disk(path) {
        Some((disk, _)) => disk.is_dir(),
        None => {
            #[cfg(windows)]
            if let Some(Component::Prefix(_)) = path.components().next() {
                return path.components().take(2).collect::<PathBuf>().exists();
            }
            true
        }
    }
}

/// Free space on the disk that holds `dir`.
#[cfg(windows)]
pub(crate) fn free_bytes(dir: &Path) -> Option<u64> {
    let drive: String = dir
        .components()
        .take(2)
        .collect::<PathBuf>()
        .display()
        .to_string();
    let mut c = Command::new("fsutil");
    c.args(["volume", "diskfree", &drive]);
    crate::hide_window(&mut c);
    let output = c.output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let after = text.lines().next()?.split(':').nth(1)?;
    let digits: String = after
        .split('(')
        .next()?
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

/// Free space on the disk that holds `dir` (the nearest folder of it that exists).
#[cfg(unix)]
pub(crate) fn free_bytes(dir: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let existing = dir.ancestors().find(|p| p.exists())?;
    let path = std::ffi::CString::new(existing.as_os_str().as_bytes()).ok()?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(path.as_ptr(), &mut stat) } != 0 {
        return None;
    }
    Some(stat.f_bavail as u64 * stat.f_frsize as u64)
}

// ---------- links and folders ----------

/// Opens an https link in the player's browser, with no shell involved.
pub(crate) fn open_url(url: &str) -> Result<(), String> {
    let mut c = if cfg!(windows) {
        Command::new("explorer.exe")
    } else if cfg!(target_os = "macos") {
        Command::new("open")
    } else {
        Command::new("xdg-open")
    };
    c.arg(url);
    crate::hide_window(&mut c);
    c.spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open {url}: {error}"))
}

/// Shows a folder in the file manager.
pub(crate) fn open_folder(path: &Path) -> Result<(), String> {
    let program = if cfg!(windows) {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    Command::new(program)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open {}: {e}", path.display()))
}

// ---------- processes ----------

/// Gives a program its own process group on Linux, so Stop ends it and every program
/// it started (Wine's helpers, the game) together, as `taskkill /T` does on Windows.
pub(crate) fn own_process_group(c: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        c.process_group(0);
    }
    #[cfg(not(unix))]
    let _ = c;
}

/// Asks a program and every program it started to close, so the game can save, and
/// ends them a few seconds later if they still run.
pub(crate) fn stop_tree(pid: u32) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        {
            let pid = pid.to_string();
            let mut close = Command::new("taskkill");
            close.args(["/PID", &pid, "/T"]);
            crate::hide_window(&mut close);
            let _ = close.status();
            std::thread::sleep(std::time::Duration::from_secs(8));
            let mut force = Command::new("taskkill");
            force.args(["/PID", &pid, "/T", "/F"]);
            crate::hide_window(&mut force);
            let _ = force.status();
        }
        #[cfg(unix)]
        {
            // The program leads its own group (own_process_group): a negative pid is the group.
            let Ok(group) = i32::try_from(pid) else { return };
            unsafe { libc::kill(-group, libc::SIGTERM) };
            std::thread::sleep(std::time::Duration::from_secs(8));
            unsafe { libc::kill(-group, libc::SIGKILL) };
        }
    });
}

/// The running programs on Linux: (pid, the program's file, its command line).
#[cfg(target_os = "linux")]
fn processes() -> Vec<(u32, Option<PathBuf>, String)> {
    std::fs::read_dir("/proc")
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let pid: u32 = entry.file_name().to_str()?.parse().ok()?;
            let exe = std::fs::read_link(entry.path().join("exe")).ok();
            let cmdline = std::fs::read(entry.path().join("cmdline"))
                .map(|bytes| String::from_utf8_lossy(&bytes).replace('\0', " "))
                .unwrap_or_default();
            Some((pid, exe, cmdline))
        })
        .collect()
}

/// Ends every program that lives under `dir` (the game and the victory that runs it),
/// Windows programs run by Wine included (found by their command line).
pub(crate) fn stop_programs_under(dir: &Path) {
    #[cfg(windows)]
    {
        let folder = dir.display().to_string().replace('\'', "''");
        let script = format!(
            "Get-Process | Where-Object {{ $_.Path -and $_.Path.StartsWith('{folder}', [StringComparison]::OrdinalIgnoreCase) }} | Stop-Process -Force -ErrorAction SilentlyContinue"
        );
        let mut c = Command::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        crate::hide_window(&mut c);
        let _ = c.status();
    }
    #[cfg(target_os = "linux")]
    {
        let me = std::process::id();
        let folder = dir.display().to_string();
        if folder.len() < 2 {
            return;
        }
        for (pid, exe, cmdline) in processes() {
            let under = exe.as_deref().is_some_and(|exe| exe.starts_with(dir))
                || cmdline.contains(&folder);
            if under && pid != me {
                if let Ok(pid) = i32::try_from(pid) {
                    unsafe { libc::kill(pid, libc::SIGKILL) };
                }
            }
        }
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    let _ = dir;
}

/// Whether another copy of this launcher (by its program's name) runs.
pub(crate) fn other_launcher_running() -> Result<bool, String> {
    #[cfg(windows)]
    {
        let mut command = Command::new("tasklist");
        command.args(["/FI", "IMAGENAME eq Neves Launcher.exe", "/FO", "CSV", "/NH"]);
        crate::hide_window(&mut command);
        let failed = || "could not check whether Neves Launcher is running (tasklist failed), so Fix was not started".to_string();
        let output = command.output().map_err(|_| failed())?;
        if !output.status.success() {
            return Err(failed());
        }
        let me = std::process::id();
        let text = String::from_utf8_lossy(&output.stdout);
        Ok(text
            .lines()
            .filter_map(|line| line.split(',').nth(1))
            .filter_map(|pid| pid.trim().trim_matches('"').parse::<u32>().ok())
            .any(|pid| pid != me))
    }
    #[cfg(target_os = "linux")]
    {
        let me = std::process::id();
        let names = launcher_names();
        Ok(processes().into_iter().any(|(pid, exe, _)| {
            pid != me
                && exe
                    .as_deref()
                    .and_then(Path::file_name)
                    .and_then(|n| n.to_str())
                    .is_some_and(|name| names.iter().any(|known| known == name))
        }))
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    Ok(false)
}

/// What the launcher's program is called on Linux: the bundle's name, the Cargo name
/// of a development build, and this program's own name.
#[cfg(target_os = "linux")]
fn launcher_names() -> Vec<String> {
    let mut names: Vec<String> = ["Neves Launcher", "neves-launcher", "neves_launcher"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    if let Some(own) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.file_name().map(|n| n.to_string_lossy().into_owned()))
    {
        names.push(own);
    }
    names
}

// ---------- time ----------

/// A time as the player's clock shows it: `2026-11-27 18:30`.
pub(crate) fn local_time(seconds: u64) -> Option<String> {
    #[cfg(windows)]
    return crate::build_activity::local_time(seconds);
    #[cfg(unix)]
    {
        let time = libc::time_t::try_from(seconds).ok()?;
        let mut tm: libc::tm = unsafe { std::mem::zeroed() };
        if unsafe { libc::localtime_r(&time, &mut tm) }.is_null() {
            return None;
        }
        Some(format!(
            "{:04}-{:02}-{:02} {:02}:{:02}",
            tm.tm_year + 1900,
            tm.tm_mon + 1,
            tm.tm_mday,
            tm.tm_hour,
            tm.tm_min
        ))
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = seconds;
        None
    }
}

// ---------- Windows programs on Linux ----------

/// What runs Windows programs on this PC: `NEVES_WINE` if set (a path to wine, umu-run or a
/// script), else umu-run (Proton outside Steam), else Wine, else a Proton that Steam installed.
/// None on Windows, or when none is installed.
pub(crate) fn windows_runner() -> Option<PathBuf> {
    if cfg!(windows) {
        return None;
    }
    if let Some(set) = std::env::var_os("NEVES_WINE").filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(set));
    }
    ["umu-run", "wine"]
        .iter()
        .find_map(|name| on_path(name))
        .or_else(steam_proton)
}

/// Steam's own folder (native or Flatpak), where Proton is installed.
fn steam_root() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    [
        ".local/share/Steam",
        ".steam/steam",
        ".var/app/com.valvesoftware.Steam/.local/share/Steam",
    ]
    .iter()
    .map(|sub| home.join(sub))
    .find(|dir| dir.join("steamapps").is_dir())
}

/// The `proton` script of the newest Proton Steam has: a custom one (GE-Proton) in
/// compatibilitytools.d first, then Valve's, Experimental before the numbered ones.
fn steam_proton() -> Option<PathBuf> {
    let steam = steam_root()?;
    let list = |dir: PathBuf| -> Vec<PathBuf> {
        let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .is_some_and(|n| n.to_string_lossy().contains("Proton"))
                    && p.join("proton").is_file()
            })
            .collect();
        found.sort();
        found.reverse();
        found
    };
    let custom = list(steam.join("compatibilitytools.d"));
    let mut valve = list(steam.join("steamapps").join("common"));
    valve.sort_by_key(|p| !p.to_string_lossy().contains("Experimental"));
    custom
        .into_iter()
        .chain(valve)
        .map(|dir| dir.join("proton"))
        .next()
}

/// The first `name` on the PATH.
pub(crate) fn on_path(name: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

/// A command that starts `program`: itself, or on Linux a Windows program through umu-run
/// or Wine, in a Wine prefix of the launcher's own (`<workspace>/wine`).
pub(crate) fn program_command(program: &Path, workspace: &Path) -> Result<Command, String> {
    if cfg!(windows) || !is_windows_program(program) {
        return Ok(Command::new(program));
    }
    let runner = windows_runner().ok_or(
        "This is a Windows program. To run it on Linux, install umu-launcher (Proton) or Wine (on Fedora: sudo dnf install wine), or set NEVES_WINE to the program that runs it.",
    )?;
    let mut c = Command::new(&runner);
    let prefix = workspace.join("wine");
    let _ = std::fs::create_dir_all(&prefix);
    if std::env::var_os("WINEPREFIX").is_none() {
        c.env("WINEPREFIX", &prefix);
    }
    let name = runner
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    if name.starts_with("umu-run") && std::env::var_os("GAMEID").is_none() {
        c.env("GAMEID", "umu-default");
    }
    if name == "proton" {
        // Steam's Proton script: its prefix lives in STEAM_COMPAT_DATA_PATH.
        let data = workspace.join("proton");
        let _ = std::fs::create_dir_all(&data);
        c.env("STEAM_COMPAT_DATA_PATH", &data);
        if let Some(steam) = steam_root() {
            c.env("STEAM_COMPAT_CLIENT_INSTALL_PATH", steam);
        }
        c.arg("run");
    }
    c.arg(program);
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn victory_is_named_for_this_system() {
        if cfg!(windows) {
            assert_eq!(victory_exe(), "victory.exe");
        } else {
            assert_eq!(victory_exe(), "victory");
        }
        assert!(is_windows_program(Path::new("a/victory.EXE")));
        assert!(!is_windows_program(Path::new("a/victory")));
    }

    #[cfg(unix)]
    #[test]
    fn free_space_and_local_time_are_read() {
        assert!(free_bytes(&std::env::temp_dir().join("not-made-yet")).is_some());
        let time = local_time(1_700_000_000).unwrap();
        assert_eq!(time.len(), "2023-11-14 22:13".len());
        assert!(time.starts_with("2023-11-1"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn a_removable_disk_is_split_from_its_folder() {
        let user = std::env::var("USER").unwrap_or_default();
        if user.is_empty() {
            return;
        }
        let path = PathBuf::from(format!("/run/media/{user}/SSD/Games/Scarlett"));
        assert_eq!(
            split_disk(&path),
            Some((
                PathBuf::from(format!("/run/media/{user}/SSD")),
                PathBuf::from("Games/Scarlett")
            ))
        );
        assert_eq!(
            split_disk(Path::new("/mnt/games/GTA")),
            Some((PathBuf::from("/mnt/games"), PathBuf::from("GTA")))
        );
        assert_eq!(split_disk(Path::new("/home/someone/Games")), None);
        assert_eq!(split_disk(Path::new("/mnt/games")), None);
        assert!(disk_connected(Path::new("/home/someone/Games")));
        assert!(!disk_connected(Path::new("/mnt/no-such-disk-here/GTA")));
    }

    #[test]
    fn a_native_program_runs_as_itself() {
        let c = program_command(Path::new("/opt/game/victory"), Path::new("/tmp")).unwrap();
        assert_eq!(c.get_program(), "/opt/game/victory");
    }
}
