import { AlertTriangle, Check, CheckCircle2, Download, FileArchive, FolderOpen, Link2, Plus, Search, Star, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/ui/segmented"
import { Spinner } from "@/components/ui/spinner"
import { startPlay } from "@/features/library/primary-action"
import { ResponsibilityDialog } from "@/features/shared/responsibility"
import { pickFile, pickFolder, saveFile } from "@/lib/api"
import { allProjects, run, useAlias, useStore } from "@/lib/store"
import type { PlayChoice, PlayNext, SaveOption, SavesList } from "@/lib/types"
import { cn } from "@/lib/utils"
import { NoticeDialog } from "./notice-dialog"
import { t } from "@/lib/i18n"
import { toolsInstallHint } from "@/lib/platform"

/** Every dialog, opened from the store or by the launcher itself (a failed import, a move). */
export function Dialogs() {
  const dialog = useStore((s) => s.dialog)
  const open = useStore((s) => s.open)
  const snap = useStore((s) => s.snap)
  const close = () => open(null)
  if (!snap) return null
  return (
    <>
      <ImportDialog open={dialog?.kind === "import"} onClose={close} />
      {dialog?.kind === "uninstall" && <UninstallDialog repo={dialog.repo} onClose={close} />}
      {dialog?.kind === "setup" && <SetupDialog repo={dialog.repo} onClose={close} />}
      {dialog?.kind === "saves" && <SavesDialog repo={dialog.repo} onClose={close} />}
      {dialog?.kind === "presets" && <PresetsDialog repo={dialog.repo} choice={dialog.choice} onClose={close} />}
      <MoveDialog />
      <ImportErrorDialog />
      <NoticeDialog />
    </>
  )
}

function ImportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const busy = useStore((s) => s.snap!.job.running)
  const [mode, setMode] = useState<"link" | "zip">("link")
  const [link, setLink] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setLink("")
      setError(null)
    }
  }, [open])
  const acknowledged = useStore((s) => s.snap!.settings.acknowledged)
  const [askImport, setAskImport] = useState(false)
  const add = async () => {
    try {
      const { act } = await import("@/lib/api")
      await act({ type: "add_repo_link", link })
      toast.success(t("Added to your library"))
      onClose()
    } catch (e) {
      setError(String(e))
    }
  }
  // The first repo import asks the player to take responsibility; later ones go straight through.
  const submit = () => (acknowledged.includes("import-repo") ? void add() : setAskImport(true))
  const [zipPath, setZipPath] = useState<string | null>(null)
  const importZip = (path: string) => {
    void run({ type: "import_build_zip", path })
    onClose()
  }
  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Import a project"
      description="Add a Rust project by its Git link, or a prebuilt Windows build from a ZIP."
      footer={
        mode === "link" ? (
          <>
            <Button variant="primary" disabled={!link.trim()} onClick={submit}><Plus /> Add to library</Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                const path = await pickFile(t("Import a build ZIP"), [{ name: t("Build ZIP"), extensions: ["zip"] }])
                if (!path) return
                // A ZIP holds a program that runs on this PC, so it gets the same warning as a repo.
                if (acknowledged.includes("import-repo")) importZip(path)
                else {
                  setZipPath(path)
                  setAskImport(true)
                }
              }}
            >
              <FileArchive /> Choose ZIP…
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </>
        )
      }
    >
      <Segmented
        label="What to import"
        className="flex w-full"
        value={mode}
        options={[{ value: "link", label: "Git link" }, { value: "zip", label: "Build ZIP" }] as const}
        onChange={(v) => setMode(v)}
      />
      {mode === "link" ? (
        <div className="mt-5 space-y-2">
          <label className="relative block">
            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-4" />
            <Input
              autoFocus
              value={link}
              onChange={(e) => {
                setLink(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => e.key === "Enter" && link.trim() && submit()}
              placeholder="https://github.com/owner/project"
              aria-label="Git link"
              className="h-10 pl-9"
            />
          </label>
          {error && <p className="text-secondary text-bad">{error}</p>}
          <p className="text-caption text-fg-3">GitHub, GitLab, Codeberg, Gitea or your own server.</p>
        </div>
      ) : (
        <p className="mt-5 text-body text-fg-2">A ZIP with a Windows program and its files. Builds of VIctory (victory.exe) start with your game files; anything else starts on its own.</p>
      )}
      <div className="mt-5 flex items-start gap-3 rounded-lg border border-warn/20 bg-warn/8 px-3.5 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
        <p className="text-secondary text-fg-2">Neves Launcher builds and runs this code on your PC. Add only projects from people you trust: fake repos with malware exist.</p>
      </div>
    </Dialog>
    <ResponsibilityDialog
      open={askImport}
      onOpenChange={(open) => {
        setAskImport(open)
        if (!open) setZipPath(null)
      }}
      id="import-repo"
      onAccept={() => {
        const pending = zipPath
        setZipPath(null)
        if (pending) importZip(pending)
        else void add()
      }}
    />
    </>
  )
}

function UninstallDialog({ repo, onClose }: { repo: string; onClose(): void }) {
  const snap = useStore((s) => s.snap)!
  const alias = useAlias()
  const p = allProjects(snap).find((q) => q.repo === repo)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("Uninstall {name}?", { name: p ? alias(p).name : t("this project") })}
      description="This deletes its download, its build and its shader cache. Your saves stay, and you can install it again later."
      footer={
        <>
          <Button variant="danger-solid" onClick={() => { void run({ type: "uninstall", repo }); onClose() }}><Trash2 /> Uninstall</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </>
      }
    />
  )
}

function MoveDialog() {
  const pending = useStore((s) => s.snap!.pending_move)
  if (!pending) return null
  const answer = (a: "move" | "keep" | "cancel") => void run({ type: "confirm_move", answer: a })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && answer("cancel")}
      title="Move your installed projects?"
      description="Your projects and their saves are in the old folder. Moving them to another drive can take a while."
      footer={
        <>
          <Button variant="primary" onClick={() => answer("move")}>Move them</Button>
          <Button onClick={() => answer("keep")}>Don't move</Button>
          <Button variant="ghost" onClick={() => answer("cancel")}>Cancel</Button>
        </>
      }
    >
      <dl className="space-y-2 rounded-lg border border-line bg-fill-1 p-3 font-mono text-caption">
        <div className="flex gap-3"><dt className="w-10 text-fg-3">From</dt><dd className="break-all text-fg-2">{pending[0]}</dd></div>
        <div className="flex gap-3"><dt className="w-10 text-fg-3">To</dt><dd className="break-all text-fg">{pending[1]}</dd></div>
      </dl>
    </Dialog>
  )
}

function ImportErrorDialog() {
  const error = useStore((s) => s.snap!.job.import_error)
  if (!error) return null
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && void run({ type: "dismiss_import_error" })}
      title="The build couldn't be imported"
      description={error}
      footer={<Button variant="primary" onClick={() => void run({ type: "dismiss_import_error" })}>OK</Button>}
    />
  )
}

/** Everything a project needs before Install or Play, each with its fix, in order. */
function SetupDialog({ repo, onClose }: { repo: string; onClose(): void }) {
  const snap = useStore((s) => s.snap)!
  const alias = useAlias()
  const p = allProjects(snap).find((q) => q.repo === repo)
  if (!p) return null
  const tools = snap.tools
  const toolsBusy = snap.job.running && !snap.job.repo
  const needTools = !p.installed && p.kind === "git"
  const needFiles = !p.standalone
  const toolsOk = !needTools || !!tools?.ready
  const filesOk = !needFiles || snap.files.ok
  const ready = toolsOk && filesOk
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow={alias(p).name}
      title={p.installed ? "Get ready to play" : "Get ready to install"}
      description={ready ? "Everything is in place." : "A few things are needed first. Neves Launcher can set most of them up for you."}
      footer={
        <>
          <Button
            variant="primary"
            disabled={!ready || snap.job.running}
            onClick={() => {
              onClose()
              if (p.installed) void startPlay(p.repo)
              else void run({ type: "install", repo: p.repo })
            }}
          >
            {p.installed ? "Play" : "Install"}
          </Button>
          <Button variant="ghost" onClick={onClose}>{ready ? "Not now" : "Later"}</Button>
        </>
      }
    >
      <ol className="space-y-2">
        {needTools && (
          <Step
            n={1}
            done={toolsOk}
            title="Build tools"
            detail={!tools ? "Checking for Git, Rust and the C++ build tools…" : tools.ready ? "Git, Rust and the C++ build tools are ready." : toolsBusy ? snap.job.stage : `${t("Missing {tools}", { tools: tools.missing.join(", ") })}. ${t(toolsInstallHint(snap))}`}
          >
            {tools && !tools.ready && (
              <Button size="sm" disabled={snap.job.running} onClick={() => void run({ type: "install_tools" })}>
                {toolsBusy ? <Spinner className="text-white" /> : <Download />} {toolsBusy ? "Installing" : "Install"}
              </Button>
            )}
          </Step>
        )}
        {needFiles && (
          <Step
            n={needTools ? 2 : 1}
            done={filesOk}
            title="Your game files"
            detail={snap.files.ok ? "Found in your game folder." : snap.files.unplugged ? "The drive with your game files is not connected. Plug it in, or choose the folder again." : snap.files.find_error ?? (snap.files.chosen ? `Missing ${snap.files.missing.join(", ")}` : "The folder with game_scarlett_master.exe from your own copy of the game.")}
          >
            {!filesOk && (
              <>
                <Button size="sm" variant="ghost" disabled={snap.files.searching} onClick={() => void run({ type: "find_game_files" })}>
                  {snap.files.searching ? <Spinner /> : <Search />} Find
                </Button>
                <Button size="sm" onClick={async () => { const d = await pickFolder("The folder with your game files"); if (d) void run({ type: "set_game_dir", path: d }) }}>
                  <FolderOpen /> Choose…
                </Button>
              </>
            )}
          </Step>
        )}
      </ol>
    </Dialog>
  )
}

function Step({ n, done, title, detail, children }: { n: number; done: boolean; title: string; detail: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3.5 rounded-lg border border-line bg-fill-1 p-3.5">
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-secondary font-semibold", done ? "bg-ok/15 text-ok" : "bg-fill-3 text-fg-2")}>
        {done ? <Check className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-fg">{title}</p>
        <p className="text-secondary text-fg-3">{detail}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </li>
  )
}

function PresetsDialog({ repo, choice, onClose }: { repo: string; choice: PlayChoice; onClose(): void }) {
  const open = useStore((s) => s.open)
  const [picked, setPicked] = useState<number | null>(choice.recommended)
  const rows = [{ title: "Current settings", detail: "Keep this project's arguments and switches." }, ...choice.options]
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="How should it start?"
      description="Choose once: Neves Launcher remembers it for this project."
      footer={
        <>
          <Button
            variant="primary"
            onClick={async () => {
              const next = await run<PlayNext>({ type: "confirm_preset", repo, index: picked })
              if (!next) return
              if (next.next === "saves") open({ kind: "saves", repo })
              else onClose()
            }}
          >
            Continue
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div role="radiogroup" className="space-y-1.5">
        {rows.map((r, i) => {
          const index = i === 0 ? null : i - 1
          return <Choice key={i} selected={picked === index} onSelect={() => setPicked(index)} title={r.title} detail={r.detail} />
        })}
      </div>
    </Dialog>
  )
}

function Choice({ selected, onSelect, title, detail, icon }: { selected: boolean; onSelect(): void; title: string; detail?: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors duration-150",
        selected ? "border-accent/50 bg-accent-soft" : "border-line bg-fill-1 hover:bg-fill-2",
      )}
    >
      <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", selected ? "border-accent bg-accent" : "border-fg-4")}>
        {selected && <span className="size-1.5 rounded-full bg-white" />}
      </span>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-fg">{title}</span>
        {detail && <span className="block truncate text-secondary text-fg-3">{detail}</span>}
      </span>
    </button>
  )
}

type SaveTab = "this_build" | "other_builds" | "favorites"

function SavesDialog({ repo, onClose }: { repo: string; onClose(): void }) {
  const snap = useStore((s) => s.snap)!
  const screenshot = useStore((s) => s.screenshot)
  const alias = useAlias()
  const p = allProjects(snap).find((q) => q.repo === repo)
  const [list, setList] = useState<SavesList | null>(null)
  const [tab, setTab] = useState<SaveTab>("this_build")
  const [index, setIndex] = useState(0)
  const [naming, setNaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const load = async (keep?: { tab: SaveTab; title?: string }) => {
    const l = await run<SavesList>({ type: "saves_list", repo })
    if (!l) return
    setList(l)
    if (keep) {
      setTab(keep.tab)
      setIndex(Math.max(0, keep.title ? l[keep.tab].findIndex((o) => o.title === keep.title) : 0))
    } else {
      setIndex(l.has_current ? 0 : 1)
    }
  }
  useEffect(() => {
    void load()
  }, [repo])
  const options: SaveOption[] = list?.[tab] ?? []
  const option = options[index]
  const exportable = option?.path ?? option?.source ?? null
  const label = option?.kind === "continue" ? "Continue" : option?.kind === "fresh" ? "Start a new game" : "Play from a copy"
  const empty = tab === "other_builds" ? "Saves from your other builds show here once you've saved in them." : "To keep a checkpoint, pick a save and choose Add to favourites."
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      eyebrow={p ? alias(p).name : undefined}
      title="Choose a save"
      description="New games and copies keep your earlier progress."
      className="w-[min(560px,calc(100vw-48px))]"
      footer={
        deleting ? (
          <>
            <Button
              variant="danger-solid"
              onClick={async () => {
                if (exportable) await run({ type: "delete_save", path: exportable }, "Moved to deleted-saves")
                setDeleting(false)
                void load({ tab })
              }}
            >
              <Trash2 /> Delete save
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(false)}>Keep it</Button>
          </>
        ) : naming != null ? (
          <>
            <Button
              variant="primary"
              disabled={!naming.trim() || !option?.source}
              onClick={async () => {
                const ok = await run({ type: "checkpoint", name: naming, source: option!.source! })
                if (ok !== undefined) {
                  toast.success(t("Added to favourites"))
                  setNaming(null)
                  void load({ tab: "favorites", title: naming.trim() })
                }
              }}
            >
              <Star /> Save checkpoint
            </Button>
            <Button variant="ghost" onClick={() => setNaming(null)}>Back</Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={!option || !snap.files.ok || snap.job.running}
              onClick={() => {
                if (!option) return
                const choice = option.kind === "copy" ? { kind: "copy" as const, path: option.path! } : { kind: option.kind }
                void run({ type: "start_with_save", repo, choice })
                onClose()
              }}
            >
              {label}
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <div className="mr-auto flex gap-1">
              {!screenshot && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const path = await pickFile("Import a save ZIP", [{ name: "VIctory save ZIP", extensions: ["zip"] }])
                    if (path) {
                      const name = await run<string>({ type: "import_save_zip", path })
                      if (name) {
                        toast.success(t("Imported “{name}” into favourites", { name }))
                        void load({ tab: "favorites", title: name })
                      }
                    }
                  }}
                >
                  <Download /> Import
                </Button>
              )}
            </div>
          </>
        )
      }
    >
      <Segmented
        label="Saves"
        className="flex w-full"
        value={tab}
        options={[{ value: "this_build", label: "This build" }, { value: "other_builds", label: "Other builds" }, { value: "favorites", label: "Favourites" }] as const}
        onChange={(t) => {
          setTab(t)
          setIndex(0)
          setNaming(null)
          setDeleting(false)
        }}
      />
      <div role="radiogroup" className="mt-4 max-h-64 space-y-1.5 overflow-y-auto">
        {!list && <p className="flex items-center gap-2 text-secondary text-fg-3"><Spinner /> Looking for saves</p>}
        {list && options.length === 0 && <p className="py-6 text-center text-secondary text-fg-3">{empty}</p>}
        {options.map((o, i) => (
          <Choice
            key={`${tab}-${i}`}
            selected={i === index}
            onSelect={() => {
              setIndex(i)
              setNaming(null)
              setDeleting(false)
            }}
            title={screenshot && tab !== "this_build" ? `Example save ${String(i + 1).padStart(2, "0")}` : o.title}
            detail={o.detail}
            icon={tab === "favorites" ? <Star className="size-4 shrink-0 text-fg-3" /> : undefined}
          />
        ))}
      </div>
      {naming != null ? (
        <div className="mt-4 space-y-1.5">
          <Input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="e.g. Intro complete" aria-label="Checkpoint name" />
          <p className="text-caption text-fg-3">Letters, numbers, spaces, hyphens and underscores, up to 60.</p>
        </div>
      ) : deleting ? (
        <p className="mt-4 text-secondary text-fg-2">Delete “{option?.title}”? The files move to Neves Launcher's deleted-saves folder.</p>
      ) : (
        option && !screenshot && (
          <div className="mt-3 flex flex-wrap gap-1">
            {option.source && <Button size="sm" variant="ghost" onClick={() => setNaming("")}><Star /> Add to favourites</Button>}
            {exportable && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const path = await saveFile("Export this save", "Neves Launcher Save.zip", [{ name: "ZIP archive", extensions: ["zip"] }])
                  if (path) void run({ type: "export_save", source: exportable, path }, "Save exported")
                }}
              >
                <Download /> Export
              </Button>
            )}
            {exportable && <Button size="sm" variant="ghost" className="text-bad hover:text-bad" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>}
          </div>
        )
      )}
      {!snap.files.ok && (
        <p className="mt-3 flex items-center gap-2 text-secondary text-warn"><CheckCircle2 className="size-3.5" /> Choose your game files in Settings to play.</p>
      )}
    </Dialog>
  )
}
