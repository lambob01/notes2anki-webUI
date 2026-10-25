import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useActiveGeneration } from '@/hooks/useActiveGeneration'

export function ActiveRunChip() {
  const { active, activeCount } = useActiveGeneration()
  if (!active) return null

  const total = active.total_slides || 0
  const completed = active.completed_slides || 0
  const writing = active.phase === 'writing'
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <Link
      to={`/review/${active.id}`}
      className="block rounded-md border border-line bg-raised px-2.5 py-2 transition-colors hover:border-line-strong"
    >
      <div className="flex items-center gap-2 text-[11px] font-medium text-ink">
        <Loader2 className="h-3 w-3 animate-spin text-muted" />
        {writing ? 'Writing cards' : 'Generating'}
        {activeCount > 1 ? (
          <span className="ml-auto font-mono text-[10px] text-faint">
            +{activeCount - 1}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted">
        {active.title || 'Untitled generation'}
      </p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
        {total > 0 ? (
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-[progressSlide_1.4s_ease-in-out_infinite] rounded-full bg-ink/50" />
        )}
      </div>
      <p className="mt-1 font-mono text-[10px] tabular-nums text-faint">
        {total > 0 ? `${completed}/${total} slides` : writing ? 'topic mode' : 'preparing'} ·{' '}
        {active.cards_generated || 0} cards
      </p>
    </Link>
  )
}
