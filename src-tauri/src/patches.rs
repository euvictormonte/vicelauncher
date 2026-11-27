//! Keeps an update from silently discarding a project's uncommitted edits.
//!
//! Before an update resets a project's source folder (repos\<slug>), `save` writes the
//! uncommitted changes to workspace\patches\<slug>-<UTC stamp>.patch. `rotate` keeps the
//! newest `KEEP` such files per project. Nothing here stashes, commits or resets anything.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Output;
use std::time::{SystemTime, UNIX_EPOCH};

/// How many patch files are kept per project.
pub(crate) const KEEP: usize = 5;
const SUFFIX: &str = ".patch";

/// `YYYYMMDD-HHMMSSmmm` in UTC. Sorts by time as plain text.
pub(crate) fn stamp(now: SystemTime) -> String {
    let millis = now
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let secs = millis.div_euclid(1000);
    let ms = millis.rem_euclid(1000);
    let (year, month, day) = civil_from_days(secs.div_euclid(86_400));
    let rest = secs.rem_euclid(86_400);
    format!(
        "{year:04}{month:02}{day:02}-{:02}{:02}{:02}{ms:03}",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

/// Days since 1970-01-01 to (year, month, day), proleptic Gregorian.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// The slug as a file name: anything other than a letter, digit, `-`, `_` or `.` becomes `_`.
fn file_slug(slug: &str) -> String {
    slug.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || "-_.".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// `<slug>-<stamp>.patch`
pub(crate) fn patch_name(slug: &str, stamp: &str) -> String {
    format!("{}-{stamp}{SUFFIX}", file_slug(slug))
}

/// The stamp of a file that belongs to `slug`, or None for any other file.
fn stamp_of(file_name: &str, slug: &str) -> Option<String> {
    let rest = file_name
        .strip_prefix(file_slug(slug).as_str())?
        .strip_prefix('-')?;
    let stamp = rest.strip_suffix(SUFFIX)?;
    let bytes = stamp.as_bytes();
    let well_formed = bytes.len() == 18
        && bytes[8] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 8 || b.is_ascii_digit());
    well_formed.then(|| stamp.to_string())
}

/// Deletes the patch files of `slug` in `folder` except the newest `keep`.
/// Only files named like patch files of `slug` are touched. Returns how many were deleted.
pub(crate) fn rotate(folder: &Path, slug: &str, keep: usize) -> Result<usize, String> {
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(format!("could not read {}: {error}", folder.display())),
    };
    let mut ours: Vec<(String, PathBuf)> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            stamp_of(&name, slug).map(|stamp| (stamp, entry.path()))
        })
        .collect();
    ours.sort_by(|a, b| b.0.cmp(&a.0));
    let mut deleted = 0;
    for (_, path) in ours.iter().skip(keep) {
        fs::remove_file(path)
            .map_err(|error| format!("could not delete {}: {error}", path.display()))?;
        deleted += 1;
    }
    Ok(deleted)
}

fn git(repo: &Path, args: &[&str]) -> Result<Output, String> {
    let mut command = crate::tools::git();
    command.args(args).current_dir(repo);
    crate::launcher::hide_window(&mut command);
    command
        .output()
        .map_err(|error| format!("could not run git {}: {error}", args.join(" ")))
}

fn checked(repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let out = git(repo, args)?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        Err(format!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

/// Writes the uncommitted changes of `repo` to a new patch file in `folder` and returns its
/// path. Returns None when the working tree is clean. Tracked changes come from `git diff HEAD`;
/// untracked (not ignored) files are listed in a header and included as new-file diffs.
pub(crate) fn save(repo: &Path, folder: &Path, slug: &str) -> Result<Option<PathBuf>, String> {
    let status = checked(repo, &["status", "--porcelain"])?;
    if status.iter().all(|b| b.is_ascii_whitespace()) {
        return Ok(None);
    }
    let diff = checked(repo, &["diff", "HEAD"])?;
    let untracked: Vec<String> =
        checked(repo, &["ls-files", "--others", "--exclude-standard", "-z"])?
            .split(|b| *b == 0)
            .filter(|part| !part.is_empty())
            .map(|part| String::from_utf8_lossy(part).into_owned())
            .collect();

    let mut body = format!(
        "# Neves Launcher saved these uncommitted changes from {} before an update.\n\
         # Apply with: git apply <this file>, run in the project folder.\n\
         # Untracked files (included below as new-file diffs):\n",
        repo.display()
    );
    if untracked.is_empty() {
        body.push_str("#   (none)\n");
    }
    for path in &untracked {
        body.push_str(&format!("#   {path}\n"));
    }
    let mut bytes = body.into_bytes();
    bytes.extend_from_slice(&diff);
    for path in &untracked {
        // git diff --no-index exits with 1 when the files differ, which is the normal case here.
        let out = git(repo, &["diff", "--no-index", "--", "/dev/null", path])?;
        if out.status.code().is_none_or(|code| code > 1) {
            return Err(format!(
                "git diff of {path} failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        bytes.extend_from_slice(&out.stdout);
    }

    fs::create_dir_all(folder)
        .map_err(|error| format!("could not make {}: {error}", folder.display()))?;
    let path = folder.join(patch_name(slug, &stamp(SystemTime::now())));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| format!("could not create {}: {error}", path.display()))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    /// A fresh folder under the system temp dir; never the real workspace.
    fn scratch(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!(
            "vilauncher-patches-{name}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn stamps_are_utc_and_sortable() {
        assert_eq!(stamp(UNIX_EPOCH), "19700101-000000000");
        // 1_000_000_000 seconds after the epoch is 2001-09-09 01:46:40 UTC.
        let at = UNIX_EPOCH + Duration::from_millis(1_000_000_000_789);
        assert_eq!(stamp(at), "20010909-014640789");
        assert!(stamp(UNIX_EPOCH) < stamp(at));
    }

    #[test]
    fn patch_names_carry_the_slug_and_stamp() {
        assert_eq!(
            patch_name("alpha", "20010909-014640789"),
            "alpha-20010909-014640789.patch"
        );
    }

    #[test]
    fn rotation_keeps_the_newest_five_of_one_project_only() {
        let root = scratch("rotate");
        let names: Vec<String> = (0..7)
            .map(|i| patch_name("alpha", &format!("2001090{i}-000000000")))
            .collect();
        for name in &names {
            fs::write(root.join(name), "diff").unwrap();
        }
        // Another project whose slug starts with the same text, and an unrelated file.
        fs::write(
            root.join(patch_name("alpha-beta", "20010101-000000000")),
            "x",
        )
        .unwrap();
        fs::write(root.join("notes.txt"), "x").unwrap();

        assert_eq!(rotate(&root, "alpha", KEEP).unwrap(), 2);

        assert!(!root.join(&names[0]).exists());
        assert!(!root.join(&names[1]).exists());
        for name in &names[2..] {
            assert!(root.join(name).is_file(), "{name} should be kept");
        }
        assert!(root
            .join(patch_name("alpha-beta", "20010101-000000000"))
            .is_file());
        assert!(root.join("notes.txt").is_file());
        assert_eq!(rotate(&root, "alpha", KEEP).unwrap(), 0);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rotation_of_a_missing_folder_does_nothing() {
        let root = scratch("missing");
        assert_eq!(rotate(&root.join("nope"), "alpha", KEEP).unwrap(), 0);
        let _ = fs::remove_dir_all(root);
    }
}

#[cfg(test)]
mod save_tests {
    use super::*;
    use std::process::Command;

    fn git_in(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "test@example.invalid")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "test@example.invalid")
            .status()
            .expect("git runs")
            .success();
        assert!(ok, "git {args:?} failed");
    }

    #[test]
    fn saves_edits_and_new_files_before_an_update_and_nothing_when_clean() {
        let root =
            std::env::temp_dir().join(format!("vilauncher-save-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let repo = root.join("repo");
        let folder = root.join("patches");
        std::fs::create_dir_all(&repo).unwrap();
        git_in(&repo, &["init", "-q"]);
        std::fs::write(repo.join("a.txt"), "one\n").unwrap();
        git_in(&repo, &["add", "a.txt"]);
        git_in(&repo, &["commit", "-q", "-m", "init"]);

        // A clean tree saves nothing.
        assert_eq!(save(&repo, &folder, "owner/game").unwrap(), None);

        std::fs::write(repo.join("a.txt"), "two\n").unwrap();
        std::fs::write(repo.join("new.txt"), "fresh\n").unwrap();
        let saved = save(&repo, &folder, "owner/game")
            .unwrap()
            .expect("a patch is written");
        assert!(saved.starts_with(&folder), "{}", saved.display());
        let text = std::fs::read_to_string(&saved).unwrap();
        assert!(text.contains("+two"), "{text}");
        assert!(text.contains("new.txt"), "{text}");
        std::fs::remove_dir_all(root).unwrap();
    }
}
