use std::fs::{self, File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

const MAX_EXPANDED_BYTES: u64 = 8 * 1024 * 1024 * 1024;

fn valid_component(part: &str) -> bool {
    let stem = part
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_uppercase();
    !part.is_empty()
        && part != "."
        && part != ".."
        && !part.ends_with([' ', '.'])
        && !part
            .chars()
            .any(|ch| ch.is_control() || "<>:\"/\\|?*".contains(ch))
        && !matches!(
            stem.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
        )
        && !stem
            .strip_prefix("COM")
            .or_else(|| stem.strip_prefix("LPT"))
            .is_some_and(|number| {
                matches!(
                    number,
                    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
}

pub fn extract(input: &Path, destination: &Path) -> Result<PathBuf, String> {
    let file = File::open(input).map_err(|error| error.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    fs::create_dir(destination).map_err(|error| error.to_string())?;
    let result = extract_contents(&mut zip, destination);
    if result.is_err() {
        let _ = fs::remove_dir_all(destination);
    }
    result.map_err(|error| error.to_string())
}

fn extract_contents(zip: &mut zip::ZipArchive<File>, destination: &Path) -> io::Result<PathBuf> {
    if zip.len() > 50_000 {
        return Err(io::Error::other("The build ZIP contains too many entries."));
    }
    let mut remaining = MAX_EXPANDED_BYTES;
    let mut executables = Vec::new();
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index)?;
        let name = entry.name()?;
        let name = name.trim_end_matches('/');
        if entry.is_symlink() || !name.split('/').all(valid_component) {
            return Err(io::Error::other(
                "The build ZIP contains an unsafe file path or symbolic link.",
            ));
        }
        let relative = PathBuf::from(name);
        let output = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(output)?;
            continue;
        }
        if entry.size() > remaining {
            return Err(io::Error::other("The extracted build exceeds 8 GiB."));
        }
        fs::create_dir_all(output.parent().expect("extracted file has a parent"))?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(output)?;
        let written = io::copy(&mut io::Read::take(&mut entry, remaining + 1), &mut file)?;
        remaining = remaining
            .checked_sub(written)
            .ok_or_else(|| io::Error::other("The extracted build exceeds 8 GiB."))?;
        if relative
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        {
            executables.push(relative);
        }
    }
    let mut victory = executables.iter().filter(|path| is_victory(path));
    match (victory.next(), victory.next(), executables.as_slice()) {
        (Some(exe), None, _) | (None, None, [exe]) => Ok(exe.clone()),
        (None, None, []) => Err(io::Error::other("The ZIP contains no Windows executable.")),
        _ => Err(io::Error::other(
            "The ZIP contains multiple possible launch executables.",
        )),
    }
}

pub fn is_victory(executable: &Path) -> bool {
    executable
        .file_name()
        .is_some_and(|name| name.eq_ignore_ascii_case("victory.exe") || name == "victory")
}

/// Read only literal defaults from a companion script. The script itself is never run.
pub fn launch_defaults(directory: &Path) -> Vec<(String, String)> {
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };
    let mut scripts: Vec<_> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            (name.starts_with("play-") && name.ends_with(".cmd")).then_some(path)
        })
        .collect();
    scripts.sort();
    let [script] = scripts.as_slice() else {
        return Vec::new();
    };
    if !script
        .metadata()
        .is_ok_and(|metadata| metadata.len() <= 128 * 1024)
    {
        return Vec::new();
    }
    let Ok(contents) = fs::read_to_string(script) else {
        return Vec::new();
    };
    contents
        .lines()
        .filter_map(|line| {
            let (guard, assignment) = line
                .trim()
                .strip_prefix("if not defined ")?
                .split_once(" set \"")?;
            let (name, value) = assignment.strip_suffix('"')?.split_once('=')?;
            (guard == name
                && name.starts_with("VICTORY_")
                && name
                    .bytes()
                    .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte)))
            .then(|| (name.to_owned(), value.to_owned()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn imports_nested_victory_with_support_files_and_rejects_traversal() {
        let root =
            std::env::temp_dir().join(format!("vilauncher-build-zip-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        let archive = root.join("build.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file("cool_fox/victory.exe", options).unwrap();
        writer.write_all(b"fixture").unwrap();
        writer
            .start_file("cool_fox/Play-cool_fox.cmd", options)
            .unwrap();
        writer.write_all(b"if not defined VICTORY_RELAY set \"VICTORY_RELAY=2\"\n+if not defined VICTORY_DIR set \"VICTORY_DIR=%LOCALAPPDATA%\"\n").unwrap();
        writer.finish().unwrap();

        let destination = root.join("build");
        assert_eq!(
            extract(&archive, &destination).unwrap(),
            Path::new("cool_fox/victory.exe")
        );
        assert_eq!(
            launch_defaults(&destination.join("cool_fox")),
            [("VICTORY_RELAY".into(), "2".into())]
        );

        let malicious = root.join("unsafe.zip");
        let mut writer = zip::ZipWriter::new(File::create(&malicious).unwrap());
        writer.start_file("../escape.exe", options).unwrap();
        writer.finish().unwrap();
        assert!(extract(&malicious, &root.join("unsafe")).is_err());
        assert!(!root.join("unsafe").exists());
        assert!(!root.join("escape.exe").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
