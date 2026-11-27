import { ClipboardPaste, Copy, Download, FileUp, MoreHorizontal, Save, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Group, Row } from "@/components/ui/group"
import { Input, Textarea } from "@/components/ui/input"
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { copyText, pickFile, saveFile } from "@/lib/api"
import { useDraft } from "@/lib/hooks"
import { run, useStore } from "@/lib/store"
import type { Project } from "@/lib/types"
import { t as translate } from "@/lib/i18n"

export function LaunchTab({ project: p }: { project: Project }) {
  const snap = useStore((s) => s.snap)!
  const global = snap.settings
  const l = p.launch
  const [args, setArgs] = useDraft(l.args ?? (p.standalone ? "" : global.launch_args), (v) => void run({ type: "set_project_args", repo: p.repo, value: v }))
  const [switches, setSwitches] = useDraft(l.switches ?? global.extra_env, (v) => void run({ type: "set_project_switches", repo: p.repo, value: v }))
  const options = l.script_options
  return (
    <div className="max-w-[760px] space-y-8">
      <Group title="Arguments" description={p.standalone ? "Passed to the program when it starts." : "Added to victory run. Arguments for the game itself go after --."}>
        <Row stacked label={l.args == null && !p.standalone ? "Using your default arguments" : "This project's arguments"}>
          <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder={p.standalone ? "Program arguments" : "--strict -- -windowed"} className="font-mono text-secondary" aria-label="Launch arguments" />
          {l.args != null && !p.standalone && (
            <Button size="sm" variant="ghost" onClick={() => void run({ type: "set_project_args", repo: p.repo, value: null })}>Use default</Button>
          )}
        </Row>
      </Group>
      {!p.standalone && (
        <Group title="Switches" description="One VICTORY_NAME=value per line.">
          {options && (options.ray_tracing || options.probe_rays || options.hooks) && (
            <>
              {options.ray_tracing && (
                <Row label="Ray tracing">
                  <Switch checked={l.script_state.ray_tracing} onCheckedChange={(v) => void run({ type: "set_script_option", repo: p.repo, option: "ray_tracing", enabled: v })} aria-label="Ray tracing" />
                </Row>
              )}
              {options.probe_rays && (
                <Row label="Probe rays" hint="Available with ray tracing off.">
                  <Switch disabled={l.script_state.ray_tracing} checked={!l.script_state.ray_tracing && l.script_state.probe_rays} onCheckedChange={(v) => void run({ type: "set_script_option", repo: p.repo, option: "probe_rays", enabled: v })} aria-label="Probe rays" />
                </Row>
              )}
              {options.hooks && (
                <Row label="Hooks">
                  <Switch checked={l.script_state.hooks} onCheckedChange={(v) => void run({ type: "set_script_option", repo: p.repo, option: "hooks", enabled: v })} aria-label="Hooks" />
                </Row>
              )}
            </>
          )}
          <Row stacked label={l.switches == null ? "Using your default switches" : "This project's switches"}>
            <Textarea value={switches} onChange={(e) => setSwitches(e.target.value)} placeholder="VICTORY_NAME=value" className="font-mono text-secondary" rows={4} aria-label="Launch switches" />
            {l.switches != null && (
              <Button size="sm" variant="ghost" onClick={() => void run({ type: "set_project_switches", repo: p.repo, value: null })}>Use default</Button>
            )}
          </Row>
        </Group>
      )}
      <Presets project={p} />
    </div>
  )
}

function Presets({ project: p }: { project: Project }) {
  const snap = useStore((s) => s.snap)!
  const compatible = snap.presets.filter((x) => !p.standalone || x.switches == null)
  const [detected, setDetected] = useState<string | null>(null)
  const [picked, setPicked] = useState<string>("")
  const [saving, setSaving] = useState<{ name: string; argsOnly: boolean } | null>(null)
  const [pasting, setPasting] = useState<string | null>(null)
  useEffect(() => {
    void run<string | null>({ type: "detected_preset", repo: p.repo }).then((d) => setDetected(d ?? null))
  }, [p.repo, snap.presets.length])
  useEffect(() => setPicked(p.launch.selected_preset ?? ""), [p.launch.selected_preset])
  const choices = [
    ...(detected ? [{ value: "__detected", label: `${detected} · detected script` }] : []),
    ...compatible.map((x) => ({ value: x.name, label: x.name })),
  ]
  const value = picked || (detected ? "__detected" : "")
  const selectedName = value === "__detected" ? null : value || null
  return (
    <Group
      title="Presets"
      description="Save these arguments and switches under a name, apply them to other projects, or share them."
      action={
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="ghost"><MoreHorizontal /> {translate("Import")}</Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem
              onSelect={async () => {
                const path = await pickFile("Import a preset or launch script", [{ name: "Preset or launch script", extensions: ["json", "ps1"] }])
                if (path) void run<string>({ type: "import_preset_file", repo: p.repo, path }).then((n) => n && toast.success(translate("Imported “{name}”", { name: n })))
              }}
            >
              <FileUp /> {translate("Import file…")}
            </MenuItem>
            <MenuItem onSelect={() => setPasting("")}>
              <ClipboardPaste /> {translate("Paste preset text…")}
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    >
      <Row label="Preset" hint={p.launch.selected_preset ? translate("Applied: {name}", { name: p.launch.selected_preset }) : translate("None applied")}>
        {choices.length > 0 ? (
          <Select label="Preset" value={value || choices[0].value} options={choices} onChange={setPicked} />
        ) : (
          <span className="text-secondary text-fg-3">{translate("No saved presets")}</span>
        )}
        <Button size="sm" variant="secondary" disabled={choices.length === 0} onClick={() => void run<string>({ type: "apply_preset", repo: p.repo, name: selectedName ?? (value ? null : choices[0]?.value ?? null) }).then((n) => n && toast.success(translate("Applied “{name}”", { name: n })))}>
          Apply
        </Button>
        {selectedName && (
          <Menu>
            <MenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Preset actions"><MoreHorizontal /></Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                onSelect={async () => {
                  const path = await saveFile("Export preset", "launch-preset.json", [{ name: "Launch preset", extensions: ["json"] }])
                  if (path) void run({ type: "export_preset", name: selectedName, path }, "Preset exported")
                }}
              >
                <Download /> Export file…
              </MenuItem>
              <MenuItem onSelect={() => void run<string>({ type: "preset_text", name: selectedName }).then((text) => text && copyText(text).then(() => toast.success(translate("Preset text copied"))))}>
                <Copy /> Copy preset text
              </MenuItem>
              <MenuSeparator />
              <MenuItem tone="danger" onSelect={() => void run({ type: "delete_preset", repo: p.repo, name: selectedName }, `Deleted “${selectedName}”`).then(() => setPicked(""))}>
                <Trash2 /> Delete preset
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </Row>
      {saving ? (
        <Row stacked label="Save the current settings as a preset">
          <Input autoFocus value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} placeholder="Preset name" aria-label="Preset name" />
          {!p.standalone && (
            <label className="flex shrink-0 items-center gap-2 text-secondary text-fg-2">
              <Switch checked={saving.argsOnly} onCheckedChange={(argsOnly) => setSaving({ ...saving, argsOnly })} aria-label="Arguments only" /> Arguments only
            </label>
          )}
          <Button size="sm" variant="primary" disabled={!saving.name.trim()} onClick={() => void run<string>({ type: "save_preset", repo: p.repo, name: saving.name, include_switches: !saving.argsOnly }).then((n) => { if (n) { toast.success(translate("Saved “{name}”", { name: n })); setSaving(null); setPicked(n) } })}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSaving(null)}>Cancel</Button>
        </Row>
      ) : pasting != null ? (
        <Row stacked label="Paste the text from Copy preset text">
          <Textarea autoFocus value={pasting} onChange={(e) => setPasting(e.target.value)} rows={3} className="font-mono text-secondary" aria-label="Preset text" />
          <Button size="sm" variant="primary" disabled={!pasting.trim()} onClick={() => void run<string>({ type: "import_preset_text", repo: p.repo, text: pasting }).then((n) => { if (n) { toast.success(translate("Imported “{name}”", { name: n })); setPasting(null) } })}>
            Import
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPasting(null)}>Cancel</Button>
        </Row>
      ) : (
        <Row label="Save as preset" hint="Keeps this project's arguments and switches under a name.">
          <Button size="sm" variant="secondary" onClick={() => setSaving({ name: "", argsOnly: false })}><Save /> Save as…</Button>
        </Row>
      )}
    </Group>
  )
}
