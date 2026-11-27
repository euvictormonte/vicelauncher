import type * as React from "react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

export const fieldClass =
  "w-full rounded-md border border-line bg-fill-1 px-3 text-body text-fg placeholder:text-fg-4 transition-colors duration-150 hover:border-line-2 focus-visible:border-accent/60 focus-visible:bg-fill-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input spellCheck={false} className={cn(fieldClass, "h-9", className)} {...props} placeholder={props.placeholder ? t(props.placeholder) : undefined} aria-label={props["aria-label"] ? t(props["aria-label"]) : undefined} />
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea spellCheck={false} className={cn(fieldClass, "min-h-24 resize-y py-2 leading-5", className)} {...props} placeholder={props.placeholder ? t(props.placeholder) : undefined} aria-label={props["aria-label"] ? t(props["aria-label"]) : undefined} />
}
