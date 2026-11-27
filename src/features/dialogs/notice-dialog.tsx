import legal from "../../../LEGAL.md?raw"
import legalPt from "../../../LEGAL.pt-BR.md?raw"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { inTauri } from "@/lib/api"
import { run, useStore } from "@/lib/store"
import { useLanguage } from "@/lib/i18n"

/** LEGAL.md, the one source of the notice (also in the README and the installer). */
function Paragraph({ text }: { text: string }) {
  // "1. You must provide the build. Rest…": the lead sentence carries the point.
  const m = text.match(/^(\d+)\.\s+([^.]+\.)\s*([\s\S]*)$/)
  if (!m) return <p className="text-body text-fg-2">{text}</p>
  return (
    <li className="flex gap-3">
      <span className="w-4 shrink-0 text-body font-semibold text-fg-3 tabular-nums">{m[1]}</span>
      <p className="text-body text-fg-2">
        <span className="font-semibold text-fg">{m[2]}</span> {m[3]}
      </p>
    </li>
  )
}

/**
 * The legal notice. On the first start it must be agreed to before the
 * library opens (no way around it but Quit); from Settings it is only read.
 */
export function NoticeDialog() {
  const language = useLanguage()
  const paragraphs = (language === "pt-BR" ? legalPt : legal).trim().split(/\n\s*\n/).slice(1)
  const accepted = useStore((s) => s.snap?.notice_accepted ?? true)
  const dialog = useStore((s) => s.dialog)
  const open = useStore((s) => s.open)
  const reading = dialog?.kind === "notice"
  if (accepted && !reading) return null
  const intro = paragraphs[0]
  const numbered = paragraphs.filter((p) => /^\d+\./.test(p))
  const closing = paragraphs.filter((p) => !/^\d+\./.test(p)).slice(1)
  return (
    <Dialog
      open
      dismissable={accepted}
      onOpenChange={(o) => !o && accepted && open(null)}
      title="Before you start"
      description={intro}
      className="w-[min(600px,calc(100vw-48px))]"
      footer={
        accepted ? (
          <Button variant="primary" onClick={() => open(null)}>Close</Button>
        ) : (
          <>
            <Button variant="primary" onClick={() => void run({ type: "accept_notice" })}>I understand and agree</Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!inTauri) return
                const { getCurrentWindow } = await import("@tauri-apps/api/window")
                await getCurrentWindow().close()
              }}
            >
              Quit
            </Button>
          </>
        )
      }
    >
      <ol className="space-y-4" data-selectable>
        {numbered.map((p) => (
          <Paragraph key={p} text={p} />
        ))}
      </ol>
      {closing.map((p) => (
        <p key={p} className="mt-5 text-secondary text-fg-3">{p}</p>
      ))}
    </Dialog>
  )
}
