import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { RefreshCw } from 'lucide-react'
import { ModelCombobox } from '@/components/ModelCombobox'

interface Props {
  providers: any[]
  templates: any[]
  config: any
  onChange: (config: any) => void
}

export function GenerationConfig({ providers, templates, config, onChange }: Props) {
  const queryClient = useQueryClient()
  const selectedProvider = providers.find((p: any) => p.id === config.provider_id)

  const { data: models } = useQuery({
    queryKey: ['models', config.provider_id],
    queryFn: () => api.providers.listModels(config.provider_id),
    enabled: !!config.provider_id,
  })

  const fetchModelsMutation = useMutation({
    mutationFn: () => api.providers.fetchModels(config.provider_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models', config.provider_id] }),
  })

  const addCustomModelMutation = useMutation({
    mutationFn: (model_id: string) =>
      api.providers.addCustomModel(config.provider_id, { model_id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['models', config.provider_id] }),
    // A duplicate name 400s; harmless, the model is already selected either way.
    onError: () => {},
  })

  const activeProviders = providers.filter((p: any) => p.is_active)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <h3 className="font-semibold text-gray-700">Generation Settings</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">API Provider</label>
          <select
            value={config.provider_id}
            onChange={(e) => onChange({ ...config, provider_id: e.target.value, model_name: '' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select provider...</option>
            {activeProviders.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-500">Model</label>
            {config.provider_id && (
              <button
                onClick={() => fetchModelsMutation.mutate()}
                disabled={fetchModelsMutation.isPending}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${fetchModelsMutation.isPending ? 'animate-spin' : ''}`} />
                Fetch
              </button>
            )}
          </div>
          <ModelCombobox
            models={models || []}
            value={config.model_name}
            onChange={(model_name) => onChange({ ...config, model_name })}
            // Persist hand-typed names so they're in the list next time.
            onAddCustom={(model_id) => addCustomModelMutation.mutate(model_id)}
            disabled={!config.provider_id}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Card Template</label>
          <select
            value={config.template_id}
            onChange={(e) => onChange({ ...config, template_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select template...</option>
            {templates.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name} ({t.note_type})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Deck Name</label>
          <input
            type="text"
            value={config.deck_name}
            onChange={(e) => onChange({ ...config, deck_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Default"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Subject Context</label>
          <input
            type="text"
            value={config.subject_context}
            onChange={(e) => onChange({ ...config, subject_context: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="e.g. Biology 101"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={!!config.force}
              onChange={(e) => onChange({ ...config, force: e.target.checked })}
              className="rounded"
            />
            Re-process already processed slides
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Custom Prompt (optional)
        </label>
        <textarea
          value={config.custom_prompt}
          onChange={(e) => onChange({ ...config, custom_prompt: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
          placeholder="Custom system prompt for the AI..."
        />
      </div>

      <details className="text-sm">
        <summary className="text-gray-500 cursor-pointer">Advanced</summary>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">DPI: {config.dpi}</label>
            <input
              type="range"
              min={72}
              max={300}
              step={10}
              value={config.dpi}
              onChange={(e) => onChange({ ...config, dpi: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Parallel Workers: {config.max_workers}
            </label>
            <input
              type="range"
              min={1}
              max={8}
              value={config.max_workers}
              onChange={(e) => onChange({ ...config, max_workers: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </details>
    </div>
  )
}
