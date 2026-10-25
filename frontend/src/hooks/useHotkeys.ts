import { useEffect, useRef } from 'react'

type Bindings = Record<string, () => void>

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  )
}

/**
 * Global keyboard bindings. Supports single keys ("n", "?"), sequences
 * ("g d"), and the command modifier ("mod k"). Bindings are ignored while the
 * user is typing unless the key carries a modifier.
 */
export function useHotkeys(bindings: Bindings) {
  const ref = useRef(bindings)

  useEffect(() => {
    ref.current = bindings
  })

  useEffect(() => {
    let sequence = ''
    let resetTimer: number | undefined

    const resetSequence = () => {
      sequence = ''
      if (resetTimer) window.clearTimeout(resetTimer)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Dialogs own their keyboard handling; global shortcuts should not fire
      // behind the palette, a confirm dialog, or a preview.
      if (document.querySelector('[role="dialog"]')) return

      const key = event.key.toLowerCase()
      const command = event.metaKey || event.ctrlKey
      const otherModifier = event.altKey

      if (command && !otherModifier) {
        const binding = ref.current[`mod ${key}`]
        if (binding) {
          event.preventDefault()
          resetSequence()
          binding()
        }
        return
      }

      if (otherModifier) return
      if (isTypingTarget(event.target)) return

      if (key === 'escape') {
        resetSequence()
        return
      }

      if (sequence === 'g') {
        const binding = ref.current[`g ${key}`]
        if (binding) {
          event.preventDefault()
          resetSequence()
          binding()
          return
        }
        resetSequence()
      }

      const single = ref.current[key]
      if (single) {
        event.preventDefault()
        resetSequence()
        single()
        return
      }

      if (key === 'g') {
        sequence = 'g'
        if (resetTimer) window.clearTimeout(resetTimer)
        resetTimer = window.setTimeout(() => {
          sequence = ''
        }, 900)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (resetTimer) window.clearTimeout(resetTimer)
    }
  }, [])
}
