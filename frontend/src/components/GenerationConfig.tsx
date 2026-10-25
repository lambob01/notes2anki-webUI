import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui'
import { ModelCombobox } from '@/components/ModelCombobox'
import { cn } from '@/lib/cn'

const ENRICHMENT_PRESETS = [
  { key: 'explanations', label: 'Explanations', hint: 'Explain the why, not just the what' },
  { key: 'derivations', label: 'Derivations', hint: 'Step-by-step math for formulas' },
  { key: 'common_mistakes', label: 'Common mistakes', hint: 'Call out misconceptions' },
  {
    key: 'real_world_applications',
    label: 'Real-world uses',
    hint: 'Connect ideas to physical examples',
  },
] as const

type Mode = 'file' | 'text' | 'topic'

interface Props {
  mode: Mode
  providers: any[]
  templates: any[]
  config: any
  onChange: (config: any) => void
}

export function GenerationConfig({ mode, providers, templates, config, onChange }: Props) {
  const queryClient = useQueryClient()

  const { data: models } = useQuery({
    queryKey: ['models', config.provider_id],
    queryFn: () => api.providers.listModels(config.provider_id),
    enabled: !!config.provider_id,
  })

  const fetchModelsMutation = useMutation({
    mutationFn: () => api.providers.fetchModels(config.provider_id),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['models', config.provider_id] })
      toast.success(
        result?.added
          ? `Fetched ${result.added} new model${result.added === 1 ? '' : 's'}`
          : 'Model list is already up to date'
      )
    },
    onError: (error: any) => toast.error(error.message),
  })

  const addCustomModelMutation = useMutation({
    mutationFn: (model_id: string) =>
      api.providers.addCustomModel(config.provider_id, { model_id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['models', config.provider_id] }),
    // A duplicate name 400s; harmless, the model is already selected either way.
    onError: () => {},
  })

  const activeProviders = providers.filter((provider: any) => provider.is_active)
  const cardSpecs: string[] = config.card_specs || []

  const toggleCardSpec = (key: string) => {
    const next = cardSpecs.includes(key)
      ? cardSpecs.filter((item: string) => item !== key)
      : [...cardSpecs, key]
    onChange({ ...config, card_specs: next })
  }

  return (
    <div className="space-y-5 p-5">
      <div>
        <h2 className="text-[13px] font-medium text-ink">Generation settings</h2>
        <p className="mt-0.5 text-xs text-muted">
          {mode === 'topic'
            ? 'Choose the model, template, and how much depth to add.'
            : 'Choose where the cards come from.'}
        </p>
      </div>

      <Field
        label="API provider"
        hint={
          activeProviders.length === 0 ? (
            <Link to="/settings" className="text-ink underline decoration-line underline-offset-2">
              Add one
            </Link>
          ) : undefined
        }
      >
        <Select
          value={config.provider_id}
          onChange={(event) =>
            onChange({ ...config, provider_id: event.target.value, model_name: '' })
          }
        >
          <option value="">Select provider…</option>
          {activeProviders.map((provider: any) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Model"
        hint={
          config.provider_id ? (
            <button
              type="button"
              onClick={() => fetchModelsMutation.mutate()}
              disabled={fetchModelsMutation.isPending}
              className="inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              <RefreshCw
                className={cn('h-3 w-3', fetchModelsMutation.isPending && 'animate-spin')}
              />
              Fetch
            </button>
          ) : undefined
        }
      >
        <ModelCombobox
          models={models || []}
          value={config.model_name}
          onChange={(model_name) => onChange({ ...config, model_name })}
          onAddCustom={(model_id) => addCustomModelMutation.mutate(model_id)}
          disabled={!config.provider_id}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Template">
          <Select
            value={config.template_id}
            onChange={(event) => onChange({ ...config, template_id: event.target.value })}
          >
            <option value="">Select…</option>
            {templates.map((template: any) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Deck">
          <Input
            value={config.deck_name}
            onChange={(event) => onChange({ ...config, deck_name: event.target.value })}
            placeholder="Default"
          />
        </Field>
      </div>

      <Field label="Subject context" hint="optional">
        <Input
          value={config.subject_context}
          onChange={(event) => onChange({ ...config, subject_context: event.target.value })}
          placeholder="e.g. Biology 101"
        />
      </Field>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="eyebrow">Enrichment</span>
          <span className="text-[11px] text-faint">optional</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ENRICHMENT_PRESETS.map((preset) => {
            const active = cardSpecs.includes(preset.key)
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCardSpec(preset.key)}
                className={cn(
                  'rounded-md border p-2.5 text-left transition-colors',
                  active
                    ? 'border-line-strong bg-raised text-ink'
                    : 'border-line bg-panel text-muted hover:border-line-strong hover:text-ink'
                )}
              >
                <span className="flex items-center gap-1.5 text-[12px] font-medium">
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 items-center justify-center rounded-sm border',
                      active ? 'border-ink bg-ink text-canvas' : 'border-line-strong'
                    )}
                  >
                    {active ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                  </span>
                  {preset.label}
                </span>
                <span className="mt-1 block pl-5 text-[10px] leading-snug text-faint">
                  {preset.hint}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {mode === 'topic'
            ? "Added depth goes in the template's answer field."
            : 'Added depth goes in the template\'s answer field and is marked "not in slides".'}
        </p>
      </div>

      <Field label="Additional instructions" hint="optional">
        <Textarea
          value={config.custom_prompt}
          onChange={(event) => onChange({ ...config, custom_prompt: event.target.value })}
          rows={2}
          placeholder={
            mode === 'topic'
              ? 'e.g. focus on boundary-layer separation, at undergraduate level'
              : 'e.g. connect each formula to the physical meaning of each term'
          }
        />
      </Field>

      {mode === 'file' ? (
        <>
          <div className="rounded-md border border-line bg-canvas/40">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div>
                <p className="text-[12px] text-ink">Reprocess processed slides</p>
                <p className="mt-0.5 text-[10px] text-faint">
                  Re-run slides this file has already generated before.
                </p>
              </div>
              <Switch
                checked={!!config.force}
                onChange={(force) => onChange({ ...config, force })}
                label="Reprocess processed slides"
              />
            </div>
          </div>

          <details className="group rounded-md border border-line bg-canvas/40">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[12px] text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
              Advanced
              <span className="font-mono text-[10px] text-faint group-open:hidden">OPEN</span>
              <span className="hidden font-mono text-[10px] text-faint group-open:inline">
                CLOSE
              </span>
            </summary>
            <div className="space-y-4 border-t border-line px-3 py-3">
              <label className="block">
                <span className="mb-1 flex items-baseline justify-between">
                  <span className="eyebrow">Render DPI</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted">
                    {config.dpi}
                  </span>
                </span>
                <input
                  type="range"
                  min={72}
                  max={300}
                  step={10}
                  value={config.dpi}
                  onChange={(event) =>
                    onChange({ ...config, dpi: parseInt(event.target.value, 10) })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-ink"
                />
              </label>
              <label className="block">
                <span className="mb-1 flex items-baseline justify-between">
                  <span className="eyebrow">Parallel workers</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted">
                    {config.max_workers}
                  </span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={config.max_workers}
                  onChange={(event) =>
                    onChange({ ...config, max_workers: parseInt(event.target.value, 10) })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-ink"
                />
              </label>
            </div>
          </details>
        </>
      ) : null}

    </div>
  )
}
