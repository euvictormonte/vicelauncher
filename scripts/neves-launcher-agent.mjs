#!/usr/bin/env node
// Neves Launcher agent tool. Lets an AI agent (Claude Code, opencode, or similar)
// look at the launcher's projects and builds, read failure output, run the
// launcher's own Fix and verify, and turn an agent-written fix into a patch the
// player can review. Plain Node ESM with no dependencies (Node 22 and 24).
//
// Usage:
//   node scripts/neves-launcher-agent.mjs <command> [arguments] [--json]
//
// Commands. The first four always work; the rest need the flags shown.
//   status                              launcher folders, agent access, tools, free space, projects and builds
//   projects                            the projects saved in settings.json (the VIPortLive list is GUI-only)
//   log <repo>                          the last job's output for a project (logs\<slug>.log), redacted
//   patch-status <repo>                 git status and diff stat of repos\<slug>
//   patch-export <repo> --out <file>    write repos\<slug>'s diff (vs the built commit) to a new file
//   fix <repo> --yes                    run the launcher's Fix and verify (agent access on, --yes)
//   patch-apply <repo> <file> --yes     apply a patch to repos\<slug>, no commit (agent access on, --yes)
//   help                                this list and the safety rules
//
// Agent access is the setting "AI agent access" in the launcher. It is stored as
// "agent_access": true in %APPDATA%\Neves Launcher\settings.json. Missing or false means off.
// The launcher's own state is read from there; this tool never writes it.
//
// Typical flow: status -> log -> change the code on a branch in repos\<slug> ->
// patch-export -> patch-apply --yes -> fix --yes -> status again.
//
// Safety rules:
// - Never deletes anything. patch-export never overwrites a file.
// - Never reads or writes data\ (the saves). Never reads cache\ or the game files.
// - Never prints secrets, environment values, or home-folder paths: those become <private>.
// - Never runs a shell or a command taken from arguments. It only runs git (fixed
//   arguments) and the launcher's own --fix command.
// - Never commits, pushes, or changes git config. git apply touches the working tree only.
// - Changing commands (fix, patch-apply) print a warning that the agent's change runs on
//   the player's PC and is the player's responsibility. They need agent access AND --yes.
// - patch-apply refuses: paths outside repos\<slug>, .git paths, symlinks, submodules,
//   binary changes, non-git diffs, and files over 2 MB. It runs git apply --check first.
// - fix refuses while Neves Launcher.exe is running (it may hold the files). It runs the launcher's
//   --fix command from src-tauri\target\release\Neves Launcher.exe, or the debug build if no release
//   build exists. The launcher's --fix refuses too unless agent access is on and no window runs.
//
// Exit codes: 0 ok, 1 refused (agent access off, --yes missing, unsafe patch, launcher running),
// 2 usage error, 3 failure (missing clone or build, git or launcher failed).

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, statfs, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXIT = { ok: 0, refused: 1, usage: 2, failure: 3 };
const FOLDER = "Neves Launcher";
const EXE_NAME = "Neves Launcher.exe";
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const COMMIT = /^[0-9a-f]{7,40}$/;
const OWNER_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WARNING =
  "Warning: an agent's change runs on the player's PC, on their own projects. The player is responsible for it. Review the patch before running it.";

class CliError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}
const usage = (message) => new CliError("usage", message);
const refused = (message) => new CliError("refused", message);
const failure = (message) => new CliError("failure", message);

// ---------- redaction ----------

// Values that must never be printed: the player's name and folders on this PC.
function privateStrings(extra = []) {
  const names = ["USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "USERNAME", "USER"];
  const values = names.map((name) => process.env[name]);
  try {
    values.push(homedir(), userInfo().username);
  } catch {
    // no user info on this system: the env values above still apply
  }
  values.push(...extra);
  const out = new Set();
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text.length < 3) continue;
    out.add(text.replace(/\//g, "\\"));
    out.add(text.replace(/\\/g, "/"));
  }
  return [...out].sort((a, b) => b.length - a.length);
}

const GENERIC_HOME = [/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>|]+/gi, /\/(?:home|Users)\/[^/\s"']+/g];

function redact(text, extra = []) {
  let out = String(text);
  for (const secret of privateStrings(extra)) out = out.split(secret).join("<private>");
  for (const pattern of GENERIC_HOME) out = out.replace(pattern, "<private>");
  return out;
}

// ---------- launcher folders and settings ----------

function launcherFolders() {
  const roaming = process.env.APPDATA ? join(process.env.APPDATA, FOLDER) : null;
  const local = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, FOLDER) : null;
  return { roaming, local, settings: roaming ? join(roaming, "settings.json") : null };
}

async function exists(path) {
  if (!path) return false;
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDir(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function listDirs(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

// Reads only the fields this tool needs. Other settings (including env values) are never read into output.
async function loadSettings(folders) {
  const result = { found: false, error: null, agentAccess: false, installDir: "", custom: [], selected: null };
  if (!folders.settings || !(await isFile(folders.settings))) return result;
  result.found = true;
  let data;
  try {
    data = JSON.parse(await readFile(folders.settings, "utf8"));
  } catch {
    result.error = "settings.json is not valid JSON";
    return result;
  }
  if (!data || typeof data !== "object") {
    result.error = "settings.json is not an object";
    return result;
  }
  result.agentAccess = data.agent_access === true;
  result.installDir = typeof data.install_dir === "string" ? data.install_dir.trim() : "";
  result.custom = Array.isArray(data.custom)
    ? data.custom
        .filter((p) => p && typeof p.repo === "string" && p.repo)
        .map((p) => ({ repo: p.repo, name: typeof p.name === "string" ? p.name : "" }))
    : [];
  result.selected = typeof data.selected === "string" && data.selected ? data.selected : null;
  return result;
}

// The workspace is settings.install_dir when set, else %LOCALAPPDATA%\Neves Launcher.
function workspaceOf(settings, folders) {
  if (settings.installDir) return { path: settings.installDir, kind: "custom" };
  if (folders.local) return { path: folders.local, kind: "default" };
  return null;
}

function requireWorkspace(settings, folders) {
  const ws = workspaceOf(settings, folders);
  if (!ws) throw failure("the launcher folder is unknown: APPDATA or LOCALAPPDATA is not set");
  return ws;
}

async function requireWorkspaceDir(settings, folders) {
  const ws = requireWorkspace(settings, folders);
  if (!(await isDir(ws.path))) throw failure("no launcher data yet: the launcher folder does not exist");
  return ws.path;
}

// ---------- repos ----------

function checkRepo(repo) {
  if (typeof repo !== "string" || !repo) throw usage("give a repo as owner/name or a git URL");
  if (repo.includes("://")) return repo;
  if (!OWNER_NAME.test(repo)) throw usage("a repo is owner/name, using letters, digits, - _ and .");
  const [owner, name] = repo.split("/");
  if ([owner, name].some((part) => part === "." || part === "..")) throw usage("a repo is owner/name");
  return repo;
}

// Same as launcher.rs slug(): owner_name, or git-<hash> for a URL.
function slugOf(repo) {
  if (repo.includes("://")) {
    return "git-" + createHash("sha256").update(repo).digest("hex").slice(0, 32);
  }
  return repo.replace(/\//g, "_");
}

function layoutOf(wsPath, slug) {
  return {
    repoDir: join(wsPath, "repos", slug),
    targetDir: join(wsPath, "target", slug),
    previousDir: join(wsPath, "previous", slug),
  };
}

async function requireClone(repo, slug, repoDir) {
  if (!(await exists(join(repoDir, ".git")))) {
    throw failure(`no clone of ${repo} in repos\\${slug} yet. Install or build the project in the launcher first.`);
  }
}

function git(args, cwd) {
  return new Promise((done) => {
    execFile(
      "git",
      ["--no-pager", ...args],
      { cwd, windowsHide: true, maxBuffer: 256 * 1024 * 1024 },
      (error, stdout, stderr) => {
        done({ ok: !error, stdout: String(stdout), stderr: String(stderr), missing: error?.code === "ENOENT" });
      },
    );
  });
}

function onPath(name) {
  const finder = process.platform === "win32" ? "where" : "which";
  return new Promise((done) => {
    execFile(finder, [name], { windowsHide: true }, (error) => done(!error));
  });
}

async function readBuilt(targetDir) {
  try {
    const text = (await readFile(join(targetDir, "built-from.txt"), "utf8")).trim();
    return text ? text.split(/\s/)[0].slice(0, 64) : null;
  } catch {
    return null;
  }
}

async function readCargoProfile(repoDir) {
  try {
    const text = await readFile(join(repoDir, "Cargo.toml"), "utf8");
    return text.includes("[profile.diag]") ? "diag" : "release";
  } catch {
    return "release";
  }
}

// Mirrors launcher.rs project_installed(): the recorded Rust install, else victory.exe under the profile.
async function isInstalled(repoDir, targetDir) {
  const rustFile = join(targetDir, "mandyhub-rust.json");
  if (await isFile(rustFile)) {
    try {
      const install = JSON.parse(await readFile(rustFile, "utf8"));
      if (!install.executable) return true;
      return isFile(resolve(targetDir, String(install.executable)));
    } catch {
      // unreadable record: fall through to the victory.exe check
    }
  }
  const profile = await readCargoProfile(repoDir);
  return isFile(join(targetDir, profile, "victory.exe"));
}

async function projectStatus(wsPath, entry) {
  const { repoDir, targetDir, previousDir } = layoutOf(wsPath, entry.slug);
  const clone = await exists(join(repoDir, ".git"));
  let head = null;
  if (clone) {
    const result = await git(["rev-parse", "--short", "HEAD"], repoDir);
    if (result.ok) head = result.stdout.trim();
  }
  return {
    repo: entry.repo,
    slug: entry.slug,
    source: entry.sources.join("+"),
    clone,
    head,
    installed: await isInstalled(repoDir, targetDir),
    built_from: await readBuilt(targetDir),
    previous: await isDir(previousDir),
  };
}

// Saved projects, then folders under repos\ and target\ that no saved project names.
async function knownRepos(settings, wsPath) {
  const bySlug = new Map();
  const add = (repo, source) => {
    const slug = slugOf(repo);
    const entry = bySlug.get(slug) ?? { repo, slug, sources: [] };
    if (!entry.sources.includes(source)) entry.sources.push(source);
    bySlug.set(slug, entry);
  };
  for (const p of settings.custom) add(p.repo, "custom");
  if (settings.selected) add(settings.selected, "selected");
  if (wsPath) {
    const folders = new Set([...(await listDirs(join(wsPath, "repos"))), ...(await listDirs(join(wsPath, "target")))]);
    for (const slug of folders) {
      if (!bySlug.has(slug)) bySlug.set(slug, { repo: null, slug, sources: ["folder"] });
    }
  }
  return [...bySlug.values()];
}

async function freeGiB(path) {
  let current = path;
  while (current && !(await exists(current))) {
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  if (!current) return null;
  try {
    const info = await statfs(current);
    return Math.round((Number(info.bavail) * Number(info.bsize)) / 1024 ** 3 * 10) / 10;
  } catch {
    return null;
  }
}

function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}

// ---------- agent access ----------

function accessProblem(settings) {
  if (settings.error) return `settings.json could not be read (${settings.error}), so agent access counts as off`;
  if (!settings.agentAccess) {
    return "agent access is off. Ask the player to turn on 'AI agent access' in Neves Launcher Settings. Nothing was changed.";
  }
  return null;
}

function requireChange(settings, flags, what) {
  const problem = accessProblem(settings);
  if (problem) throw refused(problem);
  if (!flags.yes) throw refused(`${what} changes files on the player's PC. Add --yes to run it.`);
}

// ---------- commands ----------

async function cmdStatus() {
  const folders = launcherFolders();
  const settings = await loadSettings(folders);
  const ws = workspaceOf(settings, folders);
  const wsExists = ws ? await isDir(ws.path) : false;
  const repos = await knownRepos(settings, wsExists ? ws.path : null);
  const projects = [];
  for (const entry of repos) {
    projects.push(wsExists ? await projectStatus(ws.path, entry) : { repo: entry.repo, slug: entry.slug, source: entry.sources.join("+"), clone: false, head: null, installed: false, built_from: null, previous: false });
  }
  const accessOn = accessProblem(settings) === null;
  const data = {
    ok: true,
    settings_file: !settings.found ? "missing" : settings.error ? "unreadable" : "found",
    workspace: { kind: ws ? ws.kind : null, found: wsExists },
    agent_access: accessOn,
    tools: { git: await onPath("git"), cargo: await onPath("cargo") },
    free_disk_gib: ws && wsExists ? await freeGiB(ws.path) : null,
    projects,
    notes: [
      "The VIPortLive project list is fetched by the GUI only. Only saved and selected projects, and folders on disk, are listed here.",
      "installed follows the launcher's own rule for a top-level Cargo.toml. Nested Cargo workspaces may differ.",
    ],
  };
  const lines = [
    "Neves Launcher agent status",
    `Settings:       %APPDATA%\\${FOLDER}\\settings.json  ${data.settings_file}`,
    `Install folder: ${ws ? (ws.kind === "custom" ? "custom folder set in Settings" : `%LOCALAPPDATA%\\${FOLDER}`) : "unknown"}  ${wsExists ? "found" : "missing"}`,
    `Agent access:  ${accessOn ? "on" : "off (fix and patch-apply are refused)"}`,
    `Tools:          git ${data.tools.git ? "found" : "not found"}, cargo ${data.tools.cargo ? "found" : "not found"}`,
    `Free space:     ${data.free_disk_gib === null ? "unknown" : `${data.free_disk_gib} GiB on the launcher's drive`}`,
    "Projects:",
  ];
  if (projects.length === 0) lines.push("  none saved or on disk");
  for (const p of projects) {
    const name = p.repo ?? `(folder only, slug ${p.slug})`;
    lines.push(
      `  ${name}  slug ${p.slug}  installed ${p.installed ? "yes" : "no"}  built ${p.built_from ?? "none"}  previous ${p.previous ? "yes" : "no"}  clone ${p.clone ? `yes, HEAD ${p.head ?? "unknown"}` : "no"}`,
    );
  }
  if (settings.error) lines.push(`Note: ${settings.error}.`);
  for (const note of data.notes) lines.push(`Note: ${note}`);
  return { data: redactData(data), lines };
}

async function cmdProjects() {
  const folders = launcherFolders();
  const settings = await loadSettings(folders);
  const projects = [];
  for (const p of settings.custom) {
    projects.push({ repo: p.repo, name: p.name, source: settings.selected === p.repo ? "custom+selected" : "custom" });
  }
  if (settings.selected && !settings.custom.some((p) => p.repo === settings.selected)) {
    projects.push({ repo: settings.selected, name: "", source: "selected" });
  }
  const notes = [
    "The VIPortLive project list is fetched by the GUI only. This command does not fetch it: open the launcher to see that list.",
  ];
  if (!settings.found) notes.push("No settings.json yet, so no saved projects.");
  if (settings.error) notes.push(`settings.json could not be read: ${settings.error}.`);
  const lines = projects.length
    ? projects.map((p) => `${p.repo}${p.name ? `  (${p.name})` : ""}  ${p.source}`)
    : ["No saved projects."];
  for (const note of notes) lines.push(`Note: ${note}`);
  return { data: redactData({ ok: true, projects, notes }), lines };
}

// The launcher writes the last job's output to <workspace>\logs\<slug>.log when the job ends
// (overwritten by each job, at most 2000 lines). This tool reads only that file, never data\.
async function cmdLog(args) {
  const repo = checkRepo(args[0]);
  const slug = slugOf(repo);
  const folders = launcherFolders();
  const settings = await loadSettings(folders);
  const ws = workspaceOf(settings, folders);
  const file = ws ? join(ws.path, "logs", `${slug}.log`) : null;
  if (!file || !(await isFile(file))) {
    const message = `No log for ${repo} yet. The launcher writes logs\\${slug}.log when a job (Install, Update, Play, Fix and verify) ends. Run the job in the launcher first.`;
    return { data: redactData({ ok: true, repo, found: false, log: null }), lines: [message] };
  }
  const text = redact(await readFile(file, "utf8"));
  const data = { ok: true, repo, found: true, log: text };
  return { data: redactData(data), lines: [`Last job output for ${repo} (logs\\${slug}.log):`, ...text.split(/\r?\n/)] };
}

async function cmdPatchStatus(args) {
  const repo = checkRepo(args[0]);
  const folders = launcherFolders();
  const settings = await loadSettings(folders);
  const wsPath = await requireWorkspaceDir(settings, folders);
  const slug = slugOf(repo);
  const { repoDir, targetDir } = layoutOf(wsPath, slug);
  await requireClone(repo, slug, repoDir);

  const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], repoDir)).stdout.trim();
  const head = (await git(["rev-parse", "--short", "HEAD"], repoDir)).stdout.trim();
  const built = await readBuilt(targetDir);
  let sinceBuild = null;
  if (built && COMMIT.test(built)) {
    const count = await git(["rev-list", "--count", `${built}..HEAD`], repoDir);
    if (count.ok) sinceBuild = Number(count.stdout.trim());
  }
  const status = (await git(["status", "--porcelain=v1", "--branch"], repoDir)).stdout.split(/\r?\n/).filter(Boolean);
  const diffStat = (await git(["diff", "--stat", "--no-ext-diff", "--no-textconv", "--no-color"], repoDir)).stdout.trim();
  const warning =
    "A launcher Update hard-resets this folder and would discard uncommitted changes. Run patch-export first to keep them.";
  const data = { ok: true, repo, slug, branch, head, built_from: built, commits_since_build: sinceBuild, status, diff_stat: diffStat, warning };
  const lines = [
    `${repo}  branch ${branch}  HEAD ${head}  built ${built ?? "none recorded"}${sinceBuild === null ? "" : `  (${sinceBuild} commit${sinceBuild === 1 ? "" : "s"} since build)`}`,
    ...(status.length ? status : ["Working tree clean."]),
    ...(diffStat ? ["", diffStat] : []),
    "",
    `Warning: ${warning}`,
  ];
  return { data: redactData(data), lines };
}

async function cmdPatchExport(args, flags) {
  const repo = checkRepo(args[0]);
  if (!flags.out) throw usage("patch-export needs --out <file>, a new file outside the launcher folder");
  const outPath = resolve(flags.out);
  const folders = launcherFolders();
  const settings = await loadSettings(folders);
  const wsPath = await requireWorkspaceDir(settings, folders);
  const slug = slugOf(repo);
  const { repoDir, targetDir } = layoutOf(wsPath, slug);
  await requireClone(repo, slug, repoDir);

  if (isInside(wsPath, outPath)) throw refused("write the patch outside the launcher folder (its data\\ holds the saves)");
  if (isInside(repoDir, outPath)) throw refused("write the patch outside repos\\ so it is not part of the repo");
  if (await exists(outPath)) throw refused("that file already exists. Choose a new name: nothing is overwritten");
  if (!(await isDir(resolve(outPath, "..")))) throw failure("the folder for --out does not exist");

  let base = "HEAD";
  let note = "no built commit recorded, so the diff is against HEAD";
  const built = await readBuilt(targetDir);
  if (built && COMMIT.test(built)) {
    const check = await git(["cat-file", "-e", `${built}^{commit}`], repoDir);
    if (check.ok) {
      base = built;
      note = `diff against the built commit ${built.slice(0, 12)}`;
    } else {
      note = "the built commit is not in the clone, so the diff is against HEAD";
    }
  }
  const diff = await git(["diff", "--no-ext-diff", "--no-textconv", "--no-color", base], repoDir);
  if (!diff.ok) throw failure(`git diff failed: ${diff.stderr.trim()}`);
  const untracked = (await git(["ls-files", "--others", "--exclude-standard"], repoDir)).stdout.split(/\r?\n/).filter(Boolean);
  const notes = [note];
  if (untracked.length) notes.push(`${untracked.length} new file(s) are untracked and are not in the patch. Stage them, or commit them, to include them.`);
  if (!diff.stdout.trim()) {
    return { data: { ok: true, written: false, base, notes }, lines: ["No changes against the base. No file written.", ...notes] };
  }
  try {
    await writeFile(outPath, diff.stdout, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") throw refused("that file already exists. Choose a new name: nothing is overwritten");
    throw failure(`could not write the patch: ${error.message}`);
  }
  const bytes = Buffer.byteLength(diff.stdout, "utf8");
  if (bytes > MAX_PATCH_BYTES) notes.push("The patch is over 2 MB, so patch-apply will refuse it.");
  const files = (diff.stdout.match(/^diff --git /gm) ?? []).length;
  const data = { ok: true, written: true, file: outPath, base, files, bytes, notes };
  const lines = [
    `Wrote ${files} file change(s), ${bytes} bytes, to ${outPath}`,
    ...notes,
    "Next: patch-apply on the player's PC needs agent access on and --yes.",
  ];
  return { data: redactData(data), lines };
}

// Refuses any patch that can reach outside repos\<slug> or change what git apply cannot review.
function checkPatch(text) {
  const refuse = (why) => {
    throw refused(`patch refused: ${why}`);
  };
  const safePath = (p) => {
    if (!p || p.includes("\\") || p.includes(":") || p.includes("\0")) return false;
    if (p.startsWith("/") || isAbsolute(p)) return false;
    return p.split("/").every((part) => {
      if (part === "" || part === "." || part === "..") return false;
      if (part.toLowerCase() === ".git") return false;
      return !/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(part);
    });
  };
  const files = new Set();
  const checkPathValue = (p) => {
    if (!safePath(p)) refuse(`it touches a path outside the repo or a reserved path: ${JSON.stringify(p)}`);
    files.add(p);
  };
  let inHeader = false;
  let headers = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      headers += 1;
      const rest = line.slice("diff --git ".length);
      if (rest.startsWith('"')) refuse("quoted file names are not supported");
      const match = /^a\/(.+) b\/(.+)$/.exec(rest);
      if (!match) refuse("a diff header is not in git's a/ b/ form");
      checkPathValue(match[1]);
      checkPathValue(match[2]);
      continue;
    }
    if (line.startsWith("@@")) {
      inHeader = false;
      continue;
    }
    if (/^(GIT binary patch|Binary files )/.test(line)) refuse("binary changes are not allowed; export text changes only");
    if (!inHeader) continue;
    if (/^(old|new|deleted file|new file) mode (120000|160000)/.test(line) || /^(old|new) mode 160000/.test(line)) {
      refuse("symbolic links and submodules are not allowed");
    }
    if (/^(---|\+\+\+) /.test(line)) {
      const raw = line.slice(4).split("\t")[0];
      if (raw === "/dev/null") continue;
      if (raw.startsWith('"')) refuse("quoted file names are not supported");
      if (!/^[ab]\//.test(raw)) refuse("a file header is not in git's a/ b/ form");
      checkPathValue(raw.slice(2));
      continue;
    }
    const move = /^(rename|copy) (from|to) (.+)$/.exec(line);
    if (move) {
      if (move[3].startsWith('"')) refuse("quoted file names are not supported");
      checkPathValue(move[3]);
    }
  }
  if (headers === 0) refuse("only git diffs (from git diff) are accepted, with diff --git headers");
  return [...files];
}

async function cmdPatchApply(args, flags) {
  const repo = checkRepo(args[0]);
  if (!args[1]) throw usage("patch-apply needs <repo> <file> --yes");
  const patchPath = resolve(args[1]);
  const folders = launcherFolders();
  const settings = await loadSettings(folders);
  console.error(WARNING);
  requireChange(settings, flags, "patch-apply");
  const wsPath = await requireWorkspaceDir(settings, folders);
  const slug = slugOf(repo);
  const { repoDir } = layoutOf(wsPath, slug);
  await requireClone(repo, slug, repoDir);

  let size;
  try {
    const info = await stat(patchPath);
    if (!info.isFile()) throw new Error("not a file");
    size = info.size;
  } catch {
    throw failure("the patch file was not found");
  }
  if (size > MAX_PATCH_BYTES) throw refused("the patch is larger than 2 MB");
  const text = await readFile(patchPath, "utf8");
  if (text.includes("\0")) throw refused("the file is not a text patch");
  const files = checkPatch(text);

  const check = await git(["apply", "--check", patchPath], repoDir);
  if (!check.ok) throw failure(`the patch does not apply (git apply --check): ${check.stderr.trim()}`);
  const applied = await git(["apply", patchPath], repoDir);
  if (!applied.ok) throw failure(`git apply failed: ${applied.stderr.trim()}`);
  const status = (await git(["status", "--porcelain=v1"], repoDir)).stdout.split(/\r?\n/).filter(Boolean);
  const next = `node scripts/neves-launcher-agent.mjs fix ${repo} --yes`;
  const data = { ok: true, applied: true, committed: false, files, status, next };
  const lines = [
    `Applied the patch to repos\\${slug} (working tree only, not committed, not pushed).`,
    ...files.map((f) => `  ${f}`),
    `Next: ${next}`,
  ];
  return { data: redactData(data), lines };
}

async function cmdFix(args, flags, emit) {
  const repo = checkRepo(args[0]);
  const folders = launcherFolders();
  const settings = await loadSettings(folders);
  console.error(WARNING);
  requireChange(settings, flags, "fix");
  const releaseExe = join(ROOT, "src-tauri", "target", "release", EXE_NAME);
  const debugExe = join(ROOT, "src-tauri", "target", "debug", EXE_NAME);
  const exe = (await isFile(releaseExe)) ? releaseExe : (await isFile(debugExe)) ? debugExe : null;
  if (!exe) {
    throw failure("the launcher is not built. Run pnpm tauri build first (src-tauri\\target\\release\\Neves Launcher.exe)");
  }
  const running = await launcherRunning();
  if (running) throw refused("Neves Launcher is running. Close it first: it may hold the files Fix needs.");

  const ws = workspaceOf(settings, folders);
  const extra = ws ? [ws.path] : [];
  const log = [];
  let stage = null;
  const output = await new Promise((done, reject) => {
    const child = spawn(exe, ["--fix", repo], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const onLine = (raw) => {
      const line = redact(raw, extra);
      if (line.startsWith("STAGE: ")) stage = line.slice("STAGE: ".length);
      log.push(line);
      emit(line);
    };
    const splitters = [lineSplitter(onLine), lineSplitter(onLine)];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => splitters[0].push(chunk));
    child.stderr.on("data", (chunk) => splitters[1].push(chunk));
    child.on("error", () => reject(failure("could not start the launcher's --fix")));
    child.on("close", (code) => {
      splitters.forEach((s) => s.end());
      done(code);
    });
  });
  const failed = output !== 0 || (stage !== null && /fail/i.test(stage));
  const data = { ok: !failed, repo, stage, exit_code: output, log };
  if (failed) {
    const why = output !== 0 ? `the launcher exited with code ${output}` : `the launcher reported: ${stage}`;
    throw failureWith(why, data);
  }
  return { data, lines: [`Fix finished. Stage: ${stage ?? "not reported"}`, "Next: status, or log for the output."] };
}

// A failure that also carries the output, so --json callers still get the log.
function failureWith(message, data) {
  const error = failure(message);
  error.data = data;
  return error;
}

function lineSplitter(onLine) {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        onLine(buffer.slice(0, at).replace(/\r$/, ""));
        buffer = buffer.slice(at + 1);
      }
    },
    end() {
      if (buffer) onLine(buffer.replace(/\r$/, ""));
      buffer = "";
    },
  };
}

function launcherRunning() {
  return new Promise((done, reject) => {
    execFile("tasklist", ["/FI", `IMAGENAME eq ${EXE_NAME}`, "/FO", "CSV", "/NH"], { windowsHide: true }, (error, stdout) => {
      if (error) reject(failure("could not check whether Neves Launcher is running (tasklist failed), so Fix was not started"));
      else done(/"Neves Launcher\.exe"/i.test(String(stdout)));
    });
  });
}

// Redacts every string value in a result, so escaped paths in JSON are caught too.
function redactData(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactData(item)]));
  }
  return value;
}

function helpData() {
  return {
    ok: true,
    commands: [
      { name: "status", args: "", needs: "nothing" },
      { name: "projects", args: "", needs: "nothing" },
      { name: "log", args: "<repo>", needs: "nothing" },
      { name: "patch-status", args: "<repo>", needs: "nothing" },
      { name: "patch-export", args: "<repo> --out <file>", needs: "nothing (writes only the new --out file)" },
      { name: "fix", args: "<repo> --yes", needs: "agent access on, and --yes" },
      { name: "patch-apply", args: "<repo> <file> --yes", needs: "agent access on, and --yes" },
      { name: "help", args: "", needs: "nothing" },
    ],
    safety: SAFETY,
  };
}

const SAFETY = [
  "Never deletes anything. patch-export never overwrites a file.",
  "Never reads or writes data\\ (the saves).",
  "Never prints secrets, environment values, or home-folder paths (they show as <private>).",
  "Never runs a shell or a command taken from arguments.",
  "Never commits, pushes, or changes git config.",
  "fix and patch-apply need agent access on and --yes. patch-apply refuses patches that leave repos\\<slug>.",
  "Exit codes: 0 ok, 1 refused, 2 usage error, 3 failure.",
];

function helpLines() {
  const data = helpData();
  return [
    "Usage: node scripts/neves-launcher-agent.mjs <command> [arguments] [--json]",
    "",
    ...data.commands.map((c) => `  ${`${c.name} ${c.args}`.trim().padEnd(40)} needs: ${c.needs}`),
    "",
    "Safety rules:",
    ...SAFETY.map((s) => `  - ${s}`),
  ];
}

// args: how many positional arguments the command takes.
const HANDLERS = {
  help: { args: 0, run: async () => ({ data: helpData(), lines: helpLines() }) },
  status: { args: 0, run: cmdStatus },
  projects: { args: 0, run: cmdProjects },
  log: { args: 1, run: (args) => cmdLog(args) },
  "patch-status": { args: 1, run: (args) => cmdPatchStatus(args) },
  "patch-export": { args: 1, run: cmdPatchExport, out: true },
  fix: { args: 1, run: cmdFix, yes: true },
  "patch-apply": { args: 2, run: cmdPatchApply, yes: true },
};

// ---------- main ----------

function parseArgs(argv) {
  const flags = { json: false, yes: false, out: null };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--yes") flags.yes = true;
    else if (arg === "--out") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw usage("--out needs a file path");
      flags.out = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") positional.unshift("help");
    else if (arg.startsWith("--")) throw usage(`unknown option ${arg}`);
    else positional.push(arg);
  }
  return { command: positional[0] ?? "help", args: positional.slice(1), flags };
}

function printError(error, json) {
  const kind = error instanceof CliError ? error.kind : "failure";
  const message = redact(error.message);
  if (json) {
    const body = { ok: false, error: message, kind };
    if (error.data) body.data = error.data;
    process.stderr.write(JSON.stringify(body, null, 2) + "\n");
  } else {
    process.stderr.write(`${kind === "failure" ? "error" : kind}: ${message}\n`);
  }
  return { usage: EXIT.usage, refused: EXIT.refused }[kind] ?? EXIT.failure;
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    return printError(error, process.argv.includes("--json"));
  }
  const { command, args, flags } = parsed;
  const json = flags.json;
  try {
    const handler = HANDLERS[command];
    if (!handler) throw usage(`unknown command "${command}". Run: node scripts/neves-launcher-agent.mjs help`);
    if (args.length !== handler.args) throw usage(`${command} takes ${handler.args} argument(s). Run: node scripts/neves-launcher-agent.mjs help`);
    if (flags.yes && !handler.yes) throw usage(`${command} does not take --yes`);
    if (flags.out && !handler.out) throw usage(`${command} does not take --out`);
    // Human lines are printed as they come (fix streams its output); --json prints one object at the end.
    const emit = (line) => {
      if (!json) process.stdout.write(redact(line) + "\n");
    };
    const result = await handler.run(args, flags, emit);
    if (json) {
      process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
    } else {
      for (const line of result.lines ?? []) process.stdout.write(redact(line) + "\n");
    }
    return EXIT.ok;
  } catch (error) {
    if (!(error instanceof CliError)) error = failure(error?.message ?? String(error));
    return printError(error, json);
  }
}

process.exitCode = await main();
