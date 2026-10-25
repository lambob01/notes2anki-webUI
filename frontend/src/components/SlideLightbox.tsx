import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function SlideLightbox({
  src,
  alt,
  open,
  onOpenChange,
}: {
  src: string | null
  alt: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // The viewer underneath is also a dialog. Close only the lightbox.
      event.preventDefault()
      event.stopPropagation()
      onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown, true)
      previousFocus?.focus?.()
    }
  }, [open, onOpenChange])

  if (!open || !src) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        aria-label="Close slide"
        className="absolute right-5 top-5 rounded-md border border-white/15 bg-black/50 p-2 text-white/70 transition-colors hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[88vh] max-w-[92vw] rounded-md border border-white/10 object-contain shadow-lift"
      />
    </div>,
    document.body
  )
}
