import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowRight, Clock, FileText, Info, Sparkles, Type } from 'lucide-react'
import { FileDropZone } from '@/components/FileDropZone'
import { GenerationConfig } from '@/components/GenerationConfig'
import { LibraryStats } from '@/components/LibraryStats'
import { RecentRuns } from '@/components/RecentRuns'
import { SetupChecklist } from '@/components/SetupChecklist'
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Panel,
  PanelHeader,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui'
import { useGenerations } from '@/hooks/useActiveGeneration'
import { useAnkiStatus } from '@/hooks/useAnkiStatus'
import { usePersistentState } from '@/hooks/usePersistentState'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'

const CONFIG_KEY = 'notes2anki:config'

const DEFAULT_CONFIG = {
  provider_id: '',
  model_name: '',
  template_id: '',
  deck_name: 'Default',
  custom_prompt: '',
  subject_context: '',
  card_specs: [],
  target_card_count: null,
  dpi: 150,
  max_workers: 4,
  force: false,
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    /* corrupted storage - fall through to defaults */
  }
  return { ...DEFAULT_CONFIG }
}

type Mode = 'file' | 'text' | 'topic'

const TOPIC_EXAMPLES = [
  'Explain boundary layers in fluid mechanics',
  'Teach me Bayesian inference with examples',
  'Compare laminar and turbulent flow',
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mode, setMode] = usePersistentState<Mode>('notes2anki:mode', 'file')
  const [uploadedFile, setUploadedFile] = useState<any>(null)
  const [textInput, setTextInput] = useState('')
  const [topicInput, setTopicInput] = usePersistentState('notes2anki:topic-draft', '')
  const [title, setTitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [confirmReprocess, setConfirmReprocess] = useState(false)
  const [setupDismissed, setSetupDismissed] = usePersistentState(
    'notes2anki:setup-dismissed',
    false
  )

  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: api.providers.list })
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: api.templates.list })
  const { data: generations, isLoading: generationsLoading } = useGenerations()
  const { status: anki } = useAnkiStatus()
  const [config, setConfigState] = useState(loadConfig)

  const setConfig = useCallback((next: any) => {
    setConfigState(next)
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }, [])

  const activeProviders = (providers ?? []).filter((provider: any) => provider.is_active)

  const countValue =
    config.target_card_count == null
      ? 'auto'
      : [5, 10, 15, 20].includes(config.target_card_count)
        ? String(config.target_card_count)
        : 'custom'

  const setCardCount = (value: string) => {
    if (value === 'auto') setConfig({ ...config, target_card_count: null })
    else if (value === 'custom') {
      setConfig({ ...config, target_card_count: config.target_card_count ?? 10 })
    } else {
      setConfig({ ...config, target_card_count: Number(value) })
    }
  }

  const switchMode = (next: Mode) => {
    if (next !== 'file' && uploadedFile && title === uploadedFile.filename) {
      setTitle('')
    }
    if (next === 'file' && uploadedFile && !title) {
      setTitle(uploadedFile.filename)
    }
    setMode(next)
  }

  // Fill the gaps once data arrives, but never overwrite a deliberate choice.
  // A stale provider/template id (deleted in Settings) is replaced too.
  useEffect(() => {
    if (!providers || !templates) return
    const patch: Record<string, any> = {}
    const activeProvider = activeProviders[0]

    if (config.provider_id && !providers.some((p: any) => p.id === config.provider_id)) {
      patch.provider_id = activeProvider?.id ?? ''
      patch.model_name = ''
    }
    if (!config.provider_id && !patch.provider_id && activeProvider) {
      patch.provider_id = activeProvider.id
    }

    const chosenProvider = providers.find(
      (provider: any) => provider.id === (patch.provider_id ?? config.provider_id)
    )
    if (!config.model_name && chosenProvider?.models?.length === 1) {
      patch.model_name = chosenProvider.models[0].model_id
    }

    const templateFallback =
      templates.find((template: any) => template.is_default) ?? templates[0]
    if (config.template_id && !templates.some((t: any) => t.id === config.template_id)) {
      patch.template_id = templateFallback?.id ?? ''
    }
    if (!config.template_id && !patch.template_id && templateFallback) {
      patch.template_id = templateFallback.id
    }

    if (Object.keys(patch).length > 0) setConfig({ ...config, ...patch })
  }, [providers, templates, config, activeProviders, setConfig])

  const handleFileDrop = useCallback(async (file: File) => {
    try {
      const result = await api.notes.upload(file)
      setUploadedFile(result)
      setTitle(result.filename)
      toast.success(`Uploaded ${result.filename}`)
    } catch (error: any) {
      toast.error(error.message)
    }
  }, [])

  const clearFile = () => {
    if (uploadedFile && title === uploadedFile.filename) setTitle('')
    setUploadedFile(null)
  }

  const missing: string[] = []
  if (!config.provider_id) missing.push('provider')
  if (!config.model_name) missing.push('model')
  if (!config.template_id) missing.push('template')
  if (mode === 'file' && !uploadedFile) missing.push('file')
  if (mode === 'text' && !textInput.trim()) missing.push('text')
  if (mode === 'topic' && !topicInput.trim()) missing.push('topic request')
  const ready = missing.length === 0

  const runGeneration = async (forceOverride?: boolean) => {
    if (!ready) {
      toast.error(`Add ${missing.join(', ')} first`)
      return
    }

    const force = forceOverride ?? !!config.force
    if (mode === 'file' && uploadedFile?.already_processed && !force) {
      setConfirmReprocess(true)
      return
    }

    setGenerating(true)
    try {
      let result
      if (mode === 'topic') {
        result = await api.generate.start({
          ...config,
          topic: topicInput.trim(),
          source_title: title.trim() || undefined,
        })
      } else if (mode === 'file' && uploadedFile) {
        result = await api.generate.fromFile({
          ...config,
          force,
          source_title: title || uploadedFile.filename,
          source_filename: uploadedFile.stored_filename,
        })
      } else {
        result = await api.generate.start({
          ...config,
          source_text: textInput,
          source_title: title || 'Text input',
        })
      }
      queryClient.invalidateQueries({ queryKey: ['generations'] })
      toast.success('Generation started')
      navigate(`/review/${result.id}`)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setGenerating(false)
    }
  }

  const setupComplete =
    activeProviders.length > 0 &&
    activeProviders.some((provider: any) => (provider.models || []).length > 0) &&
    (templates ?? []).length > 0 &&
    anki.ok

  const selectedTemplate = (templates ?? []).find(
    (template: any) => template.id === config.template_id
  )

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="New generation"
        description="Turn a lecture deck, pasted notes, or a topic request into review-ready flashcards."
        actions={
          <Link to="/history" className={buttonVariants({ variant: 'secondary' })}>
            <Clock className="h-3.5 w-3.5" />
            History
          </Link>
        }
      />

      {!setupDismissed && !setupComplete ? (
        <SetupChecklist
          providers={providers ?? []}
          templates={templates ?? []}
          onDismiss={() => setSetupDismissed(true)}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              title={mode === 'topic' ? 'Card request' : 'Source material'}
              description={
                mode === 'file'
                  ? 'Upload a lecture file and extract cards from its slides.'
                  : mode === 'text'
                    ? 'Paste notes and extract cards from the text.'
                    : 'Describe what you want to learn; the model writes the cards from established knowledge.'
              }
              actions={
                <Tabs
                  ariaLabel="Source type"
                  value={mode}
                  onChange={(value) => switchMode(value as Mode)}
                  tabs={[
                    { id: 'file', label: 'File', icon: FileText },
                    { id: 'text', label: 'Text', icon: Type },
                    { id: 'topic', label: 'Topic', icon: Sparkles },
                  ]}
                />
              }
            />
            <div className="space-y-4 p-4">
              {mode === 'file' ? (
                <FileDropZone
                  onFile={handleFileDrop}
                  onClear={clearFile}
                  uploadedFile={uploadedFile}
                />
              ) : mode === 'text' ? (
                <div>
                  <Textarea
                    value={textInput}
                    onChange={(event) => setTextInput(event.target.value)}
                    rows={12}
                    placeholder="Paste lecture notes, a transcript, or any study text…"
                    aria-label="Study text"
                  />
                  <p className="mt-1 text-right font-mono text-[10px] text-faint">
                    {textInput.trim().length.toLocaleString()} characters
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    value={topicInput}
                    onChange={(event) => setTopicInput(event.target.value)}
                    rows={8}
                    placeholder="e.g. Explain boundary layers in fluid mechanics, from the definition to flow separation, at undergraduate level."
                    aria-label="Topic request"
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                      Try
                    </span>
                    {TOPIC_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setTopicInput(example)}
                        className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-ink"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <Field label="Card count" hint="auto lets the model decide">
                    <div className="flex items-center gap-2">
                      <Select
                        value={countValue}
                        onChange={(event) => setCardCount(event.target.value)}
                        wrapperClassName="flex-1"
                      >
                        <option value="auto">Auto</option>
                        <option value="5">5 cards</option>
                        <option value="10">10 cards</option>
                        <option value="15">15 cards</option>
                        <option value="20">20 cards</option>
                        <option value="custom">Custom…</option>
                      </Select>
                      {countValue === 'custom' ? (
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={config.target_card_count ?? 10}
                          onChange={(event) => {
                            const parsed = parseInt(event.target.value || '10', 10)
                            setConfig({
                              ...config,
                              target_card_count: Math.max(1, Math.min(30, parsed)),
                            })
                          }}
                          className="w-24"
                          aria-label="Custom card count"
                        />
                      ) : null}
                    </div>
                  </Field>
                  <div className="flex gap-2.5 rounded-md border border-line bg-canvas/40 p-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                    <p className="text-[11px] leading-relaxed text-faint">
                      Cards are written from the model&apos;s general knowledge, not a
                      document. Review them before exporting.
                    </p>
                  </div>
                </div>
              )}

              <Field label="Title" hint="optional">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={
                    mode === 'file'
                      ? 'Defaults to the filename'
                      : mode === 'topic'
                        ? 'Defaults to the prompt'
                        : 'Text input'
                  }
                />
              </Field>

              {mode === 'file' && uploadedFile?.already_processed ? (
                <div className="flex gap-2.5 rounded-md border border-warning/20 bg-warning/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="text-[12px] leading-relaxed">
                    <p className="font-medium text-warning">This file has been processed before</p>
                    <p className="mt-0.5 text-warning/80">
                      {uploadedFile.processed_slides} slide(s) already have cards. Turn on{' '}
                      <strong>Reprocess processed slides</strong> or you will get an empty run.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>

          <LibraryStats generations={generations} loading={generationsLoading} />
          <RecentRuns generations={generations} loading={generationsLoading} />
        </div>

        <div className="space-y-4 xl:sticky xl:top-[72px] xl:flex xl:h-[calc(100vh-88px)] xl:flex-col xl:gap-4 xl:space-y-0">
          <Panel className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
            <GenerationConfig
              mode={mode}
              providers={providers ?? []}
              templates={templates ?? []}
              config={config}
              onChange={setConfig}
            />
          </Panel>

          <Panel className="p-4 xl:shrink-0">
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  'text-[11px]',
                  ready ? 'text-muted' : 'text-warning'
                )}
              >
                {ready ? 'Ready to generate' : `Missing ${missing.join(', ')}`}
              </span>
              <span className="truncate font-mono text-[10px] text-faint">
                {selectedTemplate?.name ?? 'No template'}
              </span>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="mt-3 w-full"
              loading={generating}
              disabled={!ready}
              onClick={() => runGeneration()}
            >
              {generating ? 'Starting…' : 'Generate flashcards'}
              {!generating ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
            <p className="mt-2 text-center text-[10px] text-faint">
              Uses your configured provider&apos;s API credits.
            </p>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReprocess}
        onOpenChange={setConfirmReprocess}
        title="Reprocess this file?"
        description="Every slide will be sent to the model again."
        confirmLabel="Reprocess and generate"
        onConfirm={() => runGeneration(true)}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          {uploadedFile?.processed_slides ?? 0} slide(s) in this file were generated before.
          Without reprocessing, the new run would skip them and likely produce no cards.
        </p>
      </ConfirmDialog>
    </div>
  )
}
