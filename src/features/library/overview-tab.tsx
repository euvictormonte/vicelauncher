import { AlertTriangle, Check, ExternalLink, Minus, RefreshCw } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Group, Row } from "@/components/ui/group"
import { openUrl } from "@/lib/api"
import { assess, type Check as CompatCheck, type Level, mainGpu, matchesCard, withSpec } from "@/lib/compat"
import { shortCommit } from "@/lib/format"
import { leadSentence } from "./hero"
import { UpdateButton } from "./update-button"
import { run, useAlias, useStore } from "@/lib/store"
import type { Project } from "@/lib/types"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

export function OverviewTab({ project: p }: { project: Project }) {
  const screenshot = useStore((s) => s.screenshot)
  const busy = useStore((s) => s.snap?.job.running)
  const alias = useAlias()(p)
  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
        {p.update && (
          <div className="flex items-center gap-4 rounded-lg border border-warn/25 bg-warn/8 px-4 py-3">
            <RefreshCw className="size-4 shrink-0 text-warn" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-fg">{t("A new build is out")}</p>
              <p className="text-caption text-fg-3">{screenshot ? t("Version hidden") : t("Version {version} · you have {built}", { version: shortCommit(p.update) ?? "", built: shortCommit(p.built) ?? t("an older one") })}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void run({ type: "later", repo: p.repo, remote: p.update! })}>Later</Button>
            <UpdateButton repo={p.repo} size="sm" variant="primary" disabled={busy}>Update now</UpdateButton>
          </div>
        )}
        {p.custom && p.kind === "git" && (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-fill-1 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <p className="text-body text-fg-2">{t("You added this repo by link. Neves Launcher downloads, builds and runs its code on your PC, so keep only repos from people you trust.")}</p>
          </div>
        )}
        <section>
          <h2 className="font-display text-section font-semibold tracking-[-0.01em] text-fg">{t("About")}</h2>
          <p className="mt-3 max-w-[68ch] text-lead text-fg-2" data-selectable>
            {screenshot
              ? "Project description hidden."
              : aboutText(p.summary) || (p.kind === "zip" ? t("A prebuilt build you imported from a ZIP.") : p.kind === "local" ? t("A build from a folder on this PC.") : t("The tracker has no write-up for this build yet."))}
          </p>
        </section>
        {!screenshot && p.highlights.length > 0 && (
          <List title="What works" items={p.highlights} mark={<Check className="size-4 text-fg-3" strokeWidth={2.25} />} />
        )}
        {!screenshot && p.blockers.length > 0 && <List title="Known issues" items={p.blockers} mark={<span className="size-1.5 rounded-full bg-fg-4" />} />}
      </div>
      <div className="grid content-start gap-8 lg:grid-cols-2 xl:grid-cols-1">
        <YourPc project={p} />
        <Group title="Details">
          <Row label="Source" hint={p.kind === "zip" ? "Imported ZIP" : p.custom ? "Added by link" : "VIPortLive library"} />
          {p.kind === "git" && (
            <Row label="Repository" hint={<span className="break-all">{screenshot ? alias.repo : p.repo}</span>}>
              {p.web_url && !screenshot && (
                <Button size="icon-sm" variant="ghost" aria-label="Open repository" onClick={() => void openUrl(p.web_url!)}>
                  <ExternalLink />
                </Button>
              )}
            </Row>
          )}
          <Row label="Installed" hint={p.installed ? (p.kind === "git" && !screenshot ? `Version ${shortCommit(p.built) ?? "unknown"}` : "Yes") : "Not yet"} />
          {p.activity && <Row label="Updated" hint={p.activity.updated_ago.replace(/^(Updated|Installed) /, "")} />}
          {p.activity?.last_run && <Row label="Last played" hint={p.activity.last_run} />}
        </Group>
      </div>
    </div>
  )
}

function List({ title, items, mark }: { title: string; items: string[]; mark: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-lead font-semibold text-fg">{t(title)}</h3>
      <ul className="mt-3 max-w-[68ch] space-y-2" data-selectable>
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-body text-fg-2">
            <span className="grid h-5 w-4 shrink-0 place-items-center">{mark}</span>
            <span className="min-w-0">{t(item)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const MARK: Record<Level, React.ReactNode> = {
  good: <Check className="size-4 text-ok" strokeWidth={2.25} aria-label="Fine" />,
  close: <Minus className="size-4 text-warn" aria-label="Close to the limit" />,
  concern: <AlertTriangle className="size-4 text-warn" aria-label="Check this" />,
  unknown: <Minus className="size-4 text-fg-4" aria-label="Not known" />,
}

/** How this build suits the player's PC, from the author's report and the launcher's look at the hardware. */
function YourPc({ project: p }: { project: Project }) {
  const detected = useStore((s) => s.snap?.system ?? null)
  const spec = useStore((s) => s.snap?.settings)
  const system = useMemo(() => withSpec(detected, spec), [detected, spec])
  const filter = useStore((s) => s.snap?.settings.gpu_filter ?? 0)
  const a = assess(p, system)
  // Builds don't say which processor they need, so the processor is shown, not compared.
  const cpu: CompatCheck = {
    label: "Processor",
    value: system?.cpu ?? "Unknown",
    level: "unknown",
    note: system?.cpu_cores
      ? t("{count} threads. Builds don't say which processor they need", { count: system.cpu_cores })
      : t("Builds don't say which processor they need"),
  }
  const vendor = mainGpu(system)?.vendor
  const target = vendor === "NVIDIA" ? 1 : 2
  const offerFilter = system && a.level === "concern" && matchesCard(p, system) === false && filter !== target
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-body font-semibold text-fg">{t("Your PC")}</h3>
      {!system ? (
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-fill-1" aria-busy aria-label="Looking at your PC">
          <div className="px-4 py-3">
            <div className="h-4 w-4/5 animate-pulse rounded-xs bg-fill-3" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <div className="flex justify-between gap-4">
                <div className="h-4 w-24 animate-pulse rounded-xs bg-fill-3" />
                <div className="h-4 w-16 animate-pulse rounded-xs bg-fill-2" />
              </div>
              <div className="h-3 w-40 animate-pulse rounded-xs bg-fill-2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-fill-1">
          <p className="px-4 py-3 text-body text-fg">{a.headline}</p>
          {[a.gpu, a.ram, a.vram, cpu].map((c) => (
            <CheckRow key={c.label} check={c} />
          ))}
          {offerFilter && (
            <div className="px-4 py-2">
              <Button variant="ghost" size="sm" className="-ml-3" onClick={() => void run({ type: "set_gpu_filter", value: target })}>
                Show builds for my card
              </Button>
            </div>
          )}
        </div>
      )}
      <p className="px-1 text-caption text-fg-4">{t("Memory figures are what the author's PC used while playing, not a minimum requirement.")}</p>
    </section>
  )
}

function CheckRow({ check: c }: { check: CompatCheck }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className="grid h-5 w-4 shrink-0 place-items-center">{MARK[c.level]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <span className="shrink-0 text-body text-fg">{t(c.label)}</span>
          <span className={cn("min-w-0 truncate text-right text-body", c.value === "Unknown" ? "text-fg-4" : "text-fg-2")} title={c.value}>
            {c.value}
          </span>
        </div>
        <p className="mt-0.5 text-caption text-fg-3">{t(c.note)}</p>
      </div>
    </div>
  )
}

/** The summary after the sentence the hero already shows, or all of it when the hero shows none. */
function aboutText(summary: string) {
  const lead = leadSentence(summary)
  const rest = lead ? summary.trim().slice(lead.length).trim() : summary
  return rest || summary
}
