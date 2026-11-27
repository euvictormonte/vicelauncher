import { useEffect } from "react"
import { toast, Toaster } from "sonner"
import { Sidebar } from "@/components/shell/sidebar"
import { WindowControls } from "@/components/shell/window-controls"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Dialogs } from "@/features/dialogs/dialogs"
import { LibrarySkeleton, LibraryView } from "@/features/library/library-view"
import { HomeSkeleton, HomeView } from "@/features/home/home-view"
import { SettingsView } from "@/features/settings/settings-view"
import { getBackend } from "@/lib/api"
import { scheduleRefresh, useStore } from "@/lib/store"
import { t, useLanguage } from "@/lib/i18n"
import { discordErrorMessage, inTauri } from "@/lib/api"
import { saveNickname } from "@/lib/profile"

export function App() {
  useLanguage()
  const snap = useStore((s) => s.snap)
  const view = useStore((s) => s.view)
  useEffect(() => {
    let off: (() => void) | undefined
    let offDiscordConnected: (() => void) | undefined
    let offDiscordError: (() => void) | undefined
    void getBackend().then(async (b) => {
      off = await b.onChange(scheduleRefresh)
      scheduleRefresh()
    })
    if (inTauri) {
      void import("@tauri-apps/api/event").then(async ({ listen }) => {
        offDiscordConnected = await listen<string>("discord://connected", ({ payload }) => {
          if (typeof payload !== "string" || !payload.trim()) return
          saveNickname(payload)
          toast.success(t("Discord connected. Welcome, {name}!", { name: payload }))
        })
        offDiscordError = await listen<string>("discord://error", ({ payload }) => {
          toast.error(discordErrorMessage(payload))
        })
      })
    }
    return () => { off?.(); offDiscordConnected?.(); offDiscordError?.() }
  }, [])
  return (
    <TooltipProvider>
      <div className="flex h-full">
        <Sidebar />
        <main className="relative min-w-0 flex-1">
          {/* The top of the window drags it; the controls sit over the art. */}
          <div className="drag absolute inset-x-0 top-0 z-30 flex h-10 justify-end">
            <WindowControls />
          </div>
          {!snap ? (
            view === "library" ? <LibrarySkeleton /> : view === "home" ? <HomeSkeleton /> : null
          ) : view === "home" ? (
            <HomeView />
          ) : view === "library" ? (
            <LibraryView />
          ) : (
            <SettingsView />
          )}
        </main>
      </div>
      <Dialogs />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{ className: "!glass !rounded-lg !text-fg !border-line !text-[13px]" }}
      />
    </TooltipProvider>
  )
}
