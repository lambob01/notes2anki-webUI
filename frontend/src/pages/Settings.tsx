import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { AnkiConnectPanel } from '@/components/AnkiConnectPanel'
import { anki, AnkiConnectError } from '@/lib/ankiconnect'
import { Plus, Trash2, RefreshCw, Check, X, Key, Globe, Server, Edit2, Loader2, ChevronDown } from 'lucide-react'

const PROVIDER_TYPES = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'groq', label: 'Groq' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)' },
]

// The content sources the app can produce for a card; the user maps each of
// their Anki note type's fields to one of these.
const SOURCES = [
  { id: '', label: '— not used —' },
  { id: 'prompt', label: 'Prompt (front)' },
  { id: 'answer', label: 'Answer (back)' },
  { id: 'formula', label: 'Formula' },
  { id: 'example question', label: 'Example Question' },
  { id: 'solution', label: 'Solution' },
  { id: 'topic', label: 'Topic' },
  { id: 'extra', label: 'Extra' },
  { id: 'image', label: 'Slide Image' },
]

// Aliases used to auto-suggest a mapping when fields are detected.
const SOURCE_HINTS: Record<string, string[]> = {
  prompt: ['prompt', 'question', 'front'],
  answer: ['answer', 'back'],
  formula: ['formula', 'equation'],
  'example question': ['example question', 'example', 'practice'],
  solution: ['solution', 'worked'],
  topic: ['topic', 'subject', 'tag'],
  extra: ['extra', 'notes', 'context'],
  image: ['image', 'picture', 'slide', 'diagram', 'photo', 'figure'],
}

function suggestSource(field: string): string | null {
  const lower = field.toLowerCase()
  for (const [source, aliases] of Object.entries(SOURCE_HINTS)) {
    if (aliases.some((a) => a === lower || lower.includes(a))) return source
  }
  return null
}

// LLM output fields derive from the mapped sources (slide image excluded);
// null means the user is editing fields manually instead.
function deriveFields(mapping: Record<string, string[]>) {
  const sources = ['prompt', 'answer', 'formula', 'example question', 'solution', 'topic', 'extra'].filter(
    (s) => Object.values(mapping).some((list) => list.includes(s))
  )
  if (!sources.length) return null
  return sources.map((s) => ({ name: s, label: s, visible: true }))
}

// Canonical mapping form is {anki field: [source, ...]}; accept the older
// single-source {source: field} shape saved before multi-source mapping.
function normalizeMapping(mapping: any): Record<string, string[]> {
  const norm: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(mapping || {})) {
    if (Array.isArray(value)) norm[key] = value as string[]
    else if (value) norm[value as string] = [key]
  }
  return norm
}

/**
 * A dropdown whose panel lists every source as a checkbox, so several can be
 * selected for one Anki field without a wall of checkboxes in the form.
 */
function MultiSourcePicker({
  field,
  selected,
  onToggle,
}: {
  field: string
  selected: string[]
  onToggle: (source: string) => void
}) {
  const [open, setOpen] = useState(false)
  const labels = selected
    .map((s) => SOURCES.find((x) => x.id === s)?.label)
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-2 py-1 border rounded text-sm ${
          selected.length
            ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200'
            : 'border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
        }`}
      >
        <span className="truncate">{selected.length ? labels : '— not used —'}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 max-h-64 overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
            {SOURCES.filter((s) => s.id).map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => onToggle(s.id)}
                  className="rounded"
                />
                {s.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: api.providers.list })
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: api.templates.list })
  const { data: defaults } = useQuery({ queryKey: ['templateDefaults'], queryFn: api.templates.defaults })

  const [showAddProvider, setShowAddProvider] = useState(false)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [newProvider, setNewProvider] = useState({ name: '', provider_type: 'openai', base_url: '', api_key: '' })
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    note_type: '',
    fields: defaults?.fields || [],
    css: defaults?.css || '',
    mapping: {} as Record<string, string[]>,
    ankiFields: [] as string[],
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [ankiNoteTypes, setAnkiNoteTypes] = useState<string[]>([])
  const [loadingNoteTypes, setLoadingNoteTypes] = useState(false)
  const [detectingFields, setDetectingFields] = useState(false)
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
      closeTemplateForm()
      toast.success('Template added')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      closeTemplateForm()
      toast.success('Template updated')
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

  const closeTemplateForm = () => {
    setShowTemplateForm(false)
    setEditingId(null)
    setAnkiNoteTypes([])
    setNewTemplate({
      name: '',
      note_type: '',
      fields: defaults?.fields || [],
      css: defaults?.css || '',
      mapping: {},
      ankiFields: [],
    })
  }

  const openTemplateForm = () => {
    closeTemplateForm()
    setShowTemplateForm(true)
  }

  const editTemplate = (t: any) => {
    setEditingId(t.id)
    setNewTemplate({
      name: t.name,
      note_type: t.note_type || '',
      fields: t.fields || [],
      css: t.css || defaults?.css || '',
      mapping: normalizeMapping(t.mapping),
      ankiFields: t.anki_fields || [],
    })
    setShowTemplateForm(true)
  }

  const loadNoteTypes = async () => {
    setLoadingNoteTypes(true)
    try {
      const names = await anki.modelNames()
      setAnkiNoteTypes(names)
      toast.success(`Found ${names.length} note type(s) in Anki`)
    } catch (e: any) {
      toast.error(e instanceof AnkiConnectError ? e.message : String(e), { duration: 8000 })
    }
    setLoadingNoteTypes(false)
  }

  const detectFields = async () => {
    const noteType = newTemplate.note_type.trim()
    if (!noteType) {
      toast.error('Enter your Anki note type name first')
      return
    }
    setDetectingFields(true)
    try {
      const fields = await anki.modelFieldNames(noteType)
      const mapping: Record<string, string[]> = {}
      for (const f of fields) {
        const source = suggestSource(f)
        if (source) mapping[f] = [source]
        else mapping[f] = []
      }
      setNewTemplate({ ...newTemplate, ankiFields: fields, mapping })
      toast.success(`Detected ${fields.length} field(s) from "${noteType}"`)
    } catch (e: any) {
      toast.error(e instanceof AnkiConnectError ? e.message : String(e), { duration: 8000 })
    }
    setDetectingFields(false)
  }

  const saveTemplate = () => {
    if (!newTemplate.name.trim()) {
      toast.error('Give the template a name')
      return
    }
    const derived = deriveFields(newTemplate.mapping)
    const mapping = Object.fromEntries(
      Object.entries(newTemplate.mapping).filter(([, sources]) => sources.length)
    )
    const payload = {
      name: newTemplate.name.trim(),
      note_type: newTemplate.note_type.trim() || 'Basic',
      fields: derived || newTemplate.fields,
      css: newTemplate.css,
      mapping: Object.keys(mapping).length ? mapping : null,
      ankiFields: newTemplate.ankiFields.length ? newTemplate.ankiFields : null,
    }
    if (editingId) updateTemplateMutation.mutate({ id: editingId, data: payload })
    else createTemplateMutation.mutate(payload)
  }

  const noteTypeOptions = [...(defaults?.note_types || []), ...ankiNoteTypes]

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500 mt-1 dark:text-gray-400">Configure API providers and card templates</p>
      </div>

      <AnkiConnectPanel />

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">API Providers</h2>
          <button
            onClick={() => setShowAddProvider(!showAddProvider)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Add Provider
          </button>
        </div>

        {showAddProvider && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3 dark:border-red-800 dark:bg-red-900/30">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
                <input
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="My OpenAI"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Provider</label>
                <select
                  value={newProvider.provider_type}
                  onChange={(e) => setNewProvider({ ...newProvider, provider_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Base URL (optional)</label>
                <input
                  value={newProvider.base_url}
                  onChange={(e) => setNewProvider({ ...newProvider, base_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Auto-detected from preset"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">API Key</label>
                <input
                  type="password"
                  value={newProvider.api_key}
                  onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="sk-..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddProvider(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => createProviderMutation.mutate(newProvider)}
                disabled={!newProvider.name}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(providers || []).map((p: any) => (
            <div key={p.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50">
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
                    <span className="text-amber-600 dark:text-amber-400">no API key</span>
                  ) : p.key_hint ? (
                    <span className="text-green-600 dark:text-green-400">key stored {p.key_hint}</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">
                      key unreadable — SECRET_KEY changed, re-enter it
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => testConnection(p)}
                  disabled={testingId === p.id}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded dark:hover:bg-red-900/30"
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
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded dark:hover:bg-red-900/30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {(!providers || providers.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4 dark:text-gray-500">
              No providers configured. Add one to get started.
            </p>
          )}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Card Templates</h2>
          <button
            onClick={openTemplateForm}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Plus className="w-4 h-4" /> Add Template
          </button>
        </div>

        {showTemplateForm && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3 dark:border-red-800 dark:bg-red-900/30">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {editingId ? 'Edit template' : 'New template'}
              </p>
              <button onClick={closeTemplateForm} className="p-1 text-gray-400 hover:text-gray-600 rounded dark:hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Name</label>
                <input
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="My Note Type"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Anki Note Type</label>
                <div className="flex gap-2">
                  <input
                    list="anki-note-types"
                    value={newTemplate.note_type}
                    onChange={(e) => setNewTemplate({ ...newTemplate, note_type: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Type your Anki note type name..."
                  />
                  <button
                    onClick={loadNoteTypes}
                    disabled={loadingNoteTypes}
                    title="Load note types from Anki"
                    className="px-2 py-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    {loadingNoteTypes ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <datalist id="anki-note-types">
                  {noteTypeOptions.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={detectFields}
                disabled={detectingFields || !newTemplate.note_type.trim()}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {detectingFields ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Detect fields from Anki
              </button>
              {newTemplate.ankiFields.length > 0 && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {newTemplate.ankiFields.length} field(s): {newTemplate.ankiFields.join(', ')}
                </span>
              )}
            </div>

            {newTemplate.ankiFields.length > 0 ? (
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Field mapping — what goes where in your card type
                </label>
                <div className="space-y-1.5 mt-1">
                  {newTemplate.ankiFields.map((f) => {
                    const selected = newTemplate.mapping[f] || []
                    const toggleSource = (source: string) => {
                      const mapping = { ...newTemplate.mapping }
                      const list = selected.includes(source)
                        ? selected.filter((s) => s !== source)
                        : [...selected, source]
                      if (list.length) mapping[f] = list
                      else delete mapping[f]
                      setNewTemplate({ ...newTemplate, mapping })
                    }
                    return (
                      <div key={f} className="flex items-center gap-2">
                        <span className="w-40 text-sm text-gray-700 truncate dark:text-gray-300">{f}</span>
                        <MultiSourcePicker
                          field={f}
                          selected={selected}
                          onToggle={toggleSource}
                        />
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Click a field to pick what it holds — a front field can take both "Prompt
                  (front)" and "Slide Image". The AI generates prompt, answer, formula,
                  example question, solution, topic and extra. If no field is mapped to
                  "Slide Image", the slide picture attaches to the back.
                </p>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Fields (manual mode — or detect from your Anki note type above)
                </label>
                {((Array.isArray(newTemplate.fields) ? newTemplate.fields : []) as any[]).map((f: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <input
                      value={f.name}
                      onChange={(e) => {
                        const updated = [...(newTemplate.fields || [])] as any[]
                        updated[i] = { ...updated[i], name: e.target.value }
                        setNewTemplate({ ...newTemplate, fields: updated })
                      }}
                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Field name"
                    />
                    <input
                      value={f.label}
                      onChange={(e) => {
                        const updated = [...(newTemplate.fields || [])] as any[]
                        updated[i] = { ...updated[i], label: e.target.value }
                        setNewTemplate({ ...newTemplate, fields: updated })
                      }}
                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Label"
                    />
                    <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
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
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">CSS</label>
              <textarea
                value={newTemplate.css}
                onChange={(e) => setNewTemplate({ ...newTemplate, css: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={closeTemplateForm} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg dark:text-gray-300 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                disabled={!newTemplate.name}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(templates || []).map((t: any) => (
            <div key={t.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50">
              <Server className="w-5 h-5 text-gray-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {t.name}
                  {t.is_default && <span className="text-xs text-red-500 ml-2 dark:text-red-400">(Default)</span>}
                </p>
                <p className="text-xs text-gray-400">
                  {t.note_type} &middot; {(t.fields || []).length} fields
                  {t.mapping && <span className="text-green-600 dark:text-green-400"> &middot; mapped</span>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => editTemplate(t)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded dark:hover:bg-red-900/30"
                  title="Edit template"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteTemplateMutation.mutate(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded dark:hover:bg-red-900/30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {(!templates || templates.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-4 dark:text-gray-500">No card templates. The defaults will be used.</p>
          )}
        </div>
      </section>
    </div>
  )
}
