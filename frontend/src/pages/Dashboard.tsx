import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileDropZone } from '@/components/FileDropZone'
import { GenerationConfig } from '@/components/GenerationConfig'
import { api } from '@/lib/api'
import { AlertTriangle } from 'lucide-react'

const CONFIG_KEY = 'notes2anki:config'
const MODE_KEY = 'notes2anki:mode'

const DEFAULT_CONFIG = {
  provider_id: '',
  model_name: '',
  template_id: '',
  deck_name: 'Default',
  custom_prompt: '',
  subject_context: '',
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

function loadMode(): 'file' | 'text' {
  return localStorage.getItem(MODE_KEY) === 'text' ? 'text' : 'file'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'file' | 'text'>(loadMode)
  const [uploadedFile, setUploadedFile] = useState<any>(null)
  const [textInput, setTextInput] = useState('')
  const [title, setTitle] = useState('')
  const [generating, setGenerating] = useState(false)

  const { data: providers } = useQuery({ queryKey: ['providers'], queryFn: api.providers.list })
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: api.templates.list })
  const [config, setConfigState] = useState(loadConfig)

  const setConfig = useCallback((next: any) => {
    setConfigState(next)
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next))
  }, [])

  const switchMode = (m: 'file' | 'text') => {
    setMode(m)
    localStorage.setItem(MODE_KEY, m)
  }

  const handleFileDrop = useCallback(async (file: File) => {
    try {
      const result = await api.notes.upload(file)
      setUploadedFile(result)
      setTitle(result.filename)
      toast.success(`Uploaded: ${result.filename}`)
    } catch (e: any) {
      toast.error(e.message)
    }
  }, [])

  const handleGenerate = async () => {
    if (!config.provider_id || !config.model_name || !config.template_id) {
      toast.error('Please configure provider, model, and template')
      return
    }
    setGenerating(true)
    try {
      let result
      if (mode === 'file' && uploadedFile) {
        let force = !!config.force
        if (uploadedFile.already_processed && !force) {
          const ok = window.confirm(
            `This file was already processed (${uploadedFile.processed_slides} slide(s)). ` +
              'Start another pass over it anyway?'
          )
          if (!ok) {
            setGenerating(false)
            return
          }
          force = true
        }
        result = await api.generate.fromFile({
          ...config,
          force,
          // title = what the user sees; filename = what's on disk
          source_title: title || uploadedFile.filename,
          source_filename: uploadedFile.stored_filename,
        })
      } else if (mode === 'text' && textInput.trim()) {
        result = await api.generate.start({
          ...config,
          source_text: textInput,
          source_title: title || 'Text Input',
        })
      } else {
        toast.error('Please upload a file or enter text')
        setGenerating(false)
        return
      }
      toast.success('Generation started!')
      navigate(`/review/${result.id}`)
    } catch (e: any) {
      toast.error(e.message)
    }
    setGenerating(false)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Create Flashcards</h1>
        <p className="text-gray-500 mt-1 dark:text-gray-400">Upload lecture notes or paste text to generate Anki cards</p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => switchMode('file')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === 'file' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          File Upload
        </button>
        <button
          onClick={() => switchMode('text')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === 'text' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          Text Input
        </button>
      </div>

      {mode === 'file' ? (
        <FileDropZone onFile={handleFileDrop} uploadedFile={uploadedFile} />
      ) : (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <textarea
            placeholder="Paste your lecture notes, study text, or any content here..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      )}

      {uploadedFile?.already_processed && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            This file was already processed before ({uploadedFile.processed_slides} slide(s)).
            Unless you enable <strong>Re-process already processed slides</strong> below, a run
            will skip everything and produce no cards.
          </span>
        </div>
      )}

      <GenerationConfig
        providers={providers || []}
        templates={templates || []}
        config={config}
        onChange={setConfig}
      />

      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {generating ? 'Generating...' : 'Generate Flashcards'}
      </button>
    </div>
  )
}
