import { useEffect, useState, type FormEvent } from "react"
import { ArrowRight, Clock3, Gamepad2, Library, Plus } from "lucide-react"
import { Aurora } from "@/components/art/aurora"
import { ProjectAvatar } from "@/components/art/project-avatar"
import { Bone } from "@/components/shell/skeleton"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { allProjects, run, useAlias, useSelected, useStore } from "@/lib/store"
import type { Project } from "@/lib/types"
import { t } from "@/lib/i18n"
import { PrimaryAction } from "@/features/library/primary-action"
import { finishWelcome, getNickname, hasCompletedWelcome, saveNickname as persistNickname } from "@/lib/profile"
import { PROFILE_CHANGED_EVENT } from "@/lib/profile"
import { beginDiscordLogin, discordErrorMessage } from "@/lib/api"
import { toast } from "sonner"

export function HomeView() {
  const snap = useStore((s) => s.snap)!
  const setView = useStore((s) => s.setView)
  const setTab = useStore((s) => s.setTab)
  const open = useStore((s) => s.open)
  const screenshot = useStore((s) => s.screenshot)
  const selected = useSelected()
  const alias = useAlias()
  const [nickname, setNickname] = useState(getNickname)
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasCompletedWelcome())
  const projects = allProjects(snap)
  const installed = projects.filter((p) => p.installed)
  const recentlyPlayed = projects
    .filter((p) => p.activity?.last_run)
    .sort((a, b) => b.activity!.last_run!.localeCompare(a.activity!.last_run!))
    .slice(0, 4)

  // Keep the familiar first-project selection even when the launcher opens on Home.
  useEffect(() => {
    if (selected || snap.list.status === "loading") return
    const all = allProjects(snap)
    const pick = all.find((p) => p.installed) ?? snap.list.items[0] ?? all[0]
    if (pick) void run({ type: "select", repo: pick.repo })
  }, [selected, snap])

  useEffect(() => {
    const onProfileChanged = (event: Event) => {
      const name = (event as CustomEvent<string>).detail
      if (name) {
        setNickname(name)
        setWelcomeOpen(false)
      }
    }
    window.addEventListener(PROFILE_CHANGED_EVENT, onProfileChanged)
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, onProfileChanged)
  }, [])

  const showProject = (project: Project) => {
    setTab("overview")
    setView("library")
    if (snap.selected !== project.repo) void run({ type: "select", repo: project.repo })
  }

  const completeWelcome = () => setWelcomeOpen(false)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] space-y-8 px-8 pt-14 pb-12 xl:px-10">
        <header>
          <h1 className="font-display text-page font-bold tracking-[-0.03em] text-fg">{!screenshot && nickname ? t("Welcome back, {name}", { name: nickname }) : !screenshot && hasCompletedWelcome() ? t("Welcome to Neves Launcher!") : t("Welcome back")}</h1>
          <p className="mt-2 text-lead text-fg-2">{t("Your gaming space, all in one place.")}</p>
        </header>

        {!screenshot && <WelcomeDialog open={welcomeOpen} initialName={nickname} onSaved={(name) => { setNickname(name); completeWelcome() }} onSkip={() => { finishWelcome(); completeWelcome() }} onDiscord={() => void beginDiscordLogin().catch((error) => toast.error(discordErrorMessage(error)))} />}

        {selected ? (
          <section className="relative isolate min-h-[250px] overflow-hidden rounded-2xl border border-line bg-fill-1">
            <Aurora seed={selected.repo} still={snap.job.running} pictures={screenshot ? [] : snap.backgrounds} art={alias(selected).owner ? `https://github.com/${alias(selected).owner}.png?size=256` : null} />
            <div className="relative z-10 flex min-h-[250px] flex-wrap items-end justify-between gap-6 p-7 md:p-9">
              <div className="min-w-0">
                <p className="text-caption font-medium text-fg-2">{t("Featured project")}</p>
                <div className="mt-3 flex items-center gap-4">
                  <ProjectAvatar project={selected} owner={alias(selected).owner} size={64} className="rounded-xl" />
                  <div className="min-w-0">
                    <h2 className="break-words font-display text-page font-bold tracking-[-0.025em] text-fg sm:text-hero">{alias(selected).name}</h2>
                    <p className="mt-1 text-secondary text-fg-3">
                      {selected.activity?.last_run
                        ? t("Last played {time}", { time: selected.activity.last_run })
                        : selected.installed ? t("Build installed") : t("Available in library")}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PrimaryAction project={selected} />
                <Button variant="secondary" size="md" onClick={() => showProject(selected)}>
                  {t("Open project")} <ArrowRight />
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex min-h-52 flex-col items-start justify-center gap-4 rounded-2xl border border-line bg-fill-1 px-7 py-8">
            <div className="grid size-11 place-items-center rounded-xl bg-accent/15 text-accent-fg"><Gamepad2 className="size-5" /></div>
            <div>
              <h2 className="font-display text-section font-semibold text-fg">{t("Select a project in your library to see it here.")}</h2>
              <Button className="mt-3" onClick={() => setView("library")}>{t("Explore the library")} <ArrowRight /></Button>
            </div>
          </section>
        )}

        <section className={`grid gap-3 ${screenshot ? "lg:grid-cols-2" : "lg:grid-cols-3"}`} aria-label={t("Your library")}>
          <SummaryCard icon={<Library />} title={t("Projects in library")} value={projects.length} />
          <SummaryCard icon={<Gamepad2 />} title={t("Installed builds")} value={installed.length} />
          {!screenshot && (
            <button type="button" onClick={() => open({ kind: "import" })} className="group flex min-h-[90px] items-center gap-4 rounded-xl border border-line bg-fill-1 px-5 text-left transition-colors hover:border-accent/40 hover:bg-fill-2">
              <span className="grid size-10 place-items-center rounded-lg bg-accent/15 text-accent-fg"><Plus className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-fg">{t("Add project")}</span>
                <span className="mt-0.5 block text-caption text-fg-3">{t("Import a repo or build")}</span>
              </span>
              <ArrowRight className="size-4 text-fg-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <Clock3 className="size-4 text-accent-fg" />
            <h2 className="font-display text-section font-semibold text-fg">{t("Recently played")}</h2>
          </div>
          {recentlyPlayed.length ? (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {recentlyPlayed.map((project) => (
                <button key={project.repo} type="button" onClick={() => showProject(project)} className="group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-fill-1 p-4 text-left transition-colors hover:border-accent/40 hover:bg-fill-2">
                  <ProjectAvatar project={project} owner={alias(project).owner} size={48} className="rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold text-fg">{alias(project).name}</span>
                    <span className="mt-1 block truncate text-caption text-fg-3">{t("Last played {time}", { time: project.activity!.last_run! })}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-fg-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-fill-1 px-5 py-6">
              <p className="text-body text-fg-2">{t("No recent games yet. Projects you play will show up here.")}</p>
              <Button variant="ghost" size="sm" className="mt-3 -ml-3" onClick={() => setView("library")}>{t("Explore the library")} <ArrowRight /></Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function WelcomeDialog({ open, initialName, onSaved, onSkip, onDiscord }: { open: boolean; initialName: string; onSaved(name: string): void; onSkip(): void; onDiscord(): void }) {
  const [name, setName] = useState(initialName)
  useEffect(() => {
    if (open) setName(initialName)
  }, [initialName, open])
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = name.trim().slice(0, 32)
    if (persistNickname(next)) onSaved(next)
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onSkip() }} title={t("Welcome to Neves Launcher!")} description={t("Choose how you would like to personalize your launcher.")} eyebrow="NEVES LAUNCHER" dismissable={false} overlayClassName="bg-black/68 backdrop-blur-md" className="max-w-[460px]">
      <form className="space-y-3" onSubmit={submit}>
        <label className="sr-only" htmlFor="welcome-nickname">{t("Name or nickname")}</label>
        <input id="welcome-nickname" value={name} onChange={(event) => setName(event.target.value)} maxLength={32} autoComplete="nickname" placeholder={t("Name or nickname")} className="h-10 w-full rounded-md border border-line bg-fill-1 px-3 text-body text-fg placeholder:text-fg-3 focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25" />
        <Button type="submit" className="w-full" disabled={!name.trim()}>{t("Continue with this name")}</Button>
      </form>
      <div className="relative my-4 text-center text-caption text-fg-4"><span className="bg-glass-solid px-2">{t("or")}</span><span className="absolute inset-x-0 top-1/2 -z-10 border-t border-line" /></div>
      <Button type="button" variant="secondary" className="w-full" onClick={onDiscord}>{t("Continue with Discord")}</Button>
      <Button type="button" variant="ghost" className="mt-2 w-full" onClick={onSkip}>{t("Skip for now")}</Button>
      <p className="pt-3 pb-5 text-center text-caption text-fg-4">{t("Your nickname is stored only on this device.")}</p>
    </Dialog>
  )
}

function SummaryCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: number }) {
  return (
    <div className="flex min-h-[90px] items-center gap-4 rounded-xl border border-line bg-fill-1 px-5">
      <span className="grid size-10 place-items-center rounded-lg bg-accent/15 text-accent-fg">{icon}</span>
      <span>
        <span className="block text-caption text-fg-3">{title}</span>
        <span className="mt-0.5 block font-display text-section font-semibold tabular-nums text-fg">{value}</span>
      </span>
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-8 px-8 pt-14 xl:px-10" aria-busy="true" aria-label={t("Loading the home screen")}>
      <div className="space-y-3"><Bone className="h-3 w-28" /><Bone className="h-9 w-64" /><Bone className="h-4 w-80" /></div>
      <Bone className="h-56 w-full rounded-2xl" />
      <div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <Bone key={i} className="h-[90px] rounded-xl" />)}</div>
      <Bone className="h-5 w-40" />
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-20 rounded-xl" />)}</div>
    </div>
  )
}
