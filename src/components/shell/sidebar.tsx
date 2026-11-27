import { BadgeCheck, House, LayoutGrid, Plus, Search, Settings2, SlidersHorizontal } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useId, useRef, useState } from "react"
import { Popover } from "radix-ui"
import { ProjectAvatar } from "@/components/art/project-avatar"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/ui/segmented"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tooltip } from "@/components/ui/tooltip"
import { assess, mainGpu, SORTS, sortProjects, withSpec } from "@/lib/compat"
import { openUrl } from "@/lib/api"
import { fps, gpuText, shortStage } from "@/lib/format"
import { run, useAlias, useStore } from "@/lib/store"
import type { Project, Snapshot } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Brand } from "./brand"
import { LauncherUpdate } from "@/features/shared/launcher-update"
import { JobCard } from "./job-card"
import { Bone, SidebarSkeleton } from "./skeleton"
import { t } from "@/lib/i18n"

const FILTERS = [
  { value: "0", label: "All" },
  { value: "1", label: "NVIDIA" },
  { value: "2", label: "AMD" },
] as const

const ROW = "[data-row]"

export function Sidebar() {
  const snap = useStore((s) => s.snap)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const open = useStore((s) => s.open)
  const screenshot = useStore((s) => s.screenshot)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // The row that takes Tab into the list (roving tabindex): the last one focused, else the selection.
  const [cursor, setCursor] = useState<string | null>(null)

  const query = screenshot ? "" : search.trim().toLowerCase()
  const filter = snap?.settings.gpu_filter ?? 0
  const loading = !snap || snap.list.status === "loading"
  const sections = snap ? group(snap, query, filter) : []
  const order = sections.flatMap((s) => s.rows.map((p) => p.repo))
  const active = cursor && order.includes(cursor) ? cursor : snap?.selected && order.includes(snap.selected) ? snap.selected : order[0]

  const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>(ROW) ?? [])]
  const onListKey = (e: React.KeyboardEvent) => {
    const all = rows()
    const i = all.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    let next: number
    if (e.key === "ArrowDown") next = Math.min(i + 1, all.length - 1)
    else if (e.key === "ArrowUp") {
      if (i === 0) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      next = i - 1
    } else if (e.key === "Home") next = 0
    else if (e.key === "End") next = all.length - 1
    else return
    e.preventDefault()
    all[next]?.focus()
  }
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      const target = listRef.current?.querySelector<HTMLElement>(`${ROW}[tabindex="0"]`) ?? rows()[0]
      if (target) {
        e.preventDefault()
        target.focus()
      }
    } else if (e.key === "Escape" && search) {
      e.preventDefault()
      e.stopPropagation()
      setSearch("")
    }
  }

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="drag flex h-12 shrink-0 items-center px-4">
        <Brand />
      </div>
      <nav className="space-y-1 px-2 pt-1" aria-label="Pages">
        <NavItem icon={<House />} label={t("Home")} active={view === "home"} onClick={() => setView("home")} />
        <NavItem icon={<LayoutGrid />} label={t("Library")} active={view === "library"} onClick={() => setView("library")} />
        <NavItem icon={<Settings2 />} label={t("Settings")} active={view === "settings"} onClick={() => setView("settings")} />
      </nav>
      <div className="flex items-center gap-1.5 px-2 pt-4">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-3" />
          <input
            ref={searchRef}
            value={screenshot ? "" : search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder={t("Search library")}
            aria-label={t("Search library")}
            aria-controls="sidebar-projects"
            spellCheck={false}
            className="h-8 w-full rounded-md border border-line bg-fill-1 pr-3 pl-9 text-secondary text-fg placeholder:text-fg-3 transition-colors hover:border-line-2 focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
          />
        </label>
        {snap ? <FilterMenu snap={snap} /> : <Bone className="size-8 shrink-0 rounded-md" />}
      </div>
      <div
        ref={listRef}
        id="sidebar-projects"
        aria-label={t("Projects")}
        aria-busy={loading || undefined}
        onKeyDown={onListKey}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
      >
        {loading && <SidebarSkeleton />}
        {snap?.list.status === "error" && (
          <div className="mt-4 rounded-lg border border-line bg-fill-1 p-3">
            <p className="text-secondary text-fg-2">{screenshot ? t("The project list could not load.") : snap.list.error}</p>
            <Button size="sm" className="mt-2" onClick={() => void run({ type: "refresh_projects" })}>Try again</Button>
          </div>
        )}
        {snap &&
          sections.map((s) => (
            <Section key={s.title} title={s.title}>
              {s.rows.map((p) => (
                <li key={p.repo}>
                  <Row project={p} snap={snap} tabbable={p.repo === active} onFocus={() => setCursor(p.repo)} />
                </li>
              ))}
            </Section>
          ))}
        {snap?.list.status === "ready" && order.length === 0 && (
          <div className="px-2 pt-6">
            <p className="text-secondary text-fg-2">{query ? t("No project matches “{query}”.", { query: search.trim() }) : t("No projects for this card yet.")}</p>
            {query ? (
              <Button variant="ghost" size="sm" className="mt-2 -ml-3" onClick={() => setSearch("")}>Clear search</Button>
            ) : filter !== 0 ? (
              <Button variant="ghost" size="sm" className="mt-2 -ml-3" onClick={() => void run({ type: "set_gpu_filter", value: 0 })}>Show all cards</Button>
            ) : null}
          </div>
        )}
      </div>
      <div className="space-y-2 border-t border-line px-2 py-3">
        <LauncherUpdate />
        <JobCard />
        {!screenshot && (
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3 px-2" onClick={() => open({ kind: "import" })}>
            <Plus className="size-4!" /> {t("Import a repo or build")}
          </Button>
        )}
      </div>
    </aside>
  )
}

/**
 * The sidebar's groups: your repos, installed builds, and every other build in the list's order.
 * There is no "recommended" group: fit is judged from memory figures that authors report, which
 * are too new and too uneven to rank builds on. A build that doesn't fit still shows its warning.
 */
function group(snap: Snapshot, query: string, filter: number) {
  const s = snap.settings
  const keep = (p: Project) => {
    const text = !query || p.name.toLowerCase().includes(query) || p.repo.toLowerCase().includes(query)
    const card = (name: string) => p.custom || p.gpu.some((g) => g.toLowerCase() === name)
    const tier = p.custom || s.list_tier === 0 || p.listing.tier === (s.list_tier === 1 ? "tracked" : "watchlist")
    // Taken-down projects are hidden unless the player turns them on.
    const taken = s.show_nuked || !p.listing.nuked
    return text && tier && taken && (filter === 1 ? card("nvidia") : filter === 2 ? card("amd") : true)
  }
  const listed = sortProjects(snap.list.items.filter(keep), s.list_sort)
  return [
    { title: "Your repos", rows: sortProjects(snap.custom.filter(keep), s.list_sort) },
    { title: "Installed", rows: listed.filter((p) => p.installed) },
    { title: "All projects", rows: listed.filter((p) => !p.installed) },
  ].filter((s) => s.rows.length > 0)
}

const TIERS = [
  { value: "0", label: "All" },
  { value: "1", label: "Tracked" },
  { value: "2", label: "Watchlist" },
] as const

/** Filter, sort and the list's options, in one menu. Every choice is kept in the launcher's settings. */
function FilterMenu({ snap }: { snap: Snapshot }) {
  const s = snap.settings
  const [open, setOpen] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const changed = [s.gpu_filter !== 0, s.show_nuked, s.list_sort !== 0, s.list_tier !== 0, s.spec_ram_gb != null || s.spec_vram_gb != null].filter(Boolean).length
  const setList = (next: { show_nuked?: boolean; sort?: number; tier?: number }) =>
    void run({
      type: "set_list_options",
      show_nuked: next.show_nuked ?? s.show_nuked,
      sort: next.sort ?? s.list_sort,
      tier: next.tier ?? s.list_tier,
    })
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={changed ? `Filter and sort, ${changed} on` : "Filter and sort"}
          title="Filter and sort"
          className={cn(
            "relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-line bg-fill-1 text-fg-2 transition-colors hover:border-line-2 hover:bg-fill-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25",
            open && "border-line-2 bg-fill-3 text-fg",
          )}
        >
          <SlidersHorizontal className="size-4" />
          {changed > 0 && (
            <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-white">
              {changed}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[min(640px,80vh)] w-[248px] space-y-4 overflow-y-auto rounded-xl border border-line-2 bg-raised p-3.5 text-body text-fg shadow-[0_12px_36px_rgb(0_0_0/0.5)] outline-none"
        >
          <label className="flex items-center justify-between gap-3">
            <span>{t("Show taken-down projects")}</span>
            <Switch checked={s.show_nuked} onCheckedChange={(v) => setList({ show_nuked: v })} aria-label="Show taken-down projects" />
          </label>
          <div className="space-y-1.5">
            <span className="text-caption font-semibold text-fg-2">{t("Sort")}</span>
            <Select
              label="Sort"
              value={String(s.list_sort)}
              options={SORTS.map((name, i) => ({ value: String(i), label: name }))}
              onChange={(v) => setList({ sort: Number(v) })}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-caption font-semibold text-fg-2">{t("Tier")}</span>
            <Segmented
              label="Tier"
              size="sm"
              className="flex w-full"
              value={String(s.list_tier) as "0" | "1" | "2"}
              options={TIERS}
              onChange={(v) => setList({ tier: Number(v) })}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-caption font-semibold text-fg-2">{t("Graphics cards")}</span>
            <Segmented
              label="Graphics cards"
              size="sm"
              className="flex w-full"
              value={String(s.gpu_filter) as "0" | "1" | "2"}
              options={FILTERS}
              onChange={(v) => void run({ type: "set_gpu_filter", value: Number(v) })}
            />
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <button
              type="button"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
              className="flex w-full items-center justify-between text-caption font-semibold text-fg-2 hover:text-fg"
            >
              {t("Advanced: by PC spec")}
              <span aria-hidden>{advanced ? "−" : "+"}</span>
            </button>
            {advanced && <SpecFields snap={snap} />}
          </div>
          {changed > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                void run({ type: "set_list_options", show_nuked: false, sort: 0, tier: 0 })
                void run({ type: "set_gpu_filter", value: 0 })
                void run({ type: "set_spec", ram_gb: null, vram_gb: null })
              }}
            >
              Reset filters
            </Button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** The player's RAM and video memory, for judging builds by hand. Empty: what the launcher found. */
function SpecFields({ snap }: { snap: Snapshot }) {
  const s = snap.settings
  const ram = snap.system?.ram_gb ?? null
  const vram = mainGpu(snap.system)?.vram_gb ?? null
  const save = (ram_gb: number | null, vram_gb: number | null) => void run({ type: "set_spec", ram_gb, vram_gb })
  return (
    <div className="space-y-2">
      <p className="text-caption text-fg-3">{t("Builds are judged against these numbers. Leave a box empty to use what the launcher found.")}</p>
      <SpecInput label="System memory (GB)" value={s.spec_ram_gb} detected={ram} onCommit={(v) => save(v, s.spec_vram_gb)} />
      <SpecInput label="Video memory (GB)" value={s.spec_vram_gb} detected={vram} onCommit={(v) => save(s.spec_ram_gb, v)} />
    </div>
  )
}

function SpecInput({
  label,
  value,
  detected,
  onCommit,
}: {
  label: string
  value: number | null
  detected: number | null
  onCommit(value: number | null): void
}) {
  const [text, setText] = useState(value == null ? "" : String(value))
  useEffect(() => setText(value == null ? "" : String(value)), [value])
  const commit = () => {
    const n = Number(text.replace(",", "."))
    onCommit(text.trim() !== "" && n > 0 ? n : null)
  }
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={detected != null ? String(detected) : "Unknown"}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
        }}
        aria-label={label}
        className="h-8 w-24 rounded-md border border-line bg-fill-1 px-2 text-right text-secondary text-fg placeholder:text-fg-3 focus-visible:border-accent/60 focus-visible:outline-none"
      />
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="pt-6 first:pt-4">
      <h2 id={id} className="px-2 pb-1 text-caption font-semibold tracking-[0.01em] text-fg-2">
        {t(title)}
      </h2>
      <ul role="list">{children}</ul>
    </section>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center gap-3 rounded-md px-2 text-body font-medium transition-colors duration-150 [&_svg]:size-4",
        active ? "bg-fill-3 text-fg [&_svg]:text-accent-fg" : "text-fg-2 hover:bg-fill-2 hover:text-fg active:bg-fill-3 [&_svg]:text-fg-3",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function Row({ project: p, snap, tabbable, onFocus }: { project: Project; snap: Snapshot; tabbable: boolean; onFocus(): void }) {
  const alias = useAlias()(p)
  const selected = snap.selected === p.repo
  const setView = useStore((s) => s.setView)
  const working = snap.job.running && snap.job.repo === p.repo
  let line: React.ReactNode
  let tone = "text-fg-3"
  if (working) {
    line = <><Spinner className="size-3 text-accent-fg" /> {t(shortStage(snap.job.stage))}</>
    tone = "text-accent-fg"
  } else if (p.listing.nuked) {
    line = "Taken down · open on VIPortLive"
    tone = "text-warn"
  } else if (p.update) {
    line = "Update available"
    tone = "text-warn"
  } else if (p.kind === "zip") {
    line = "Imported build"
  } else if (p.custom) {
    line = p.installed ? "Installed · added by link" : "Added by link"
  } else {
    const f = fps(p)
    // Where a build doesn't fit the PC, its warning takes the place of the cards it runs on.
    const verdict = assess(p, withSpec(snap.system, snap.settings))
    if (verdict.level === "concern") tone = "text-warn"
    const detail = verdict.warning ?? (p.gpu.length ? gpuText(p.gpu) : null)
    line = [f != null ? `${f} fps` : null, detail].filter(Boolean).join(" · ") || "Not measured yet"
  }
  return (
    <button
      type="button"
      data-row
      tabIndex={tabbable ? 0 : -1}
      onFocus={onFocus}
      aria-current={selected ? "true" : undefined}
      onClick={() => {
        // A taken-down project has nothing to install: its page on VIPortLive explains it.
        if (p.listing.nuked) {
          void openUrl(p.listing.id ? `${snap.brand.site}/projects/${p.listing.id}` : snap.brand.site)
          return
        }
        setView("library")
        void run({ type: "select", repo: p.repo })
      }}
      className="group relative flex h-[52px] w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left focus-visible:outline-offset-0"
    >
      {selected && (
        <motion.span layoutId="sidebar-pick" className="absolute inset-0 rounded-md bg-fill-3" transition={{ type: "spring", duration: 0.28, bounce: 0.1 }} />
      )}
      <span className="absolute inset-0 rounded-md transition-colors duration-150 group-hover:bg-fill-1 group-active:bg-fill-2" />
      <ProjectAvatar project={p} owner={alias.owner} size={32} className="relative" />
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <Name text={alias.name} className={selected ? "text-fg" : "text-fg/90"} />
          {p.verified && <BadgeCheck aria-label="Verified" className="size-3.5 shrink-0 text-fg-3" />}
          {p.activity?.pending && !working && <span className="ml-1 size-1.5 shrink-0 rounded-full bg-fg-2" aria-label={p.activity.pending} />}
        </span>
        <span className={cn("flex items-center gap-1 truncate text-caption", tone)}>{typeof line === "string" ? t(line) : line}</span>
      </span>
    </button>
  )
}

/** A project name that shows itself whole in a tooltip when the row cuts it short. */
function Name({ text, className }: { text: string; className?: string }) {
  const [el, setEl] = useState<HTMLSpanElement | null>(null)
  const [cut, setCut] = useState(false)
  useEffect(() => {
    if (!el) return
    const check = () => setCut(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, text])
  const name = (
    <span ref={setEl} className={cn("truncate text-body font-medium", className)}>
      {text}
    </span>
  )
  return cut ? <Tooltip label={text} side="right">{name}</Tooltip> : name
}
