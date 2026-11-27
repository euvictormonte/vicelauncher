import { Switch as SwitchPrimitive } from "radix-ui"
import type * as React from "react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-fill-4 transition-colors duration-200 ease-out data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
      aria-label={props["aria-label"] ? t(props["aria-label"]) : undefined}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.35)] transition-transform duration-200 ease-out data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  )
}
