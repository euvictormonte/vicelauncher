import { useEffect } from "react"
import { Bone } from "@/components/shell/skeleton"
import { Button } from "@/components/ui/button"
import { allProjects, run, useSelected, useStore } from "@/lib/store"
import { Hero } from "./hero"
import { ProjectTabs } from "./project-tabs"

export function LibraryView() {
  const snap = useStore((s) => s.snap)!
  const screenshot = useStore((s) => s.screenshot)
  const project = useSelected()
  // Nothing picked: an installed project, else the best listed one.
  useEffect(() => {
    if (project || snap.list.status === "loading") return
    const all = allProjects(snap)
    const pick = all.find((p) => p.installed) ?? snap.list.items[0] ?? all[0]
    if (pick) void run({ type: "select", repo: pick.repo })
  }, [project, snap])
  if (!project) {
    if (snap.list.status !== "error") return <LibrarySkeleton />
    // Image slot: a drawn scene for "the list didn't arrive" belongs above this text.
    return (
      <div className="relative flex h-full flex-col justify-end px-10 pb-16">
        <h1 className="font-display text-page font-bold text-fg">The project list didn't arrive</h1>
        <p className="mt-2 max-w-[520px] text-lead text-fg-2">
          Neves Launcher reads the list of community builds from viportlive.com. Check your connection, then try again.
        </p>
        <div className="mt-6">
          <Button onClick={() => void run({ type: "refresh_projects" })}>Try again</Button>
        </div>
        {!screenshot && snap.list.error && <p className="mt-3 text-caption text-fg-3" data-selectable>{snap.list.error}</p>}
      </div>
    )
  }
  return (
    <div className="h-full overflow-y-auto" key={project.repo}>
      <Hero project={project} />
      <ProjectTabs project={project} />
    </div>
  )
}

/** The library while the snapshot or the project list loads: the hero's shape, without art. */
export function LibrarySkeleton() {
  return (
    <div className="h-full overflow-hidden" aria-busy="true" aria-label="Loading the library">
      <section className="relative shrink-0" style={{ height: "clamp(420px, 60vh, 620px)" }}>
        <div className="flex h-full max-w-[1280px] items-end justify-between gap-10 px-10 pt-16 pb-10">
          <div className="min-w-0 max-w-[640px] flex-1">
            <div className="flex items-center gap-6">
              <Bone className="size-[88px] shrink-0 rounded-xl" />
              <div className="flex-1">
                <Bone className="h-3 w-28" />
                <Bone className="mt-4 h-11 w-[min(320px,80%)] rounded-md" />
              </div>
            </div>
            <Bone className="mt-6 h-3.5 w-[92%]" />
            <Bone className="mt-2 h-3.5 w-[64%]" />
            <div className="mt-6 flex gap-12">
              {[56, 48, 40].map((w) => (
                <div key={w} className="space-y-2">
                  <Bone className="h-4" style={{ width: w }} />
                  <Bone className="h-2.5 w-12" />
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-2">
              <Bone className="h-12 w-44 rounded-lg" />
              <Bone className="size-12 rounded-lg" />
              <Bone className="size-12 rounded-lg" />
            </div>
            <div className="mt-3 h-[18px]" />
          </div>
        </div>
      </section>
      <div className="max-w-[1280px] px-10">
        <div className="flex h-11 items-center gap-8 border-b border-line">
          {[64, 60, 104, 40, 52].map((w, i) => (
            <Bone key={i} className="h-3" style={{ width: w }} />
          ))}
        </div>
        <div className="space-y-3 pt-8">
          <Bone className="h-5 w-20" />
          <Bone className="h-3.5 w-[min(640px,90%)]" />
          <Bone className="h-3.5 w-[min(560px,80%)]" />
        </div>
      </div>
    </div>
  )
}
