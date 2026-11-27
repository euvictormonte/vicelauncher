# Neves Launcher: notes for agents

## Checking a build

Run the same checks as CI, locally, before you say a change works:

- `pnpm ci:check` runs typecheck, vite build and `cargo test --locked`, stopping at the first failure.
- `node scripts/ci.mjs --only typecheck,vite,test --json` runs a subset and writes `.ci/last-run.json`.
- `node scripts/ci.mjs --tauri --keep-going` also builds the installer, and runs every step.

On a failure, each failing step prints its last 40 lines with colour codes removed. Read that output first; `.ci/last-run.json` has the same lines for the failing step. Fix the first error, then rerun only the failing step with `--only`.

## Working tree

The tree often has other people's uncommitted edits. Do not revert or reformat files you did not change in this task, and do not commit unless asked.

## Layout

- `src/` React UI. `src/dev/mock.ts` is the browser mock backend; keep it in step with `src/lib/types.ts`.
- `src-tauri/src/` Rust launcher. The project list comes from `brand::PROJECT_SOURCES`; the list's options and the PC-spec override are saved settings (`launcher.rs`, actions in `launcher/actions.rs`).
- `src/lib/compat.ts` judges a build against the PC (yes / close / no); `withSpec` applies the player's own RAM and video memory.

## For AI agents

`node scripts/neves-launcher-agent.mjs <command> [--json]` (or `pnpm agent`) is the only tool to use on the launcher's projects. Run `help` for the list.

- Read-only, always allowed: `status` (folders, agent access, tools, disk, projects, builds), `projects`, `log <repo>`, `patch-status <repo>`, `patch-export <repo> --out <file>` (writes only the new file, never overwrites).
- Changing: `fix <repo> --yes` (runs the launcher's Fix and verify) and `patch-apply <repo> <file> --yes` (git apply to the working tree, never commits). Both need the player's **AI agent access** setting on (`agent_access: true` in `%APPDATA%\Neves Launcher\settings.json`; missing means off). Without it they exit 1 and change nothing.
- Flow: `status` -> `log <repo>` -> make the change on a branch in `repos\<slug>` -> `patch-export <repo> --out <file>` -> `patch-apply <repo> <file> --yes` -> `fix <repo> --yes` -> `status` again.
- Exit codes: 0 ok, 1 refused, 2 usage error, 3 failure. Errors go to stderr.
- Changes run on the player's PC and are their responsibility. Show the patch to the player before `fix`.
- `fix` refuses while Neves Launcher.exe runs (ask the player to close it). It runs the launcher's `--fix <repo>` command from `src-tauri\target\release\Neves Launcher.exe` if that exists, else the debug build. The launcher's `--fix` refuses too (exit 1) unless `agent_access` is true and no other Neves Launcher window runs. Build it with `pnpm tauri build`.
- The tool never reads or writes `data\` (the saves). It prints no secrets, env values or home-folder paths.
- When a job (Install, Update, Play, Fix and verify) ends, the launcher writes its output to `<workspace>\logs\<slug>.log` (header line with the time and stage, then the last 2000 lines, overwritten by each job, scrubbed of the player's name and folders). `log <repo>` prints that file, or says none exists yet. Never `data\`.
