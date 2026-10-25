import { Check, Info, Moon, Shield, Sun } from 'lucide-react'
import { Badge, Panel, PanelHeader } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useTheme, type Theme } from '@/lib/theme'

const THEMES: Array<{
  id: Theme
  label: string
  description: string
  icon: typeof Moon
}> = [
  {
    id: 'dark',
    label: 'Dark',
    description: 'Near-black canvas with monochrome panels.',
    icon: Moon,
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Paper-white canvas with the same quiet hierarchy.',
    icon: Sun,
  },
]

export function AppearanceTab() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Appearance"
          description="Dark is the default identity. Your choice is saved in this browser."
        />
        <div className="grid grid-cols-2 gap-3 p-4">
          {THEMES.map(({ id, label, description, icon: Icon }) => {
            const active = theme === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                aria-pressed={active}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  active
                    ? 'border-line-strong bg-raised'
                    : 'border-line bg-panel hover:border-line-strong hover:bg-raised/40'
                )}
              >
                <div
                  className={cn(
                    'mb-3 flex h-20 flex-col justify-between rounded-md border border-line p-2.5',
                    id === 'dark' ? 'bg-[#08080a]' : 'bg-[#fafafa]'
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-1.5 w-10 rounded-full',
                        id === 'dark' ? 'bg-[#ededed]' : 'bg-[#111113]'
                      )}
                    />
                    <span
                      className={cn(
                        'h-1.5 w-5 rounded-full',
                        id === 'dark' ? 'bg-[#38383d]' : 'bg-[#d4d4d8]'
                      )}
                    />
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span
                      className={cn(
                        'h-8 w-6 rounded-sm border',
                        id === 'dark'
                          ? 'border-[#26262a] bg-[#0f0f11]'
                          : 'border-[#e4e4e7] bg-white'
                      )}
                    />
                    <span
                      className={cn(
                        'h-6 flex-1 rounded-sm border',
                        id === 'dark'
                          ? 'border-[#26262a] bg-[#0f0f11]'
                          : 'border-[#e4e4e7] bg-white'
                      )}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted" />
                  <span className="text-[13px] font-medium text-ink">{label}</span>
                  {active ? (
                    <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-ink text-canvas">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-faint">{description}</p>
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="About" description="A self-hosted lecture-to-flashcard tool." />
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-ink">notes2anki v0.1</span>
            <Badge>local</Badge>
            <Badge tone="success">no telemetry</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[12px] leading-relaxed text-muted">
            <div className="flex gap-2.5 rounded-md border border-line bg-canvas/40 p-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              <p>
                FastAPI + SQLite backend, React SPA, two LLM adapters. Providers,
                templates, generations, and cards live in the local database.
              </p>
            </div>
            <div className="flex gap-2.5 rounded-md border border-line bg-canvas/40 p-3">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              <p>
                There is no authentication. Keep the container bound to
                <span className="font-mono text-ink"> 127.0.0.1</span> and do not expose
                it to an untrusted network.
              </p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
