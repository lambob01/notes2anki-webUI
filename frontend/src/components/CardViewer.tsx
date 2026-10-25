import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Trash2,
  X,
} from 'lucide-react'
import { Badge, Button, Dialog } from '@/components/ui'
import { LatexText } from '@/components/Latex'
import { SlideLightbox } from '@/components/SlideLightbox'
import { api } from '@/lib/api'
import { cardFieldLabel } from '@/lib/cardLabels'

interface Props {
  cards: any[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  onToggleSelect: (card: any) => void
  onDelete: (card: any) => void
}

export function CardViewer({
  cards,
  index,
  onIndexChange,
  onClose,
  onToggleSelect,
  onDelete,
}: Props) {
  const card = cards[index]
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!card) return
    const onKey = (event: KeyboardEvent) => {
      if (lightboxOpen) return
      // A confirm dialog can open above the viewer; it owns the keyboard then.
      if (document.querySelectorAll('[role="dialog"]').length > 1) return
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'j') {
        event.preventDefault()
        onIndexChange(Math.min(index + 1, cards.length - 1))
      } else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onIndexChange(Math.max(index - 1, 0))
      } else if (event.key.toLowerCase() === 'x') {
        event.preventDefault()
        onToggleSelect(card)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, cards.length, index, lightboxOpen, onIndexChange, onToggleSelect])

  if (!card) return null

  const fields = card.fields || {}
  const isOcclusion = (fields.prompt || '').startsWith(
    'RECOMMENDATION: Use Image Occlusion'
  )
  const displayFields = Object.entries(fields).filter(
    ([key, value]) => value && key !== 'slide_index' && key !== 'source_filename'
  )
  const slideSrc =
    card.slide_index != null
      ? api.generate.slideUrl(card.generation_id, card.slide_index)
      : null

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={`Card ${index + 1}`}
        showHeader={false}
        width="xl"
        className="flex max-h-[88vh] flex-col overflow-hidden"
        bodyClassName="min-h-0 flex-1 overflow-y-auto p-0"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onIndexChange(Math.max(0, index - 1))}
              disabled={index === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Button>

            <div className="flex items-center gap-1.5">
              <Button
                variant={card.selected ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onToggleSelect(card)}
                title="Toggle selection (X)"
              >
                {card.selected ? 'Selected' : 'Select'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(card)}
                className="hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onIndexChange(Math.min(cards.length - 1, index + 1))}
              disabled={index >= cards.length - 1}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-panel/95 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Card {index + 1} / {cards.length}
            </span>
            <Badge tone={card.selected ? 'neutral' : 'warning'}>
              {card.selected ? 'Selected' : 'Unselected'}
            </Badge>
            {card.user_edited ? <Badge>Edited</Badge> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close (Esc)"
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {isOcclusion ? (
            <Badge tone="warning" className="gap-1.5">
              <Layers className="h-3 w-3" />
              Image occlusion recommended
            </Badge>
          ) : null}

          {slideSrc ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              title="Open full-size slide"
              className="group block w-full overflow-hidden rounded-md border border-line bg-canvas"
            >
              <img
                src={slideSrc}
                alt={`Source slide ${card.slide_index}`}
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
                className="max-h-[44vh] w-full object-contain"
              />
            </button>
          ) : null}

          {displayFields.length === 0 ? (
            <p className="text-sm italic text-faint">Empty card</p>
          ) : null}

          {displayFields.map(([key, value]) => (
            <div key={key}>
              <p className="eyebrow">{cardFieldLabel(key)}</p>
              <div className="mt-1 text-[14px] leading-relaxed text-ink break-words">
                <LatexText text={String(value)} />
              </div>
            </div>
          ))}
        </div>
      </Dialog>

      <SlideLightbox
        src={slideSrc}
        alt={`Source slide ${card.slide_index}`}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </>
  )
}
