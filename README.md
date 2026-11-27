<p align="center">
  <img src="assets/bannr.png" alt="Neves Launcher" width="960">
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: GPL-3.0-or-later" src=""></a>
  <a href="https://github.com/euvictormonte/vicelauncher/actions/workflows/build.yml"><img alt="Build" src="https://github.com/euvictormonte/vicelauncher/actions/workflows/build.yml/badge.svg"></a>
  <a href="https://github.com/euvictormonte/vicelauncher/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/euvictormonte/vicelauncher?color=ff4fa8&cacheSeconds=300"></a>
</p>

A Windows launcher for community game projects. It lists projects from [VIPortLive](https://viportlive.com), downloads and builds them with Git and Cargo, and starts them with **your own copy of the game files**.

![Neves Launcher library: recommended builds, filters and a project's overview](assets/screenshots/library.png)

> **No game is included.** Neves Launcher ships no game files, downloads none, and is not affiliated with Rockstar Games, Take-Two Interactive, or any other publisher. See [LEGAL.md](LEGAL.md).

## Where it came from

Neves Launcher is a fork of VILauncher, which began as a fork of [Mandyhub](https://github.com/TheGameOnAddict/mandyhub-sinkfinger) by Zettrox. The source project was redesigned and extended by the VIPortLive team; this fork is being rebranded as Neves Launcher.

- Its project library is not limited to VIctory builds. Any Rust project with a Git URL, any prebuilt Windows ZIP, and any build already on your PC can be added and managed the same way.
- It checks a project's own notes and reports for known problems, and can fix and verify many of them (see [Features](#features)).
- It has a one-level rollback for updates, a disk-space manager, a problem-report button that opens a GitHub issue, and an optional AI-agent interface for developers.

Mandyhub's settings and installed projects are carried over on first start, so nothing is rebuilt needlessly.

## What you can and can't do with it

**You can fork it, and we want you to.** The code is GPL-3.0-or-later. You may use, study, change and redistribute it, including as a base for your own launcher or to contribute back. The license requires that any copy or modified version you distribute:

- stays under GPL-3.0-or-later and comes with its source code,
- keeps the copyright and license notices and credits Mandyhub and Neves Launcher's authors,
- marks clearly what you changed.

**You can't take it closed-source.** A modified version you distribute must be released under the same license. That is the rule the GPL sets, not a courtesy we are asking for.

**The projects are not ours.** Neves Launcher manages projects made by other people. It does not review, certify or vouch for their code. Read what you run.

**Rockstar and GTA.** Neves Launcher shows community projects for a game whose files you must already own. It never includes, downloads or distributes game files. Rockstar Games and Take-Two Interactive are not affiliated with this project and have not endorsed it. Their names and marks belong to them.

## What's new

New versions and downloads are published on [GitHub Releases](https://github.com/euvictormonte/vicelauncher/releases). The build workflow runs for each `v*` tag.

## Download

Download `Neves Launcher.exe` (portable) or the installer from [Releases](https://github.com/euvictormonte/vicelauncher/releases/latest). The launcher checks for its own updates at start and verifies the executable's SHA-256 before replacing itself.

### Antivirus flags

A signed release verifies with `Get-AuthenticodeSignature` (signer: VIPortLive team) and a SHA-256 digest on the release page; while a release is unsigned, compare its SHA-256 instead. Machine-learning engines such as Trapmine still flag fresh builds now and then. Why, and how to report it: [docs/FALSE-POSITIVES.md](docs/FALSE-POSITIVES.md).

## Features

- **Library.** Projects from VIPortLive, your own Git repos, and prebuilt ZIPs. Each shows its reported frame rate, the graphics cards it was made for, and whether it is verified. Projects VIPortLive has taken down are hidden by default; you can show them, and they open VIPortLive's page.
- **Fit warnings.** The launcher reads your graphics card, memory and processor, and compares them with what each build's author reported. A build that doesn't fit shows a warning; this is usage the author saw, not a minimum. You can set your own RAM and video memory under *Advanced: by PC spec*. There is no "recommended" list: these projects are too new for their reports to rank them.
- **Filter and sort.** Sort by name, frame rate, stars or recent commits; filter by tier and graphics card.
- **Tool setup.** Finds Git, Rust and the C++ build tools, and installs missing ones with winget (Windows asks for permission).
- **Install, update, play.** Downloaded and built once, then kept. Updates save any uncommitted edits as a patch file, keep the previous build for one-step rollback, and show a warning first.
- **Known-problem fixes.** Before Play, and from the Activity tab, the launcher checks the project's own notes and build for known problems and fixes what it can. Agility SDK files are fetched from Microsoft's NuGet package and checked against pinned SHA-256 hashes; missing files are searched for; tools are installed; caches are cleared; graphics settings are lowered after out-of-memory or lost-device crashes. Every result is read back.
- **Report a problem.** After a failed job, one click opens a GitHub issue with the log filled in. Names and folders are removed first. Nothing is sent until you press Submit on GitHub.
- **Storage.** Settings shows how much disk each project uses (sources, builds, previous build, shader cache, saves). You can clear previous builds and shader caches. Saves are never cleared from here.
- **Saves.** Continue a save, start fresh, copy from another build, or start from a named checkpoint. Import or export save ZIPs.
- **Launch presets and graphics.** Named argument and environment presets per project, and per-project graphics overrides.
- **Shader warm-up.** Builds the shader cache before the first launch where a project supports it.
- **Activity log.** Full Git and Cargo output, copyable and exportable. Each job's log is also kept on disk.
- **AI-agent access (off by default).** Lets an AI agent read logs and, after you confirm, apply a patch and run the project's build. See [Agent tools](#agent-tools).
- **Screenshot mode.** Hides names, paths, notes and logs for sharing pictures.

## Screenshots

![A project that is not installed yet, with the Set up button](assets/screenshots/first-setup.png)

The screenshots use example data from the browser mock, not a real PC or account.

## Requirements

- Windows 10 or 11, 64-bit
- WebView2, which ships with Windows 10 and 11 (the installer fetches it if missing)
- Your own copy of any game a project needs
- To build Rust projects: Git, Rust and the C++ build tools (Neves Launcher can install them)

## Data folders

| Path | Holds |
| --- | --- |
| `%LOCALAPPDATA%\Neves Launcher` | Repos, builds, shader caches, saves and profiles (`data`), previous builds, patches, logs. The install folder can be changed in Settings. |
| `%APPDATA%\Neves Launcher\settings.json` | Settings |

Saves live in `data` and are never touched by an update, a rollback or a cache clear.

## Build from source

Needs Node.js 22, pnpm 10 and Rust stable. The UI also runs in a plain browser with a mock backend during development.

```powershell
pnpm install
pnpm tauri dev     # run with hot reload
pnpm tauri build   # release build
```

Output:

- `src-tauri\target\release\Neves Launcher.exe`
- `src-tauri\target\release\bundle\nsis\Neves Launcher_<version>_x64-setup.exe`

### Check the build like CI

```powershell
pnpm ci:check                                  # install, typecheck, vite build, cargo test
node scripts/ci.mjs --only typecheck,test      # run a subset
node scripts/ci.mjs --tauri --keep-going       # also build the installer, run every step
node scripts/ci.mjs --json                     # also write .ci/last-run.json
```

Each step prints PASS or FAIL with its timing; a failing step shows the last 40 lines of its output. The exit code is 0 only when every step that ran passed. CI runs the same checks on every push and pull request; a `v*` tag publishes a release.

## Agent tools

`scripts/neves-launcher-agent.mjs` (run with `pnpm agent <command>`) lets an AI agent look at the launcher's projects and builds, read the logs, run the launcher's own Fix and verify, and turn an agent's fix into a patch you review first. Read-only commands always work. Anything that changes files needs the **AI agent access** setting turned on in the launcher, and `--yes` on the command. Run `pnpm agent help` for the list and the safety rules.

Optional: the REA MCP server (`npx rea-agents@6.10.1 mcp`, MIT, from [morluto/rea](https://github.com/morluto/rea)) gives an agent reverse-engineering tools. Its native analysis needs Hopper, Ghidra, IDA or Kuna installed by you. Only point it at builds you are allowed to analyse. Neves Launcher does not bundle REA.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request. In short: open an issue for anything large, run `pnpm ci:check`, and keep the change focused.

Problems with a *project* (its game, its code, its results) belong to that project's authors. Problems with the *list* belong to VIPortLive. Problems with *Neves Launcher itself* belong here.

## Project layout

| Path | Contents |
| --- | --- |
| `src/` | React UI (TypeScript, Tailwind CSS) |
| `src/dev/mock.ts` | Mock backend for the browser |
| `src-tauri/` | Rust launcher (Tauri 2): project list, Git and Cargo jobs, saves, presets, updates, diagnostics |
| `src-tauri/src/brand.rs` | Names, links, folders and project list sources |
| `scripts/` | CI checks (`ci.mjs`) and the agent tool (`neves-launcher-agent.mjs`) |

The project list comes from `https://viportlive.com/api/launcher`. If that is unavailable, PortWatch's `tracker.json` is used.

## Legal notice

Neves Launcher is a project manager. It does not include, download or distribute any game, game build or game files. You must provide your own copy of any game a project needs. You are responsible for what you install, build and run, and for having the right to use the files you supply. The software comes with no warranty, and Neves Launcher is not affiliated with any game publisher or developer.

The full text is in [LEGAL.md](LEGAL.md). The app shows it on first start and asks you to agree before the library opens.

## Credits

- Forked from [Mandyhub](https://github.com/TheGameOnAddict/mandyhub-sinkfinger) by Zettrox, and the Mandyhub contributors
- Launcher redesign by ellion369
- Save picker, checkpoints, presets and build tracking by TheGameOnAddict
- VIctory by Marvisak and contributors
- Project list and tracker from PortWatch, via VIPortLive
- Fonts: Inter and Schibsted Grotesk (SIL Open Font License), Yellowtail (Apache License 2.0), via Fontsource

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). Third-party components keep their own licenses.
