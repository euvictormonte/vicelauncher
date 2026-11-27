import type { Project, SystemInfo } from "./types"
import { t } from "./i18n"

/**
 * How a build suits the player's PC, from what is known: the cards it was
 * made for, and the memory its author reported it using. Reported use is not
 * a minimum, so the words stay careful: "below what the author reported",
 * never "won't run".
 *
 * The verdicts are the ones "Can my PC run GTA VI?" (portwatch-vi, lib/pc-check.ts)
 * gives a part: yes, close, no. A part is yes at 95% of what is wanted (benchmark
 * suites differ by about that much) and close at 80%. `concern` is the "no".
 */
export type Level = "good" | "close" | "concern" | "unknown"

export interface Check {
  level: Level
  label: string
  value: string
  note: string
}

export interface Assessment {
  level: Level
  headline: string
  /** One line for a build that doesn't fit (or only just does): what to watch for. Null when it fits. */
  warning: string | null
  gpu: Check
  ram: Check
  vram: Check
}

type Gpu = SystemInfo["gpus"][number]

/** The card that plays games: a discrete NVIDIA or AMD one before integrated graphics. */
export function mainGpu(system: SystemInfo | null): Gpu | null {
  if (!system || system.gpus.length === 0) return null
  const rank = (g: Gpu) => (g.vendor === "NVIDIA" ? 0 : g.vendor === "AMD" ? 1 : g.vendor === "Intel" ? 2 : 3)
  return [...system.gpus].sort((a, b) => rank(a) - rank(b) || (b.vram_gb ?? 0) - (a.vram_gb ?? 0))[0]
}

/** Whether `p` was made for the player's card: null when either is unknown. */
export function matchesCard(p: Project, system: SystemInfo | null): boolean | null {
  const gpu = mainGpu(system)
  if (!gpu || p.gpu.length === 0 || (gpu.vendor !== "NVIDIA" && gpu.vendor !== "AMD")) return null
  return p.gpu.some((g) => g.toLowerCase() === gpu.vendor.toLowerCase())
}

/**
 * The PC the fit is judged on: what the launcher found, with the player's own RAM and
 * video memory where they set them under "By PC spec" (Settings are in the filter menu).
 */
export function withSpec(
  system: SystemInfo | null,
  spec: { spec_ram_gb: number | null; spec_vram_gb: number | null } | undefined,
): SystemInfo | null {
  if (!spec || (spec.spec_ram_gb == null && spec.spec_vram_gb == null)) return system
  const base: SystemInfo = system ?? { gpus: [], ram_gb: null, cpu: null, cpu_cores: null }
  const gpus = base.gpus.map((g, i) => (i === 0 && spec.spec_vram_gb != null ? { ...g, vram_gb: spec.spec_vram_gb } : g))
  if (base.gpus.length === 0 && spec.spec_vram_gb != null) gpus.push({ name: "Unknown", vendor: "Other", vram_gb: spec.spec_vram_gb })
  return { ...base, gpus, ram_gb: spec.spec_ram_gb ?? base.ram_gb }
}

/** The list's order. 0 keeps the order the launcher was given (VIPortLive's), the rest sort by it. */
export const SORTS = ["VIPortLive order", "Name", "Frame rate", "Stars", "Recent commits"] as const

/** A stable sort of a project list by the chosen order; unknown values sort last. */
export function sortProjects(list: Project[], sort: number): Project[] {
  if (sort === 0) return list
  const key: Record<number, (p: Project) => number | string | null> = {
    1: (p) => p.name.toLowerCase(),
    2: (p) => p.fps,
    3: (p) => p.listing.stars,
    4: (p) => p.listing.commits7d,
  }
  const k = key[sort]
  return [...list].sort((a, b) => {
    const x = k(a)
    const y = k(b)
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y)
    return (y as number) - (x as number)
  })
}

/** yes at 95% of what the author used, close at 80%, else no (the same marks as the GTA VI check). */
export function ratio(have: number, used: number): Level {
  return have >= used * 0.95 ? "good" : have >= used * 0.8 ? "close" : "concern"
}

const gb = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} GB`

export function assess(p: Project, system: SystemInfo | null): Assessment {
  const gpu = mainGpu(system)
  const match = matchesCard(p, system)
  const gpuCheck: Check = {
    label: t("Graphics card"),
    value: gpu ? gpu.name.replace(/^(NVIDIA|AMD|Intel\(R\)) /, "") : "Unknown",
    level: match === true ? "good" : match === false ? "concern" : "unknown",
    note:
      match === true
        ? t("Made for {vendor} cards, like yours", { vendor: gpu!.vendor })
        : match === false
          ? t("Made for {gpu} cards", { gpu: p.gpu.join(t("and")) })
          : p.gpu.length === 0
            ? t("The author hasn't said which cards it runs on")
            : t("Made for {gpu} cards", { gpu: p.gpu.join(t("and")) }),
  }
  const memory = (label: string, have: number | null | undefined, used: number | null): Check => {
    const level: Level = have && used ? ratio(have, used) : "unknown"
    return {
      label,
      value: have ? gb(have) : t("Unknown"),
      level,
      note: !used
        ? t("No usage reported")
        : !have
          ? t("The author reported about {amount}", { amount: gb(used) })
          : level === "good"
            ? t("Above the {amount} the author reported", { amount: gb(used) })
            : level === "close"
              ? t("Close to the {amount} the author reported", { amount: gb(used) })
              : t("Below the {amount} the author reported", { amount: gb(used) }),
    }
  }
  const ram = memory(t("System memory"), system?.ram_gb, p.reported.ram_gb)
  const vram = memory(t("Video memory"), gpu?.vram_gb, p.reported.vram_gb)
  const checks = [gpuCheck, ram, vram]
  const level: Level = checks.some((c) => c.level === "concern")
    ? "concern"
    : checks.some((c) => c.level === "close")
      ? "close"
      : checks.some((c) => c.level === "good")
        ? "good"
        : "unknown"
  const headline =
    level === "concern"
      ? gpuCheck.level === "concern"
        ? t("Made for {gpu}: it may not start, or run slowly, on your card.", { gpu: p.gpu.join(t("and")) })
        : t("It may run slowly on your PC: it used more memory on the author's.")
      : level === "close"
        ? t("Close to what your PC has: it may run a little slower than the author's.")
        : level === "good"
          ? t("A good match for your PC, from what its author reported.")
          : t("Not enough is known yet to compare it with your PC.")
  const warning =
    gpuCheck.level === "concern"
      ? t("Made for {gpu} cards, not {vendor}", { gpu: p.gpu.join(t("and")), vendor: gpu!.vendor })
      : ram.level === "concern"
        ? t("Used {used} of memory on the author's PC; yours has {have}", { used: gb(p.reported.ram_gb!), have: gb(system!.ram_gb!) })
        : vram.level === "concern"
          ? t("Used {used} of video memory on the author's PC; yours has {have}", { used: gb(p.reported.vram_gb!), have: gb(gpu!.vram_gb!) })
          : level === "close"
            ? t("Close to your PC's limits: it may run a little slower")
            : null
  return { level, headline, warning, gpu: gpuCheck, ram, vram }
}
