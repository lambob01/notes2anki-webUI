import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Trash2, CheckSquare, Square, Layers } from 'lucide-react'
import { LatexText } from '@/components/Latex'
import { api } from '@/lib/api'

const FIELD_LABELS: Record<string, string> = {
  prompt: 'Front / Prompt',
  answer: 'Back / Answer',
  formula: 'Formula',
  'example question': 'Example Question',
  solution: 'Solution',
  topic: 'Topic',
  extra: 'Extra',
}

interface Props {
  cards: any[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  onToggleSelect: (card: any) => void
  onDelete: (card: any) => void
}

export function CardViewer({ cards, index, onIndexChange, onClose, onToggleSelect, onDelete }: Props) {
  const card = cards[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        onIndexChange(Math.min(index + 1, cards.length - 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onIndexChange(Math.max(index - 1, 0))
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, cards.length, onIndexChange, onClose])

  if (!card) return null

  const fields = card.fields || {}
  const isOcclusion = (fields.prompt || '').startsWith(
    'RECOMMENDATION: Use Image Occlusion'
  )
  const displayFields = Object.entries(fields).filter(
    ([k, v]) => v && k !== 'slide_index' && k !== 'source_filename'
  )

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-600 tabular-nums">
            Card {index + 1} / {cards.length}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isOcclusion && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              <Layers className="w-3.5 h-3.5" />
              Image Occlusion recommended - create this card in Anki from the slide image
            </span>
          )}
          {card.slide_index != null && (
            <img
              src={api.generate.slideUrl(card.generation_id, card.slide_index)}
              alt={`Source slide ${card.slide_index}`}
              onError={(e) => (e.currentTarget.style.display = 'none')}
              className="w-full rounded-lg border border-gray-100"
            />
          )}
          {displayFields.length === 0 && (
            <p className="text-sm text-gray-400 italic">Empty card</p>
          )}
          {displayFields.map(([key, value]) => (
            <div key={key}>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {FIELD_LABELS[key] || key}
              </span>
              <div className="text-sm text-gray-800 mt-1 leading-relaxed break-words">
                <LatexText text={String(value)} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <button
            onClick={() => onIndexChange(Math.max(0, index - 1))}
            disabled={index === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleSelect(card)}
              title={card.selected ? 'Deselect' : 'Select'}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                card.selected
                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {card.selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {card.selected ? 'Selected' : 'Not selected'}
            </button>
            <button
              onClick={() => onDelete(card)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>

          <button
            onClick={() => onIndexChange(Math.min(cards.length - 1, index + 1))}
            disabled={index >= cards.length - 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
