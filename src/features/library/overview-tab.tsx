import { Activity, AlertTriangle, Check, CircuitBoard, Cpu, ExternalLink, FileText, MemoryStick, Minus, Monitor } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Group, Row } from "@/components/ui/group"
import { openUrl } from "@/lib/api"
import { assess, type Check as CompatCheck, type Level, mainGpu, matchesCard, withSpec } from "@/lib/compat"
import { relativeAge, shortCommit } from "@/lib/format"
import { UpdateButton } from "./update-button"
import { run, useAlias, useStore } from "@/lib/store"
import type { Project } from "@/lib/types"
import { t } from "@/lib/i18n"

export function OverviewTab({ project: p }: { project: Project }) {
  const screenshot = useStore((s) => s.screenshot)
  const busy = useStore((s) => s.snap?.job.running)
  const alias = useAlias()(p)
  const description = screenshot
    ? t("Project description hidden.")
    : p.summary.trim() || (p.kind === "zip" ? t("A prebuilt build you imported from a ZIP.") : p.kind === "local" ? t("A build from a folder on this PC.") : t("The tracker has no write-up for this build yet."))

  return (
    <div className="space-y-5">
      {p.update && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-warn/25 bg-warn/8 px-5 py-4">
          <Activity className="size-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-fg">{t("A new build is out")}</p>
            <p className="text-caption text-fg-3">{screenshot ? t("Version hidden") : t("Version {version} · you have {built}", { version: shortCommit(p.update) ?? "", built: shortCommit(p.built) ?? t("an older one") })}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void run({ type: "later", repo: p.repo, remote: p.update! })}>{t("Later")}</Button>
          <UpdateButton repo={p.repo} size="sm" variant="primary" disabled={busy}>{t("Update now")}</UpdateButton>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <section className="overflow-hidden rounded-2xl border border-line bg-fill-1 p-6">
          <div className="mb-4 flex items-center gap-3">
            <FileText className="size-6 text-accent-fg" />
            <h2 className="font-display text-lead font-semibold text-fg">{t("Description")}</h2>
          </div>
          <p className="max-w-[70ch] text-body leading-7 text-fg-2" data-selectable>{description}</p>
          {p.custom && p.kind === "git" && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/8 p-4">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
              <div>
                <p className="text-body font-semibold text-fg">{t("Safety notice")}</p>
                <p className="mt-1 text-caption leading-5 text-fg-2">{t("You added this repo by link. Neves Launcher downloads, builds and runs its code on your PC, so keep only repos from people you trust.")}</p>
              </div>
            </div>
          )}
          {p.highlights.length > 0 && !screenshot && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-3 text-caption font-semibold text-fg-3">{t("What works")}</h3>
              <div className="flex flex-wrap gap-2">
                {p.highlights.map((item) => <span key={item} className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1.5 text-caption font-medium text-accent-fg">{t(item)}</span>)}
              </div>
            </div>
          )}
          {p.blockers.length > 0 && !screenshot && <List title="Known issues" items={p.blockers} />}
        </section>

        <RecentActivity project={p} />
      </div>

      <YourPc project={p} />

      <Group title="Details" className="max-w-[900px]">
        <Row label="Source" hint={p.kind === "zip" ? "Imported ZIP" : p.custom ? "Added by link" : "VIPortLive library"} />
        {p.kind === "git" && (
          <Row label="Repository" hint={<span className="break-all">{screenshot ? alias.repo : p.repo}</span>}>
            {p.web_url && !screenshot && <Button size="icon-sm" variant="ghost" aria-label={t("Open repository")} onClick={() => void openUrl(p.web_url!)}><ExternalLink /></Button>}
          </Row>
        )}
        <Row label="Installed" hint={p.installed ? (p.kind === "git" && !screenshot ? `Version ${shortCommit(p.built) ?? "unknown"}` : "Yes") : "Not yet"} />
      </Group>
    </div>
  )
}

function RecentActivity({ project: p }: { project: Project }) {
  const events: { title: string; time: string }[] = []
  if (p.activity?.last_run) events.push({ title: "Last played", time: p.activity.last_run })
  if (p.activity) events.push({ title: p.activity.new_install ? "Version installed" : "Project files updated", time: relativeAge(p.activity.updated_ago) })

  return (
    <section className="rounded-2xl border border-line bg-fill-1 p-6">
      <div className="mb-5 flex items-center gap-3">
        <Activity className="size-6 text-accent-fg" />
        <h2 className="font-display text-lead font-semibold text-fg">{t("Recent activity")}</h2>
      </div>
      {events.length ? (
        <ol className="relative space-y-5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-accent/45">
          {events.map((event, index) => (
            <li key={`${event.title}-${index}`} className="relative pl-8">
              <span className="absolute left-0 top-1 grid size-4 place-items-center rounded-full border-2 border-accent bg-accent/15"><span className="size-1.5 rounded-full bg-accent" /></span>
              <p className="text-body font-medium text-fg">{t(event.title)}</p>
              <p className="mt-0.5 text-caption text-fg-3">{event.time}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-line bg-fill-2/60 px-4 py-5 text-body text-fg-3">{t("No recent activity yet.")}</p>
      )}
    </section>
  )
}

const MARK: Record<Level, React.ReactNode> = {
  good: <Check className="size-4 text-ok" strokeWidth={2.25} aria-label={t("Fine")} />,
  close: <Minus className="size-4 text-warn" aria-label={t("Close to the limit")} />,
  concern: <AlertTriangle className="size-4 text-warn" aria-label={t("Check this")} />,
  unknown: <Minus className="size-4 text-fg-4" aria-label={t("Not known")} />,
}

function YourPc({ project: p }: { project: Project }) {
  const detected = useStore((s) => s.snap?.system ?? null)
  const spec = useStore((s) => s.snap?.settings)
  const system = useMemo(() => withSpec(detected, spec), [detected, spec])
  const filter = useStore((s) => s.snap?.settings.gpu_filter ?? 0)
  const assessment = assess(p, system)
  const cpu: CompatCheck = {
    label: "Processor",
    value: system?.cpu ?? t("Unknown"),
    level: "unknown",
    note: system?.cpu_cores
      ? t("{count} threads. Builds don't say which processor they need", { count: system.cpu_cores })
      : t("Builds don't say which processor they need"),
  }
  const checks = [assessment.gpu, assessment.ram, assessment.vram, cpu]
  const icons = [CircuitBoard, MemoryStick, MemoryStick, Cpu]
  const vendor = mainGpu(system)?.vendor
  const target = vendor === "NVIDIA" ? 1 : 2
  const offerFilter = system && assessment.level === "concern" && matchesCard(p, system) === false && filter !== target

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-fill-1 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Monitor className="size-6 text-accent-fg" />
        <h2 className="font-display text-lead font-semibold text-fg">{t("Compatibility with your PC")}</h2>
        <p className="ml-auto text-caption text-fg-3">{assessment.headline}</p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        {checks.map((check, index) => <CheckCard key={check.label} check={check} Icon={icons[index]} />)}
      </div>
      <p className="mt-4 text-caption text-fg-4">{t("Memory figures are what the author's PC used while playing, not a minimum requirement.")}</p>
      {offerFilter && (
        <Button variant="ghost" size="sm" className="mt-2 -ml-3" onClick={() => void run({ type: "set_gpu_filter", value: target })}>
          {t("Show builds for my card")}
        </Button>
      )}
    </section>
  )
}

function CheckCard({ check, Icon }: { check: CompatCheck; Icon: typeof CircuitBoard }) {
  return (
    <div className="flex min-w-0 gap-3 px-3 py-4 first:pl-0 last:pr-0">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent-fg"><Icon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-caption text-fg-3">{t(check.label)}</span>
          <span className="shrink-0">{MARK[check.level]}</span>
        </div>
        <p className="mt-1 truncate text-body font-semibold text-fg" title={check.value}>{check.value}</p>
        <p className="mt-1 text-caption leading-4 text-fg-3">{t(check.note)}</p>
      </div>
    </div>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-5 border-t border-line pt-4">
      <h3 className="text-caption font-semibold text-fg-3">{t(title)}</h3>
      <ul className="mt-2 space-y-1.5" data-selectable>
        {items.map((item) => <li key={item} className="flex gap-2 text-caption text-fg-2"><span className="text-warn">•</span>{t(item)}</li>)}
      </ul>
    </section>
  )
}
