import { Activity, ChartNoAxesColumn, FileText, House, Settings2 } from "lucide-react"
import { motion } from "motion/react"
import { useRef } from "react"
import { useStore, type ProjectTab } from "@/lib/store"
import type { Project } from "@/lib/types"
import { cn } from "@/lib/utils"
import { t as translate } from "@/lib/i18n"
import { ActivityTab } from "./activity-tab"
import { GraphicsTab } from "./graphics-tab"
import { LaunchTab } from "./launch-tab"
import { NotesTab } from "./notes-tab"
import { OverviewTab } from "./overview-tab"

const TABS: { id: ProjectTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "graphics", label: "Graphics" },
  { id: "launch", label: "Launch options" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
]

const TAB_ICONS = { overview: House, graphics: ChartNoAxesColumn, launch: Settings2, notes: FileText, activity: Activity }

const tabId = (id: ProjectTab) => `project-tab-${id}`
const PANEL = "project-tabpanel"

export function ProjectTabs({ project }: { project: Project }) {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const running = useStore((s) => s.snap?.job.running)
  const screenshot = useStore((s) => s.screenshot)
  const listRef = useRef<HTMLDivElement>(null)
  const hidden = screenshot && (tab === "launch" || tab === "notes" || tab === "activity")
  // Arrow keys move between tabs and open them (the WAI-ARIA tabs pattern, automatic activation).
  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next].id)
    listRef.current?.querySelector<HTMLElement>(`#${tabId(TABS[next].id)}`)?.focus()
  }
  return (
    <div className="max-w-[1280px] px-10 pb-16">
      <div ref={listRef} role="tablist" aria-label={translate("Project")} onKeyDown={onKey} className="flex gap-8 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={tabId(t.id)}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={PANEL}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px flex h-11 cursor-pointer items-center gap-2 text-body font-medium transition-colors duration-150",
              tab === t.id ? "text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            <TabIcon id={t.id} active={tab === t.id} />
            {translate(t.label)}
            {t.id === "activity" && running && <span className="size-1.5 rounded-full bg-accent" aria-label={translate("Running")} />}
            {tab === t.id && <motion.span layoutId="tab-line" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" transition={{ type: "spring", duration: 0.3, bounce: 0.1 }} />}
          </button>
        ))}
      </div>
      <motion.div
        key={`${project.repo}-${tab}`}
        id={PANEL}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="pt-8"
      >
        {hidden ? (
          <p className="text-body text-fg-3">{translate("Hidden in Screenshot mode.")}</p>
        ) : tab === "overview" ? (
          <OverviewTab project={project} />
        ) : tab === "graphics" ? (
          <GraphicsTab project={project} />
        ) : tab === "launch" ? (
          <LaunchTab project={project} />
        ) : tab === "notes" ? (
          <NotesTab project={project} />
        ) : (
          <ActivityTab project={project} />
        )}
      </motion.div>
    </div>
  )
}

function TabIcon({ id, active }: { id: ProjectTab; active: boolean }) {
  const Icon = TAB_ICONS[id]
  return <Icon className={cn("size-4", active ? "text-accent-fg" : "text-fg-4")} aria-hidden="true" />
}
