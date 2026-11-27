import { AlertCircle, CheckCircle2, Copy, Download, Square, Wrench } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { copyText, getBackend, openUrl, saveFile } from "@/lib/api"
import { run, useStore } from "@/lib/store"
import type { Project, ReportView } from "@/lib/types"
import { t } from "@/lib/i18n"
import { shortStage } from "@/lib/format"

/**
 * After a failed job: a GitHub issue for the launcher or the build's repo, with the log filled in.
 * Nothing is sent by the launcher; the player reads and submits the issue on GitHub.
 */
function ReportBar({ project }: { project: Project }) {
  const [busy, setBusy] = useState(false)
  const fetchReport = async () => {
    setBusy(true)
    try {
      return await run<ReportView>({ type: "report", repo: project.repo })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-line bg-fill-1 p-3">
      <p className="text-caption text-fg-2">
        {t("Report this to GitHub. The issue opens with the log filled in. Names and folders are removed, but read it before you submit: nothing is sent until you do.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            const r = await fetchReport()
            if (r) void openUrl(r.launcher_url)
          }}
        >
          Report to Neves Launcher
        </Button>
        {project.repo.split("/").length === 2 && !project.repo.includes("://") && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              const r = await fetchReport()
              if (r?.build_url) void openUrl(r.build_url)
            }}
          >
            Report to {project.name}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            const r = await fetchReport()
            if (r) void copyText(r.text).then(() => toast.success(t("Report copied")))
          }}
        >
          <Copy /> Copy report
        </Button>
      </div>
    </div>
  )
}

export function ActivityTab({ project }: { project: Project }) {
  const job = useStore((s) => s.snap!.job)
  const [lines, setLines] = useState<string[]>([])
  const [omitted, setOmitted] = useState(0)
  const box = useRef<HTMLPreElement>(null)
  const stick = useRef(true)
  const have = useRef(0)
  useEffect(() => {
    // Only what is new is fetched; a cleared log starts over.
    if (job.log_lines < have.current) {
      have.current = 0
      setLines([])
    }
    if (job.log_lines === have.current) return
    void getBackend().then(async (b) => {
      const view = await b.log(have.current)
      have.current = view.from + view.lines.length
      setOmitted(view.omitted)
      setLines((old) => [...(view.from === 0 ? [] : old), ...view.lines].slice(-4000))
    })
  }, [job.log_lines])
  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines])
  const status = !job.stage ? t("Nothing running") : t(shortStage(job.stage))
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {job.running ? <Spinner className="text-accent-fg" /> : job.failed ? <AlertCircle className="size-4 text-bad" /> : job.stage ? <CheckCircle2 className="size-4 text-ok" /> : null}
        <p className={job.failed ? "text-body text-bad" : "text-body text-fg-2"}>{status}</p>
        <div className="ml-auto flex gap-1">
          {!job.running && project.installed && (
            <Button size="sm" variant="ghost" title="Check every known problem, fix it and verify the result" onClick={() => void run({ type: "fix", repo: project.repo })}>
              <Wrench /> Fix and verify
            </Button>
          )}
          {job.stoppable && (
            <Button size="sm" variant="danger" onClick={() => void run({ type: "stop" })}><Square /> Stop</Button>
          )}
          <Button size="sm" variant="ghost" disabled={!lines.length} onClick={() => void copyText(lines.join("\n")).then(() => toast.success(t("Log copied")))}><Copy /> Copy</Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!lines.length}
            onClick={async () => {
              const path = await saveFile("Export the activity log", "neves-launcher.log", [{ name: "Log", extensions: ["log", "txt"] }])
              if (path) void run({ type: "export_log", path }, "Log exported")
            }}
          >
            <Download /> Export
          </Button>
        </div>
      </div>
      {job.failed && !job.running && <ReportBar project={project} />}
      {omitted > 0 && <p className="text-caption text-fg-3">{t("{count} earlier lines scrolled out of the log.", { count: omitted })}</p>}
      <p className="text-caption text-fg-3">
        {t("Fix and verify checks every known problem, fixes the ones it can and checks each result. It reads the project's own notes for the switches it recommends, and can rebuild the program, install missing tools or lower settings; rendering and frame rate are not tuned beyond that.")}
      </p>
      <pre
        ref={box}
        data-selectable
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        className="h-[420px] overflow-auto rounded-lg border border-line bg-black/35 p-4 font-mono text-caption leading-5 whitespace-pre-wrap text-fg-2"
      >
        {lines.length ? lines.join("\n") : <span className="text-fg-4">{t("The log of installs, builds and games shows here.")}</span>}
      </pre>
    </div>
  )
}
