import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock,
  CornerDownLeft,
  Keyboard,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { Dialog, Kbd } from '@/components/ui'
import { useGenerations } from '@/hooks/useActiveGeneration'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/cn'

interface Command {
  id: string
  label: string
  group: string
  icon: LucideIcon
  hint?: string
  meta?: string
  run: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  onShowShortcuts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onShowShortcuts: () => void
}) {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { data: generations } = useGenerations()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const navigation: Command[] = [
      {
        id: 'new',
        label: 'New generation',
        group: 'Navigation',
        icon: Sparkles,
        hint: 'G D',
        run: () => navigate('/'),
      },
      {
        id: 'history',
        label: 'Open history',
        group: 'Navigation',
        icon: Clock,
        hint: 'G H',
        run: () => navigate('/history'),
      },
      {
        id: 'settings',
        label: 'Open settings',
        group: 'Navigation',
        icon: Settings,
        hint: 'G S',
        run: () => navigate('/settings'),
      },
    ]

    const actions: Command[] = [
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Actions',
        icon: Keyboard,
        hint: '?',
        run: onShowShortcuts,
      },
      {
        id: 'theme',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`,
        group: 'Actions',
        icon: theme === 'dark' ? Sun : Moon,
        run: toggle,
      },
    ]

    const recent: Command[] = (generations ?? []).slice(0, 5).map((generation: any) => ({
      id: `generation-${generation.id}`,
      label: generation.title || 'Untitled generation',
      group: 'Recent generations',
      icon: Clock,
      meta: `${generation.card_count ?? 0} cards · ${generation.status}`,
      run: () => navigate(`/review/${generation.id}`),
    }))

    return [...navigation, ...actions, ...recent]
  }, [generations, navigate, onShowShortcuts, theme, toggle])

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return commands
    return commands.filter((command) =>
      `${command.label} ${command.meta ?? ''}`.toLowerCase().includes(search)
    )
  }, [commands, query])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  const execute = (command: Command | undefined) => {
    if (!command) return
    onOpenChange(false)
    window.setTimeout(() => command.run(), 0)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) =>
        filtered.length ? (current + 1) % filtered.length : 0
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) =>
        filtered.length ? (current - 1 + filtered.length) % filtered.length : 0
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      execute(filtered[highlight])
    }
  }

  let currentGroup = ''

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      showHeader={false}
      width="lg"
      className="max-w-xl overflow-hidden"
      bodyClassName="p-0"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-faint" />
        <input
          data-autofocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command or search generations…"
          aria-label="Search commands"
          className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
        />
        <Kbd>ESC</Kbd>
      </div>

      <div className="max-h-[min(420px,58vh)] overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-faint">
            No commands or generations match “{query}”.
          </p>
        ) : (
          filtered.map((command, index) => {
            const showGroup = command.group !== currentGroup
            currentGroup = command.group
            const Icon = command.icon
            return (
              <div key={command.id}>
                {showGroup ? (
                  <div className="eyebrow px-4 pb-1 pt-3">{command.group}</div>
                ) : null}
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => execute(command)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors',
                    index === highlight ? 'bg-raised' : 'hover:bg-raised/60'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {command.label}
                  </span>
                  {command.meta ? (
                    <span className="shrink-0 font-mono text-[10px] text-faint">
                      {command.meta}
                    </span>
                  ) : null}
                  {command.hint ? <Kbd>{command.hint}</Kbd> : null}
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-2 font-mono text-[10px] text-faint">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>
            <CornerDownLeft className="h-2.5 w-2.5" />
          </Kbd>
          run
        </span>
        <span className="ml-auto">notes2anki</span>
      </div>
    </Dialog>
  )
}
