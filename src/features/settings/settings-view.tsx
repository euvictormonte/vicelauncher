import { Fragment, useCallback, useEffect, useState } from "react"
import { ExternalLink, FolderOpen, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/ui/segmented"
import { Group, Row } from "@/components/ui/group"
import { Input, Textarea } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { GraphicsGroups } from "@/features/library/graphics-tab"
import { ResponsibilityDialog } from "@/features/shared/responsibility"
import { openUrl, pickFolder } from "@/lib/api"
import { useDraft } from "@/lib/hooks"
import { pawsUnlocked, setTheme, THEMES, type Theme, useTheme } from "@/lib/theme"
import { run, useStore } from "@/lib/store"
import type { StorageView } from "@/lib/types"
import { setLanguage, t as translate, useLanguage, useT } from "@/lib/i18n"

export function SettingsView() {
  const snap = useStore((s) => s.snap)!
  const screenshot = useStore((s) => s.screenshot)
  const setScreenshot = useStore((s) => s.setScreenshot)
  const s = snap.settings
  const theme = useTheme()
  const language = useLanguage()
  const t = useT()
  const looks = [
    ...THEMES.map((t) => ({ value: t.id as string, label: t.label })),
    ...(pawsUnlocked() || theme === "paws" ? [{ value: "paws", label: "Paws" }] : []),
  ]
  const [askAgents, setAskAgents] = useState(false)
  // Turning agents on needs the warning once; the switch only moves after Continue.
  const turnOnAgents = () =>
    s.acknowledged.includes("agent-access") ? void run({ type: "set_agent_access", enabled: true }) : setAskAgents(true)
  const [gameDir, setGameDir] = useDraft(s.game_dir, (v) => void run({ type: "set_game_dir", path: v }), 600)
  const [args, setArgs] = useDraft(s.launch_args, (v) => void run({ type: "set_settings", patch: { launch_args: v } }))
  const [env, setEnv] = useDraft(s.extra_env, (v) => void run({ type: "set_settings", patch: { extra_env: v } }))
  const busy = snap.job.running
  const u = snap.updater
  return (
    <div className="h-full overflow-y-auto">
      <div className="drag h-12" />
      <div className="mx-auto max-w-[760px] space-y-10 px-10 pb-16">
        <header>
          <h1 className="font-display text-page font-bold tracking-[-0.02em] text-fg">{t("Settings")}</h1>
          <p className="mt-1 text-body text-fg-3">{snap.brand.name} {snap.version}</p>
        </header>

        <Group title="Language">
          <Row label="App language" hint="The language choice is saved on this PC.">
            <Segmented label="App language" size="sm" value={language} options={[{ value: "pt-BR", label: "Português (Brasil)" }, { value: "en", label: "English" }]} onChange={(v) => setLanguage(v as "pt-BR" | "en")} />
          </Row>
        </Group>

        <Group title="Appearance" description="Dark is the default. Light and calm are flat, with no glow. The look is remembered on this PC.">
          <Row label="Look" hint="Applies at once.">
            <Segmented label="Look" size="sm" value={theme} options={looks} onChange={(v) => setTheme(v as Theme)} />
          </Row>
        </Group>

        <Group title="Privacy">
          <Row label="Screenshot mode" hint="Shows example names and hides paths, notes and logs, for sharing pictures of the launcher.">
            <Switch checked={screenshot} onCheckedChange={setScreenshot} aria-label="Screenshot mode" />
          </Row>
        </Group>

        {screenshot ? (
          <p className="text-body text-fg-3">{t("The other settings are hidden in Screenshot mode.")}</p>
        ) : (
          <>
            <Group title="Game files" description="The folder with game_scarlett_master.exe from your own copy of the game. Neves Launcher never downloads game files.">
              <Row stacked label="Folder">
                <Input value={gameDir} onChange={(e) => setGameDir(e.target.value)} placeholder="Paste the folder's path" className="font-mono text-secondary" aria-label="Game folder" />
                <Button size="md" onClick={async () => { const d = await pickFolder(t("The folder with your game files")); if (d) void run({ type: "set_game_dir", path: d }) }}>
                  <FolderOpen /> Choose…
                </Button>
                <Button size="md" variant="ghost" disabled={snap.files.searching} onClick={() => void run({ type: "find_game_files" })}>
                  {snap.files.searching ? <Spinner /> : <Search />} {snap.files.searching ? "Searching" : "Find"}
                </Button>
              </Row>
              <Row label="Status" hint={snap.files.find_error ?? undefined}>
                <FilesStatus />
              </Row>
            </Group>

            <Group title="Build tools" description="Projects are downloaded with Git and built with Rust and the C++ build tools, once, on this PC.">
              <Row label={!snap.tools ? "Checking…" : snap.tools.ready ? "Git, Rust and the C++ build tools are ready" : t("Missing {tools}", { tools: snap.tools.missing.join(", ") })} hint={snap.tools && !snap.tools.ready ? "Installs with winget; Windows asks for permission." : undefined}>
                {snap.tools && !snap.tools.ready && <Button size="sm" variant="primary" disabled={busy} onClick={() => void run({ type: "install_tools" })}>Install missing tools</Button>}
                {snap.tools?.ready && <Dot ok />}
              </Row>
            </Group>

            <div className="space-y-8">
              <div className="px-1">
                <h2 className="font-display text-section font-semibold text-fg">{t("Default graphics")}</h2>
                <p className="mt-0.5 text-secondary text-fg-3">{t("Every project uses these unless you change its own in its Graphics tab.")}</p>
              </div>
              <GraphicsGroups graphics={s.graphics} onChange={(graphics) => void run({ type: "set_default_graphics", graphics })} />
            </div>

            <Group title="Shaders and launch" description="VIctory can translate the game's shaders before you play, so the game doesn't stop to do it on the way. Each project keeps its own cache.">
              <Row label="Warm up shaders before playing" hint="Runs each time you press Play. The first one takes minutes and about 1.3 GB.">
                <Switch checked={s.warm_before_play} onCheckedChange={(v) => void run({ type: "set_settings", patch: { warm_before_play: v } })} aria-label="Warm up shaders before playing" />
              </Row>
              <Row label="Also build the GPU pipelines" hint="Slow: about 20 minutes on 16 threads, hours after a translator update.">
                <Switch checked={s.warm_pipelines} onCheckedChange={(v) => void run({ type: "set_settings", patch: { warm_pipelines: v } })} aria-label="Also build the GPU pipelines" />
              </Row>
              <Row stacked label="Default launch arguments" hint="Added to victory run, for example --strict. Arguments for the game go after --.">
                <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="--strict -- -title-argument" className="font-mono text-secondary" aria-label="Default launch arguments" />
              </Row>
              <Row stacked label="Default launch switches" hint="One VICTORY_NAME=value per line.">
                <Textarea value={env} onChange={(e) => setEnv(e.target.value)} placeholder="VICTORY_NAME=value" rows={3} className="font-mono text-secondary" aria-label="Default launch switches" />
              </Row>
            </Group>

            <Group title="Storage">
              <Row label="Install folder" hint={<span className="font-mono break-all" data-selectable>{s.workspace}</span>}>
                <Button size="sm" disabled={busy} onClick={async () => { const d = await pickFolder(t("Where projects are downloaded and built")); if (d) void run({ type: "choose_install_dir", path: d }) }}>Change…</Button>
                {s.install_dir_custom && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ type: "use_default_install_dir" })}>Use default</Button>}
              </Row>
              <Row label="Background pictures" hint="Put .jpg or .png pictures here and they show behind every project.">
                <Button size="sm" onClick={() => void run({ type: "open", what: "backgrounds" })}><FolderOpen /> Open folder</Button>
              </Row>
            </Group>

            <DiskSpace />
          </>
        )}

        <Group title="AI agents">
          <Row label="Let AI agents help with builds" hint="Off by default. Agents can read logs and, when you confirm, apply patches. See the README section 'Agent tools'.">
            <Switch
              checked={snap.settings.agent_access}
              onCheckedChange={(v) => (v ? turnOnAgents() : void run({ type: "set_agent_access", enabled: false }))}
              aria-label="Let AI agents help with builds"
            />
          </Row>
          <ResponsibilityDialog
            open={askAgents}
            onOpenChange={setAskAgents}
            id="agent-access"
            onAccept={() => void run({ type: "set_agent_access", enabled: true })}
          />
        </Group>

        <Group title="Updates">
          <Row
            label={u.state === "available" ? t("{version} is available", { version: u.tag ?? snap.version }) : u.state === "downloaded" ? "The update is ready" : u.state === "checking" ? "Checking for updates…" : u.state === "downloading" ? "Downloading and verifying…" : u.state === "failed" ? "The update check failed" : "You're up to date"}
            hint={u.restart_error ?? u.error ?? t("Version {version}", { version: snap.version })}
          >
            {u.state === "available" && <Button size="sm" variant="primary" disabled={busy} onClick={() => void run({ type: "download_update" })}>Update and restart</Button>}
            {u.state === "downloaded" && <Button size="sm" variant="primary" disabled={busy} onClick={() => void run({ type: "restart_to_update" })}>Restart now</Button>}
            {(u.state === "checking" || u.state === "downloading") && <Spinner />}
            {!["available", "downloaded", "checking", "downloading"].includes(u.state) && <Button size="sm" onClick={() => void run({ type: "check_update" })}>Check now</Button>}
            <Button size="sm" variant="ghost" onClick={() => void openUrl(u.releases)}>Release notes</Button>
          </Row>
          <Row label="Warn before updating a project" hint="Shows what an update replaces, and that the previous build can be restored once.">
            <Switch
              checked={!snap.settings.skip_update_warning}
              onCheckedChange={(v) => void run({ type: "set_update_warning", show: v })}
              aria-label="Warn before updating a project"
            />
          </Row>
        </Group>

        <Group title="About">
          <Row label={t("Neves Launcher community")} hint={t("An independently maintained launcher for organizing, installing, updating and starting community projects, with its own interface in Brazilian Portuguese and English. It does not distribute game files.")}>
            <Button size="sm" variant="ghost" onClick={() => void openUrl("https://discord.gg/pfuXKQCSYq")}><ExternalLink /> {t("Community Discord")}</Button>
          </Row>
          <Row label={t("Origins and credits")} hint={t("This Neves Launcher edition reworks VI Launcher with its own visual identity, a redesigned interface and Brazilian Portuguese localization while preserving the project’s core features. VI Launcher, in turn, is based on Mandyhub by Zettrox. We also credit ellion369’s redesign and TheGameOnAddict’s save picker, checkpoints, presets and build tracking. Free software under the GNU GPL v3 or later.")}>
            <Button size="sm" variant="ghost" onClick={() => void openUrl(snap.brand.source)}><ExternalLink /> {t("View Neves Launcher on GitHub")}</Button>
          </Row>
          <Row label="Legal notice" hint="You provide your own copy of the game, and you are responsible for what you install, build and run. Neves Launcher only manages the projects.">
            <Button size="sm" variant="ghost" onClick={() => useStore.getState().open({ kind: "notice" })}>Read</Button>
          </Row>
        </Group>
      </div>
    </div>
  )
}

/** Sizes in KB, MB, GB or TB with one decimal. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

/** What each project takes on disk, and the safe parts to clear. Saves are never offered. */
function DiskSpace() {
  const busy = useStore((s) => s.snap!.job.running)
  const [view, setView] = useState<StorageView | null>(null)
  const [scanning, setScanning] = useState(false)
  // The button waiting for its second click, as "cache:<slug>" or "previous:<slug>".
  const [armed, setArmed] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setScanning(true)
    const next = await run<StorageView>({ type: "storage_scan" })
    if (next) setView(next)
    setScanning(false)
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  const clear = async (kind: "cache" | "previous", repo: string, key: string) => {
    if (armed !== key) {
      setArmed(key)
      return
    }
    setArmed(null)
    await run(
      kind === "cache" ? { type: "clear_cache", repo } : { type: "clear_previous", repo },
      kind === "cache" ? "Shader cache cleared" : "Previous build cleared",
    )
    await scan()
  }

  return (
    <Group
      title="Disk space"
      description="What Neves Launcher keeps on this PC. Saves are always kept. Clearing a shader cache makes its next Play slow again while it is rebuilt."
    >
      <Row
        label={view ? translate("{size} in use", { size: formatBytes(view.total_bytes) }) : translate("Measuring…")}
        hint={view && `${translate("{size} outside the projects (checkpoints, logs)", { size: formatBytes(view.other_bytes) })}${view.free_bytes != null ? `. ${formatBytes(view.free_bytes)} ${translate("free on the drive")}` : ""}.`}
      >
        <Button size="sm" variant="ghost" disabled={scanning} onClick={() => void scan()}>
          {scanning ? <Spinner /> : <RefreshCw />} Refresh
        </Button>
      </Row>
      {view && (
        <div className="overflow-x-auto px-4 py-3">
          <table className="w-full min-w-[560px] text-secondary">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="pb-2 font-normal">{translate("Project")}</th>
                <th className="pb-2 text-right font-normal">{translate("Sources")}</th>
                <th className="pb-2 text-right font-normal">{translate("Builds")}</th>
                <th className="pb-2 text-right font-normal">{translate("Previous build")}</th>
                <th className="pb-2 text-right font-normal">{translate("Shader cache")}</th>
                <th className="pb-2 text-right font-normal">{translate("Saves (kept)")}</th>
              </tr>
            </thead>
            <tbody>
              {view.projects.map((row) => {
                const cacheKey = `cache:${row.slug}`
                const previousKey = `previous:${row.slug}`
                return (
                  <Fragment key={row.slug}>
                    <tr className="text-fg-2">
                      <td className="py-1.5 text-body text-fg">{row.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatBytes(row.sources)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatBytes(row.builds)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatBytes(row.previous)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatBytes(row.cache)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatBytes(row.saves)}</td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="pb-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="ghost" disabled={busy || scanning || row.previous === 0} onClick={() => void clear("previous", row.repo, previousKey)}>
                            {armed === previousKey ? "Confirm" : "Clear previous build"}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy || scanning || row.cache === 0} onClick={() => void clear("cache", row.repo, cacheKey)}>
                            {armed === cacheKey ? "Confirm" : "Clear shader cache"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Group>
  )
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={ok ? "size-2 rounded-full bg-ok" : "size-2 rounded-full bg-bad"} aria-hidden />
}

function FilesStatus() {
  const f = useStore((s) => s.snap!.files)
  if (!f.chosen) return <span className="text-secondary text-fg-3">{translate("No folder chosen")}</span>
  if (f.ok) return <span className="flex items-center gap-2 text-secondary text-ok"><Dot ok /> {translate("All game files found")}</span>
  if (f.unplugged) return <span className="flex items-center gap-2 text-secondary text-bad"><Dot ok={false} /> {translate("The drive with your game files is not connected")}</span>
  if (f.empty) return <span className="flex items-center gap-2 text-secondary text-bad"><Dot ok={false} /> {translate("This folder is empty")}</span>
  return (
    <span className="flex max-w-80 flex-wrap items-center justify-end gap-x-2 text-secondary text-bad">
      <Dot ok={false} /> {translate("Missing")} <span className="font-mono text-caption text-fg-2">{f.missing.join(", ")}</span>
    </span>
  )
}
