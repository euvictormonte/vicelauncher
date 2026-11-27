import { AlertCircle, CheckCircle2, Square, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { allProjects, run, useAlias, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { shortStage } from "@/lib/format"
import { t } from "@/lib/i18n"

/** What the launcher is doing now, in the corner of the sidebar, like a download. */
export function JobCard() {
  const snap = useStore((s) => s.snap)
  const setTab = useStore((s) => s.setTab)
  const setView = useStore((s) => s.setView)
  const alias = useAlias()
  const still = useReducedMotion()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const job = snap?.job
  const key = job ? `${job.repo}|${job.stage}` : ""
  useEffect(() => {
    if (job?.running) setDismissed(null)
  }, [job?.running])
  const show = !!job && !!job.stage && dismissed !== key && job.stage !== "Playing"
  const project = snap && job?.repo ? allProjects(snap).find((p) => p.repo === job.repo) : undefined
  const title = project ? alias(project).name : "Neves Launcher"
  return (
    <AnimatePresence initial={false}>
      {show && job && (
        // Grows in from nothing, so the list above shortens smoothly instead of jumping.
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: still ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div role="status" aria-live="polite" className="rounded-lg border border-line bg-fill-2 p-3">
            <div className="flex items-center gap-2">
              {job.running ? (
                <span className="grid size-4 shrink-0 place-items-center"><span className="size-2 rounded-full bg-accent" /></span>
              ) : job.failed ? (
                <AlertCircle className="size-4 shrink-0 text-bad" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0 text-ok" />
              )}
              <p className="min-w-0 flex-1 truncate text-secondary font-medium text-fg">{title}</p>
              <button
                type="button"
                onClick={() => {
                  if (job.repo) void run({ type: "select", repo: job.repo })
                  setView("library")
                  setTab("activity")
                }}
                className={cn(small, "px-2 text-caption font-medium text-fg-2")}
              >
                Build log
              </button>
              {job.stoppable && (
                <Tooltip label="Stop" side="top">
                  <button type="button" aria-label="Stop" onClick={() => void run({ type: "stop" })} className={cn(small, "w-6 text-fg-2 hover:text-bad")}>
                    <Square className="size-3" />
                  </button>
                </Tooltip>
              )}
              {!job.running && (
                <button type="button" aria-label="Dismiss" onClick={() => setDismissed(key)} className={cn(small, "w-6 text-fg-3")}>
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 line-clamp-2 pl-6 text-caption text-fg-3">{t(shortStage(job.stage))}</p>
            {job.running && (
              <div className="mt-2 ml-6 h-1 overflow-hidden rounded-full bg-fill-3">
                {still ? (
                  <div className="h-full w-full rounded-full bg-accent/50" />
                ) : (
                  <motion.div className="h-full w-1/3 rounded-full bg-accent" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const small = "grid h-6 shrink-0 cursor-pointer place-items-center rounded-sm transition-colors duration-150 hover:bg-fill-3 hover:text-fg active:bg-fill-4"
