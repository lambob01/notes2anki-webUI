import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Eye, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ModelOption {
  id: string
  model_id: string
  display_name?: string | null
  supports_vision?: boolean
  is_custom?: boolean
}

interface Props {
  models: ModelOption[]
  value: string
  onChange: (modelId: string) => void
  /** Persist a hand-typed name so it appears in the list next time. */
  onAddCustom?: (modelId: string) => void
  disabled?: boolean
  placeholder?: string
}

/**
 * Type-to-filter model picker that also accepts arbitrary text, so a model the
 * provider's /models endpoint doesn't advertise (common on vLLM and other
 * local runtimes) can still be used.
 */
export function ModelCombobox({
  models,
  value,
  onChange,
  onAddCustom,
  disabled,
  placeholder = 'Search or type a model name…',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    // Subsequence match, so "g4o" finds "gpt-4o" and "c37s" finds
    // "claude-3-7-sonnet" without needing the exact substring.
    return models.filter((m) => {
      const hay = `${m.model_id} ${m.display_name ?? ''}`.toLowerCase()
      if (hay.includes(q)) return true
      let i = 0
      for (const ch of hay) {
        if (ch === q[i]) i++
        if (i === q.length) return true
      }
      return false
    })
  }, [models, query])

  const trimmed = query.trim()
  const exactExists = models.some((m) => m.model_id === trimmed)
  const canAddCustom = trimmed.length > 0 && !exactExists
  const rowCount = filtered.length + (canAddCustom ? 1 : 0)

  useEffect(() => setHighlight(0), [query, open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const commit = (modelId: string, isNew: boolean) => {
    onChange(modelId)
    if (isNew) onAddCustom?.(modelId)
    setOpen(false)
    setQuery('')
  }

  const selectRow = (index: number) => {
    if (index < filtered.length) commit(filtered[index].model_id, false)
    else if (canAddCustom) commit(trimmed, true)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (rowCount ? (h + 1) % rowCount : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (rowCount ? (h - 1 + rowCount) % rowCount : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rowCount) selectRow(highlight)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const selected = models.find((m) => m.model_id === value)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-line bg-panel px-3 text-left text-[13px] transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20'
        )}
      >
        <span className={cn('flex-1 truncate', !value && 'text-faint')}>
          {value || 'Select model…'}
        </span>
        {selected?.supports_vision ? (
          <Eye className="h-3.5 w-3.5 shrink-0 text-muted" />
        ) : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-faint" />
      </button>

      {open && !disabled ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-line bg-panel shadow-lift animate-rise-in">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map((m, i) => (
              <button
                key={m.id || m.model_id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(m.model_id, false)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]',
                  i === highlight ? 'bg-raised' : 'hover:bg-raised/60'
                )}
              >
                <span className="flex-1 truncate text-ink">
                  {m.display_name && m.display_name !== m.model_id ? (
                    <>
                      {m.display_name}
                      <span className="ml-1.5 font-mono text-[10px] text-faint">{m.model_id}</span>
                    </>
                  ) : (
                    m.model_id
                  )}
                </span>
                {m.supports_vision ? <Eye className="h-3.5 w-3.5 shrink-0 text-muted" /> : null}
                {m.is_custom ? (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-faint">
                    custom
                  </span>
                ) : null}
                {m.model_id === value ? (
                  <Check className="h-4 w-4 shrink-0 text-ink" />
                ) : null}
              </button>
            ))}

            {canAddCustom ? (
              <button
                type="button"
                onMouseEnter={() => setHighlight(filtered.length)}
                onClick={() => commit(trimmed, true)}
                className={cn(
                  'flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[13px]',
                  highlight === filtered.length ? 'bg-raised' : 'hover:bg-raised/60'
                )}
              >
                <Plus className="h-4 w-4 shrink-0 text-muted" />
                <span className="truncate text-ink">
                  Use <span className="font-medium">{trimmed}</span>
                </span>
              </button>
            ) : null}

            {filtered.length === 0 && !canAddCustom ? (
              <p className="px-3 py-6 text-center text-xs text-faint">
                No models found. Fetch them in Settings, or type a name to use it directly.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
