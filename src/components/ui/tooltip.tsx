import { Tooltip as T } from "radix-ui"
import type * as React from "react"
import { t } from "@/lib/i18n"

export const TooltipProvider = T.Provider

export function Tooltip({ label, children, side = "bottom" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          className="z-50 max-w-64 rounded-md border border-line bg-raised/95 px-2.5 py-1.5 text-caption text-fg shadow-[0_8px_24px_rgb(0_0_0/0.4)] backdrop-blur-xl"
        >
          {typeof label === "string" ? t(label) : label}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
