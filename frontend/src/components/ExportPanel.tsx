import { useState } from 'react'
import { Download, FileDown, Send, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { syncToAnki, AnkiConnectError } from '@/lib/ankiconnect'

interface Props {
  generationId: string
  cards: any[]
  deckName: string
  modelName: string
  fieldNames: string[]
  css?: string
  isCloze?: boolean
  mapping?: Record<string, string>
  ankiFields?: string[]
}

export function ExportPanel({
  generationId,
  cards,
  deckName,
  modelName,
  fieldNames,
  css,
  isCloze,
  mapping,
  ankiFields,
}: Props) {
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const selectedCount = cards.filter((c: any) => c.selected).length

  const handleSync = async () => {
    if (selectedCount === 0) {
      toast.error('No cards selected')
      return
    }
    setSyncing(true)
    try {
      const result = await syncToAnki({
        cards,
        generationId,
        deckName,
        modelName,
        fieldNames,
        css,
        isCloze,
        mapping,
        ankiFields,
      })
      const dupNote =
        result.duplicates > 0 ? ` (${result.duplicates} already in your collection)` : ''
      toast.success(`Added ${result.added} card(s) to "${result.deckName}"${dupNote}`)
      setLastResult(`${result.added} added to ${result.deckName}${dupNote}`)
    } catch (e: any) {
      // AnkiConnect failures are almost always setup issues, so keep the
      // message on screen long enough to act on.
      toast.error(e instanceof AnkiConnectError ? e.message : String(e), {
        duration: 8000,
      })
    }
    setSyncing(false)
  }

  const guardEmpty = (e: React.MouseEvent) => {
    if (selectedCount === 0) {
      e.preventDefault()
      toast.error('No cards selected')
    }
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {selectedCount} card{selectedCount === 1 ? '' : 's'} selected
        </span>

        <button
          onClick={handleSync}
          disabled={syncing || selectedCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors ml-auto"
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {syncing ? 'Adding to Anki...' : 'Add to Anki'}
        </button>

        <a
          href={api.export.apkgUrl(generationId)}
          onClick={guardEmpty}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          <Download className="w-4 h-4" />
          .apkg
        </a>
        <a
          href={api.export.csvUrl(generationId)}
          onClick={guardEmpty}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          <FileDown className="w-4 h-4" />
          .csv
        </a>
      </div>

      {lastResult && (
        <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {lastResult}
        </p>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Adding to Anki needs Anki open with the AnkiConnect add-on. If it fails,
        check the setup steps in Settings.
      </p>
    </div>
  )
}
