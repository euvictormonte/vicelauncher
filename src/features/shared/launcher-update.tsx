import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { openUrl } from "@/lib/api"
import { run, useStore } from "@/lib/store"
import { t } from "@/lib/i18n"

/** The release the player put off with "Later". Only that release is hidden; the next one shows. */
const LATER = "vilauncher.launcher-update-later"
/** The release announced with a notice, so the notice shows once per release. */
const ANNOUNCED = "vilauncher.launcher-update-announced"

/**
 * A new release of Neves Launcher itself: a card in the sidebar while it is available, downloading or
 * ready, and one notice when it first appears. Nothing installs until the player presses Update.
 */
export function LauncherUpdate() {
  const u = useStore((s) => s.snap?.updater)
  const [, rerender] = useState(0)

  useEffect(() => {
    if (!u || u.state !== "available" || !u.tag) return
    if (localStorage.getItem(ANNOUNCED) === u.tag) return
    localStorage.setItem(ANNOUNCED, u.tag)
    toast(t("Neves Launcher {version} is out", { version: u.tag }), {
      description: t("Update now, or later from the sidebar."),
      duration: 12000,
      action: { label: "Update", onClick: () => void run({ type: "download_update" }) },
    })
  }, [u?.state, u?.tag])

  if (!u || !u.tag) return null
  const tag = u.tag
  if (u.state === "available") {
    if (localStorage.getItem(LATER) === tag) return null
    return (
      <Card>
        <p className="text-caption text-fg-2">{t("Neves Launcher {version} is out", { version: tag })}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" onClick={() => void run({ type: "download_update" })}>Update</Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.setItem(LATER, tag)
              rerender((n) => n + 1)
            }}
          >
            Later
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void openUrl(u.releases)}>Notes</Button>
        </div>
      </Card>
    )
  }
  if (u.state === "downloading") {
    return (
      <Card>
        <p className="flex items-center gap-2 text-caption text-fg-2"><Spinner className="size-3" /> {t("Downloading {version}", { version: tag })}</p>
      </Card>
    )
  }
  if (u.state === "downloaded") {
    return (
      <Card>
        <p className="text-caption text-fg-2">{t("Update is ready: {version}", { version: tag })}</p>
        <div className="mt-2">
          <Button size="sm" variant="primary" onClick={() => void run({ type: "restart_to_update" })}>Restart now</Button>
        </div>
      </Card>
    )
  }
  return null
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-line bg-fill-2 px-3 py-2.5">{children}</div>
}
