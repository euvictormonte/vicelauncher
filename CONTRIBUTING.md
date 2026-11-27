# Contributing to Neves Launcher

Thank you for helping. Neves Launcher is free software under the GPL-3.0-or-later (see [LICENSE](LICENSE) and [LEGAL.md](LEGAL.md)). By contributing you agree that your contribution is released under the same licence.

## Before you start

- **Small fixes** (typos, a clear bug, a small UI fix): open a pull request directly.
- **Anything larger** (a new feature, a new screen, a change to how builds are run or updated): open an issue first and agree the approach. This saves you time.
- **Security problems**: do not open a public issue. See [SECURITY.md](SECURITY.md).

## Where things belong

- A **project** (its game, code, results or bugs) belongs to that project's authors. Report it to them.
- The **project list** (which projects appear, their details, takedowns) belongs to VIPortLive.
- **Neves Launcher itself** (the app, its builds, its warnings, its docs) belongs in this repository.

## Setting up

You need Windows 10 or 11, Node.js 22, pnpm 10, and Rust stable with the MSVC toolchain.

```powershell
git clone https://github.com/<your-account>/neves-launcher
cd neves-launcher
pnpm install
pnpm tauri dev
```

The UI also runs in a browser with a mock backend (`src/dev/mock.ts`), which is useful for layout work.

## Before you open a pull request

Run the same checks CI runs:

```powershell
pnpm ci:check
```

For Rust changes also run `cargo fmt --check` and `cargo clippy --all-targets` in `src-tauri`. Both should report nothing. Add a test for any logic you change when a test is practical.

If you change a Tauri command or a settings field, update `src/lib/types.ts` and `src/dev/mock.ts` in the same pull request so the browser mock keeps working.

## Rules for the code

- **No personal data.** Do not commit names, paths, tokens, logs with private information, or game files. Do not add telemetry.
- **Respect the safety model.** The launcher runs other people's code, so new features must warn before they run code, change files outside the project's own folder, or act on the player's behalf. Saves must never be read, moved or deleted by update, rollback or cleanup code.
- **Keep warnings honest.** If a feature can cause harm, say what could happen in the UI and in the docs, and require the player to accept it.
- **Dependencies** need a reason and a licence compatible with GPL-3.0-or-later. Say which in the pull request.
- **Generated files** (`tsconfig.tsbuildinfo`, `.ci/`, build output) do not belong in commits.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make a focused change. One topic per pull request.
3. Fill in the pull request template.
4. Make sure `pnpm ci:check` passes.
5. A maintainer reviews. Expect questions; they are about the change, not about you.
6. Maintainers merge when the change is reviewed, checked and fits the project. We may ask for changes or decline a change that does not fit.

## Forks

You may fork Neves Launcher and build something of your own under the same licence. A fork must keep the licence and notices, credit the authors, and say what it changed (see LEGAL.md, section 6). If you publish a fork, please name it differently so players can tell the two apart.

## Conduct

Be kind and specific. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
