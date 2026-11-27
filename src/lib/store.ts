import { toast } from "sonner"
import { create } from "zustand"
import { act as send, getBackend } from "./api"
import type { Action, PlayChoice, Project, Snapshot } from "./types"
import { t } from "./i18n"

export type View = "library" | "settings"
export type ProjectTab = "overview" | "graphics" | "launch" | "notes" | "activity"

export type Dialog =
  | { kind: "import" }
  | { kind: "uninstall"; repo: string }
  | { kind: "setup"; repo: string }
  | { kind: "saves"; repo: string }
  | { kind: "presets"; repo: string; choice: PlayChoice }
  | { kind: "notice" }
  | null

interface State {
  snap: Snapshot | null
  view: View
  search: string
  tab: ProjectTab
  screenshot: boolean
  dialog: Dialog
  setView(view: View): void
  setSearch(search: string): void
  setTab(tab: ProjectTab): void
  setScreenshot(on: boolean): void
  open(dialog: Dialog): void
  refresh(): Promise<void>
}

export const useStore = create<State>((set) => ({
  snap: null,
  view: "library",
  search: "",
  tab: "overview",
  screenshot: false,
  dialog: null,
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setTab: (tab) => set({ tab }),
  setScreenshot: (screenshot) => set({ screenshot }),
  open: (dialog) => set({ dialog }),
  refresh: async () => {
    const snap = await (await getBackend()).snapshot()
    set({ snap })
  },
}))

let queued = false
/** Asks for a new snapshot on the next frame, once however many changes came in. */
export function scheduleRefresh() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    void useStore.getState().refresh()
  })
}

/** Sends an action; a refusal shows as a toast and comes back as undefined. */
export async function run<T = unknown>(action: Action, success?: string): Promise<T | undefined> {
  try {
    const value = await send<T>(action)
    if (success) toast.success(t(success))
    scheduleRefresh()
    return value
  } catch (error) {
    toast.error(t(String(error)))
    scheduleRefresh()
    return undefined
  }
}

export function allProjects(snap: Snapshot): Project[] {
  return [...snap.custom, ...snap.list.items]
}

export function useSelected(): Project | null {
  return useStore((s) => {
    if (!s.snap) return null
    const all = allProjects(s.snap)
    return all.find((p) => p.repo === s.snap!.selected) ?? null
  })
}

/** In Screenshot mode, names and links are examples and private text is hidden. */
export function useAlias() {
  const screenshot = useStore((s) => s.screenshot)
  const snap = useStore((s) => s.snap)
  return (p: Project) => {
    if (!screenshot || !snap) return { name: p.name, repo: p.repo, owner: p.owner }
    const index = allProjects(snap).findIndex((q) => q.repo === p.repo) + 1
    const n = String(index).padStart(2, "0")
    return { name: t("Example project {number}", { number: n }), repo: `example/project-${n}`, owner: null }
  }
}
