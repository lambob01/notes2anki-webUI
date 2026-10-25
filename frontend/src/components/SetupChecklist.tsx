import { Link } from 'react-router-dom'
import { Check, ChevronRight, X, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAnkiStatus } from '@/hooks/useAnkiStatus'
import { Badge } from '@/components/ui'

interface Props {
  providers: any[]
  templates: any[]
  onDismiss: () => void
}

export function SetupChecklist({ providers, templates, onDismiss }: Props) {
  const { status: anki } = useAnkiStatus()

  const steps = [
    {
      id: 'provider',
      label: 'Add an active API provider',
      description: 'Connect OpenAI, Anthropic, Gemini, or a local runtime, then switch it on.',
      done: providers.some((provider: any) => provider.is_active),
      href: '/settings?tab=providers',
    },
    {
      id: 'model',
      label: 'Choose a model',
      description: 'Fetch the provider model list, or type a model name directly.',
      done: providers.some(
        (provider: any) => provider.is_active && (provider.models || []).length > 0
      ),
      href: '/settings?tab=providers',
    },
    {
      id: 'template',
      label: 'Pick a card template',
      description: 'Templates decide which fields the model produces.',
      done: templates.length > 0,
      href: '/settings?tab=templates',
    },
    {
      id: 'anki',
      label: 'Connect Anki',
      description: 'Optional. Export a .apkg instead if you prefer.',
      done: anki.ok,
      href: '/settings?tab=anki',
    },
  ]

  const done = steps.filter((step) => step.done).length
  const pct = Math.round((done / steps.length) * 100)

  return (
    <section className="rounded-lg border border-line bg-panel shadow-panel">
      <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-muted" />
            <h2 className="text-[13px] font-medium text-ink">Finish setup</h2>
            <Badge>{done}/{steps.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            A few one-time steps before your first run.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss setup checklist"
          className="rounded-md p-1 text-faint transition-colors hover:bg-raised hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-0.5 bg-line">
        <div
          className="h-full bg-ink transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="divide-y divide-line">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]',
                step.done
                  ? 'border-ink bg-ink text-canvas'
                  : 'border-line bg-raised text-faint'
              )}
            >
              {step.done ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-[13px]', step.done ? 'text-muted' : 'text-ink')}>
                {step.label}
              </p>
              <p className="truncate text-[11px] text-faint">{step.description}</p>
            </div>
            {step.done ? (
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-faint">
                done
              </span>
            ) : (
              <Link
                to={step.href}
                className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted transition-colors hover:text-ink"
              >
                Configure
                <ChevronRight className="h-3 w-3" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
