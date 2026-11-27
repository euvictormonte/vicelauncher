import { Bookmark, Download, FolderDown } from "lucide-react"
import { t } from "@/lib/i18n"

const steps = [
  { icon: Bookmark, title: "Choose a save" },
  { icon: Download, title: "Download the file" },
  { icon: FolderDown, title: "Add it to your game" },
] as const

export function CommunitySavesView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] space-y-8 px-8 pt-14 pb-12 xl:px-10">
        <header>
          <h1 className="font-display text-page font-bold tracking-[-0.03em] text-fg">
            {t("Community saves")}
          </h1>
          <p className="mt-2 max-w-[680px] text-lead text-fg-2">
            {t("Browse and download shared game saves to start a new journey.")}
          </p>
        </header>

        <section className="relative isolate flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-line bg-fill-1 px-6 py-12 text-center sm:min-h-[340px]">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgb(124_58_237/0.16),transparent_60%)]" />
          <div className="grid size-16 place-items-center rounded-2xl border border-accent/20 bg-accent-soft text-accent-fg shadow-float">
            <Bookmark className="size-7" />
          </div>
          <h2 className="mt-5 text-section font-semibold text-fg">{t("No community saves yet")}</h2>
          <p className="mt-2 max-w-[470px] text-body leading-6 text-fg-2">
            {t("When people share saves, they will appear here to explore and download.")}
          </p>
          <span className="mt-5 rounded-full border border-line bg-fill-2 px-3 py-1 text-caption font-medium text-fg-3">
            {t("0 saves")}
          </span>
        </section>

        <section aria-labelledby="community-saves-how-it-works" className="space-y-4">
          <div>
            <h2 id="community-saves-how-it-works" className="text-lead font-semibold text-fg">
              {t("How it will work")}
            </h2>
            <p className="mt-1 text-secondary text-fg-2">
              {t("Pick a community save and bring it into your game.")}
            </p>
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {steps.map(({ icon: Icon, title }, index) => (
              <li key={title} className="flex min-h-[112px] items-center gap-4 rounded-xl border border-line bg-fill-1 p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-caption font-semibold text-accent-fg">{t("Step {number}", { number: index + 1 })}</span>
                  <span className="mt-1 block text-body font-medium text-fg">{t(title)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
