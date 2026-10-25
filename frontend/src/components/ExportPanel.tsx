import { useState, type MouseEvent } from 'react'
import { Download, FileDown, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { syncToAnki, AnkiConnectError } from '@/lib/ankiconnect'
import { Button, buttonVariants } from '@/components/ui'

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
  const selectedCount = cards.filter((card: any) => card.selected).length

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
      const duplicateNote =
        result.duplicates > 0 ? ` (${result.duplicates} already in your collection)` : ''
      toast.success(`Added ${result.added} card(s) to "${result.deckName}"${duplicateNote}`)
    } catch (error: any) {
      // AnkiConnect failures are almost always setup issues, so keep the
      // message on screen long enough to act on.
      toast.error(error instanceof AnkiConnectError ? error.message : String(error), {
        duration: 8000,
      })
    }
    setSyncing(false)
  }

  const guardEmpty = (event: MouseEvent<HTMLAnchorElement>) => {
    if (selectedCount === 0) {
      event.preventDefault()
      toast.error('No cards selected')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="primary"
        size="sm"
        onClick={handleSync}
        disabled={syncing || selectedCount === 0}
        title="Requires Anki open with the AnkiConnect add-on"
      >
        <Send className="h-3.5 w-3.5" />
        {syncing ? 'Adding…' : 'Add to Anki'}
      </Button>
      <a
        href={api.export.apkgUrl(generationId)}
        onClick={guardEmpty}
        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        title="Download an Anki package with slide images"
      >
        <Download className="h-3.5 w-3.5" />
        .apkg
      </a>
      <a
        href={api.export.csvUrl(generationId)}
        onClick={guardEmpty}
        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
        title="Download a CSV without media"
      >
        <FileDown className="h-3.5 w-3.5" />
        .csv
      </a>
    </div>
  )
}
