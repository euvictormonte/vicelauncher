//! Git, Rust (cargo) and the C++ build tools that building a project needs:
//! found on the PATH or in the folders their installers use (a PATH changed
//! after Windows started does not reach programs started before; a launcher
//! started from the Linux desktop may not have ~/.cargo/bin on its PATH), and
//! put on this PC when the player asks: with winget on Windows, with the
//! system's package manager (through pkexec) and rustup on Linux.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

#[derive(Clone, Default, Debug)]
pub struct Tools {
    pub git: Option<PathBuf>,
    pub cargo: Option<PathBuf>,
    /// The C++ build tools (MSVC on Windows, a C compiler `cc` elsewhere): Rust needs their linker.
    pub msvc: bool,
    /// Linux only (always true on Windows): cargo-xwin with clang-cl, lld-link and llvm-lib,
    /// which build the projects made for Windows only.
    pub cross: bool,
    /// What can install the missing ones (see [`installer`]), looked up only when one is missing.
    pub installer: Option<&'static str>,
}

impl Tools {
    pub fn ready(&self) -> bool {
        self.git.is_some() && self.cargo.is_some() && self.msvc && self.cross
    }

    /// What is missing, for people.
    pub fn missing(&self) -> Vec<&'static str> {
        let mut m = Vec::new();
        if self.git.is_none() {
            m.push("Git");
        }
        if self.cargo.is_none() {
            m.push("Rust");
        }
        if !self.msvc {
            m.push("C++ build tools");
        }
        if !self.cross {
            m.push("Windows cross-compiler (cargo-xwin)");
        }
        m
    }
}

/// The last look, shared with the build commands.
static FOUND: Mutex<Option<Tools>> = Mutex::new(None);

pub fn current() -> Option<Tools> {
    FOUND.lock().unwrap().clone()
}

fn env_path(var: &str) -> Option<PathBuf> {
    std::env::var_os(var).map(PathBuf::from)
}

fn answers(program: &Path) -> bool {
    let mut c = Command::new(program);
    c.arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::hide_window(&mut c);
    c.status().map(|s| s.success()).unwrap_or(false)
}

/// `name` on the PATH, else the first of `places` that exists and answers.
fn find(name: &str, places: &[Option<PathBuf>]) -> Option<PathBuf> {
    if answers(Path::new(name)) {
        return Some(PathBuf::from(name));
    }
    places
        .iter()
        .flatten()
        .find(|p| p.is_file() && answers(p))
        .cloned()
}

#[cfg(not(windows))]
fn msvc_installed() -> bool {
    ["cc", "gcc", "clang"]
        .iter()
        .any(|name| answers(Path::new(name)))
}

/// cargo-xwin and the LLVM tools it drives (Linux); always true on Windows.
fn cross_installed() -> bool {
    if cfg!(windows) {
        return true;
    }
    #[cfg(not(windows))]
    {
        let xwin = find("cargo-xwin", &[home_cargo_bin("cargo-xwin")]).is_some();
        xwin && answers(Path::new("clang-cl"))
            && answers(Path::new("lld-link"))
            && crate::platform::on_path("llvm-lib").is_some()
    }
    #[cfg(windows)]
    true
}

#[cfg(windows)]
fn msvc_installed() -> bool {
    // Every Visual Studio install (any edition, Build Tools too), from the
    // installer's own list, else the usual folders.
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(pf86) = env_path("ProgramFiles(x86)") {
        let vswhere = pf86
            .join("Microsoft Visual Studio")
            .join("Installer")
            .join("vswhere.exe");
        if vswhere.is_file() {
            let mut c = Command::new(vswhere);
            c.args(["-all", "-products", "*", "-property", "installationPath"]);
            crate::hide_window(&mut c);
            if let Ok(o) = c.output() {
                roots.extend(
                    String::from_utf8_lossy(&o.stdout)
                        .lines()
                        .map(str::trim)
                        .filter(|l| !l.is_empty())
                        .map(PathBuf::from),
                );
            }
        }
    }
    for base in [env_path("ProgramFiles"), env_path("ProgramFiles(x86)")]
        .into_iter()
        .flatten()
    {
        let vs = base.join("Microsoft Visual Studio");
        for year in std::fs::read_dir(&vs).into_iter().flatten().flatten() {
            for edition in std::fs::read_dir(year.path())
                .into_iter()
                .flatten()
                .flatten()
            {
                roots.push(edition.path());
            }
        }
    }
    // The C++ tools are there if a version of them has its 64-bit linker.
    roots.iter().any(|root| {
        std::fs::read_dir(root.join("VC").join("Tools").join("MSVC"))
            .into_iter()
            .flatten()
            .flatten()
            .any(|v| {
                v.path()
                    .join("bin")
                    .join("Hostx64")
                    .join("x64")
                    .join("link.exe")
                    .is_file()
            })
    })
}

/// Looks for the tools now.
pub fn detect() -> Tools {
    let pf = env_path("ProgramFiles");
    let pf86 = env_path("ProgramFiles(x86)");
    let local = env_path("LOCALAPPDATA");
    let home = env_path(if cfg!(windows) { "USERPROFILE" } else { "HOME" });
    let cargo_exe = format!("cargo{}", std::env::consts::EXE_SUFFIX);
    let git = find(
        "git",
        &[
            pf.as_ref()
                .map(|p| p.join("Git").join("cmd").join("git.exe")),
            pf86.as_ref()
                .map(|p| p.join("Git").join("cmd").join("git.exe")),
            local
                .as_ref()
                .map(|p| p.join("Programs").join("Git").join("cmd").join("git.exe")),
        ],
    );
    let cargo = find(
        "cargo",
        &[
            env_path("CARGO_HOME").map(|p| p.join("bin").join(&cargo_exe)),
            home.as_ref()
                .map(|p| p.join(".cargo").join("bin").join(&cargo_exe)),
        ],
    );
    let mut t = Tools {
        git,
        cargo,
        msvc: msvc_installed(),
        cross: cross_installed(),
        installer: None,
    };
    if !t.ready() {
        t.installer = installer();
    }
    *FOUND.lock().unwrap() = Some(t.clone());
    t
}

/// A command for a tool, by the path it was found at, with the tools'
/// folders first on its PATH (cargo runs rustc and git from there).
fn command(path: Option<PathBuf>, name: &str) -> Command {
    let program = path.unwrap_or_else(|| PathBuf::from(name));
    let mut c = Command::new(&program);
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(t) = current() {
        for p in [t.git, t.cargo].into_iter().flatten() {
            if let Some(d) = p.parent().filter(|d| !d.as_os_str().is_empty()) {
                dirs.push(d.to_path_buf());
            }
        }
    }
    if !dirs.is_empty() {
        if let Some(path) = std::env::var_os("PATH") {
            dirs.extend(std::env::split_paths(&path));
        }
        if let Ok(joined) = std::env::join_paths(dirs) {
            c.env("PATH", joined);
        }
    }
    c
}

pub fn git() -> Command {
    command(current().and_then(|t| t.git), "git")
}

pub fn cargo() -> Command {
    command(current().and_then(|t| t.cargo), "cargo")
}

/// Whether winget (the Windows package manager) is there.
#[cfg(windows)]
fn has_winget() -> bool {
    answers(Path::new("winget"))
}

/// What installs the missing tools on this PC, for people: "winget", or the
/// Linux package manager ("dnf", "apt", "pacman", "zypper"); None if there is none.
pub fn installer() -> Option<&'static str> {
    #[cfg(windows)]
    return has_winget().then_some("winget");
    #[cfg(not(windows))]
    return package_manager().map(|pm| pm.name);
}

/// A Linux package manager and the packages that give Git, a C/C++ compiler and rustup.
#[cfg(not(windows))]
#[derive(Clone, Copy, Debug)]
struct PackageManager {
    name: &'static str,
    program: &'static str,
    install: &'static [&'static str],
    git: &'static [&'static str],
    compiler: &'static [&'static str],
    rustup: &'static [&'static str],
    /// clang-cl, lld-link and llvm-lib, for cargo-xwin.
    llvm: &'static [&'static str],
}

#[cfg(not(windows))]
const PACKAGE_MANAGERS: &[PackageManager] = &[
    PackageManager {
        name: "dnf",
        program: "dnf",
        install: &["install", "-y"],
        git: &["git"],
        compiler: &["gcc", "gcc-c++"],
        rustup: &["rustup"],
        llvm: &["clang", "lld", "llvm"],
    },
    PackageManager {
        name: "apt",
        program: "apt-get",
        install: &["install", "-y"],
        git: &["git"],
        compiler: &["build-essential"],
        rustup: &["rustup"],
        llvm: &["clang", "lld", "llvm"],
    },
    PackageManager {
        name: "pacman",
        program: "pacman",
        install: &["-S", "--needed", "--noconfirm"],
        git: &["git"],
        compiler: &["base-devel"],
        rustup: &["rustup"],
        llvm: &["clang", "lld", "llvm"],
    },
    PackageManager {
        name: "zypper",
        program: "zypper",
        install: &["--non-interactive", "install"],
        git: &["git"],
        compiler: &["gcc", "gcc-c++"],
        rustup: &["rustup"],
        llvm: &["clang", "lld", "llvm"],
    },
];

#[cfg(not(windows))]
fn package_manager() -> Option<PackageManager> {
    PACKAGE_MANAGERS
        .iter()
        .copied()
        .find(|pm| crate::platform::on_path(pm.program).is_some())
}

/// The commands that install what `t` lacks, in order: (what, command).
#[cfg(windows)]
pub fn install_commands(t: &Tools) -> Result<Vec<(&'static str, Command)>, String> {
    if !has_winget() {
        return Err("winget (the Windows package manager) is not on this PC. Install them by hand: git-scm.com, rustup.rs and the Visual Studio Build Tools (Desktop development with C++).".into());
    }
    Ok(install_steps(t)
        .into_iter()
        .map(|(what, args)| {
            let mut c = Command::new("winget");
            c.args(args);
            (what, c)
        })
        .collect())
}

/// The commands that install what `t` lacks, in order: (what, command). The system's
/// packages go through pkexec, so the desktop asks for the password; Rust comes from
/// rustup, for this user only (in ~/.cargo).
#[cfg(not(windows))]
pub fn install_commands(t: &Tools) -> Result<Vec<(&'static str, Command)>, String> {
    let manual = "Install them by hand: Git, a C compiler (gcc) and Rust from rustup.rs.";
    let Some(pm) = package_manager() else {
        return Err(format!("No supported package manager (dnf, apt, pacman or zypper) was found. {manual}"));
    };
    let rustup = find("rustup", &[home_cargo_bin("rustup")]);
    let mut packages: Vec<&str> = Vec::new();
    if t.git.is_none() {
        packages.extend(pm.git);
    }
    if !t.msvc {
        packages.extend(pm.compiler);
    }
    if t.cargo.is_none() && rustup.is_none() {
        packages.extend(pm.rustup);
    }
    if !t.cross {
        packages.extend(pm.llvm);
    }
    let mut steps = Vec::new();
    if !packages.is_empty() {
        if crate::platform::on_path("pkexec").is_none() {
            return Err(format!(
                "pkexec is not on this PC, so the launcher cannot ask for the password. Run: sudo {} {} {}",
                pm.program,
                pm.install.join(" "),
                packages.join(" ")
            ));
        }
        let mut c = Command::new("pkexec");
        c.arg(pm.program).args(pm.install).args(&packages);
        steps.push(("the system packages (Git, compilers)", c));
    }
    if t.cargo.is_none() {
        // Fedora's package gives rustup-init, the others rustup itself.
        let mut c = match rustup {
            Some(rustup) => {
                let mut c = Command::new(rustup);
                c.args(["default", "stable"]);
                c
            }
            None => {
                let mut c = Command::new("sh");
                c.args([
                    "-c",
                    "if command -v rustup-init >/dev/null 2>&1; then rustup-init -y --no-modify-path; else rustup default stable; fi",
                ]);
                c
            }
        };
        c.stdin(Stdio::null());
        steps.push(("Rust", c));
    }
    if !t.cross {
        // The Windows target and cargo-xwin, into ~/.cargo for this user.
        let mut c = Command::new("sh");
        c.args([
            "-c",
            "export PATH=\"${CARGO_HOME:-$HOME/.cargo}/bin:$PATH\"; rustup target add x86_64-pc-windows-msvc && cargo install --locked cargo-xwin",
        ]);
        c.stdin(Stdio::null());
        steps.push(("the Windows cross-compiler (cargo-xwin)", c));
    }
    Ok(steps)
}

/// `~/.cargo/bin/<name>`, where rustup puts its programs.
#[cfg(not(windows))]
fn home_cargo_bin(name: &str) -> Option<PathBuf> {
    env_path("CARGO_HOME")
        .or_else(|| env_path("HOME").map(|home| home.join(".cargo")))
        .map(|cargo| cargo.join("bin").join(name))
}

/// The winget installs for what `t` lacks: (what, arguments).
#[cfg(windows)]
fn install_steps(t: &Tools) -> Vec<(&'static str, Vec<String>)> {
    let common = [
        "--exact",
        "--source",
        "winget",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ];
    let mut steps = Vec::new();
    let mut step = |what: &'static str, id: &str, extra: &[&str]| {
        let mut a: Vec<String> = vec!["install".into(), "--id".into(), id.into()];
        a.extend(common.iter().map(|s| s.to_string()));
        a.extend(extra.iter().map(|s| s.to_string()));
        steps.push((what, a));
    };
    if t.git.is_none() {
        step("Git", "Git.Git", &["--silent"]);
    }
    if !t.msvc {
        step(
            "C++ build tools",
            "Microsoft.VisualStudio.2022.BuildTools",
            &["--override", "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"],
        );
    }
    if t.cargo.is_none() {
        step("Rust", "Rustlang.Rustup", &["--silent"]);
    }
    steps
}
