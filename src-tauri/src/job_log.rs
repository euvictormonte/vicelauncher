//! The last output of a project's job, kept on disk after the window closes, so
//! `scripts\neves-launcher-agent.mjs log <repo>` can read it: `<workspace>\logs\<slug>.log`.
//! Each job overwrites its project's file. The file holds a header line (the
//! time and the final stage), then the last 2000 lines of the job's output.
//! Nothing here is under `data\`, and the user's name and folders are scrubbed.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// The most job lines kept in a log file (the header line is extra).
pub(crate) const MAX_LINES: usize = 2000;

/// Writes the log for `slug` (the project's folder name under `repos\`). Failures are ignored:
/// a log that cannot be written must never break a job.
pub(crate) fn write(workspace: &Path, slug: &str, stage: &str, lines: &[String]) {
    let dir = workspace.join("logs");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let name: String = slug
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let private = [
        std::env::var("USERNAME").unwrap_or_default(),
        std::env::var("USERPROFILE").unwrap_or_default(),
        workspace.display().to_string(),
    ];

    let mut text = format!("== {} | {}\n", utc_now(), stage.trim());
    let start = lines.len().saturating_sub(MAX_LINES);
    for line in &lines[start..] {
        text.push_str(line);
        text.push('\n');
    }
    let text = crate::report::scrub(&text, &private);

    let path = dir.join(format!("{name}.log"));
    let temporary = dir.join(format!("{name}.log.tmp"));
    if std::fs::write(&temporary, text)
        .and_then(|_| std::fs::rename(&temporary, &path))
        .is_err()
    {
        let _ = std::fs::remove_file(&temporary);
    }
}

/// The current time as `YYYY-MM-DD HH:MM:SS UTC`.
fn utc_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_text_is_a_plain_date_and_time() {
        let text = utc_now();
        assert_eq!(text.len(), "2026-01-01 00:00:00 UTC".len(), "{text}");
        assert!(text.starts_with("20"), "{text}");
        assert!(text.ends_with(" UTC"));
    }

    #[test]
    fn only_the_last_lines_are_kept_and_names_are_scrubbed() {
        let dir = std::env::temp_dir().join(format!("vil-job-log-{}", std::process::id()));
        let lines: Vec<String> = (0..MAX_LINES + 5).map(|i| format!("line {i}")).collect();
        write(&dir, "owner/x", "Install failed", &lines);
        let text = std::fs::read_to_string(dir.join("logs").join("owner_x.log")).unwrap();
        assert!(text.starts_with("== "));
        assert!(text.contains("| Install failed"));
        assert!(!text.contains("line 4\n"));
        assert!(text.contains(&format!("line {}\n", MAX_LINES + 4)));
        assert_eq!(text.lines().count(), MAX_LINES + 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
