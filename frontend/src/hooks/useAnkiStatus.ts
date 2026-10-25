import { useCallback } from 'react'
import { usePersistentState } from '@/hooks/usePersistentState'

interface AnkiStatus {
  ok: boolean
  detail: string
  checkedAt: string | null
}

const EMPTY: AnkiStatus = { ok: false, detail: '', checkedAt: null }

function storageKey() {
  const origin = typeof window === 'undefined' ? 'server' : window.location.origin
  return `notes2anki:anki-status:${origin}`
}

/**
 * Last known AnkiConnect result for this origin. Persisted so the dashboard's
 * setup checklist does not have to call Anki on every page load.
 */
export function useAnkiStatus() {
  const [status, setStatus] = usePersistentState<AnkiStatus>(storageKey(), EMPTY)

  const report = useCallback(
    (ok: boolean, detail: string) => {
      setStatus({ ok, detail, checkedAt: new Date().toISOString() })
    },
    [setStatus]
  )

  return { status, report }
}
