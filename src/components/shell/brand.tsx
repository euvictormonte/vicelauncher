import { PawPrint } from "lucide-react"
import { useRef } from "react"
import { toast } from "sonner"
import { t } from "@/lib/i18n"
import { pawsUnlocked, unlockPaws, useTheme } from "@/lib/theme"

/** Neves Launcher wordmark. */
export function Brand() {
  const theme = useTheme()
  const clicks = useRef(0)
  // Seven clicks on the logo unlock a hidden look. Nothing else happens.
  const onLogo = () => {
    clicks.current += 1
    if (clicks.current < 7 || pawsUnlocked()) return
    unlockPaws()
    toast.success(t("A new look is unlocked. Find it in Settings, under Appearance."))
  }
  return (
    <div className="flex items-center gap-2">
      <img
        src="/logo.png"
        alt=""
        onClick={onLogo}
        className="size-6 rounded-[6px] [-webkit-app-region:no-drag]"
        draggable={false}
      />
      <span className="flex items-baseline leading-none">
        <span className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-fg">Neves</span>
        <span className="ml-1 font-script text-[21px] text-accent-fg">Launcher</span>
      </span>
      {theme === "paws" && <PawPrint aria-hidden className="ml-1 size-3.5 text-accent-fg" />}
    </div>
  )
}
