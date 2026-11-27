import { Check, ChevronsUpDown } from "lucide-react"
import { Select as S } from "radix-ui"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

interface Props<T extends string> {
  value: T
  options: readonly { value: T; label: string }[]
  onChange(value: T): void
  label: string
  className?: string
  placeholder?: string
}

export function Select<T extends string>({ value, options, onChange, label, className, placeholder }: Props<T>) {
  return (
    <S.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <S.Trigger
        aria-label={t(label)}
        className={cn(
          "inline-flex h-8 min-w-40 cursor-pointer items-center justify-between gap-2 rounded-md border border-line bg-fill-1 px-3 text-secondary text-fg transition-colors hover:border-line-2 hover:bg-fill-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronsUpDown className="size-3.5 text-fg-3" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="glass z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg p-1"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-8 cursor-pointer select-none items-center rounded-md pr-8 pl-3 text-secondary text-fg-2 outline-none data-[highlighted]:bg-fill-3 data-[highlighted]:text-fg data-[state=checked]:text-fg"
              >
                <S.ItemText>{t(o.label)}</S.ItemText>
                <S.ItemIndicator className="absolute right-2.5">
                  <Check className="size-3.5 text-accent-fg" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
