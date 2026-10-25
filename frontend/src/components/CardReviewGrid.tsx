import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Check,
  Edit2,
  Eye,
  Layers,
  Maximize2,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { cardFieldLabel } from '@/lib/cardLabels'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Panel,
  Textarea,
} from '@/components/ui'
import { LatexText } from '@/components/Latex'
import { CardViewer } from '@/components/CardViewer'

interface Props {
  cards: any[]
}

export function CardReviewGrid({ cards }: Props) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)

  const sorted = useMemo(
    () => [...cards].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [cards]
  )

  useEffect(() => {
    if (viewIndex !== null && sorted.length > 0 && viewIndex >= sorted.length) {
      setViewIndex(Math.max(0, sorted.length - 1))
    }
    if (viewIndex !== null && sorted.length === 0) setViewIndex(null)
  }, [sorted.length, viewIndex])

  const invalidate = (generationId: string) => {
    queryClient.invalidateQueries({ queryKey: ['generation', generationId] })
    queryClient.invalidateQueries({ queryKey: ['generations'] })
  }

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.cards.update(id, data),
    onSuccess: (_data, variables) => {
      const card = cards.find((item: any) => item.id === variables.id)
      if (card) invalidate(card.generation_id)
      toast.success('Card updated')
      setEditingId(null)
    },
    onError: (error: any) => toast.error(error.message),
  })

  const deleteCardMutation = useMutation({
    mutationFn: (id: string) => api.cards.delete(id),
    onSuccess: (_data, id) => {
      const card = cards.find((item: any) => item.id === id)
      if (card) invalidate(card.generation_id)
      toast.success('Card deleted')
      setDeleteTarget(null)
    },
    onError: (error: any) => toast.error(error.message),
  })

  const toggleSelectMutation = useMutation({
    mutationFn: ({ id, selected }: { id: string; selected: boolean }) =>
      api.cards.update(id, { selected }),
    onSuccess: (_data, variables) => {
      const card = cards.find((item: any) => item.id === variables.id)
      if (card) invalidate(card.generation_id)
    },
    onError: (error: any) => toast.error(error.message),
  })

  const handleEdit = (card: any) => {
    setEditingId(card.id)
    setEditFields({ ...card.fields })
  }

  const handleSave = (cardId: string) => {
    updateCardMutation.mutate({ id: cardId, data: { fields: editFields } })
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sorted.map((card: any, index) => {
          const isEditing = editingId === card.id
          const fields = card.fields || {}
          const isOcclusion = (fields.prompt || '').startsWith(
            'RECOMMENDATION: Use Image Occlusion'
          )
          const displayFields = Object.entries(fields).filter(
            ([key, value]) =>
              value && key !== 'slide_index' && key !== 'source_filename'
          )

          return (
            <Panel
              key={card.id}
              className={cn(
                'flex flex-col overflow-hidden transition-colors',
                card.selected
                  ? 'border-line-strong'
                  : 'border-line bg-panel/50'
              )}
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <Checkbox
                  checked={!!card.selected}
                  onChange={() =>
                    toggleSelectMutation.mutate({
                      id: card.id,
                      selected: !card.selected,
                    })
                  }
                  aria-label={`Select card ${index + 1}`}
                />
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                  Card {String(index + 1).padStart(2, '0')}
                </span>
                {isOcclusion ? (
                  <Badge tone="warning" className="gap-1">
                    <Layers className="h-2.5 w-2.5" />
                    Occlusion
                  </Badge>
                ) : null}
                {card.user_edited ? <Badge>Edited</Badge> : null}

                <div className="ml-auto flex items-center gap-0.5">
                  {isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSave(card.id)}
                        loading={updateCardMutation.isPending}
                        title="Save"
                        aria-label="Save card"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingId(null)}
                        title="Cancel"
                        aria-label="Cancel editing"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(card)}
                        title="Edit"
                        aria-label={`Edit card ${index + 1}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewIndex(index)}
                        title="Quick view"
                        aria-label={`View card ${index + 1}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(card)}
                        title="Delete"
                        aria-label={`Delete card ${index + 1}`}
                        className="hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className={cn('flex-1 space-y-3 p-3', !card.selected && 'opacity-60')}>
                {card.slide_index != null ? (
                  <button
                    type="button"
                    onClick={() => setViewIndex(index)}
                    className="group relative block w-full overflow-hidden rounded-md border border-line bg-canvas"
                  >
                    <img
                      src={api.generate.slideUrl(card.generation_id, card.slide_index)}
                      alt={`Source slide ${card.slide_index}`}
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                      loading="lazy"
                      decoding="async"
                      className="h-40 w-full object-cover object-top"
                    />
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-canvas/85 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                      Slide {card.slide_index}
                      <Maximize2 className="h-3 w-3" />
                    </span>
                  </button>
                ) : null}

                {isEditing ? (
                  <div
                    className="space-y-3"
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault()
                        handleSave(card.id)
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        setEditingId(null)
                      }
                    }}
                  >
                    {Object.keys(editFields).map((key, fieldIndex) => (
                      <label key={key} className="block">
                        <span className="eyebrow">{cardFieldLabel(key)}</span>
                        <Textarea
                          autoFocus={fieldIndex === 0}
                          value={editFields[key] || ''}
                          onChange={(event) =>
                            setEditFields({ ...editFields, [key]: event.target.value })
                          }
                          rows={3}
                          className="mt-1"
                        />
                      </label>
                    ))}
                    <p className="text-[10px] text-faint">
                      ⌘Enter to save · Esc to cancel
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {displayFields.map(([key, value]) => (
                      <div key={key}>
                        <span className="eyebrow">{cardFieldLabel(key)}</span>
                        <div className="mt-0.5 text-[13px] leading-relaxed text-ink break-words">
                          <LatexText text={String(value)} />
                        </div>
                      </div>
                    ))}
                    {displayFields.length === 0 ? (
                      <p className="text-sm italic text-faint">Empty card</p>
                    ) : null}
                  </div>
                )}
              </div>
            </Panel>
          )
        })}
      </div>

      {viewIndex !== null && sorted[viewIndex] ? (
        <CardViewer
          cards={sorted}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
          onToggleSelect={(card) =>
            toggleSelectMutation.mutate({ id: card.id, selected: !card.selected })
          }
          onDelete={(card) => setDeleteTarget(card)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this card?"
        description="The card is removed from this generation and from future exports."
        confirmLabel="Delete card"
        destructive
        confirming={deleteCardMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteCardMutation.mutate(deleteTarget.id)
        }}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          {deleteTarget ? (
            <span className="line-clamp-3">
              {String(deleteTarget.fields?.prompt ?? 'This card')}
            </span>
          ) : null}
        </p>
      </ConfirmDialog>
    </div>
  )
}
