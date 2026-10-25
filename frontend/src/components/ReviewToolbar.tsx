import { useRef, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Button, Input, Panel, Tabs } from '@/components/ui'
import { useHotkeys } from '@/hooks/useHotkeys'

export type CardFilter = 'all' | 'selected' | 'unselected'

export function ReviewToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  counts,
  selectedCount,
  totalCount,
  visibleCount,
  allVisibleSelected,
  onToggleSelectVisible,
  actions,
}: {
  search: string
  onSearchChange: (value: string) => void
  filter: CardFilter
  onFilterChange: (value: CardFilter) => void
  counts: Record<CardFilter, number>
  selectedCount: number
  totalCount: number
  visibleCount: number
  allVisibleSelected: boolean
  onToggleSelectVisible: () => void
  actions: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useHotkeys({ '/': () => inputRef.current?.focus() })

  return (
    <Panel className="sticky top-12 z-20 flex flex-wrap items-center gap-2 bg-panel/95 p-2.5 backdrop-blur">
      <div className="relative w-[220px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search cards…"
          aria-label="Search cards"
          className="h-8 pl-9 text-xs"
        />
      </div>

      <Tabs
        ariaLabel="Filter cards"
        value={filter}
        onChange={(value) => onFilterChange(value as CardFilter)}
        tabs={[
          { id: 'all', label: 'All', count: counts.all },
          { id: 'selected', label: 'Selected', count: counts.selected },
          { id: 'unselected', label: 'Unselected', count: counts.unselected },
        ]}
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleSelectVisible}
        disabled={visibleCount === 0}
      >
        {allVisibleSelected ? 'Deselect visible' : 'Select visible'}
      </Button>

      <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
        {selectedCount}/{totalCount} selected
      </span>

      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </Panel>
  )
}
