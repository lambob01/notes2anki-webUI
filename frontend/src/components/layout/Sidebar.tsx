import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/cn'
import { isNavActive, NAV_ITEMS } from '@/lib/nav'
import { useTheme } from '@/lib/theme'
import { Kbd } from '@/components/ui'
import { Logo } from '@/components/layout/Logo'
import { ActiveRunChip } from '@/components/layout/ActiveRunChip'

export function Sidebar() {
  const pathname = useLocation().pathname
  const { theme, toggle } = useTheme()

  return (
    <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-line bg-panel">
      <Link
        to="/"
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4 transition-colors hover:bg-raised/50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised p-1.5">
          <Logo className="h-full w-full" />
        </span>
        <span className="min-w-0">
          <span className="block font-mono text-[13px] leading-none tracking-tight text-ink">
            notes2anki
          </span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
            lecture → anki
          </span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="eyebrow px-2 pb-2">Workspace</div>
        <div className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon, keys }) => {
            const active = isNavActive(pathname, href)
            return (
              <Link
                key={href}
                to={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
                  active
                    ? 'bg-raised text-ink'
                    : 'text-muted hover:bg-raised/60 hover:text-ink'
                )}
              >
                {active ? (
                  <span className="absolute left-0 top-1.5 h-6 w-px rounded-full bg-ink" />
                ) : null}
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{label}</span>
                <Kbd
                  className={cn(
                    'ml-auto opacity-0 transition-opacity group-hover:opacity-100',
                    active && 'opacity-100'
                  )}
                >
                  {keys}
                </Kbd>
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="space-y-2 border-t border-line p-3">
        <ActiveRunChip />
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[12px] text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <p className="px-2.5 font-mono text-[10px] text-faint">v0.1 · local</p>
      </div>
    </aside>
  )
}
