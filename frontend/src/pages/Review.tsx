import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { CardReviewGrid } from '@/components/CardReviewGrid'
import { ExportPanel } from '@/components/ExportPanel'
import { GenerationProgress } from '@/components/GenerationProgress'
import { ArrowLeft, Loader2, Square } from 'lucide-react'

const RUNNING = ['running', 'pending']

export default function ReviewPage() {
  // react-router types params as possibly-undefined (unlike Next's useParams),
  // so gate the query on it rather than asserting.
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  // The 1s poll hits the slim /status endpoint, not the full generation:
  // serializing every card on every tick was the whole of the waste (TODO 3).
  const { data: status, isPending: statusPending, isError: statusError } = useQuery({
    queryKey: ['generation-status', id],
    enabled: Boolean(id),
    queryFn: () => api.generate.status(id!),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.status === 'running' || data?.status === 'pending') return 1000
      return false
    },
    // Generation can take minutes, and people switch tabs while they wait.
    // Without this, react-query pauses polling on blur and the progress bar
    // freezes mid-run, looking like the job hung.
    refetchIntervalInBackground: true,
  })

  const terminal = Boolean(status) && !RUNNING.includes(status!.status)

  // The full generation (with cards) is fetched once - when the run is done.
  // Until then only the slim status exists.
  const { data: gen, isLoading: genLoading } = useQuery({
    queryKey: ['generation', id],
    enabled: Boolean(id) && terminal,
    queryFn: () => api.generate.get(id!),
  })

  const cancel = useMutation({
    mutationFn: () => api.generate.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation-status', id] })
      queryClient.invalidateQueries({ queryKey: ['generation', id] })
      queryClient.invalidateQueries({ queryKey: ['generations'] })
      toast.success('Generation cancelled')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const running = status && RUNNING.includes(status.status)
  const title = status?.title ?? gen?.title
  const deckName = status?.deck_name ?? gen?.deck_name
  const modelName = status?.model_name ?? gen?.model_name
  const template = (templates || []).find((t: any) => t.id === (gen?.template_id ?? status?.template_id))

  if (statusError) {
    return <p className="text-gray-500 dark:text-gray-400">Generation not found.</p>
  }

  if (statusPending) {
    return (
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading generation...
      </div>
    )
  }

  // Terminal but the full detail (cards) is still arriving - don't flash an
  // empty "no cards" state at the user.
  if (genLoading) {
    return (
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading cards...
      </div>
    )
  }

  const cards = gen?.cards ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {deckName} &middot; {modelName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <>
              <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </span>
              <button
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                <Square className="w-3.5 h-3.5" />
                {cancel.isPending ? 'Cancelling...' : 'Cancel'}
              </button>
            </>
          )}
          {status?.status === 'completed' && (
            <span className="text-sm text-green-600 font-medium dark:text-green-400">
              Complete &middot; {cards.length} cards
            </span>
          )}
          {status?.status === 'cancelled' && (
            <span className="text-sm text-amber-600 font-medium dark:text-amber-400">
              Cancelled &middot; {cards.length} cards
            </span>
          )}
          {status?.status === 'failed' && (
            <span className="text-sm text-red-600 dark:text-red-400">
              Failed: {status.error_message}
            </span>
          )}
        </div>
      </div>

      {running && (
        <GenerationProgress
          phase={status.phase}
          totalSlides={status.total_slides ?? 0}
          completedSlides={status.completed_slides ?? 0}
          cardsGenerated={status.cards_generated ?? 0}
        />
      )}

      {cards.length > 0 && (
        <>
          <ExportPanel
            generationId={gen!.id}
            cards={cards}
            deckName={deckName || 'Default'}
            // Anki keys note types by name. A mapped template targets the
            // user's own Anki note type; legacy templates reuse the template
            // name to land in the same note type across runs.
            modelName={template?.mapping ? template.note_type : template?.name || 'Notes2Anki'}
            fieldNames={(template?.fields || []).map((f: any) => f.name)}
            css={template?.css}
            isCloze={(template?.note_type || '').toLowerCase() === 'cloze'}
            mapping={template?.mapping}
            ankiFields={template?.anki_fields}
          />
          <CardReviewGrid cards={cards} />
        </>
      )}

      {cards.length === 0 && status?.status === 'completed' && (
        <div className="text-center py-12 px-6">
          <p className="text-gray-500 dark:text-gray-400">No flashcards were generated from this content.</p>
          {/* A completed-but-empty run usually has a reason (every slide was a
              duplicate, or individual slides errored). Surfacing it here beats
              leaving the user to guess. */}
          {status.error_message && (
            <p className="text-sm text-amber-600 mt-3 max-w-xl mx-auto whitespace-pre-line dark:text-amber-400">
              {status.error_message.trim()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
