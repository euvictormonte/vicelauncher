//! A report for a problem the launcher could not fix: a GitHub issue opened
//! with the log filled in, and the same text to copy. The launcher sends
//! nothing itself; the player reads the issue on GitHub and submits it there.

use serde::Serialize;

/// Where Neves Launcher's own problems are reported.
pub(crate) const LAUNCHER_REPO: &str = "euvictormonte/vicelauncher";
/// The longest body put in the link; GitHub refuses links that are too long.
const LINK_BODY_LIMIT: usize = 6000;
/// The last lines of the log that go in the report.
const LOG_LINES: usize = 150;

#[derive(Serialize)]
pub(crate) struct Report {
    pub title: String,
    /// The whole report, for Copy (an AI agent can rewrite it from here).
    pub text: String,
    pub launcher_url: String,
    /// The project's own repo, when it is on GitHub.
    pub build_url: Option<String>,
}

pub(crate) struct Facts<'a> {
    pub project: &'a str,
    pub repo: &'a str,
    pub stage: &'a str,
    pub log: &'a [String],
    pub gpus: Vec<String>,
    pub cpu: Option<String>,
    pub ram_gb: Option<f64>,
    /// Text that must not leave the PC: the user's name, folders on this PC.
    pub private: Vec<String>,
}

/// Removes every private string from `text`, longest first, and with either slash.
pub(crate) fn scrub(text: &str, private: &[String]) -> String {
    let mut secrets: Vec<String> = private
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() >= 3)
        .flat_map(|s| [s.replace('/', "\\"), s.replace('\\', "/")])
        .collect();
    secrets.sort_by_key(|s| std::cmp::Reverse(s.len()));
    secrets.dedup();
    let mut out = text.to_string();
    for secret in secrets {
        out = out.replace(&secret, "<private>");
    }
    out
}

/// The GitHub issue link for `repo` (owner/name) with the title and body filled in.
fn issue_url(repo: &str, title: &str, body: &str) -> Option<String> {
    let mut url = url::Url::parse(&format!("https://github.com/{repo}/issues/new")).ok()?;
    url.query_pairs_mut()
        .append_pair("title", title)
        .append_pair("body", body);
    Some(url.into())
}

/// `owner/name` on GitHub, from a project's repo field (not a link to another site).
fn github_repo(repo: &str) -> Option<&str> {
    let mut parts = repo.split('/');
    let (owner, name) = (parts.next()?, parts.next()?);
    let plain = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    };
    (parts.next().is_none() && !repo.contains("://") && plain(owner) && plain(name)).then_some(repo)
}

/// The longest prefix of `text` within `limit` bytes, cut on a character boundary.
fn cut(text: &str, limit: usize) -> &str {
    if text.len() <= limit {
        return text;
    }
    let mut end = limit;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

pub(crate) fn make(f: &Facts) -> Report {
    let scrubbed: Vec<String> = f.log.iter().map(|line| scrub(line, &f.private)).collect();
    let tail = &scrubbed[scrubbed.len().saturating_sub(LOG_LINES)..];
    let stage = scrub(f.stage, &f.private);
    let title = format!("{}: {}", f.project, cut(stage.trim(), 120));

    let gpus = if f.gpus.is_empty() {
        "not found".to_string()
    } else {
        f.gpus.join(", ")
    };
    let cpu = f.cpu.clone().unwrap_or_else(|| "not found".to_string());
    let ram = f
        .ram_gb
        .map(|g| format!("{g} GB"))
        .unwrap_or_else(|| "not found".to_string());
    let text = format!(
        "## What happened\n<!-- What did you do, and what did you expect? -->\n\n\
         ## Launcher\n- Neves Launcher {}\n- CPU: {cpu}\n- GPU: {gpus}\n- Memory: {ram}\n\n\
         ## Project\n- {} (`{}`)\n- Last stage: {stage}\n\n\
         ## Log (last {} lines)\n```text\n{}\n```\n",
        env!("CARGO_PKG_VERSION"),
        scrub(f.project, &f.private),
        scrub(f.repo, &f.private),
        tail.len(),
        tail.join("\n"),
    );
    let link_body = {
        let short = cut(&text, LINK_BODY_LIMIT);
        if short.len() < text.len() {
            format!("{short}\n\n_The log was cut for this link. Paste the full report from Copy report if it helps._")
        } else {
            text.clone()
        }
    };
    Report {
        launcher_url: issue_url(LAUNCHER_REPO, &title, &link_body).unwrap_or_default(),
        build_url: github_repo(f.repo).and_then(|r| issue_url(r, &title, &link_body)),
        title,
        text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts<'a>(log: &'a [String], repo: &'a str) -> Facts<'a> {
        Facts {
            project: "Victory",
            repo,
            stage: "Fix and verify failed: the game files are missing",
            log,
            gpus: vec!["NVIDIA GeForce RTX 4060".into()],
            cpu: Some("AMD Ryzen 7".into()),
            ram_gb: Some(16.0),
            private: vec!["alice".into(), "C:\\Users\\alice\\Games".into()],
        }
    }

    #[test]
    fn private_names_and_folders_never_reach_the_report() {
        let log = vec![
            "Looking in C:\\Users\\alice\\Games\\GTA".to_string(),
            "Looking in C:/Users/alice/Games/GTA".to_string(),
            "Hello alice".to_string(),
        ];
        let report = make(&facts(&log, "owner/victory"));
        assert!(!report.text.contains("alice"), "{}", report.text);
        assert!(!report.launcher_url.contains("alice"));
        assert!(report.text.contains("<private>"));
    }

    #[test]
    fn links_point_at_the_launcher_and_the_build_repo() {
        let log = vec!["ERROR: missing".to_string()];
        let report = make(&facts(&log, "owner/victory"));
        assert!(report
            .launcher_url
            .starts_with("https://github.com/euvictormonte/vicelauncher/issues/new?"));
        assert!(report
            .build_url
            .as_deref()
            .unwrap()
            .starts_with("https://github.com/owner/victory/issues/new?"));
        // A repo given as a link is not on GitHub's issue form for this owner.
        let link = make(&facts(&log, "https://example.com/x.git"));
        assert!(link.build_url.is_none());
    }

    #[test]
    fn long_logs_are_cut_for_the_link_but_kept_in_the_text() {
        let log: Vec<String> = (0..2000).map(|i| format!("line {i} ünïcode")).collect();
        let report = make(&facts(&log, "owner/victory"));
        assert!(report.text.contains("line 1999"));
        assert!(!report.launcher_url.contains("line 1999"));
        assert!(report.launcher_url.len() < 12_000);
    }

    #[test]
    fn scrub_handles_both_slashes_and_longest_first() {
        let private = vec!["C:\\Users\\alice".to_string(), "alice".to_string()];
        assert_eq!(
            scrub("C:/Users/alice/x alice", &private),
            "<private>/x <private>"
        );
    }
}
