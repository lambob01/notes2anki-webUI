import { Dialog, Kbd } from '@/components/ui'

const GROUPS: Array<{ title: string; rows: Array<{ label: string; keys: string[] }> }> = [
  {
    title: 'General',
    rows: [
      { label: 'Command palette', keys: ['⌘', 'K'] },
      { label: 'Shortcut reference', keys: ['?'] },
      { label: 'New generation', keys: ['N'] },
      { label: 'Focus search', keys: ['/'] },
      { label: 'Close overlay', keys: ['Esc'] },
    ],
  },
  {
    title: 'Navigate',
    rows: [
      { label: 'New generation', keys: ['G', 'D'] },
      { label: 'History', keys: ['G', 'H'] },
      { label: 'Settings', keys: ['G', 'S'] },
    ],
  },
  {
    title: 'Review',
    rows: [
      { label: 'Previous / next card', keys: ['J', 'K'] },
      { label: 'Toggle selection in viewer', keys: ['X'] },
      { label: 'Save inline edit', keys: ['⌘', 'Enter'] },
    ],
  },
]

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="Move through the app without leaving the keyboard."
      width="md"
    >
      <div className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="eyebrow mb-2">{group.title}</h3>
            <div className="divide-y divide-line rounded-md border border-line">
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 px-3 py-2 text-[13px] text-muted"
                >
                  <span>{row.label}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
