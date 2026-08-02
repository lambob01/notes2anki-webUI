import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { AnkiConnectPanel } from '@/components/AnkiConnectPanel'
import { Plus, Trash2, RefreshCw, Check, X, Key, Globe, Server } from 'lucide-react'

const PROVIDER_TYPES = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'groq', label: 'Groq' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)' },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: api.providers.list })
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: api.templates.list })
  const { data: defaults } = useQuery({ queryKey: ['templateDefaults'], queryFn: api.templates.defaults })

  const [showAddProvider, setShowAddProvider] = useState(false)
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [newProvider, setNewProvider] = useState({ name: '', provider_type: 'openai', base_url: '', api_key: '' })
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    note_type: 'Basic',
    fields: defaults?.fields || [],
    css: defaults?.css || '',
  })
  const [testingId, setTestingId] = useState<string | null>(null)

  const createProviderMutation = useMutation({
    mutationFn: (data: any) => api.providers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      setShowAddProvider(false)
      setNewProvider({ name: '', provider_type: 'openai', base_url: '', api_key: '' })
      toast.success('Provider added')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteProviderMutation = useMutation({
    mutationFn: (id: string) => api.providers.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      toast.success('Provider removed')
    },
  })

  const testConnection = async (provider: any) => {
    setTestingId(provider.id)
    try {
      // The stored key is never sent to the browser, so the server tests it.
      const result = await api.providers.testSaved(provider.id)
      if (result.ok) toast.success('Connection successful')
      else toast.error(result.error || 'Connection failed')
    } catch (e: any) {
      toast.error(e.message)
    }
    setTestingId(null)
  }

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => api.templates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowAddTemplate(false)
      toast.success('Template added')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template removed')
    },
  })

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500 mt-1">Configure API providers and card templates</p>
      </div>

      <AnkiConnectPanel />

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">API Providers</h2>
          <button
            onClick={() => setShowAddProvider(!showAddProvider)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add Provider
          </button>
        </div>

        {showAddProvider && (
          <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Name</label>
                <input
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="My OpenAI"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Provider</label>
                <select
                  value={newProvider.provider_type}
                  onChange={(e) => setNewProvider({ ...newProvider, provider_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Base URL (optional)</label>
                <input
                  value={newProvider.base_url}
                  onChange={(e) => setNewProvider({ ...newProvider, base_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Auto-detected from preset"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">API Key</label>
                <input
                  type="password"
                  value={newProvider.api_key}
                  onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="sk-..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddProvider(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => createProviderMutation.mutate(newProvider)}
                disabled={!newProvider.name}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(providers || []).map((p: any) => (
            <div key={p.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
              <Globe className="w-5 h-5 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.provider_type} {p.base_url ? `— ${p.base_url}` : ''}
                </p>
                {/* The key itself is never sent to the browser - only whether
                    one is stored, plus a fragment to identify which. A stored
                    key with no hint means it failed to decrypt, which happens
                    when SECRET_KEY changed since it was saved. */}
                <p className="text-xs mt-0.5">
                  {!p.key_set ? (
                    <span className="text-amber-600">no API key</span>
                  ) : p.key_hint ? (
                    <span className="text-green-600">key stored {p.key_hint}</span>
                  ) : (
                    <span className="text-red-600">
                      key unreadable — SECRET_KEY changed, re-enter it
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => testConnection(p)}
                  disabled={testingId === p.id}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                  title="Test connection"
                >
                  {testingId === p.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => deleteProviderMutation.mutate(p.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {(!providers || providers.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">
              No providers configured. Add one to get started.
            </p>
          )}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Card Templates</h2>
          <button
            onClick={() => setShowAddTemplate(!showAddTemplate)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add Template
          </button>
        </div>

        {showAddTemplate && (
          <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Name</label>
                <input
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="My Note Type"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Note Type</label>
                <select
                  value={newTemplate.note_type}
                  onChange={(e) => setNewTemplate({ ...newTemplate, note_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {(defaults?.note_types || ['Basic', 'Cloze']).map((t: string) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Fields</label>
              {((Array.isArray(newTemplate.fields) ? newTemplate.fields : []) as any[]).map((f: any, i: number) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  <input
                    value={f.name}
                    onChange={(e) => {
                      const updated = [...(newTemplate.fields || [])] as any[]
                      updated[i] = { ...updated[i], name: e.target.value }
                      setNewTemplate({ ...newTemplate, fields: updated })
                    }}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="Field name"
                  />
                  <input
                    value={f.label}
                    onChange={(e) => {
                      const updated = [...(newTemplate.fields || [])] as any[]
                      updated[i] = { ...updated[i], label: e.target.value }
                      setNewTemplate({ ...newTemplate, fields: updated })
                    }}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="Label"
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={f.visible}
                      onChange={(e) => {
                        const updated = [...(newTemplate.fields || [])] as any[]
                        updated[i] = { ...updated[i], visible: e.target.checked }
                        setNewTemplate({ ...newTemplate, fields: updated })
                      }}
                    />
                    Visible
                  </label>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">CSS</label>
              <textarea
                value={newTemplate.css}
                onChange={(e) => setNewTemplate({ ...newTemplate, css: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddTemplate(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={() => createTemplateMutation.mutate(newTemplate)} disabled={!newTemplate.name} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(templates || []).map((t: any) => (
            <div key={t.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
              <Server className="w-5 h-5 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {t.name}
                  {t.is_default && <span className="text-xs text-indigo-500 ml-2">(Default)</span>}
                </p>
                <p className="text-xs text-gray-400">
                  {t.note_type} &middot; {(t.fields || []).length} fields
                </p>
              </div>
              <button onClick={() => deleteTemplateMutation.mutate(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {(!templates || templates.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4">No card templates. The defaults will be used.</p>
          )}
        </div>
      </section>
    </div>
  )
}
