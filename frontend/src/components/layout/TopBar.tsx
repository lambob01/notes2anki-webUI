import { useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Kbd } from '@/components/ui'
import { routeTitle } from '@/lib/nav'

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = useLocation().pathname

  return (
    <header className="sticky top-0 z-30 h-12 shrink-0 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between px-8">
        <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
          <span className="text-muted">notes2anki</span>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{routeTitle(pathname)}</span>
        </div>

        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex h-7 items-center gap-2 rounded-md border border-line bg-panel px-2 text-[11px] text-faint transition-colors hover:border-line-strong hover:text-muted"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="pr-4">Search or jump to…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
    </header>
  )
}
