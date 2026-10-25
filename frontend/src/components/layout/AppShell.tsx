import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useActiveGeneration } from '@/hooks/useActiveGeneration'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useHotkeys } from '@/hooks/useHotkeys'
import { routeTitle } from '@/lib/nav'
import { CommandPalette } from '@/components/CommandPalette'
import { ShortcutsDialog } from '@/components/ShortcutsDialog'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const { active } = useActiveGeneration()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useHotkeys({
    'mod k': () => setPaletteOpen(true),
    '?': () => setShortcutsOpen(true),
    n: () => navigate('/'),
    'g d': () => navigate('/'),
    'g h': () => navigate('/history'),
    'g s': () => navigate('/settings'),
  })

  const title = active
    ? `Generating · ${active.completed_slides}/${active.total_slides || '—'}`
    : routeTitle(pathname)
  useDocumentTitle(`${title} · notes2anki`)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-8">
          <div key={pathname} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
