import { useCallback, useSyncExternalStore } from 'react'

const THEME_KEY = 'notes2anki:theme'

export type Theme = 'light' | 'dark'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* storage unavailable */
  }
  // Dark is the product's default identity, not a system-preference derivation.
  return 'dark'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#08080a' : '#fafafa')
}

let current = readStoredTheme()
const listeners = new Set<() => void>()

if (typeof document !== 'undefined') applyTheme(current)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Theme {
  return current
}

function setTheme(next: Theme) {
  if (next === current) return
  current = next
  applyTheme(next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    /* storage unavailable - theme just won't persist */
  }
  listeners.forEach((listener) => listener())
}

/**
 * Shared light/dark theme state. A module-level store keeps every consumer
 * (sidebar, palette, appearance settings) in sync.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const toggle = useCallback(() => {
    setTheme(current === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, toggle, setTheme }
}
