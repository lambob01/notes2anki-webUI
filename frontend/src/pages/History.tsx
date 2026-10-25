import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { History, Plus, SearchX } from 'lucide-react'
import { HistoryTable } from '@/components/HistoryTable'
import {
  HistorySort,
  HistoryStatus,
  HistoryToolbar,
} from '@/components/HistoryToolbar'
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
} from '@/components/ui'
import { useGenerations } from '@/hooks/useActiveGeneration'
import { api } from '@/lib/api'

export default function HistoryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: generations, isLoading, isError, error } = useGenerations()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<HistoryStatus>('all')
  const [sort, setSort] = useState<HistorySort>('newest')
  const [action, setAction] = useState<null | {
    type: 'rerun' | 'delete'
    generation: any
  }>(null)
  const [clearOpen, setClearOpen] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['generations'] })

  const clearAll = useMutation({
    mutationFn: () => api.generate.clear(),
    onSuccess: () => {
      invalidate()
      toast.success('History cleared')
    },
    onError: (mutationError: any) => toast.error(mutationError.message),
  })

  const deleteOne = useMutation({
    mutationFn: (id: string) => api.generate.delete(id),
    onSuccess: () => {
      invalidate()
      toast.success('Generation deleted')
    },
    onError: (mutationError: any) => toast.error(mutationError.message),
  })

  const rerun = useMutation({
    mutationFn: (id: string) => api.generate.rerun(id),
    onSuccess: (generation: any) => {
      invalidate()
      toast.success('Generation restarted')
      navigate(`/review/${generation.id}`)
    },
    onError: (mutationError: any) => toast.error(mutationError.message),
  })

  const all = useMemo(() => generations ?? [], [generations])

  const counts: Record<HistoryStatus, number> = {
    all: all.length,
    completed: all.filter((generation: any) => generation.status === 'completed').length,
    running: all.filter(
      (generation: any) =>
        generation.status === 'running' || generation.status === 'pending'
    ).length,
    failed: all.filter((generation: any) => generation.status === 'failed').length,
    cancelled: all.filter((generation: any) => generation.status === 'cancelled').length,
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const result = all.filter((generation: any) => {
      const matchesSearch =
        !query ||
        [generation.title, generation.model_name, generation.deck_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      const matchesStatus =
        status === 'all' ||
        (status === 'running'
          ? generation.status === 'running' || generation.status === 'pending'
          : generation.status === status)
      return matchesSearch && matchesStatus
    })

    return [...result].sort((a: any, b: any) => {
      if (sort === 'cards') return (b.card_count ?? 0) - (a.card_count ?? 0)
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return sort === 'oldest' ? aTime - bTime : bTime - aTime
    })
  }, [all, search, sort, status])

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setSort('newest')
  }

  const empty = !isLoading && all.length === 0
  const noMatches = !isLoading && all.length > 0 && filtered.length === 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="Generation history"
        description="Reopen a run, replay it with the same settings, or clear space."
        actions={
          <>
            <Button
              variant="danger"
              onClick={() => setClearOpen(true)}
              disabled={empty || clearAll.isPending || counts.running > 0}
              title={
                counts.running > 0
                  ? 'Wait for active runs to finish before clearing history'
                  : undefined
              }
            >
              Clear all
            </Button>
            <Link to="/" className={buttonVariants({ variant: 'primary' })}>
              <Plus className="h-3.5 w-3.5" />
              New generation
            </Link>
          </>
        }
      />

      {!empty ? (
        <HistoryToolbar
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          sort={sort}
          onSortChange={setSort}
          counts={counts}
          resultCount={filtered.length}
        />
      ) : null}

      {isLoading ? (
        <Panel className="divide-y divide-line">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </Panel>
      ) : isError ? (
        <EmptyState
          icon={SearchX}
          title="Could not load history"
          description={(error as Error)?.message ?? 'The server did not respond.'}
        />
      ) : empty ? (
        <EmptyState
          icon={History}
          title="No generations yet"
          description="Your first run will appear here with its cards, slides, and exports."
          action={
            <Link to="/" className={buttonVariants({ variant: 'primary' })}>
              Create your first generation
            </Link>
          }
        />
      ) : noMatches ? (
        <EmptyState
          icon={SearchX}
          title="No matching generations"
          description="Try a different search or clear the status filter."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <HistoryTable
          generations={filtered}
          rerunningId={rerun.isPending ? (rerun.variables as string) : null}
          onRerun={(generation) => setAction({ type: 'rerun', generation })}
          onDelete={(generation) => setAction({ type: 'delete', generation })}
        />
      )}

      <ConfirmDialog
        open={action?.type === 'rerun'}
        onOpenChange={(open) => {
          if (!open) setAction(null)
        }}
        title="Run this generation again?"
        description="A new run starts with the same provider, model, template, source, and instructions."
        confirmLabel="Run again"
        confirming={rerun.isPending}
        onConfirm={() => {
          if (action?.generation) rerun.mutate(action.generation.id)
          setAction(null)
        }}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          This uses your provider credits. File-based runs reprocess every slide so the
          replay is not silently skipped.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={action?.type === 'delete'}
        onOpenChange={(open) => {
          if (!open) setAction(null)
        }}
        title="Delete this generation?"
        description="Its cards, slide images, and export files are removed. This cannot be undone."
        confirmLabel="Delete generation"
        destructive
        confirming={deleteOne.isPending}
        onConfirm={() => {
          if (action?.generation) deleteOne.mutate(action.generation.id)
          setAction(null)
        }}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          {action?.generation?.title || 'Untitled generation'} ·{' '}
          {action?.generation?.card_count ?? 0} cards
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all history?"
        description="Every generation, card, slide image, and export is deleted."
        confirmLabel="Clear everything"
        destructive
        confirming={clearAll.isPending}
        onConfirm={() => clearAll.mutate()}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Uploaded source files are kept only while another generation references them.
          This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  )
}
