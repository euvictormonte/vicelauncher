import { BadgeCheck, CheckCircle2, Copy, ExternalLink, FolderOpen, MoreHorizontal, RefreshCw, RotateCcw, Trash2, Wrench, X } from "lucide-react"
import { Aurora } from "@/components/art/aurora"
import { avatarUrl, ProjectAvatar } from "@/components/art/project-avatar"
import { Button } from "@/components/ui/button"
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu"
import { Tooltip } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { copyText, openUrl } from "@/lib/api"
import { fps, gpuText, relativeAge } from "@/lib/format"
import { run, useAlias, useStore } from "@/lib/store"
import type { Project } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ActionNote, PrimaryAction } from "./primary-action"
import { useUpdateWarning } from "./update-button"
import { t } from "@/lib/i18n"
import luciaBanner from "../../../assets/banner-lucia.jpg"
import jasonBanner from "../../../assets/banner-jason.jpg"
import viceCityBoatBanner from "../../../assets/banner-vice-city-boat.jpg"
import viceCityBanner from "../../../assets/banner-vice-city.jpg"

const HERO_BANNERS = [
  { src: luciaBanner, position: "center 12%" },
  { src: jasonBanner, position: "center 8%" },
  { src: viceCityBoatBanner, position: "center 50%" },
  { src: viceCityBanner, position: "center 24%" },
]

export function Hero({ project: p }: { project: Project }) {
  const snap = useStore((s) => s.snap)!
  const screenshot = useStore((s) => s.screenshot)
  const alias = useAlias()(p)
  const playing = snap.job.running && snap.job.stage === "Playing"
  const source = p.kind === "zip" ? t("Imported build") : p.custom ? t("Added by link") : "PortWatch VI"
  return (
    <section className="relative isolate shrink-0" style={{ minHeight: "clamp(350px, 38vh, 430px)" }}>
      <Aurora seed={p.repo} still={playing} pictures={screenshot ? [] : snap.backgrounds} art={alias.owner ? avatarUrl(alias.owner, 256) : null} fallbackImages={screenshot ? [] : HERO_BANNERS} />
      <div className="relative z-10 flex h-full min-h-[inherit] max-w-[1280px] flex-col justify-end px-10 pt-16 pb-8">
        <div className="flex items-end gap-6">
          <ProjectAvatar project={p} owner={alias.owner} size={88} className="shadow-[0_12px_32px_-8px_rgb(0_0_0/0.6)]" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-body text-fg-2">
              {p.installed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/15 px-3 py-1 text-caption font-semibold text-accent-fg">
                  <CheckCircle2 className="size-3.5" /> {t("Installed")}
                </span>
              ) : <span>{source}</span>}
              {p.verified && (
                <>
                  <span className="text-fg-4">·</span>
                  <span className="inline-flex items-center gap-1"><BadgeCheck className="size-4" /> {t("Verified")}</span>
                </>
              )}
            </p>
            <h1 className="mt-1 pb-1 break-words text-balance font-display text-hero font-bold tracking-[-0.035em] text-fg [text-shadow:0_2px_24px_rgb(0_0_0/0.35)]">
              {alias.name}
            </h1>
          </div>
        </div>
        {p.activity && (
          <p className="mt-3 text-secondary text-fg-3">
            {relativeAge(p.activity.updated_ago)}
            {p.activity.last_run && <> <span className="px-1 text-fg-4">·</span> {t("Last played {time}", { time: p.activity.last_run })}</>}
          </p>
        )}
        <div className="mt-6 flex items-center gap-2">
          <PrimaryAction project={p} />
          {p.web_url && !screenshot && (
            <Tooltip label="Open repository">
              <Button variant="secondary" size="icon-lg" aria-label="Open repository" onClick={() => openUrl(p.web_url!).catch((error) => toast.error(t(String(error))))}>
                <ExternalLink />
              </Button>
            </Tooltip>
          )}
          <MoreMenu project={p} />
        </div>
        <div className="mt-3 min-h-5">
          <ActionNote project={p} />
        </div>
        <Stats project={p} />
      </div>
    </section>
  )
}

/** What the tracker measured, as a line of type: only what is known. */
function Stats({ project: p }: { project: Project }) {
  const f = fps(p)
  const stats: { value: string; label: string; tip?: string }[] = []
  if (f != null) stats.push({ value: `${f} fps`, label: t("Average") })
  if (p.render != null && (p.render > 0 || f != null))
    stats.push({ value: `${Math.round(p.render * 100)}%`, label: t("Picture accuracy"), tip: t("How close the picture is to the console version, as rated on VIPortLive.") })
  if (p.gpu.length) stats.push({ value: gpuText(p.gpu), label: t("Made for") })
  if (!stats.length) return null
  return (
    <dl className="mt-6 flex flex-wrap items-stretch gap-y-3">
      {stats.map((s, i) => {
        const body = (
          <div className={cn("flex flex-col-reverse", i > 0 && "border-l border-line-2 pl-6", i < stats.length - 1 && "pr-6", s.tip && "cursor-help rounded-xs")} tabIndex={s.tip ? 0 : undefined}>
            <dt className="text-caption text-fg-3">{s.label}</dt>
            <dd className="font-display text-section font-semibold tracking-[-0.01em] text-fg tabular-nums">{s.value}</dd>
          </div>
        )
        return s.tip ? <Tooltip key={s.label} label={s.tip}>{body}</Tooltip> : <div key={s.label} className="contents">{body}</div>
      })}
    </dl>
  )
}

function MoreMenu({ project: p }: { project: Project }) {
  const snap = useStore((s) => s.snap)!
  const open = useStore((s) => s.open)
  const screenshot = useStore((s) => s.screenshot)
  const busy = snap.job.running
  const warning = useUpdateWarning(p.repo)
  return (
    <Menu>
      <Tooltip label="More">
        <MenuTrigger asChild>
          <Button variant="secondary" size="icon-lg" aria-label="More">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
      </Tooltip>
      <MenuContent>
        {p.installed && p.kind === "git" && (
          <MenuItem disabled={p.checking} onSelect={() => void run({ type: "check_repo", repo: p.repo })}>
            <RefreshCw /> {t("Check for updates")}
          </MenuItem>
        )}
        {p.installed && !p.standalone && p.kind !== "local" && (
          <MenuItem disabled={busy || !snap.files.ok} onSelect={() => void run({ type: "warm", repo: p.repo })}>
            <Wrench /> {t("Warm up shaders")}
          </MenuItem>
        )}
        {p.installed && p.kind === "git" && (
          <MenuItem disabled={busy} onSelect={warning.ask}>
            <RotateCcw /> {t("Reinstall")}
          </MenuItem>
        )}
        {!screenshot && (
          <MenuItem onSelect={() => void run({ type: "open", what: "project_folder", repo: p.repo })} disabled={!p.installed}>
            <FolderOpen /> {t("Show in folder")}
          </MenuItem>
        )}
        {p.web_url && !screenshot && (
          <MenuItem
            onSelect={() =>
              copyText(p.web_url!)
                .then(() => toast.success(t("Link copied")))
                .catch((error) => toast.error(t(String(error))))
            }
          >
            <Copy /> {t("Copy link")}
          </MenuItem>
        )}
        {(p.installed && p.kind !== "local") || p.custom ? <MenuSeparator /> : null}
        {p.installed && p.kind !== "local" && (
          <MenuItem tone="danger" disabled={busy} onSelect={() => open({ kind: "uninstall", repo: p.repo })}>
            <Trash2 /> {t("Uninstall…")}
          </MenuItem>
        )}
        {p.custom && p.kind === "git" && (
          <MenuItem tone="danger" onSelect={() => void run({ type: "remove_custom", repo: p.repo }, "Removed from your library")}>
            <X /> {t("Remove from library")}
          </MenuItem>
        )}
      </MenuContent>
      {warning.dialog}
    </Menu>
  )
}
