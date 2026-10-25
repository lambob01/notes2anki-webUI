import { Link } from 'react-router-dom'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Badge, Button, Panel, StatusBadge } from '@/components/ui'
import { formatDateTime, formatRelativeTime, pluralize } from '@/lib/format'

export function HistoryTable({
  generations,
  onRerun,
  onDelete,
  rerunningId,
}: {
  generations: any[]
  onRerun: (generation: any) => void
  onDelete: (generation: any) => void
  rerunningId?: string | null
}) {
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="w-[116px] px-4 py-2.5 font-normal">
              <span className="eyebrow">Status</span>
            </th>
            <th className="px-4 py-2.5 font-normal">
              <span className="eyebrow">Generation</span>
            </th>
            <th className="w-[190px] px-4 py-2.5 font-normal">
              <span className="eyebrow">Model</span>
            </th>
            <th className="w-[82px] px-4 py-2.5 text-right font-normal">
              <span className="eyebrow">Cards</span>
            </th>
            <th className="w-[120px] px-4 py-2.5 text-right font-normal">
              <span className="eyebrow">Created</span>
            </th>
            <th className="w-[88px] px-3 py-2.5 font-normal">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {generations.map((generation: any) => {
            const active =
              generation.status === 'running' || generation.status === 'pending'
            return (
            <tr
              key={generation.id}
              className="group border-b border-line transition-colors last:border-0 hover:bg-raised/40"
            >
              <td className="px-4 py-3">
                <StatusBadge status={generation.status} />
              </td>
              <td className="min-w-0 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={`/review/${generation.id}`}
                    className="truncate text-[13px] font-medium text-ink hover:underline"
                  >
                    {generation.title || 'Untitled generation'}
                  </Link>
                  {generation.source_type === 'topic' ? (
                    <Badge className="shrink-0">Topic</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-faint">
                  {generation.deck_name || 'Default'} · {generation.card_count ?? 0}{' '}
                  {pluralize(generation.card_count ?? 0, 'card')}
                </p>
              </td>
              <td className="truncate px-4 py-3 font-mono text-[11px] text-muted">
                {generation.model_name}
              </td>
              <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-muted">
                {generation.card_count ?? 0}
              </td>
              <td
                className="px-4 py-3 text-right font-mono text-[10px] text-faint"
                title={formatDateTime(generation.created_at)}
              >
                {formatRelativeTime(generation.created_at)}
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    loading={rerunningId === generation.id}
                    onClick={() => onRerun(generation)}
                    disabled={active}
                    title={
                      active
                        ? 'Wait for this run to finish, or cancel it from Review'
                        : 'Run again'
                    }
                    aria-label={`Run ${generation.title} again`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(generation)}
                    disabled={active}
                    title={
                      active
                        ? 'Wait for this run to finish, or cancel it from Review'
                        : 'Delete'
                    }
                    aria-label={`Delete ${generation.title}`}
                    className="hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}
