import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, Sparkles } from 'lucide-react'
import { Badge, EmptyState, Panel, PanelHeader, Skeleton, StatusBadge } from '@/components/ui'
import { formatRelativeTime, pluralize } from '@/lib/format'

export function RecentRuns({
  generations,
  loading,
}: {
  generations: any[] | undefined
  loading: boolean
}) {
  const recent = (generations ?? []).slice(0, 3)

  return (
    <Panel>
      <PanelHeader
        title="Recent generations"
        description="Jump back into something you were reviewing."
        actions={
          <Link
            to="/history"
            className="inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ink"
          >
            View all
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      />
      {loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="p-4">
          <EmptyState
            compact
            icon={Sparkles}
            title="No generations yet"
            description="Your first run will appear here once you generate cards."
          />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((generation: any) => (
            <li key={generation.id}>
              <Link
                to={`/review/${generation.id}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/50"
              >
                <StatusBadge status={generation.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[13px] text-ink">
                      {generation.title || 'Untitled generation'}
                    </p>
                    {generation.source_type === 'topic' ? (
                      <Badge className="shrink-0">Topic</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">
                    {generation.card_count ?? 0}{' '}
                    {pluralize(generation.card_count ?? 0, 'card')} ·{' '}
                    {formatRelativeTime(generation.created_at)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-ink" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
