import { X } from "lucide-react"
import { motion } from "motion/react"
import { Dialog as D } from "radix-ui"
import type * as React from "react"
import { cn } from "@/lib/utils"
import { translateNode } from "@/lib/i18n"

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  overlayClassName?: string
  /** False: no close button, and Escape or a click outside do nothing (a question that needs an answer). */
  dismissable?: boolean
}

/** A dialog over the dimmed window: glass, 16 px corners, Escape or a click outside closes it. */
export function Dialog({ open, onOpenChange, title, description, eyebrow, children, footer, className, overlayClassName, dismissable = true }: Props) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={cn("fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] animate-[fade-in_180ms_ease-out]", overlayClassName)} />
        <D.Content
          asChild
          onEscapeKeyDown={(e) => !dismissable && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissable && e.preventDefault()}
          onInteractOutside={(e) => !dismissable && e.preventDefault()}
          onOpenAutoFocus={(e) => {
            // A field takes the focus when there is one; otherwise nothing lights up until the keyboard is used.
            e.preventDefault()
            ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("input, textarea")?.focus()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "glass fixed top-1/2 left-1/2 z-50 flex max-h-[86vh] w-[min(520px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-glass-solid outline-none",
              className,
            )}
          >
            <header className="flex items-start gap-4 px-6 pt-6">
              <div className="min-w-0 flex-1">
                {eyebrow && <p className="mb-1 text-caption font-medium text-fg-3">{translateNode(eyebrow)}</p>}
                <D.Title className="font-display text-section font-semibold tracking-[-0.01em] text-fg">{translateNode(title)}</D.Title>
                {description && <D.Description className="mt-1.5 text-body text-fg-2">{translateNode(description)}</D.Description>}
              </div>
              {dismissable && <D.Close className="-mt-1 -mr-2 grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-fg-3 transition-colors hover:bg-fill-2 hover:text-fg">
                <X className="size-4" />
                <span className="sr-only">{translateNode("Close")}</span>
              </D.Close>}
            </header>
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-1">{translateNode(children)}</div>}
            {footer && <footer className="flex flex-row-reverse items-center gap-2 px-6 pt-5 pb-6">{translateNode(footer)}</footer>}
          </motion.div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
