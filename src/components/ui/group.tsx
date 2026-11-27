import type * as React from "react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

/** A titled group of rows on one card, as in System Settings. */
export function Group({ title, description, children, className, action }: { title?: string; description?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("space-y-2", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4 px-1">
          <div>
            {title && <h3 className="text-body font-semibold text-fg">{t(title)}</h3>}
            {description && <p className="mt-0.5 text-secondary text-fg-3">{typeof description === "string" ? t(description) : description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-fill-1">{children}</div>
    </section>
  )
}

/** One row: what it is on the left, its control on the right. */
export function Row({ label, hint, children, className, stacked }: { label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; className?: string; stacked?: boolean }) {
  return (
    <div className={cn("flex min-h-13 gap-6 px-4 py-3", stacked ? "flex-col gap-3" : "items-center", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-body text-fg">{typeof label === "string" ? t(label) : label}</div>
        {hint && <div className="mt-0.5 text-secondary text-fg-3">{typeof hint === "string" ? t(hint) : hint}</div>}
      </div>
      {children && <div className={cn("flex shrink-0 items-center gap-2", stacked && "w-full")}>{children}</div>}
    </div>
  )
}
