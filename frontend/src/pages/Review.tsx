import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  RefreshCw,
  SearchX,
  Sparkles,
  Square,
} from 'lucide-react'
import { api } from '@/lib/api'
import { CardReviewGrid } from '@/components/CardReviewGrid'
import { ExportPanel } from '@/components/ExportPanel'
import { GenerationProgress } from '@/components/GenerationProgress'
import { ReviewToolbar, type CardFilter } from '@/components/ReviewToolbar'
import {
  Badge,
  Button,
  buttonVariants,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  SkeletonText,
  StatusBadge,
} from '@/components/ui'
import { formatRelativeTime, pluralize } from '@/lib/format'

const RUNNING = ['running', 'pending']

const SOURCE_LABELS: Record<string, string> = {
  file: 'File',
  text: 'Text',
  topic: 'Topic',
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CardFilter>('all')

  // Replaying from inside a review reuses this component with a new id; the
  // previous run's filters should not carry over.
  useEffect(() => {
    setSearch('')
    setFilter('all')
  }, [id])

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  const {
    data: status,
    isPending: statusPending,
    isError: statusError,
  } = useQuery({
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['generation-status', id] })
    queryClient.invalidateQueries({ queryKey: ['generation', id] })
    queryClient.invalidateQueries({ queryKey: ['generations'] })
  }

  const cancel = useMutation({
    mutationFn: () => api.generate.cancel(id!),
    onSuccess: () => {
      invalidate()
      toast.success('Generation cancelled')
    },
    onError: (error: any) => toast.error(error.message),
  })

  const rerun = useMutation({
    mutationFn: () => api.generate.rerun(id!),
    onSuccess: (generation: any) => {
      queryClient.invalidateQueries({ queryKey: ['generations'] })
      toast.success('Generation restarted')
      navigate(`/review/${generation.id}`)
    },
    onError: (error: any) => toast.error(error.message),
  })

  const batchSelect = useMutation({
    mutationFn: ({ ids, selected }: { ids: string[]; selected: boolean }) =>
      api.cards.batchSelect(ids, selected),
    onSuccess: () => invalidate(),
    onError: (error: any) => toast.error(error.message),
  })

  const cards = useMemo(
    () =>
      [...(gen?.cards ?? [])].sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    [gen?.cards]
  )

  const visibleCards = useMemo(() => {
    const query = search.trim().toLowerCase()
    return cards.filter((card: any) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'selected' ? card.selected : !card.selected)
      if (!matchesFilter) return false
      if (!query) return true
      return Object.values(card.fields || {}).some((value) =>
        String(value).toLowerCase().includes(query)
      )
    })
  }, [cards, filter, search])

  const counts: Record<CardFilter, number> = {
    all: cards.length,
    selected: cards.filter((card: any) => card.selected).length,
    unselected: cards.filter((card: any) => !card.selected).length,
  }
  const selectedCount = counts.selected
  const allVisibleSelected =
    visibleCards.length > 0 && visibleCards.every((card: any) => card.selected)

  const running = status && RUNNING.includes(status.status)
  const title = status?.title ?? gen?.title
  const deckName = status?.deck_name ?? gen?.deck_name
  const modelName = status?.model_name ?? gen?.model_name
  const template = (templates || []).find(
    (item: any) => item.id === (gen?.template_id ?? status?.template_id)
  )

  const clearFilters = () => {
    setSearch('')
    setFilter('all')
  }

  if (statusError) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Review"
          title="Generation not found"
          description="This run may have been deleted or the link is wrong."
          leading={
            <Link
              to="/history"
              aria-label="Back to history"
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          }
        />
        <EmptyState
          icon={SearchX}
          title="Nothing to review here"
          description="Open History to find a generation that still exists."
          action={
            <Link to="/history" className={buttonVariants({ variant: 'primary' })}>
              Open history
            </Link>
          }
        />
      </div>
    )
  }

  if (statusPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((index) => (
            <Panel key={index} className="space-y-3 p-4">
              <Skeleton className="h-36 w-full" />
              <SkeletonText lines={3} />
            </Panel>
          ))}
        </div>
      </div>
    )
  }

  if (!status) return null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review"
        title={title || 'Generation'}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{deckName}</span>
            <span className="text-faint">·</span>
            <span className="font-mono text-[11px]">{modelName}</span>
            <span className="text-faint">·</span>
            <span>{formatRelativeTime(status.created_at)}</span>
          </span>
        }
        leading={
          <Link
            to="/history"
            aria-label="Back to history"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        }
        actions={
          <>
            <Badge className="gap-1">
              {status.source_type === 'topic' ? <Sparkles className="h-2.5 w-2.5" /> : null}
              {SOURCE_LABELS[status.source_type] ?? status.source_type}
            </Badge>
            <StatusBadge status={status.status} />
            {running ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => cancel.mutate()}
                loading={cancel.isPending}
              >
                {cancel.isPending ? 'Stopping…' : 'Cancel'}
                {!cancel.isPending ? <Square className="h-3 w-3" /> : null}
              </Button>
            ) : null}
          </>
        }
      />

      {!running && !genLoading && gen?.source_type === 'topic' ? (
        <Panel className="p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-raised">
              <Sparkles className="h-3.5 w-3.5 text-muted" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-medium text-ink">Topic request</p>
                <Badge>
                  {gen.target_card_count
                    ? `${gen.target_card_count} cards`
                    : 'Auto count'}
                </Badge>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-[12px] leading-relaxed text-muted">
                {gen.source_text}
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      {running ? (
        <>
          <GenerationProgress
            phase={status.phase}
            totalSlides={status.total_slides ?? 0}
            completedSlides={status.completed_slides ?? 0}
            cardsGenerated={status.cards_generated ?? 0}
            failedSlides={status.failed_slides ?? 0}
          />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((index) => (
              <Panel key={index} className="space-y-3 p-4">
                <Skeleton className="h-36 w-full" />
                <SkeletonText lines={3} />
              </Panel>
            ))}
          </div>
        </>
      ) : null}

      {!running && genLoading ? (
        <>
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((index) => (
              <Panel key={index} className="space-y-3 p-4">
                <Skeleton className="h-36 w-full" />
                <SkeletonText lines={3} />
              </Panel>
            ))}
          </div>
        </>
      ) : null}

      {!running && !genLoading && status.status === 'failed' ? (
        <div className="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-danger">Generation failed</p>
            <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-danger/80">
              {status.error_message || 'The provider or document pipeline returned an error.'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => rerun.mutate()}
            loading={rerun.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Run again
          </Button>
        </div>
      ) : null}

      {!running &&
      !genLoading &&
      status.status === 'cancelled' &&
      cards.length > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/10 p-4">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-warning">Generation cancelled</p>
            <p className="mt-1 text-[12px] leading-relaxed text-warning/80">
              Cards generated before cancellation are kept. Review or export them below.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => rerun.mutate()}
            loading={rerun.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Run again
          </Button>
        </div>
      ) : null}

      {!running &&
      !genLoading &&
      status.status === 'completed' &&
      (status.failed_slides ?? 0) > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-warning">
              {status.failed_slides} slide
              {status.failed_slides === 1 ? '' : 's'} failed
            </p>
            <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-warning/80">
              {status.error_message ||
                'Those slides produced no cards. The rest of the deck completed normally.'}
            </p>
          </div>
        </div>
      ) : null}

      {!running && !genLoading && cards.length > 0 ? (
        <>
          <ReviewToolbar
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
            selectedCount={selectedCount}
            totalCount={cards.length}
            visibleCount={visibleCards.length}
            allVisibleSelected={allVisibleSelected}
            onToggleSelectVisible={() =>
              batchSelect.mutate({
                ids: visibleCards.map((card: any) => card.id),
                selected: !allVisibleSelected,
              })
            }
            actions={
              <ExportPanel
                generationId={gen!.id}
                cards={cards}
                deckName={deckName || 'Default'}
                modelName={
                  template?.mapping
                    ? template.note_type
                    : template?.name || 'Notes2Anki'
                }
                fieldNames={(template?.fields || []).map((field: any) => field.name)}
                css={template?.css}
                isCloze={(template?.note_type || '').toLowerCase() === 'cloze'}
                mapping={template?.mapping}
                ankiFields={template?.anki_fields}
              />
            }
          />

          {visibleCards.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No cards match"
              description="Try a different search or switch the filter."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <CardReviewGrid key={gen?.id} cards={visibleCards} />
          )}
        </>
      ) : null}

      {!running &&
      !genLoading &&
      cards.length === 0 &&
      (status.status === 'completed' || status.status === 'cancelled') ? (
        <EmptyState
          icon={status.status === 'cancelled' ? Ban : Sparkles}
          title={
            status.status === 'cancelled'
              ? 'Cancelled before any cards were made'
              : 'No cards were generated'
          }
          description={
            status.error_message?.trim() ||
            (status.status === 'cancelled'
              ? 'Start another run when you are ready.'
              : gen?.source_type === 'topic'
                ? 'The model returned no cards for this request. Try a more focused prompt or a different card count.'
                : 'Every slide may have been a duplicate, or the model returned nothing usable. Replaying the run is usually the fastest check.')
          }
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => rerun.mutate()}
                loading={rerun.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Run again
              </Button>
              <Link to="/" className={buttonVariants({ variant: 'primary' })}>
                New generation
              </Link>
            </div>
          }
        />
      ) : null}

      {cards.length > 0 && !running ? (
        <p className="text-center font-mono text-[10px] uppercase tracking-wider text-faint">
          {cards.length} {pluralize(cards.length, 'card')} · {selectedCount} selected for export
        </p>
      ) : null}
    </div>
  )
}
