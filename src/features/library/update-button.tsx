import { useState } from "react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { run, useStore } from "@/lib/store"
import { t } from "@/lib/i18n"

/**
 * The one Update entry point, for every control that replaces an installed build.
 * `ask` starts the install, after the warning unless the player turned it off
 * ("Don't show this again"); `dialog` must be rendered once by the caller.
 */
export function useUpdateWarning(repo: string) {
  const skip = useStore((s) => s.snap?.settings.skip_update_warning ?? false)
  const [open, setOpen] = useState(false)
  const [dontShow, setDontShow] = useState(false)

  const update = async () => {
    setOpen(false)
    if (dontShow) await run({ type: "set_update_warning", show: false })
    void run({ type: "install", repo })
  }

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t("Update this project?")}
      description={t("Updating replaces this build. The previous build is kept, so you can restore it once, but the project's source is replaced. Uncommitted changes in the project folder are saved as a patch file in Neves Launcher's patches folder before the update. The build takes several minutes. Your saves are not touched.")}
      footer={
        <>
          <Button variant="primary" onClick={() => void update()}>
            Update
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </>
      }
    >
      <label className="flex cursor-pointer items-center gap-2.5 text-body text-fg-2">
        <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} className="size-4" />
        {t("Don't show this again")}
      </label>
    </Dialog>
  )

  return { ask: () => (skip ? void run({ type: "install", repo }) : setOpen(true)), dialog }
}

/** An Update button that goes through the warning. */
export function UpdateButton({ repo, children, ...props }: ButtonProps & { repo: string }) {
  const warning = useUpdateWarning(repo)
  return (
    <>
      <Button {...props} onClick={warning.ask}>
        {children}
      </Button>
      {warning.dialog}
    </>
  )
}
