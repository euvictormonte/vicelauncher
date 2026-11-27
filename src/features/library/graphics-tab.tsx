import { Group, Row } from "@/components/ui/group"
import { Segmented } from "@/components/ui/segmented"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { graphicsMode, MODES, OUTPUTS, withMode } from "@/lib/format"
import { run } from "@/lib/store"
import type { Graphics, Project } from "@/lib/types"
import { t } from "@/lib/i18n"

export function GraphicsTab({ project: p }: { project: Project }) {
  if (p.standalone) {
    return <p className="text-body text-fg-3">{t("This project runs on its own: graphics settings apply to builds that run the game.")}</p>
  }
  const g = p.launch.graphics
  const set = (graphics: Graphics) => void run({ type: "set_project_graphics", repo: p.repo, graphics })
  return (
    <div className="max-w-[760px] space-y-8">
      <Group>
        <Row label="Use my default graphics" hint={p.launch.graphics_override ? "This project has its own settings." : "Change the defaults in Settings, or any setting below for this project only."}>
          <Switch
            checked={!p.launch.graphics_override}
            onCheckedChange={(on) => void run({ type: "set_project_graphics", repo: p.repo, graphics: on ? null : g })}
            aria-label="Use my default graphics"
          />
        </Row>
      </Group>
      <GraphicsGroups graphics={g} onChange={set} />
    </div>
  )
}

/** The graphics controls, shared by a project and the defaults in Settings. */
export function GraphicsGroups({ graphics: g, onChange }: { graphics: Graphics; onChange(g: Graphics): void }) {
  const mode = graphicsMode(g)
  return (
    <>
      <Group title="Quality" description="These may not work with every project or on older PCs. If a game won't start or looks wrong, choose Best quality and turn the fixes off.">
        <Row label="Preset" hint={mode ? MODES.find((m) => m.id === mode)!.detail : `Render scale ${Math.round(g.render_scale * 100)}%`}>
          <Segmented label="Quality preset" value={mode} options={MODES.map((m) => ({ value: m.id, label: m.label }))} onChange={(id) => onChange(withMode(g, id))} />
        </Row>
        <Row label="Console profile" hint="Series S renders at the scale above and upscales.">
          <Select
            label="Console profile"
            value={g.series_s ? "s" : "x"}
            options={[{ value: "x", label: "Series X" }, { value: "s", label: "Series S" }]}
            onChange={(v) => onChange({ ...g, series_s: v === "s" })}
          />
        </Row>
        <Row label="Output resolution" hint="Needs support in the build.">
          <Select label="Output resolution" value={g.output} options={OUTPUTS.map((o) => ({ value: o.id, label: o.label }))} onChange={(output) => onChange({ ...g, output })} />
        </Row>
      </Group>
      <Group title="Fixes and display">
        <Row label="8 GB graphics card fix" hint="Smaller textures, and grey in place of missing ones.">
          <Switch checked={g.fix_8gb} onCheckedChange={(fix_8gb) => onChange({ ...g, fix_8gb })} aria-label="8 GB graphics card fix" />
        </Row>
        <Row label="Brighter shadows" hint="A steady ambient light where ray tracing doesn't run.">
          <Switch checked={g.bright_shadows} onCheckedChange={(bright_shadows) => onChange({ ...g, bright_shadows })} aria-label="Brighter shadows" />
        </Row>
        <Row label="Borderless fullscreen" hint="The game's window covers its whole monitor, with no frame.">
          <Switch checked={g.fullscreen} onCheckedChange={(fullscreen) => onChange({ ...g, fullscreen })} aria-label="Borderless fullscreen" />
        </Row>
      </Group>
    </>
  )
}
