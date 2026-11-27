use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const SAVE_PATH: &str = "7952987A/saves";

pub fn delete_save(workspace: &Path, source: &Path) -> io::Result<PathBuf> {
    let workspace = workspace.canonicalize()?;
    let source = source.canonicalize()?;
    let relative = source.strip_prefix(&workspace).map_err(|_| {
        io::Error::new(
            ErrorKind::InvalidInput,
            "The save is outside Neves Launcher’s workspace.",
        )
    })?;
    let save_folder = relative.starts_with("data") && relative.ends_with(SAVE_PATH);
    let checkpoint = relative.parent() == Some(Path::new("checkpoints"))
        && relative
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("Checkpoint - "));
    if !(save_folder || checkpoint) || !source.is_dir() {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "This is not a Neves Launcher save folder.",
        ));
    }
    let deleted = workspace.join("deleted-saves");
    fs::create_dir_all(&deleted)?;
    if deleted.canonicalize()? != deleted {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "The deleted saves folder is redirected.",
        ));
    }
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_nanos();
    let backup = deleted.join(format!("{}-{id}", std::process::id()));
    fs::create_dir(&backup)?;
    let destination = backup.join(relative);
    let result = fs::create_dir_all(destination.parent().unwrap())
        .and_then(|()| fs::rename(source, &destination));
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&backup);
        return Err(error);
    }
    Ok(destination)
}

#[derive(Clone, PartialEq)]
pub enum LaunchSave {
    Continue,
    Fresh,
    Copy(PathBuf),
}

pub fn active_data(project: &Path) -> io::Result<PathBuf> {
    match fs::read_to_string(project.join("active-save")) {
        Ok(id) if !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()) => {
            let profile = project.join("profiles").join(id);
            if profile.is_dir() {
                Ok(profile)
            } else {
                Err(io::Error::new(
                    ErrorKind::NotFound,
                    "The active save profile is missing",
                ))
            }
        }
        Ok(_) => Err(io::Error::new(
            ErrorKind::InvalidData,
            "Invalid active save profile",
        )),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(project.to_owned()),
        Err(error) => Err(error),
    }
}

pub fn save_folder(project: &Path) -> Option<PathBuf> {
    let path = active_data(project).ok()?.join(SAVE_PATH);
    contains_files(&path).then_some(path)
}

pub fn previous_saves(project: &Path) -> Vec<(String, PathBuf)> {
    let Ok(active) = active_data(project) else {
        return Vec::new();
    };
    let mut profiles: Vec<_> = fs::read_dir(project.join("profiles"))
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path != &active && contains_files(&path.join(SAVE_PATH)))
        .collect();
    profiles.sort_unstable_by(|a, b| b.cmp(a));
    let mut saves: Vec<_> = profiles
        .into_iter()
        .enumerate()
        .map(|(index, path)| (format!("Previous save {}", index + 1), path.join(SAVE_PATH)))
        .collect();
    let original = project.join(SAVE_PATH);
    if active != project && contains_files(&original) {
        saves.push(("Original save".into(), original));
    }
    saves
}

fn contains_files(path: &Path) -> bool {
    fs::read_dir(path)
        .into_iter()
        .flatten()
        .flatten()
        .any(|entry| {
            entry.file_type().is_ok_and(|kind| {
                kind.is_file() || (kind.is_dir() && contains_files(&entry.path()))
            })
        })
}

fn copy_tree(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let destination = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&entry.path(), &destination)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), destination)?;
        } else {
            return Err(io::Error::new(
                ErrorKind::InvalidData,
                "Unsupported entry in save folder",
            ));
        }
    }
    Ok(())
}

fn copy_save(from: &Path, to: &Path) -> io::Result<()> {
    if !contains_files(from) {
        return Err(io::Error::new(
            ErrorKind::NotFound,
            "The selected save is empty or missing",
        ));
    }
    copy_tree(from, to)
}

pub fn prepare(project: &Path, choice: &LaunchSave) -> io::Result<PathBuf> {
    if *choice == LaunchSave::Continue {
        return active_data(project);
    }
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_nanos()
        .to_string();
    let profiles = project.join("profiles");
    fs::create_dir_all(&profiles)?;
    let data = profiles.join(&id);
    fs::create_dir(&data)?;
    let marker = project.join(format!("active-save-{id}.tmp"));
    let result = (|| {
        if let LaunchSave::Copy(source) = choice {
            copy_save(source, &data.join(SAVE_PATH))?;
        }
        fs::write(&marker, &id)?;
        fs::rename(&marker, project.join("active-save"))
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(marker);
        let _ = fs::remove_dir_all(data);
        return Err(error);
    }
    Ok(data)
}

pub fn checkpoint(root: &Path, name: &str, source: &Path) -> io::Result<PathBuf> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 60
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || " _-".contains(c))
    {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "Use 1–60 letters, numbers, spaces, hyphens or underscores.",
        ));
    }
    fs::create_dir_all(root)?;
    let destination = root.join(format!("Checkpoint - {name}"));
    fs::create_dir(&destination)?;
    if let Err(error) = copy_save(source, &destination) {
        let _ = fs::remove_dir_all(destination);
        return Err(error);
    }
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleting_a_checkpoint_preserves_its_contents_and_rejects_other_folders() -> io::Result<()> {
        let root =
            std::env::temp_dir().join(format!("vilauncher-deleted-saves-{}", std::process::id()));
        fs::create_dir(&root)?;
        let result = (|| {
            let checkpoint = root.join("checkpoints/Checkpoint - Example");
            fs::create_dir_all(&checkpoint)?;
            fs::write(checkpoint.join("manifest"), b"example")?;
            assert!(delete_save(&root, &root.join("checkpoints")).is_err());
            let deleted = delete_save(&root, &checkpoint)?;
            assert!(!checkpoint.exists());
            assert_eq!(fs::read(deleted.join("manifest"))?, b"example");
            Ok(())
        })();
        fs::remove_dir_all(root)?;
        result
    }

    #[test]
    fn fresh_and_copied_profiles_preserve_original_and_checkpoint() -> io::Result<()> {
        let root = std::env::temp_dir().join(format!("vilauncher-saves-{}", std::process::id()));
        fs::create_dir(&root)?;
        let result = (|| {
            let project = root.join("project");
            let original = project.join(SAVE_PATH);
            fs::create_dir_all(&original)?;
            fs::write(original.join("slot"), b"original")?;
            let checkpoints = root.join("checkpoints");
            checkpoint(&checkpoints, "Intro complete", &original)?;

            let fresh = prepare(&project, &LaunchSave::Fresh)?;
            assert_eq!(active_data(&project)?, fresh);
            assert!(save_folder(&project).is_none());
            assert_eq!(
                previous_saves(&project),
                vec![("Original save".into(), original.clone())]
            );

            let snapshot = checkpoints.join("Checkpoint - Intro complete");
            let copied = prepare(&project, &LaunchSave::Copy(snapshot.clone()))?;
            let slot = copied.join(SAVE_PATH).join("slot");
            assert_eq!(prepare(&project, &LaunchSave::Continue)?, copied);
            assert_eq!(fs::read(&slot)?, b"original");
            fs::write(slot, b"changed")?;
            assert_eq!(fs::read(snapshot.join("slot"))?, b"original");
            assert_eq!(fs::read(original.join("slot"))?, b"original");
            assert!(prepare(&project, &LaunchSave::Copy(root.join("missing"))).is_err());
            assert_eq!(active_data(&project)?, copied);
            Ok(())
        })();
        fs::remove_dir_all(root)?;
        result
    }
}
