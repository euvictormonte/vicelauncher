import type { Graphics, OutputResolution, Project } from "./types"
import { t } from "./i18n"

/** The graphics modes: Series S profile and render scale. */
export const MODES = [
  { id: "fast", label: "Fast", seriesS: true, scale: 0.5, detail: "Half resolution, scaled up" },
  { id: "balanced", label: "Balanced", seriesS: true, scale: 0.75, detail: "Three quarters, scaled up" },
  { id: "best", label: "Best quality", seriesS: false, scale: 1, detail: "Full resolution" },
] as const

export type ModeId = (typeof MODES)[number]["id"]

export function graphicsMode(g: Graphics): ModeId | null {
  const m = MODES.find((m) => g.series_s === m.seriesS && (!m.seriesS || Math.abs(g.render_scale - m.scale) < 0.01))
  return m?.id ?? null
}

export function withMode(g: Graphics, id: ModeId): Graphics {
  const m = MODES.find((m) => m.id === id)!
  return { ...g, series_s: m.seriesS, render_scale: m.scale }
}

export const OUTPUTS: { id: OutputResolution; label: string }[] = [
  { id: "Default", label: "Game default" },
  { id: "P720", label: "720p" },
  { id: "P936", label: "936p" },
  { id: "P1080", label: "1080p" },
  { id: "P1440", label: "1440p" },
  { id: "P2160", label: "2160p (4K)" },
]

export const gpuText = (gpu: string[]) => gpu.join(" · ")

export function fps(p: Project) {
  return p.fps != null && p.fps >= 0.5 ? Math.round(p.fps) : null
}

export function shortCommit(c: string | null | undefined) {
  return c ? c.slice(0, 7) : null
}

/** A short stage for small places ("Building" for "Building (the first time…)"). */
export function shortStage(stage: string) {
  if (stage.startsWith("Downloading")) return t("Downloading")
  if (stage.startsWith("Building")) return t("Building")
  if (stage.startsWith("Warming")) return t("Warming up")
  if (stage.startsWith("Installing")) return t("Installing tools")
  if (stage.startsWith("Uninstalling")) return t("Uninstalling")
  if (stage.startsWith("Moving")) return t("Moving")
  if (stage.startsWith("Extracting")) return t("Importing")
  if (stage === "Playing") return t("Playing")
  return stage
}
