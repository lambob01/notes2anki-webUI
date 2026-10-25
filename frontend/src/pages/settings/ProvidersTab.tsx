import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  CheckCircle2,
  Globe,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Panel,
  PanelHeader,
  Select,
  Switch,
} from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

interface ProviderForm {
  name: string
  provider_type: string
  base_url: string
  api_key: string
  is_active: boolean
}

const EMPTY_FORM: ProviderForm = {
  name: '',
  provider_type: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  is_active: true,
}

export function ProvidersTab() {
  const queryClient = useQueryClient()
  const { data: providers, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: api.providers.list,
  })
  const { data: presets } = useQuery({
    queryKey: ['providerPresets'],
    queryFn: api.providers.presets,
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({})
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)

  const editingProvider = (providers ?? []).find(
    (provider: any) => provider.id === editingId
  )
  const keyLocked = Boolean(editingId && editingProvider?.key_set)

  const presetEntries = Object.entries(presets ?? {}) as Array<
    [string, { label: string; base_url: string }]
  >
  const providerLabel = (type: string) =>
    presetEntries.find(([id]) => id === type)?.[1]?.label ?? type

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['providers'] })
    queryClient.invalidateQueries({ queryKey: ['providerPresets'] })
  }

  const saveProvider = useMutation({
    mutationFn: () => {
      const payload: any = {
        name: form.name.trim(),
        is_active: form.is_active,
      }
      if (!keyLocked) {
        payload.provider_type = form.provider_type
        payload.base_url = form.base_url.trim() || null
      }
      if (form.api_key.trim()) payload.api_key = form.api_key.trim()

      return editingId
        ? api.providers.update(editingId, payload)
        : api.providers.create({
            ...payload,
            provider_type: form.provider_type,
            base_url: form.base_url.trim() || null,
          })
    },
    onSuccess: () => {
      invalidate()
      closeForm()
      toast.success(editingId ? 'Provider updated' : 'Provider added')
    },
    onError: (error: any) => toast.error(error.message),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.providers.update(id, { is_active: active }),
    onSuccess: () => invalidate(),
    onError: (error: any) => toast.error(error.message),
  })

  const fetchModels = useMutation({
    mutationFn: (id: string) => api.providers.fetchModels(id),
    onSuccess: (result: any) => {
      invalidate()
      toast.success(
        result?.added
          ? `Fetched ${result.added} new model${result.added === 1 ? '' : 's'}`
          : 'Model list is already up to date'
      )
    },
    onError: (error: any) => toast.error(error.message),
  })

  const deleteProvider = useMutation({
    mutationFn: (id: string) => api.providers.delete(id),
    onSuccess: () => {
      invalidate()
      setDeleteTarget(null)
      toast.success('Provider removed')
    },
    onError: (error: any) => toast.error(error.message),
  })

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const openAdd = () => {
    const first = presetEntries[0]
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      provider_type: first?.[0] ?? 'openai',
      base_url: first?.[1]?.base_url ?? '',
    })
    setFormOpen(true)
  }

  const openEdit = (provider: any) => {
    setEditingId(provider.id)
    setForm({
      name: provider.name,
      provider_type: provider.provider_type,
      base_url: provider.base_url ?? '',
      api_key: '',
      is_active: provider.is_active,
    })
    setFormOpen(true)
  }

  const changeType = (type: string) => {
    setForm({
      ...form,
      provider_type: type,
      base_url: presets?.[type]?.base_url ?? '',
    })
  }

  const testConnection = async (provider: any) => {
    setTestingId(provider.id)
    try {
      const result = await api.providers.testSaved(provider.id)
      setTestResults((current) => ({
        ...current,
        [provider.id]: {
          ok: Boolean(result.ok),
          message: result.ok ? 'Connection successful' : result.error || 'Connection failed',
        },
      }))
      if (result.ok) toast.success('Connection successful')
      else toast.error(result.error || 'Connection failed')
    } catch (error: any) {
      setTestResults((current) => ({
        ...current,
        [provider.id]: { ok: false, message: error.message },
      }))
      toast.error(error.message)
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="API providers"
          description="Keys stay encrypted on the server and are never sent to the browser."
          actions={
            <Button variant="primary" size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" />
              Add provider
            </Button>
          }
        />

        {formOpen ? (
          <div className="border-b border-line bg-raised/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink">
                {editingId ? 'Edit provider' : 'New provider'}
              </p>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close provider form"
                className="rounded-md p-1 text-faint transition-colors hover:bg-panel hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="My OpenAI"
                />
              </Field>
              <Field
                label="Provider"
                hint={keyLocked ? 'delete to change' : undefined}
              >
                <Select
                  value={form.provider_type}
                  disabled={keyLocked}
                  onChange={(event) => changeType(event.target.value)}
                >
                  {presetEntries.length === 0 ? (
                    <option value={form.provider_type}>{form.provider_type}</option>
                  ) : (
                    presetEntries.map(([id, preset]) => (
                      <option key={id} value={id}>
                        {preset.label}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Base URL"
                hint={
                  keyLocked
                    ? 'locked while a key is stored'
                    : form.provider_type === 'custom'
                      ? 'required for custom providers'
                      : 'auto-filled from preset'
                }
              >
                <Input
                  value={form.base_url}
                  disabled={keyLocked}
                  onChange={(event) => setForm({ ...form, base_url: event.target.value })}
                  placeholder="https://…"
                />
              </Field>
              <Field
                label="API key"
                hint={editingId ? 'leave blank to keep' : 'stored encrypted'}
              >
                <Input
                  type="password"
                  value={form.api_key}
                  onChange={(event) => setForm({ ...form, api_key: event.target.value })}
                  placeholder={editingId && editingProvider?.key_set ? '••••••••' : 'sk-…'}
                />
              </Field>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2">
              <div>
                <p className="text-[12px] text-ink">Active</p>
                <p className="text-[10px] text-faint">Only active providers appear in the generator.</p>
              </div>
              <Switch
                checked={form.is_active}
                onChange={(active) => setForm({ ...form, is_active: active })}
                label="Provider active"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => saveProvider.mutate()}
                disabled={
                  !form.name.trim() ||
                  (form.provider_type === 'custom' && !form.base_url.trim())
                }
                loading={saveProvider.isPending}
              >
                {editingId ? 'Save changes' : 'Add provider'}
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-md bg-raised" />
            ))}
          </div>
        ) : (providers ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              icon={Globe}
              title="No providers yet"
              description="Add an API provider before generating your first deck."
              action={
                <Button variant="primary" size="sm" onClick={openAdd}>
                  <Plus className="h-3.5 w-3.5" />
                  Add provider
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {(providers ?? []).map((provider: any) => {
              const test = testResults[provider.id]
              return (
                <li
                  key={provider.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/30"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
                    <Globe className="h-3.5 w-3.5 text-muted" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-ink">{provider.name}</p>
                      <Badge>{providerLabel(provider.provider_type)}</Badge>
                      {!provider.is_active ? <Badge tone="warning">Paused</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
                      {provider.base_url || 'no base URL'}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px]">
                      {!provider.key_set ? (
                        <span className="text-warning">No API key</span>
                      ) : provider.key_hint ? (
                        <span className="text-success">Key stored {provider.key_hint}</span>
                      ) : (
                        <span className="text-danger">
                          Key unreadable — SECRET_KEY changed
                        </span>
                      )}
                      <span className="text-faint">
                        {(provider.models || []).length} model
                        {(provider.models || []).length === 1 ? '' : 's'}
                      </span>
                    </p>
                    {test ? (
                      <p
                        className={cn(
                          'mt-1 flex items-center gap-1 text-[11px]',
                          test.ok ? 'text-success' : 'text-danger'
                        )}
                      >
                        {test.ok ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {test.message}
                      </p>
                    ) : null}
                  </div>

                  <Switch
                    checked={provider.is_active}
                    onChange={(active) =>
                      toggleActive.mutate({ id: provider.id, active })
                    }
                    label={`${provider.name} active`}
                  />

                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => testConnection(provider)}
                      loading={testingId === provider.id}
                      title="Test connection"
                      aria-label={`Test ${provider.name}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => fetchModels.mutate(provider.id)}
                      loading={fetchModels.isPending && fetchModels.variables === provider.id}
                      title="Fetch models"
                      aria-label={`Fetch models for ${provider.name}`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(provider)}
                      title="Edit"
                      aria-label={`Edit ${provider.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(provider)}
                      title="Delete"
                      aria-label={`Delete ${provider.name}`}
                      className="hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this provider?"
        description="Providers used by existing generations cannot be deleted; remove those generations first."
        confirmLabel="Delete provider"
        destructive
        confirming={deleteProvider.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteProvider.mutate(deleteTarget.id)
        }}
      >
        <p className="text-[13px] text-muted">
          {deleteTarget?.name} · {deleteTarget ? providerLabel(deleteTarget.provider_type) : ''}
        </p>
      </ConfirmDialog>
    </div>
  )
}
