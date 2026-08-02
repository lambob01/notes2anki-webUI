import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { CardReviewGrid } from '@/components/CardReviewGrid'
import { ExportPanel } from '@/components/ExportPanel'
import { GenerationProgress } from '@/components/GenerationProgress'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function ReviewPage() {
  // react-router types params as possibly-undefined (unlike Next's useParams),
  // so gate the query on it rather than asserting.
  const { id } = useParams<{ id: string }>()
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  const { data: gen, isLoading, refetch } = useQuery({
    queryKey: ['generation', id],
    enabled: Boolean(id),
    queryFn: () => api.generate.get(id!),
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

  const template = (templates || []).find((t: any) => t.id === gen?.template_id)

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading generation...
      </div>
    )
  }

  if (!gen) {
    return <p className="text-gray-500">Generation not found.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{gen.title}</h1>
            <p className="text-sm text-gray-500">
              {gen.deck_name} &middot; {gen.model_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {gen.status === 'running' && (
            <span className="flex items-center gap-1 text-sm text-indigo-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </span>
          )}
          {gen.status === 'completed' && (
            <span className="text-sm text-green-600 font-medium">Complete &middot; {gen.cards.length} cards</span>
          )}
          {gen.status === 'failed' && (
            <span className="text-sm text-red-600">
              Failed: {gen.error_message}
            </span>
          )}
        </div>
      </div>

      {(gen.status === 'running' || gen.status === 'pending') && (
        <GenerationProgress
          phase={gen.phase}
          totalSlides={gen.total_slides ?? 0}
          completedSlides={gen.completed_slides ?? 0}
          cardsGenerated={gen.cards_generated ?? 0}
        />
      )}

      {gen.cards.length > 0 && (
        <>
          <ExportPanel
            generationId={gen.id}
            cards={gen.cards}
            deckName={gen.deck_name || 'Default'}
            // Anki keys note types by name, so reuse the template's name to
            // land in the same note type across runs instead of duplicating.
            modelName={template?.name || 'Notes2Anki'}
            fieldNames={(template?.fields || []).map((f: any) => f.name)}
            css={template?.css}
            isCloze={(template?.note_type || '').toLowerCase() === 'cloze'}
          />
          <CardReviewGrid cards={gen.cards} />
        </>
      )}

      {gen.cards.length === 0 && gen.status === 'completed' && (
        <div className="text-center py-12 px-6">
          <p className="text-gray-500">No flashcards were generated from this content.</p>
          {/* A completed-but-empty run usually has a reason (every slide was a
              duplicate, or individual slides errored). Surfacing it here beats
              leaving the user to guess. */}
          {gen.error_message && (
            <p className="text-sm text-amber-600 mt-3 max-w-xl mx-auto whitespace-pre-line">
              {gen.error_message.trim()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
