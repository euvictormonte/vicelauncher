import { useEffect } from "react"
import { Toaster } from "sonner"
import { Sidebar } from "@/components/shell/sidebar"
import { WindowControls } from "@/components/shell/window-controls"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Dialogs } from "@/features/dialogs/dialogs"
import { LibrarySkeleton, LibraryView } from "@/features/library/library-view"
import { HomeSkeleton, HomeView } from "@/features/home/home-view"
import { SettingsView } from "@/features/settings/settings-view"
import { getBackend } from "@/lib/api"
import { scheduleRefresh, useStore } from "@/lib/store"
import { useLanguage } from "@/lib/i18n"

export function App() {
  useLanguage()
  const snap = useStore((s) => s.snap)
  const view = useStore((s) => s.view)
  useEffect(() => {
    let off: (() => void) | undefined
    void getBackend().then(async (b) => {
      off = await b.onChange(scheduleRefresh)
      scheduleRefresh()
    })
    return () => off?.()
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
