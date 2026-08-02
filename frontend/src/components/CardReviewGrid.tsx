import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { Edit2, Trash2, Check, Eye } from 'lucide-react'
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

  const sorted = useMemo(
    () => [...cards].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [cards]
  )

  useEffect(() => {
    if (viewIndex !== null && sorted.length > 0 && viewIndex >= sorted.length) {
      setViewIndex(Math.max(0, sorted.length - 1))
    }
  }, [sorted.length, viewIndex])

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.cards.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation'] })
      toast.success('Card updated')
      setEditingId(null)
    },
  })

  const deleteCardMutation = useMutation({
    mutationFn: (id: string) => api.cards.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generation'] })
      toast.success('Card deleted')
    },
  })

  const toggleSelectMutation = useMutation({
    mutationFn: ({ id, selected }: { id: string; selected: boolean }) =>
      api.cards.update(id, { selected }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['generation'] }),
  })

  const handleSelectAll = () => {
    const allIds = cards.map((c: any) => c.id)
    const allSelected = cards.every((c: any) => c.selected)
    api.cards.batchSelect(allIds, !allSelected).then(() =>
      queryClient.invalidateQueries({ queryKey: ['generation'] })
    )
  }

  const handleEdit = (card: any) => {
    setEditingId(card.id)
    setEditFields({ ...card.fields })
  }

  const handleSave = (cardId: string) => {
    updateCardMutation.mutate({ id: cardId, data: { fields: editFields } })
  }

  const fieldLabels: Record<string, string> = {
    prompt: 'Front / Prompt',
    answer: 'Back / Answer',
    formula: 'Formula',
    'example question': 'Example Question',
    solution: 'Solution',
    topic: 'Topic',
    extra: 'Extra',
  }

  const selectedCount = cards.filter((c: any) => c.selected).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={cards.length > 0 && cards.every((c: any) => c.selected)}
              onChange={handleSelectAll}
              className="rounded"
            />
            Select All
          </label>
          <span className="text-xs text-gray-400">
            {selectedCount} of {cards.length} selected
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((card: any, idx) => {
          const isEditing = editingId === card.id
          const fields = card.fields || {}
          const displayFields = Object.entries(fields).filter(
            ([k, v]) => v && k !== 'slide_index' && k !== 'source_filename'
          )

          return (
            <div
              key={card.id}
              className={`border rounded-xl p-4 transition-colors ${
                card.selected ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-300 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={card.selected}
                    onChange={() =>
                      toggleSelectMutation.mutate({ id: card.id, selected: !card.selected })
                    }
                    className="rounded mt-0.5"
                  />
                  <span className="text-xs text-gray-400">Card #{idx + 1}</span>
                </label>
                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <button
                      onClick={() => handleSave(card.id)}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEdit(card)}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setViewIndex(idx)}
                    className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                    title="Quick view (arrow keys to navigate)"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteCardMutation.mutate(card.id)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  {Object.keys(editFields).map((key) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-400 mb-0.5">
                        {fieldLabels[key] || key}
                      </label>
                      <textarea
                        value={editFields[key] || ''}
                        onChange={(e) =>
                          setEditFields({ ...editFields, [key]: e.target.value })
                        }
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm resize-y"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {card.slide_index != null && (
                    <img
                      src={api.generate.slideUrl(card.generation_id, card.slide_index)}
                      alt={`Source slide ${card.slide_index}`}
                      title="Source slide (click to view)"
                      onClick={() => setViewIndex(idx)}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      className="w-full rounded-lg border border-gray-100 cursor-pointer max-h-48 object-cover object-top"
                    />
                  )}
                  {displayFields.map(([key, value]) => (
                    <div key={key}>
                      <span className="text-xs font-medium text-gray-400">
                        {fieldLabels[key] || key}
                      </span>
                      <p className="text-sm text-gray-800 mt-0.5 break-words">
                        <LatexText text={String(value)} />
                      </p>
                    </div>
                  ))}
                  {displayFields.length === 0 && (
                    <p className="text-sm text-gray-400 italic">Empty card</p>
                  )}
                </div>
              )}

              {card.user_edited && (
                <span className="text-xs text-amber-500 mt-2 inline-block">Edited</span>
              )}
            </div>
          )
        })}
      </div>

      {viewIndex !== null && sorted[viewIndex] && (
        <CardViewer
          cards={sorted}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
          onToggleSelect={(card) =>
            toggleSelectMutation.mutate({ id: card.id, selected: !card.selected })
          }
          onDelete={(card) => deleteCardMutation.mutate(card.id)}
        />
      )}
    </div>
  )
}
