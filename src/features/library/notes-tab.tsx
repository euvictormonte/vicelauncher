import { Textarea } from "@/components/ui/input"
import { useDraft } from "@/lib/hooks"
import { t } from "@/lib/i18n"
import { run } from "@/lib/store"
import type { Project } from "@/lib/types"

export function NotesTab({ project: p }: { project: Project }) {
  const [notes, setNotes] = useDraft(p.launch.notes, (v) => void run({ type: "set_project_notes", repo: p.repo, notes: v }))
  return (
    <div className="max-w-[760px]">
      <p className="mb-3 text-secondary text-fg-3">{t("Kept on this PC, for this project. Saved as you type.")}</p>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={12} placeholder="How it ran, glitches you saw, settings to try next…" aria-label="Notes" className="min-h-64 text-body" />
    </div>
  )
}
