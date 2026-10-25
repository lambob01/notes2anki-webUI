import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: string
  icon?: LucideIcon
  count?: ReactNode
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-line bg-panel p-1',
        className
      )}
    >
      {tabs.map(({ id, label, icon: Icon, count }) => {
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
              active
                ? 'bg-raised text-ink'
                : 'text-faint hover:bg-raised/60 hover:text-ink'
            )}
          >
            {Icon ? <Icon className="h-3 w-3" /> : null}
            {label}
            {count != null ? (
              <span className={cn('tabular-nums', active ? 'text-muted' : 'text-faint')}>
                {count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
