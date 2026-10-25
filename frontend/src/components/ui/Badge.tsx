import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'border-line bg-raised text-muted',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  danger: 'border-danger/20 bg-danger/10 text-danger',
}

export function Badge({
  tone = 'neutral',
  dot,
  className,
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        tones[tone],
        className
      )}
    >
      {dot ? <span className="h-1 w-1 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

const STATUS_TONES: Record<string, BadgeTone> = {
  completed: 'success',
  failed: 'danger',
  cancelled: 'warning',
  running: 'neutral',
  pending: 'neutral',
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  running: 'Running',
  pending: 'Pending',
}

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral'
  const label = STATUS_LABELS[status] ?? status
  const active = status === 'running' || status === 'pending'
  return (
    <Badge tone={tone} dot={!active}>
      {active ? (
        <Loader2 className={cn('h-2.5 w-2.5', status === 'running' && 'animate-spin')} />
      ) : null}
      {label}
    </Badge>
  )
}
