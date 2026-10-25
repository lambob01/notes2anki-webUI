import { useCallback, useState } from 'react'

/**
 * localStorage-backed state. Failures are non-fatal: the app falls back to the
 * in-memory value, which is the same behavior as a private window with storage
 * disabled.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return JSON.parse(raw) as T
    } catch {
      /* corrupted or unavailable storage */
    }
    return initial
  })

  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved =
          typeof next === 'function' ? (next as (current: T) => T)(current) : next
        try {
          localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          /* storage unavailable */
        }
        return resolved
      })
    },
    [key]
  )

  return [value, set] as const
}
