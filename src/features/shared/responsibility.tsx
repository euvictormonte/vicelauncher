import { AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { run } from "@/lib/store"
import type { ResponsibilityId } from "@/lib/types"

interface Text {
  title: string
  body: string
  bullets: string[]
}

/** The plain-language warning for each risky step. Keep every risk listed. */
const TEXT: Record<ResponsibilityId, Text> = {
  "import-repo": {
    title: "Before you import this project",
    body: "Importing a repo downloads its code and runs it on this PC. Its build scripts and the programs it builds can read and change files you can access, use the network, and use your graphics card. Neves Launcher checks the repo's game files and verified project list but cannot make unknown code safe. Only import repos you trust, and read the code if you can.",
    bullets: [
      "It runs build scripts and compiles the code.",
      "It may download more code and tools.",
      "It can write to folders your user account can write to.",
      "The saves Neves Launcher keeps are separate and an import does not touch them, but the project's own code might.",
    ],
  },
  "agent-access": {
    title: "Let AI agents help with builds?",
    body: "Turning this on lets AI agents (for example Claude Code or opencode) read this launcher's logs and projects, and, when you confirm each step, apply a patch to a project's source and run its build. An agent can make mistakes, and its patch runs on this PC.",
    bullets: [
      "Agents read logs and folder names. Your user name is removed from what is shown.",
      "Patches only touch a project's own source folder.",
      "Every change needs your confirmation. Nothing is committed or pushed.",
      "You can turn this off at any time.",
    ],
  },
  "agent-patch": {
    title: "Apply this patch?",
    body: "This patch will change the project's source and run its build on this PC. Saves are not touched. The patch is written by an agent and has not been reviewed by the project's authors.",
    bullets: [],
  },
}

/**
 * Asks the player to accept responsibility before a risky step. The acceptance is
 * stored by the launcher (settings.acknowledged), so it is asked once per warning.
 * Continue stays disabled until the box is ticked.
 */
export function ResponsibilityDialog({
  open,
  onOpenChange,
  id,
  onAccept,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  id: ResponsibilityId
  onAccept(): void
}) {
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const text = TEXT[id]

  useEffect(() => {
    if (open) {
      setAgreed(false)
      setBusy(false)
    }
  }, [open])

  const accept = async () => {
    setBusy(true)
    // run() reports a failure as undefined (and shows the error), so only a saved acceptance goes on.
    const saved = await run({ type: "acknowledge", id })
    setBusy(false)
    if (saved === undefined) return
    onOpenChange(false)
    onAccept()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={text.title}
      footer={
        <>
          <Button variant="primary" disabled={!agreed || busy} onClick={() => void accept()}>
            Continue
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </>
      }
    >
      <p className="text-body text-fg-2">{text.body}</p>
      {text.bullets.length > 0 && (
        <div className="mt-4 rounded-lg border border-warn/20 bg-warn/8 px-3.5 py-3">
          <p className="flex items-center gap-2 text-secondary font-medium text-fg">
            <AlertTriangle className="size-4 shrink-0 text-warn" /> What could happen
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-secondary text-fg-2">
            {text.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-body text-fg-2">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 size-4"
        />
        I understand, and I take responsibility for what this does on my PC.
      </label>
    </Dialog>
  )
}
