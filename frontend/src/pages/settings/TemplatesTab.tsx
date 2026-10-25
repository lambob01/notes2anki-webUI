import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ChevronDown,
  Copy,
  Eye,
  LayoutTemplate,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { anki, AnkiConnectError } from '@/lib/ankiconnect'
import { api } from '@/lib/api'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Panel,
  PanelHeader,
  Textarea,
} from '@/components/ui'
import { TemplatePreview } from '@/components/TemplatePreview'

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
    if (aliases.some((alias) => alias === lower || lower.includes(alias))) return source
  }
  return null
}

function deriveFields(mapping: Record<string, string[]>) {
  const sources = ['prompt', 'answer', 'formula', 'example question', 'solution', 'topic', 'extra'].filter(
    (source) => Object.values(mapping).some((list) => list.includes(source))
  )
  if (!sources.length) return null
  return sources.map((source) => ({ name: source, label: source, visible: true }))
}

function normalizeMapping(mapping: any): Record<string, string[]> {
  const normalized: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(mapping || {})) {
    if (Array.isArray(value)) normalized[key] = value as string[]
    else if (value) normalized[value as string] = [key]
  }
  return normalized
}

interface TemplateForm {
  name: string
  note_type: string
  fields: any[]
  css: string
  mapping: Record<string, string[]>
  ankiFields: string[]
}

const EMPTY_FORM: TemplateForm = {
  name: '',
  note_type: '',
  fields: [],
  css: '',
  mapping: {},
  ankiFields: [],
}

function MultiSourcePicker({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (source: string) => void
}) {
  const [open, setOpen] = useState(false)
  const labels = selected
    .map((source) => SOURCES.find((item) => item.id === source)?.label)
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={
          selected.length
            ? 'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-raised px-2.5 text-left text-[12px] text-ink'
            : 'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-line bg-panel px-2.5 text-left text-[12px] text-faint hover:border-line-strong'
        }
      >
        <span className="truncate">{selected.length ? labels : '— not used —'}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-line bg-panel p-1.5 shadow-lift animate-rise-in">
            {SOURCES.filter((source) => source.id).map((source) => (
              <label
                key={source.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12px] text-muted hover:bg-raised hover:text-ink"
              >
                <Checkbox
                  checked={selected.includes(source.id)}
                  onChange={() => onToggle(source.id)}
                />
                {source.label}
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function TemplatesTab() {
  const queryClient = useQueryClient()
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })
  const { data: defaults } = useQuery({
    queryKey: ['templateDefaults'],
    queryFn: api.templates.defaults,
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM)
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [ankiNoteTypes, setAnkiNoteTypes] = useState<string[]>([])
  const [loadingNoteTypes, setLoadingNoteTypes] = useState(false)
  const [detectingFields, setDetectingFields] = useState(false)

  // The defaults query can resolve after the user opens the form; fill an empty
  // new form when it does so the fields/CSS are not left blank.
  useEffect(() => {
    if (!formOpen || editingId || !defaults) return
    setForm((current) => {
      if (current.fields.length > 0) return current
      return {
        ...current,
        fields: defaults.fields || [],
        css: current.css || defaults.css || '',
      }
    })
  }, [defaults, editingId, formOpen])

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setAnkiNoteTypes([])
  }

  const openNew = () => {
    closeForm()
    setForm({
      ...EMPTY_FORM,
      fields: defaults?.fields || [],
      css: defaults?.css || '',
    })
    setFormOpen(true)
  }

  const editTemplate = (template: any) => {
    setEditingId(template.id)
    setForm({
      name: template.name,
      note_type: template.note_type || '',
      fields: template.fields || [],
      css: template.css || defaults?.css || '',
      mapping: normalizeMapping(template.mapping),
      ankiFields: template.anki_fields || [],
    })
    setFormOpen(true)
  }

  const duplicateTemplate = (template: any) => {
    closeForm()
    setForm({
      name: `${template.name} copy`,
      note_type: template.note_type || '',
      fields: template.fields || [],
      css: template.css || defaults?.css || '',
      mapping: normalizeMapping(template.mapping),
      ankiFields: template.anki_fields || [],
    })
    setFormOpen(true)
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] })

  const createTemplate = useMutation({
    mutationFn: (data: any) => api.templates.create(data),
    onSuccess: () => {
      invalidate()
      closeForm()
      toast.success('Template added')
    },
    onError: (error: any) => toast.error(error.message),
  })

  const updateTemplate = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.templates.update(id, data),
    onSuccess: () => {
      invalidate()
      closeForm()
      toast.success('Template updated')
    },
    onError: (error: any) => toast.error(error.message),
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.templates.delete(id),
    onSuccess: () => {
      invalidate()
      setDeleteTarget(null)
      toast.success('Template removed')
    },
    onError: (error: any) => toast.error(error.message),
  })

  const setDefault = useMutation({
    mutationFn: (id: string) => api.templates.update(id, { is_default: true }),
    onSuccess: () => {
      invalidate()
      toast.success('Default template updated')
    },
    onError: (error: any) => toast.error(error.message),
  })

  const loadNoteTypes = async () => {
    setLoadingNoteTypes(true)
    try {
      const names = await anki.modelNames()
      setAnkiNoteTypes(names)
      toast.success(`Found ${names.length} note type(s) in Anki`)
    } catch (error: any) {
      toast.error(error instanceof AnkiConnectError ? error.message : String(error), {
        duration: 8000,
      })
    }
    setLoadingNoteTypes(false)
  }

  const detectFields = async () => {
    const noteType = form.note_type.trim()
    if (!noteType) {
      toast.error('Enter your Anki note type name first')
      return
    }
    setDetectingFields(true)
    try {
      const fields = await anki.modelFieldNames(noteType)
      const mapping: Record<string, string[]> = {}
      for (const field of fields) {
        const source = suggestSource(field)
        mapping[field] = source ? [source] : []
      }
      setForm({ ...form, ankiFields: fields, mapping })
      toast.success(`Detected ${fields.length} field(s) from "${noteType}"`)
    } catch (error: any) {
      toast.error(error instanceof AnkiConnectError ? error.message : String(error), {
        duration: 8000,
      })
    }
    setDetectingFields(false)
  }

  const saveTemplate = () => {
    if (!form.name.trim()) {
      toast.error('Give the template a name')
      return
    }
    const derived = deriveFields(form.mapping)
    const mapping = Object.fromEntries(
      Object.entries(form.mapping).filter(([, sources]) => sources.length)
    )
    const payload = {
      name: form.name.trim(),
      note_type: form.note_type.trim() || 'Basic',
      fields: derived || form.fields,
      css: form.css,
      mapping: Object.keys(mapping).length ? mapping : null,
      ankiFields: form.ankiFields.length ? form.ankiFields : null,
    }
    if (editingId) updateTemplate.mutate({ id: editingId, data: payload })
    else createTemplate.mutate(payload)
  }

  const openFormPreview = () => {
    setPreviewTemplate({
      name: form.name || 'Untitled template',
      note_type: form.note_type || 'Basic',
      fields: deriveFields(form.mapping) || form.fields,
      css: form.css,
      mapping: form.mapping,
      ankiFields: form.ankiFields,
    })
  }

  const noteTypeOptions = [...(defaults?.note_types || []), ...ankiNoteTypes]
  const list = templates ?? []

  return (
    <div className="space-y-4">
      {formOpen ? (
        <Panel>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-ink">
                {editingId ? 'Edit template' : 'New template'}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Fields define both the model output and the Anki note type.
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close template form"
              className="rounded-md p-1 text-faint transition-colors hover:bg-raised hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="My note type"
                  />
                </Field>
                <Field label="Anki note type">
                  <div className="flex gap-2">
                    <Input
                      list="anki-note-types"
                      value={form.note_type}
                      onChange={(event) =>
                        setForm({ ...form, note_type: event.target.value })
                      }
                      placeholder="Basic"
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={loadNoteTypes}
                      loading={loadingNoteTypes}
                      title="Load note types from Anki"
                      aria-label="Load note types from Anki"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <datalist id="anki-note-types">
                    {noteTypeOptions.map((noteType) => (
                      <option key={noteType} value={noteType} />
                    ))}
                  </datalist>
                </Field>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={detectFields}
                  loading={detectingFields}
                  disabled={!form.note_type.trim()}
                >
                  {!detectingFields ? <RefreshCw className="h-3.5 w-3.5" /> : null}
                  Detect fields from Anki
                </Button>
                {form.ankiFields.length > 0 ? (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                    {form.ankiFields.length} fields detected
                  </span>
                ) : null}
              </div>

              {form.ankiFields.length > 0 ? (
                <div>
                  <p className="eyebrow mb-2">Field mapping</p>
                  <div className="space-y-1.5">
                    {form.ankiFields.map((field) => {
                      const selected = form.mapping[field] || []
                      const toggleSource = (source: string) => {
                        const mapping = { ...form.mapping }
                        const list = selected.includes(source)
                          ? selected.filter((item) => item !== source)
                          : [...selected, source]
                        if (list.length) mapping[field] = list
                        else delete mapping[field]
                        setForm({ ...form, mapping })
                      }
                      return (
                        <div key={field} className="flex items-center gap-2">
                          <span className="w-36 truncate font-mono text-[11px] text-muted">
                            {field}
                          </span>
                          <MultiSourcePicker
                            selected={selected}
                            onToggle={toggleSource}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-faint">
                    A field can combine several sources. If no field takes the slide
                    image, it attaches to the back.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="eyebrow">Fields</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm({
                          ...form,
                          fields: [...form.fields, { name: '', label: '', visible: true }],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add field
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    {form.fields.map((field: any, index: number) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={field.name}
                          onChange={(event) => {
                            const fields = [...form.fields]
                            fields[index] = { ...fields[index], name: event.target.value }
                            setForm({ ...form, fields })
                          }}
                          placeholder="Field name"
                          className="flex-1"
                        />
                        <Input
                          value={field.label}
                          onChange={(event) => {
                            const fields = [...form.fields]
                            fields[index] = { ...fields[index], label: event.target.value }
                            setForm({ ...form, fields })
                          }}
                          placeholder="Label"
                          className="flex-1"
                        />
                        <label className="flex items-center gap-1.5 text-[11px] text-faint">
                          <Checkbox
                            checked={field.visible}
                            onChange={(event) => {
                              const fields = [...form.fields]
                              fields[index] = {
                                ...fields[index],
                                visible: event.target.checked,
                              }
                              setForm({ ...form, fields })
                            }}
                          />
                          Visible
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setForm({
                              ...form,
                              fields: form.fields.filter(
                                (_item: any, itemIndex: number) => itemIndex !== index
                              ),
                            })
                          }
                          title="Remove field"
                          aria-label="Remove field"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-faint">
                    Manual fields are for templates that are not mapped to an existing
                    Anki note type. Detect fields above to switch to mapping mode.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Field label="Card CSS" hint="used by preview and .apkg export">
                <Textarea
                  value={form.css}
                  onChange={(event) => setForm({ ...form, css: event.target.value })}
                  rows={14}
                  className="font-mono text-[11px]"
                />
              </Field>
              <Button variant="secondary" size="sm" onClick={openFormPreview} className="w-full">
                <Eye className="h-3.5 w-3.5" />
                Preview with sample content
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={saveTemplate}
              disabled={!form.name.trim()}
              loading={createTemplate.isPending || updateTemplate.isPending}
            >
              {editingId ? 'Save changes' : 'Add template'}
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Card templates"
          description="Each template controls the model prompt, export fields, and Anki note type."
          actions={
            <Button variant="primary" size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              Add template
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-md bg-raised" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              icon={LayoutTemplate}
              title="No templates yet"
              description="The default template is used until you create one."
              action={
                <Button variant="primary" size="sm" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5" />
                  Add template
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((template: any) => (
              <li
                key={template.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/30"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                  <LayoutTemplate className="h-3.5 w-3.5 text-muted" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-medium text-ink">{template.name}</p>
                    {template.is_default ? <Badge>Default</Badge> : null}
                    {template.mapping ? <Badge tone="success">Mapped</Badge> : null}
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">
                    {template.note_type} · {(template.fields || []).length} fields
                    {template.anki_fields?.length
                      ? ` · ${template.anki_fields.length} anki fields`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPreviewTemplate(template)}
                    title="Preview"
                    aria-label={`Preview ${template.name}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => editTemplate(template)}
                    title="Edit"
                    aria-label={`Edit ${template.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => duplicateTemplate(template)}
                    title="Duplicate"
                    aria-label={`Duplicate ${template.name}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {!template.is_default ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDefault.mutate(template.id)}
                      loading={setDefault.isPending && setDefault.variables === template.id}
                      title="Set as default"
                      aria-label={`Set ${template.name} as default`}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(template)}
                    title="Delete"
                    aria-label={`Delete ${template.name}`}
                    className="hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <TemplatePreview
        open={!!previewTemplate}
        onOpenChange={(open) => {
          if (!open) setPreviewTemplate(null)
        }}
        template={previewTemplate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this template?"
        description="Existing generations keep their cards; new runs can no longer use this template."
        confirmLabel="Delete template"
        destructive
        confirming={deleteTemplate.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteTemplate.mutate(deleteTarget.id)
        }}
      >
        <p className="text-[13px] text-muted">{deleteTarget?.name}</p>
      </ConfirmDialog>
    </div>
  )
}
