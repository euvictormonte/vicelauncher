//! Known problems: checked before a game starts, read from its log after it stops,
//! and fixed only when the fix can be checked afterwards.
//!
//! Every fix is a real repair followed by a check: a copied file is hashed, a found
//! game folder is asked for every required file, cleared settings are read back, and
//! a freed cache is looked at again. A fix that cannot prove itself is reported as
//! failed instead of claiming success.

use ring::digest::{digest, SHA256};
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

pub(crate) const FIX_AGILITY: &str = "agility-dlls";
pub(crate) const FIX_GAME_FILES: &str = "game-files";
pub(crate) const FIX_TOOLS: &str = "build-tools";
pub(crate) const FIX_BUILD: &str = "build";
pub(crate) const FIX_CACHE: &str = "cache";
pub(crate) const FIX_PERMISSIONS: &str = "permissions";
pub(crate) const FIX_DISK: &str = "disk-space";
pub(crate) const FIX_GRAPHICS_MEMORY: &str = "graphics-memory";
pub(crate) const FIX_GRAPHICS_DEVICE: &str = "graphics-device";
pub(crate) const FIX_DRIVER_PAGE: &str = "driver-page";
pub(crate) const FIX_REPO_SWITCH: &str = "repo-switch";

/// Microsoft's D3D12 Agility SDK files and the package that holds them. Each copy is
/// checked against a SHA-256: these when the project's own build names no version.
pub(crate) const AGILITY_PINNED: &[(&str, &str)] = &[
    (
        "D3D12Core.dll",
        "70a6d47d335b4a15180544c01a35b84474522a369dc582d85fe057313a3aeaa0",
    ),
    (
        "d3d12SDKLayers.dll",
        "3140822f550003d322b0a0681e0c40af7364c561296a1d7eeb96b3258c9cd32d",
    ),
];
const PINNED_PACKAGE: &str = "1.620.2";
const PACKAGE_ID: &str = "microsoft.direct3d.d3d12";

/// `D3D12\` file beside the exe must all hash to these.
pub(crate) type Agility = Vec<(String, String)>;

/// A known problem: what it is, what to do, whether only the full check covers it,
/// and the fix id if the launcher can repair it.
#[derive(Debug, PartialEq)]
pub(crate) struct Finding {
    pub title: String,
    pub detail: String,
    pub fix: Option<&'static str>,
    /// Heavy checks: a rebuild, a tool install. Play skips them; Fix and verify runs them.
    pub heavy: bool,
    /// Fix data: `K=V` lines for a switch the project's repo recommends.
    pub data: Option<String>,
}

/// What the launcher is looking at: the build, the game files, the folders it writes,
/// the last game's output and the PC.
pub(crate) struct Check<'a> {
    pub exe: &'a Path,
    pub game_dir: &'a Path,
    /// The project's own folder, for a version its build script names.
    pub repo_dir: &'a Path,
    pub data: &'a Path,
    pub cache: &'a Path,
    pub last_log: &'a [String],
    /// The player's and the fixes' switches, to leave alone ones already set.
    pub switches: &'a str,
    pub installed: bool,
    /// Every required game file is in `game_dir`.
    pub game_ok: bool,
    pub unplugged: bool,
    /// Also run the heavy checks (tools, free space).
    pub slow: bool,
    /// Free bytes on the install drive.
    pub free_bytes: Option<u64>,
    /// The video card vendor, for the driver page.
    pub gpu: Option<&'a str>,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn sha256_hex(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(hex(digest(&SHA256, &bytes).as_ref()))
}

fn sha256(bytes: &[u8]) -> String {
    hex(digest(&SHA256, bytes).as_ref())
}

/// Writes `bytes` to `dest` only when they are the expected file, replacing any old copy.
fn write_verified(
    dest: &Path,
    bytes: &[u8],
    sha: &str,
    log: &dyn Fn(String),
) -> Result<(), String> {
    let got = sha256(bytes);
    if got != sha {
        return Err(format!(
            "{} did not pass the hash check ({got}, wanted {sha}).",
            dest.display()
        ));
    }
    let temporary = dest.with_extension("part");
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write {}: {error}", temporary.display()))?;
    std::fs::rename(&temporary, dest)
        .map_err(|error| format!("Could not place {}: {error}", dest.display()))?;
    log(format!("checked {} ({sha})", dest.display()));
    Ok(())
}

/// Whether `dir\D3D12` holds every Agility file at an expected version. An empty
/// expected hash (the project named only one file) means "present".
fn agility_ok(dir: &Path, agility: &Agility) -> bool {
    agility.iter().all(|(name, sha)| {
        let path = dir.join("D3D12").join(name);
        if sha.is_empty() {
            path.is_file()
        } else {
            sha256_hex(&path).as_deref() == Some(sha.as_str())
        }
    })
}

/// Whether `dir` is a `D3D12` folder with every expected file.
fn agility_folder_ok(dir: &Path, agility: &Agility) -> bool {
    dir.file_name().is_some_and(|name| name == "D3D12")
        && agility.iter().all(|(name, sha)| {
            let path = dir.join(name);
            if sha.is_empty() {
                path.is_file()
            } else {
                sha256_hex(&path).as_deref() == Some(sha.as_str())
            }
        })
}

/// The folder named `D3D12` under `dir` that the build left the Agility SDK in.
fn find_agility_build(dir: &Path, depth: u32) -> Option<PathBuf> {
    if dir.file_name().is_some_and(|name| name == "D3D12") && dir.join("D3D12Core.dll").is_file() {
        return Some(dir.to_path_buf());
    }
    if depth == 0 {
        return None;
    }
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if let Some(found) = find_agility_build(&entry.path(), depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

/// Every 64-character hexadecimal string on `lines[start..start+window]`.
fn hashes_near(lines: &[&str], start: usize, window: usize) -> Option<String> {
    for line in lines.iter().skip(start).take(window) {
        let bytes = line.as_bytes();
        let mut run = 0;
        for (at, byte) in bytes.iter().enumerate() {
            if byte.is_ascii_hexdigit() {
                run += 1;
                if run == 64 {
                    return Some(line[at + 1 - 64..=at].to_ascii_lowercase());
                }
            } else {
                run = 0;
            }
        }
    }
    None
}

/// The Agility files a project's own build script checks, by searching its text files
/// for a file name followed by its SHA-256. Empty when it names none.
fn agility_from_project(repo: &Path) -> Agility {
    fn walk(dir: &Path, depth: u32, left: &mut usize, files: &mut Vec<PathBuf>) {
        if *left == 0 || depth == 0 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            if *left == 0 {
                return;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                if !matches!(
                    name.as_str(),
                    ".git" | "target" | "node_modules" | "diagnostics" | "tests"
                ) {
                    walk(&path, depth - 1, left, files);
                }
            } else if matches!(
                path.extension().and_then(|e| e.to_str()),
                Some("rs" | "ps1" | "cmd" | "bat" | "toml" | "json" | "txt")
            ) {
                *left -= 1;
                files.push(path);
            }
        }
    }
    let mut files = Vec::new();
    walk(repo, 5, &mut 400, &mut files);
    let mut found = Vec::new();
    for path in files {
        let Ok(meta) = std::fs::metadata(&path) else {
            continue;
        };
        if meta.len() > 2_000_000 {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let lines: Vec<&str> = text.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            for name in ["D3D12Core.dll", "d3d12SDKLayers.dll"] {
                if line.contains(name) && !found.iter().any(|(have, _)| have == name) {
                    if let Some(sha) = hashes_near(&lines, i, 6) {
                        found.push((name.to_string(), sha));
                    }
                }
            }
        }
    }
    found
}

/// Whether the program at `exe` exports the two symbols the D3D12 loader reads to find
/// the Agility SDK: `D3D12SDKVersion` and `D3D12SDKPath`. Without them the `D3D12\`
/// folder beside the program is ignored and the inbox D3D12 runtime is used instead.
///
/// This looks for both names as NUL-terminated strings, which is how the export table
/// stores them. A name that appears only as ordinary text would also pass, so a `true`
/// is strong evidence rather than proof; a `false` is reliable.
pub(crate) fn exe_names_agility(exe: &Path) -> bool {
    let Ok(bytes) = std::fs::read(exe) else {
        return false;
    };
    ["D3D12SDKVersion", "D3D12SDKPath"].iter().all(|name| {
        let mut needle = name.as_bytes().to_vec();
        needle.push(0);
        bytes
            .windows(needle.len())
            .any(|window| window == needle.as_slice())
    })
}

/// The files to install: the project's own pinned set, else Microsoft's current one.
pub(crate) fn agility_for(repo: &Path) -> Agility {
    let pinned: Agility = AGILITY_PINNED
        .iter()
        .map(|(name, sha)| ((*name).to_string(), (*sha).to_string()))
        .collect();
    let own = agility_from_project(repo);
    if own.iter().any(|(name, _)| name == "D3D12Core.dll") {
        own
    } else {
        pinned
    }
}

fn package_url(version: &str) -> String {
    format!("https://api.nuget.org/v3-flatcontainer/{PACKAGE_ID}/{version}/{PACKAGE_ID}.{version}.nupkg")
}

fn download(url: &str) -> Result<Vec<u8>, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(180))
        .user_agent(crate::brand::USER_AGENT)
        .build();
    let response = agent
        .get(url)
        .call()
        .map_err(|error| format!("Could not download {url}: {error}"))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read {url}: {error}"))?;
    Ok(bytes)
}

/// Reads one entry from a package, or `None` when it has no such entry.
fn package_entry(package: &[u8], name: &str) -> Option<Vec<u8>> {
    let entry = format!("build/native/bin/x64/{name}");
    let mut archive = zip::ZipArchive::new(Cursor::new(package)).ok()?;
    let mut bytes = Vec::new();
    archive.by_name(&entry).ok()?.read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

/// The cached package marker: the core hash it belongs to.
fn cached_core(cache: &Path) -> Option<String> {
    std::fs::read_to_string(cache.join("package.txt"))
        .ok()?
        .lines()
        .next()
        .map(str::to_owned)
}

/// Every package version Microsoft lists, newest first.
fn package_versions() -> Result<Vec<String>, String> {
    let body = download(&format!(
        "https://api.nuget.org/v3-flatcontainer/{PACKAGE_ID}/index.json"
    ))?;
    let list: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|error| format!("NuGet's version list is not JSON: {error}"))?;
    let mut versions: Vec<String> = list["versions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v.as_str().map(str::to_owned))
        .collect();
    versions.reverse();
    Ok(versions)
}

/// The version whose files match `agility`, from the cache, the pinned version, or NuGet.
/// Returns the folder and the files' actual hashes.
fn resolve_package(
    agility: &Agility,
    cache: &Path,
    log: &dyn Fn(String),
) -> Result<(PathBuf, Agility), String> {
    let core_sha = &agility
        .iter()
        .find(|(name, _)| name == "D3D12Core.dll")
        .ok_or("The expected Agility files name no D3D12Core.dll.")?
        .1;
    let dir = cache.join("D3D12");
    if cached_core(cache).as_deref() == Some(core_sha.as_str()) && agility_folder_ok(&dir, agility)
    {
        log(format!("Using the checked copy in {}.", dir.display()));
        let actual = agility
            .iter()
            .map(|(name, _)| {
                (
                    name.clone(),
                    sha256_hex(&dir.join(name)).unwrap_or_default(),
                )
            })
            .collect();
        return Ok((dir, actual));
    }
    let pinned = agility
        == &AGILITY_PINNED
            .iter()
            .map(|(name, sha)| ((*name).to_string(), (*sha).to_string()))
            .collect::<Agility>();
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    let mut versions = if pinned {
        vec![PINNED_PACKAGE.to_string()]
    } else {
        log("Reading Microsoft's package versions for the project's files.".to_string());
        package_versions()?
    };
    versions.retain(|v| !v.is_empty());
    if versions.is_empty() {
        return Err("Microsoft lists no stable D3D12 Agility SDK package.".into());
    }
    let mut tried = 0;
    for version in versions {
        tried += 1;
        if tried > 40 {
            break;
        }
        let url = package_url(&version);
        log(format!("Trying Microsoft's {version} package."));
        let package = match download(&url) {
            Ok(package) => package,
            Err(error) => {
                log(error);
                continue;
            }
        };
        let Some(core) = package_entry(&package, "D3D12Core.dll") else {
            continue;
        };
        if sha256(&core) != *core_sha {
            continue;
        }
        log(format!(
            "Microsoft's {version} holds the project's D3D12Core.dll."
        ));
        let mut actual = Agility::new();
        for (name, expected) in agility {
            let Some(bytes) = package_entry(&package, name) else {
                return Err(format!("Microsoft's {version} has no {name}."));
            };
            let got = sha256(&bytes);
            if !expected.is_empty() && got != *expected {
                log(format!(
                    "Microsoft's {version} {name} is {got}, not {expected}."
                ));
            }
            actual.push((name.clone(), got));
            write_verified(&dir.join(name), &bytes, &sha256(&bytes), log)?;
        }
        std::fs::write(
            cache.join("package.txt"),
            format!("{core_sha}\n{version}\n"),
        )
        .map_err(|error| format!("Could not record the package: {error}"))?;
        if !agility_folder_ok(&dir, &actual) {
            return Err("The downloaded D3D12 Agility SDK files did not pass the check.".into());
        }
        return Ok((dir, actual));
    }
    Err(format!(
        "No Microsoft D3D12 Agility SDK package among the newest {tried} holds the project's files."
    ))
}

/// Finds a checked copy of the Agility files: in the build, in the cache, else from Microsoft.
fn agility_source(
    exe: &Path,
    repo: &Path,
    cache: &Path,
    log: &dyn Fn(String),
) -> Result<(PathBuf, Agility), String> {
    let agility = agility_for(repo);
    if let Some(dir) = exe.parent() {
        log(format!(
            "Looking for the build's D3D12 files under {}.",
            dir.join("build").display()
        ));
        if let Some(found) = find_agility_build(&dir.join("build"), 6) {
            if agility_folder_ok(&found, &agility) {
                log(format!(
                    "The build left checked files in {}.",
                    found.display()
                ));
                return Ok((found, agility));
            }
            log(format!(
                "The build's {} are the wrong version; Microsoft's are used instead.",
                found.display()
            ));
        } else {
            log("The build did not leave any D3D12 files.".to_string());
        }
    }
    let source = resolve_package(&agility, cache, log)?;
    Ok((source.0, source.1))
}

/// Copies the Agility files next to the exe, where they are missing or wrong, and checks them.
fn fix_agility(
    exe: &Path,
    repo: &Path,
    cache: &Path,
    log: &dyn Fn(String),
) -> Result<String, String> {
    let dir = exe.parent().ok_or("The game has no folder.")?;
    let agility = agility_for(repo);
    let dest = dir.join("D3D12");
    if agility_ok(dir, &agility) {
        log(format!(
            "{} already holds both files at the expected version.",
            dest.display()
        ));
        return Ok(format!(
            "The D3D12 Agility SDK files were already in place.{}",
            agility_unused_note(exe)
        ));
    }
    let (source, agility) = agility_source(exe, repo, cache, log)?;
    std::fs::create_dir_all(&dest)
        .map_err(|error| format!("Could not create {}: {error}", dest.display()))?;
    let mut copied = Vec::new();
    for (name, sha) in &agility {
        let to = dest.join(name);
        if sha256_hex(&to).as_deref() == Some(sha.as_str()) {
            log(format!("{} is already correct.", to.display()));
            continue;
        }
        let from = source.join(name);
        if sha256_hex(&from).as_deref() != Some(sha.as_str()) {
            return Err(format!(
                "{name} from {} is not the expected Microsoft file, so it was not used.",
                source.display()
            ));
        }
        let bytes =
            std::fs::read(&from).map_err(|error| format!("Could not read {name}: {error}"))?;
        write_verified(&to, &bytes, sha, log)?;
        copied.push(name.clone());
    }
    if !agility_ok(dir, &agility) {
        return Err("The copied D3D12 Agility SDK files did not pass the check.".into());
    }
    log(format!(
        "{} holds both files and both hashes match.",
        dest.display()
    ));
    Ok(format!(
        "Copied {} and checked them.{}",
        copied.join(", "),
        agility_unused_note(exe)
    ))
}

/// A sentence for the fix's result when the program will not use the copied files.
fn agility_unused_note(exe: &Path) -> &'static str {
    if exe_names_agility(exe) {
        ""
    } else {
        " The program does not export D3D12SDKVersion and D3D12SDKPath, so it will not use these files; its build must add them."
    }
}

/// Whether a small file can be written, read back and removed in `dir`.
pub(crate) fn writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(format!(".vilauncher-write-{}", std::process::id()));
    let wrote = std::fs::write(&probe, b"probe").is_ok()
        && std::fs::read(&probe).is_ok_and(|bytes| bytes == b"probe");
    let _ = std::fs::remove_file(&probe);
    wrote
}

/// The switches in one line of a project's docs: `VICTORY_FOO=1` in backticks.
fn switches_from(line: &str) -> Vec<(String, String)> {
    let mut found = Vec::new();
    for piece in line.split('`') {
        let token = piece.split_whitespace().next().unwrap_or("");
        let Some(rest) = token.strip_prefix("VICTORY_") else {
            continue;
        };
        let name_len = rest
            .bytes()
            .take_while(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || *b == b'_')
            .count();
        if name_len == 0 {
            continue;
        }
        let name = format!("VICTORY_{}", &rest[..name_len]);
        let value = rest[name_len..]
            .strip_prefix('=')
            .map(|v| {
                v.trim_end_matches([',', '.', ';', ')', ']'])
                    .trim_matches('"')
                    .to_string()
            })
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "0".to_string());
        if !found.iter().any(|(have, _)| have == &name) {
            found.push((name, value));
        }
    }
    found
}

/// Current problems a project's own docs name, with the switches they tell you to set:
/// (source, line number, the line, the switches, whether it is a stated known problem).
/// Only headings about known problems or the newest changes are read, so old history does
/// not pile switches on.
/// One switch a repo's notes recommend: (name, line, note, settings, known problem).
type RepoSwitch = (String, usize, String, Vec<(String, String)>, bool);

fn repo_switches(repo: &Path) -> Vec<RepoSwitch> {
    let mut files = vec![repo.join("README.md")];
    if let Ok(entries) = std::fs::read_dir(repo.join("docs")) {
        for entry in entries.flatten().take(8) {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("md") {
                files.push(entry.path());
            }
        }
    }
    let mut found = Vec::new();
    let mut seen = Vec::new();
    for path in files {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let source = path
            .strip_prefix(repo)
            .unwrap_or(&path)
            .display()
            .to_string();
        let mut active = false;
        let mut heading_level = 0;
        let mut known = false;
        for (at, line) in text.lines().enumerate() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix('#') {
                let level = trimmed.bytes().take_while(|b| *b == b'#').count();
                let lower = rest.to_lowercase();
                if lower.contains("known problem") || lower.contains("newest") {
                    active = true;
                    heading_level = level;
                } else if active && level <= heading_level {
                    active = false;
                }
                known = false;
                continue;
            }
            if !active {
                continue;
            }
            if trimmed.starts_with(['-', '*']) {
                known = false;
            }
            if trimmed.to_lowercase().contains("known problem") {
                known = true;
            }
            let pairs = switches_from(trimmed);
            if pairs.is_empty() {
                continue;
            }
            let lower = trimmed.to_lowercase();
            let recommended = lower.contains("to play")
                || lower.contains("set ")
                || lower.contains("until")
                || lower.contains("turn off");
            if !recommended {
                continue;
            }
            let fresh: Vec<(String, String)> = pairs
                .into_iter()
                .filter(|(name, _)| !seen.contains(name))
                .collect();
            if fresh.is_empty() {
                continue;
            }
            seen.extend(fresh.iter().map(|(name, _)| name.clone()));
            found.push((
                source.clone(),
                at + 1,
                trimmed.trim_start_matches(['-', '*', ' ']).to_string(),
                fresh,
                known,
            ));
        }
    }
    found
}

/// Problems to fix before the game starts.
pub(crate) fn preflight(check: &Check) -> Vec<Finding> {
    let mut found = Vec::new();
    let agility = agility_for(check.repo_dir);
    if !check.installed {
        found.push(Finding {
            title: "The build is missing or its program was deleted.".to_string(),
            detail:
                "Build downloads the newest version again and checks that its program is there."
                    .to_string(),
            fix: Some(FIX_BUILD),
            heavy: true,
            data: None,
        });
    } else if !agility_ok(check.exe.parent().unwrap_or(Path::new(".")), &agility) {
        found.push(Finding {
            title: "The D3D12 Agility SDK files are missing or not the expected version.".to_string(),
            detail: "The game needs them in D3D12\\ next to its exe, or device creation fails with 0x887E0003. Fix and verify finds the project's version, installs it and checks every hash.".to_string(),
            fix: Some(FIX_AGILITY),
            heavy: false,
            data: None,
        });
    }
    if !check.game_ok {
        if check.game_dir.as_os_str().is_empty() {
            found.push(Finding {
                title: "No game folder is chosen.".to_string(),
                detail: "Choose your game folder with Browse, or let Fix and verify search the drives for every required file.".to_string(),
                fix: Some(FIX_GAME_FILES),
                heavy: false,
                data: None,
            });
        } else {
            found.push(Finding {
                title: if check.unplugged {
                    "The drive holding your game files is not connected.".to_string()
                } else {
                    "Some required game files are missing from the chosen folder.".to_string()
                },
                detail: "Fix and verify looks in the chosen folder, under it, on the other drives and under the same path on a drive that changed letter, and asks for every required file before accepting a folder.".to_string(),
                fix: Some(FIX_GAME_FILES),
                heavy: false,
                data: None,
            });
        }
    }
    if !writable(check.data) || !writable(check.cache) {
        found.push(Finding {
            title: "The launcher cannot write its saves or cache folder.".to_string(),
            detail:
                "Fix and verify clears the read-only flags and writes a probe file in both folders."
                    .to_string(),
            fix: Some(FIX_PERMISSIONS),
            heavy: false,
            data: None,
        });
    }
    if check.slow {
        if !crate::tools::detect().ready() {
            found.push(Finding {
                title: "Building is missing one or more tools.".to_string(),
                detail: "Fix and verify installs the missing Git, Rust or C++ build tools with winget and looks again.".to_string(),
                fix: Some(FIX_TOOLS),
                heavy: true,
                data: None,
            });
        }
        if check
            .free_bytes
            .is_some_and(|free| free < 6 * 1024 * 1024 * 1024)
        {
            found.push(Finding {
                title: "The install drive is nearly full.".to_string(),
                detail: "Fix and verify removes the shader caches of other projects and checks the free space again.".to_string(),
                fix: Some(FIX_DISK),
                heavy: true,
                data: None,
            });
        }
    }
    if check.installed {
        for (source, line, text, pairs, known) in repo_switches(check.repo_dir) {
            if !known && check.last_log.is_empty() && !check.slow {
                continue;
            }
            let pairs: Vec<(String, String)> = pairs
                .into_iter()
                .filter(|(name, _)| {
                    let prefix = format!("{name}=");
                    !check
                        .switches
                        .lines()
                        .any(|line| line.trim_start().starts_with(&prefix))
                })
                .collect();
            if pairs.is_empty() {
                continue;
            }
            let list = pairs
                .iter()
                .map(|(name, value)| format!("{name}={value}"))
                .collect::<Vec<_>>()
                .join(" ");
            let title: String = text.chars().take(120).collect();
            found.push(Finding {
                title,
                detail: format!(
                    "{source}:{line} documents this problem and recommends {list}. Fix and verify adds it to this project's switches and reads it back."
                ),
                fix: Some(FIX_REPO_SWITCH),
                heavy: false,
                data: Some(
                    pairs
                        .iter()
                        .map(|(name, value)| format!("{name}={value}"))
                        .collect::<Vec<_>>()
                        .join("\n"),
                ),
            });
        }
    }
    let log_findings = from_log(check.last_log);
    // The files can be in place and still unused: a program that does not export the
    // Agility symbols never looks in D3D12\. Say so rather than suggesting a file copy.
    if check.installed
        && log_findings.iter().any(|f| f.fix == Some(FIX_AGILITY))
        && !exe_names_agility(check.exe)
    {
        found.push(Finding {
            title: "The game's program does not load the D3D12 Agility SDK.".to_string(),
            detail: "The program does not export D3D12SDKVersion and D3D12SDKPath, so the D3D12\\ folder beside it is ignored. Build downloads the project's newest version and checks again; if it still does not export both, its maker has to add them.".to_string(),
            fix: Some(FIX_BUILD),
            heavy: true,
            data: None,
        });
    }
    for finding in log_findings {
        if finding.fix == Some(FIX_DRIVER_PAGE) && check.gpu.is_none() {
            continue;
        }
        let duplicate = found.iter().any(|have| match (have.fix, finding.fix) {
            (Some(a), Some(b)) => a == b,
            _ => have.title == finding.title,
        });
        if !duplicate {
            found.push(finding);
        }
    }
    found
}

/// Problems the game's own output shows, read after it stopped.
pub(crate) fn from_log(lines: &[String]) -> Vec<Finding> {
    let has = |needles: &[&str]| {
        lines
            .iter()
            .any(|line| needles.iter().any(|needle| line.contains(needle)))
    };
    let mut found = Vec::new();
    // "root signature refused" and "Unsupported bit-flag set" come from a D3D12 root
    // signature that asks for flags only the Agility SDK runtime knows, so the game
    // is running on the inbox runtime.
    if has(&[
        "Agility SDK runtime missing",
        "0x887E0003",
        "0x887A002D",
        "root signature refused",
        "Unsupported bit-flag set",
    ]) {
        found.push(Finding {
            title: "The game could not load the D3D12 Agility SDK.".to_string(),
            detail: "Fix and verify installs and checks the files the project needs, then Play again after it passes.".to_string(),
            fix: Some(FIX_AGILITY),
            heavy: false,
            data: None,
        });
    }
    if has(&[
        "DXGI_ERROR_DEVICE_REMOVED",
        "0x887A0005",
        "0x887A0007",
        "device removed",
    ]) {
        found.push(Finding {
            title: "The graphics driver stopped responding.".to_string(),
            detail: "Fix and verify lowers the render scale and turns on the memory fixes; the driver page is opened for an update.".to_string(),
            fix: Some(FIX_GRAPHICS_DEVICE),
            heavy: false,
            data: None,
        });
        found.push(Finding {
            title: "The video driver may be behind.".to_string(),
            detail: "The maker's driver page is opened; install what it offers, then Play again."
                .to_string(),
            fix: Some(FIX_DRIVER_PAGE),
            heavy: true,
            data: None,
        });
    }
    if has(&["out of memory", "0x8007000E"]) {
        found.push(Finding {
            title: "The game ran out of memory.".to_string(),
            detail: "Fix and verify lowers the render scale, turns on the texture fix and lowers a 1440p or 4K output to 1080p.".to_string(),
            fix: Some(FIX_GRAPHICS_MEMORY),
            heavy: false,
            data: None,
        });
    }
    if has(&[
        "pipelines.rejected",
        "host-pipelines.rejected",
        "pipeline library",
        "pipeline cache",
        "shader cache",
        "corrupt",
        "failed to read the cache",
    ]) {
        found.push(Finding {
            title: "The shader or pipeline cache could not be read.".to_string(),
            detail: "Fix and verify deletes the project's cache folder and checks that it is gone; the next Play fills it again.".to_string(),
            fix: Some(FIX_CACHE),
            heavy: false,
            data: None,
        });
    }
    if has(&["Access is denied", "permission denied", "os error 5"]) {
        found.push(Finding {
            title: "A file or folder could not be written.".to_string(),
            detail: "Fix and verify clears read-only flags and proves the saves and cache folders writable.".to_string(),
            fix: Some(FIX_PERMISSIONS),
            heavy: false,
            data: None,
        });
    }
    found
}

/// Applies the fix `id` to the game at `exe`, then checks it. Returns what was done.
#[cfg(test)]
pub(crate) fn fix(id: &str, exe: &Path, repo: &Path, cache: &Path) -> Result<String, String> {
    fix_logging(id, exe, repo, cache, &|_| {})
}

/// Applies the fix `id` and reports each check in `log`.
pub(crate) fn fix_logging(
    id: &str,
    exe: &Path,
    repo: &Path,
    cache: &Path,
    log: &dyn Fn(String),
) -> Result<String, String> {
    match id {
        FIX_AGILITY => fix_agility(exe, repo, cache, log),
        _ => Err(format!("There is no file fix called {id}.")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("vilauncher-diagnose-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn agility_files_left_under_build_are_fixed_and_checked() {
        let root = temp("build");
        let exe = root.join("diag").join("victory.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::write(&exe, b"exe").unwrap();
        // Give the fixture's files explicit hashes so the test never needs NuGet.
        let core_hash = sha256(b"core");
        let layers_hash = sha256(b"layers");
        let source = root
            .join("diag")
            .join("build")
            .join("victory-1")
            .join("out")
            .join("D3D12");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("D3D12Core.dll"), b"core").unwrap();
        std::fs::write(source.join("d3d12SDKLayers.dll"), b"layers").unwrap();

        let repo = root.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        std::fs::write(
            repo.join("build.rs"),
            format!(
                "(\"D3D12Core.dll\", \"{core_hash}\"),\n(\"d3d12SDKLayers.dll\", \"{layers_hash}\"),\n"
            ),
        )
        .unwrap();
        let check = Check {
            exe: &exe,
            game_dir: &root,
            repo_dir: &repo,
            data: &root.join("data"),
            cache: &root.join("cache"),
            last_log: &[],
            switches: "",
            installed: true,
            game_ok: true,
            unplugged: false,
            slow: false,
            free_bytes: None,
            gpu: None,
        };
        assert_eq!(preflight(&check).len(), 1);
        assert_eq!(preflight(&check)[0].fix, Some(FIX_AGILITY));
        fix(FIX_AGILITY, &exe, &repo, &root.join("cache")).unwrap();
        assert!(agility_ok(exe.parent().unwrap(), &agility_for(&repo)));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_project_naming_its_package_is_read() {
        let root = temp("project");
        std::fs::write(
            root.join("build.rs"),
            r#"
            ("D3D12Core.dll", "70a6d47d335b4a15180544c01a35b84474522a369dc582d85fe057313a3aeaa0"),
            ("d3d12SDKLayers.dll", "3140822f550003d322b0a0681e0c40af7364c561296a1d7eeb96b3258c9cd32d"),
            "#,
        )
        .unwrap();
        let agility = agility_for(&root);
        assert_eq!(agility.len(), 2);
        assert_eq!(agility[0].1, AGILITY_PINNED[0].1);
        assert_eq!(agility[1].1, AGILITY_PINNED[1].1);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn every_problem_has_its_own_fix() {
        let root = temp("kinds");
        let exe = root.join("victory.exe");
        std::fs::write(&exe, b"exe").unwrap();
        let log = vec![
            "Agility SDK runtime missing".to_string(),
            "DXGI_ERROR_DEVICE_REMOVED 0x887A0005".to_string(),
            "out of memory 0x8007000E".to_string(),
            "host-pipelines.rejected".to_string(),
            "Access is denied (os error 5)".to_string(),
        ];
        let found = from_log(&log);
        for fix_id in [
            FIX_AGILITY,
            FIX_GRAPHICS_DEVICE,
            FIX_DRIVER_PAGE,
            FIX_GRAPHICS_MEMORY,
            FIX_CACHE,
            FIX_PERMISSIONS,
        ] {
            assert!(
                found.iter().any(|finding| finding.fix == Some(fix_id)),
                "missing {fix_id}"
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_missing_build_is_a_heavy_finding() {
        let root = temp("missing-build");
        let exe = root.join("diag").join("victory.exe");
        std::fs::create_dir_all(root.join("data")).unwrap();
        std::fs::create_dir_all(root.join("cache")).unwrap();
        let check = Check {
            exe: &exe,
            game_dir: &root,
            repo_dir: &root,
            data: &root.join("data"),
            cache: &root.join("cache"),
            last_log: &[],
            switches: "",
            installed: false,
            game_ok: true,
            unplugged: false,
            slow: false,
            free_bytes: None,
            gpu: None,
        };
        let found = preflight(&check);
        let build = found
            .iter()
            .find(|f| f.fix == Some(FIX_BUILD))
            .expect("the missing build is reported");
        assert!(build.heavy);
        assert!(found.iter().all(|f| f.fix != Some(FIX_AGILITY)));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_repo_known_problem_switch_becomes_a_finding() {
        let root = temp("repo-switch");
        std::fs::write(
            root.join("README.md"),
            "# Fork\n\n## Latest\n\n- No switches here.\n\n### Known problems\n\n- **Crash after 30 s:** set `VICTORY_BVH_BUILDER=0` to play until it is fixed.\n\n## Older\n\n- set `VICTORY_OLD=1` to play.\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("data")).unwrap();
        std::fs::create_dir_all(root.join("cache")).unwrap();
        let exe = root.join("victory.exe");
        std::fs::write(&exe, b"exe").unwrap();
        let check = Check {
            exe: &exe,
            game_dir: &root,
            repo_dir: &root,
            data: &root.join("data"),
            cache: &root.join("cache"),
            last_log: &[],
            switches: "",
            installed: true,
            game_ok: true,
            unplugged: false,
            slow: true,
            free_bytes: None,
            gpu: None,
        };
        let found = preflight(&check);
        let guide = found
            .iter()
            .find(|f| f.fix == Some(FIX_REPO_SWITCH))
            .expect("the repo's switch is a finding");
        assert_eq!(guide.data.as_deref(), Some("VICTORY_BVH_BUILDER=0"));
        assert!(guide.detail.contains("README.md:"));
        assert!(found
            .iter()
            .all(|f| f.data.as_deref() != Some("VICTORY_OLD=1")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn only_a_stated_known_problem_is_used_before_a_crash() {
        let root = temp("repo-known");
        std::fs::write(
            root.join("README.md"),
            "# Fork\n\n### Newest\n\n- **Known problem: a crash.** Until traced, set `VICTORY_A=0` to play.\n- **Water:** set `VICTORY_B=1` for its colour.\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("data")).unwrap();
        std::fs::create_dir_all(root.join("cache")).unwrap();
        let exe = root.join("victory.exe");
        std::fs::write(&exe, b"exe").unwrap();
        let base = Check {
            exe: &exe,
            game_dir: &root,
            repo_dir: &root,
            data: &root.join("data"),
            cache: &root.join("cache"),
            last_log: &[],
            switches: "",
            installed: true,
            game_ok: true,
            unplugged: false,
            slow: false,
            free_bytes: None,
            gpu: None,
        };
        let quiet = preflight(&base);
        assert_eq!(
            quiet
                .iter()
                .find(|f| f.fix == Some(FIX_REPO_SWITCH))
                .and_then(|f| f.data.clone()),
            Some("VICTORY_A=0".to_string())
        );
        assert!(quiet
            .iter()
            .all(|f| f.data.as_deref() != Some("VICTORY_B=1")));
        // After a crash the newest section's other suggestions are used too.
        let crash = vec!["ERROR: crash".to_string()];
        let loud = Check {
            last_log: &crash,
            ..base
        };
        let found = preflight(&loud);
        assert!(found
            .iter()
            .any(|f| f.data.as_deref() == Some("VICTORY_B=1")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_repo_switch_already_set_is_not_a_finding() {
        let root = temp("repo-set");
        std::fs::write(
            root.join("README.md"),
            "### Known problems\n\n- Crash: set `VICTORY_A=0` to play.\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("data")).unwrap();
        std::fs::create_dir_all(root.join("cache")).unwrap();
        let exe = root.join("victory.exe");
        std::fs::write(&exe, b"exe").unwrap();
        let check = Check {
            exe: &exe,
            game_dir: &root,
            repo_dir: &root,
            data: &root.join("data"),
            cache: &root.join("cache"),
            last_log: &[],
            switches: "VICTORY_A=1",
            installed: true,
            game_ok: true,
            unplugged: false,
            slow: false,
            free_bytes: None,
            gpu: None,
        };
        assert!(preflight(&check)
            .iter()
            .all(|f| f.fix != Some(FIX_REPO_SWITCH)));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_wrong_source_file_is_not_copied() {
        let root = temp("source");
        let dest = root.join("D3D12");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(dest.join("D3D12Core.dll"), b"wrong core").unwrap();
        let log = |_| {};
        assert!(write_verified(
            &dest.join("D3D12Core.dll"),
            b"wrong core",
            AGILITY_PINNED[0].1,
            &log
        )
        .is_err());
        assert_eq!(
            std::fs::read(dest.join("D3D12Core.dll")).unwrap(),
            b"wrong core"
        );
        assert!(!dest.join("D3D12Core.part").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_checked_file_replaces_an_old_copy() {
        let root = temp("write");
        let dest = root.join("D3D12Core.dll");
        std::fs::write(&dest, b"old").unwrap();
        let good = b"good";
        write_verified(&dest, good, &sha256(good), &|_| {}).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), good);
        assert!(!root.join("D3D12Core.part").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn writable_folders_are_probed_and_read_back() {
        let root = temp("writable");
        assert!(writable(&root.join("data")));
        let file = root.join("a-file");
        std::fs::write(&file, b"x").unwrap();
        assert!(!writable(&file));
        // The probe does not stay behind.
        assert!(!std::fs::read_dir(root.join("data"))
            .unwrap()
            .flatten()
            .any(|e| e
                .file_name()
                .to_string_lossy()
                .starts_with(".vilauncher-write")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_crash_log_names_the_known_problem() {
        let lines = vec!["Error: Agility SDK runtime missing: D3D12Core.dll not found".to_string()];
        let found = from_log(&lines);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].fix, Some(FIX_AGILITY));
        assert!(from_log(&["ok".to_string()]).is_empty());
    }

    #[test]
    fn a_root_signature_refusal_points_at_the_agility_sdk() {
        // The log from issue #3: the inbox runtime refuses flags only Agility knows.
        let lines = vec![
            "host root signature refused error=The parameter is incorrect. (0x80070057)"
                .to_string(),
            "root signature: Unsupported bit-flag set (root signature flags c00).".to_string(),
        ];
        let found = from_log(&lines);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].fix, Some(FIX_AGILITY));
    }

    #[test]
    fn a_program_must_name_both_agility_symbols() {
        let root = temp("exports");
        let exe = root.join("victory.exe");
        std::fs::write(&exe, b"MZ....D3D12SDKVersion\0....D3D12SDKPath\0").unwrap();
        assert!(exe_names_agility(&exe));
        std::fs::write(&exe, b"MZ....D3D12SDKVersion\0 no path symbol").unwrap();
        assert!(!exe_names_agility(&exe));
        std::fs::write(&exe, b"MZ....D3D12SDKVersionX\0....D3D12SDKPath").unwrap();
        assert!(!exe_names_agility(&exe));
        assert!(!exe_names_agility(&root.join("missing.exe")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unused_agility_files_are_reported_as_a_build_problem() {
        let root = temp("unused");
        let exe = root.join("victory.exe");
        // Files are in place at the pinned hashes, but the program exports nothing.
        std::fs::write(&exe, b"MZ no agility exports").unwrap();
        let repo = root.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        // The project names its own files and hashes, so no Microsoft download is needed.
        let (core, layers) = (b"core".as_slice(), b"layers".as_slice());
        std::fs::write(
            repo.join("build.txt"),
            format!(
                "D3D12Core.dll\n{}\nd3d12SDKLayers.dll\n{}\n",
                sha256(core),
                sha256(layers)
            ),
        )
        .unwrap();
        let dest = root.join("D3D12");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(dest.join("D3D12Core.dll"), core).unwrap();
        std::fs::write(dest.join("d3d12SDKLayers.dll"), layers).unwrap();
        let log = vec!["host root signature refused".to_string()];
        let check = Check {
            exe: &exe,
            game_dir: &root,
            repo_dir: &repo,
            data: &root.join("data"),
            cache: &root.join("cache"),
            last_log: &log,
            switches: "",
            installed: true,
            game_ok: true,
            unplugged: false,
            slow: false,
            free_bytes: None,
            gpu: None,
        };
        let found = preflight(&check);
        // The files pass, so the only Agility finding is the one from the log, and the
        // build finding explains why the files alone cannot fix it.
        assert!(found.iter().any(|f| f.fix == Some(FIX_BUILD)
            && f.title.contains("does not load the D3D12 Agility SDK")));
        assert!(!preflight(&check).iter().any(|f| f.title.contains("missing or not the expected")));
        std::fs::remove_dir_all(root).unwrap();
    }
}
