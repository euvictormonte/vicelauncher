import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import type * as React from "react"
import { cn } from "@/lib/utils"
import { t, translateNode } from "@/lib/i18n"

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,color,box-shadow,opacity,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_8px_24px_-8px_color-mix(in_srgb,var(--color-accent)_60%,transparent)] hover:bg-accent-hover",
        secondary: "glass-thin text-fg hover:bg-fill-3",
        ghost: "text-fg-2 hover:bg-fill-2 hover:text-fg",
        danger: "bg-bad/14 text-bad hover:bg-bad/22",
        "danger-solid": "bg-bad text-white hover:bg-bad/90",
      },
      size: {
        sm: "h-8 px-3 text-secondary [&_svg]:size-3.5",
        md: "h-9 px-4 text-body [&_svg]:size-4",
        lg: "h-12 min-w-44 px-7 text-lead font-semibold tracking-[-0.01em] rounded-lg [&_svg]:size-[18px]",
        "icon-sm": "size-8 [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        "icon-lg": "size-12 rounded-lg [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
)

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} aria-label={props["aria-label"] ? t(props["aria-label"]) : undefined} title={props.title ? t(props.title) : undefined}>{translateNode(props.children)}</Comp>
}

export { buttonVariants }
