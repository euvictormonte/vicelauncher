import { motion } from "motion/react"
import { ToggleGroup } from "radix-ui"
import { useId } from "react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

interface Props<T extends string> {
  value: T | null
  options: readonly { value: T; label: string }[]
  onChange(value: T): void
  className?: string
  size?: "sm" | "md"
  label: string
}

/** One of a few options, side by side; the pick's plate slides to a new pick. */
export function Segmented<T extends string>({ value, options, onChange, className, size = "md", label }: Props<T>) {
  const id = useId()
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={t(label)}
      value={value ?? ""}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("inline-flex rounded-md bg-fill-1 p-0.5 ring-1 ring-line ring-inset", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "relative flex-1 cursor-pointer whitespace-nowrap rounded-[5px] px-3 font-medium text-fg-3 transition-colors duration-150 hover:text-fg data-[state=on]:text-fg",
            size === "sm" ? "h-7 text-caption" : "h-8 text-secondary",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-[5px] bg-fill-4 shadow-[0_1px_2px_rgb(0_0_0/0.3),inset_0_1px_0_rgb(255_255_255/0.08)]"
              transition={{ type: "spring", duration: 0.25, bounce: 0.12 }}
            />
          )}
          <span className="relative">{t(o.label)}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
