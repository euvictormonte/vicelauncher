import { DropdownMenu } from "radix-ui"
import type * as React from "react"
import { cn } from "@/lib/utils"
import { translateNode } from "@/lib/i18n"

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger

export function MenuContent({ className, ...props }: React.ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={8}
        align="start"
        className={cn("glass z-50 min-w-56 rounded-lg p-1", className)}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

export function MenuItem({
  className,
  tone,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & { tone?: "danger" }) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-secondary text-fg-2 outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-fill-3 data-[highlighted]:text-fg data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-fg-3",
        tone === "danger" && "text-bad data-[highlighted]:bg-bad/14 data-[highlighted]:text-bad [&_svg]:text-bad",
        className,
      )}
      {...props}
    >{translateNode(props.children)}</DropdownMenu.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="mx-1 my-1 h-px bg-line" />
}
