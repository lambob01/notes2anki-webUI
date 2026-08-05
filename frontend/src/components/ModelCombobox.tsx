import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search, Eye } from 'lucide-react'
import { clsx } from 'clsx'

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
  placeholder = 'Search or type a model name...',
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

  // Total rows including the "use custom" row, for keyboard navigation.
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
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-left',
          disabled
            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500'
            : 'bg-white border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:hover:border-gray-500'
        )}
      >
        <span className={clsx('flex-1 truncate', !value && 'text-gray-400 dark:text-gray-500')}>
          {value || 'Select model...'}
        </span>
        {selected?.supports_vision && (
          <Eye className="w-3.5 h-3.5 text-red-400 shrink-0" />
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 dark:text-gray-500" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <Search className="w-4 h-4 text-gray-400 shrink-0 dark:text-gray-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="flex-1 text-sm outline-none placeholder:text-gray-400 dark:bg-transparent dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map((m, i) => (
              <button
                key={m.id || m.model_id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(m.model_id, false)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
                  i === highlight ? 'bg-red-50 dark:bg-red-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                <span className="flex-1 truncate">
                  {m.display_name && m.display_name !== m.model_id ? (
                    <>
                      {m.display_name}
                      <span className="text-gray-400 ml-1.5 text-xs dark:text-gray-500">{m.model_id}</span>
                    </>
                  ) : (
                    m.model_id
                  )}
                </span>
                {m.supports_vision && (
                  <Eye className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                {m.is_custom && (
                  <span className="text-[10px] text-gray-400 shrink-0 dark:text-gray-500">custom</span>
                )}
                {m.model_id === value && (
                  <Check className="w-4 h-4 text-red-600 shrink-0" />
                )}
              </button>
            ))}

            {canAddCustom && (
              <button
                type="button"
                onMouseEnter={() => setHighlight(filtered.length)}
                onClick={() => commit(trimmed, true)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left border-t border-gray-100 dark:border-gray-700',
                  highlight === filtered.length ? 'bg-red-50 dark:bg-red-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                <Plus className="w-4 h-4 text-red-600 shrink-0" />
                <span className="truncate">
                  Use <span className="font-medium">{trimmed}</span>
                </span>
              </button>
            )}

            {filtered.length === 0 && !canAddCustom && (
              <p className="px-3 py-6 text-sm text-gray-400 text-center dark:text-gray-500">
                No models found. Fetch them in Settings, or type a name to use it
                directly.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
