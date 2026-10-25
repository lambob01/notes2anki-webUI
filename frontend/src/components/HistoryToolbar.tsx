import { useRef } from 'react'
import { Search } from 'lucide-react'
import { Input, Select, Tabs } from '@/components/ui'
import { useHotkeys } from '@/hooks/useHotkeys'

export type HistoryStatus = 'all' | 'completed' | 'running' | 'failed' | 'cancelled'
export type HistorySort = 'newest' | 'oldest' | 'cards'

export function HistoryToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  counts,
  resultCount,
}: {
  search: string
  onSearchChange: (value: string) => void
  status: HistoryStatus
  onStatusChange: (value: HistoryStatus) => void
  sort: HistorySort
  onSortChange: (value: HistorySort) => void
  counts: Record<HistoryStatus, number>
  resultCount: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useHotkeys({ '/': () => inputRef.current?.focus() })

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3 shadow-panel">
      <div className="relative w-[280px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search generations…"
          aria-label="Search generations"
          className="pl-9"
        />
      </div>

      <Tabs
        ariaLabel="Filter by status"
        value={status}
        onChange={(value) => onStatusChange(value as HistoryStatus)}
        tabs={[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'completed', label: 'Done', count: counts.completed },
          { id: 'running', label: 'Active', count: counts.running },
          { id: 'failed', label: 'Failed', count: counts.failed },
          { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
        ]}
      />

      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
          {resultCount} shown
        </span>
        <Select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as HistorySort)}
          aria-label="Sort generations"
          wrapperClassName="w-[150px]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="cards">Most cards</option>
        </Select>
      </div>
    </div>
  )
}
