import katex from 'katex'
import 'katex/dist/katex.min.css'

// Splits on inline \(...\) and display \[...\] math, keeping the delimiters
// in the parts so each piece is classified unambiguously.
const MATH_SPLIT = /(\\\(.*?\\\)|\\\[.*?\\\])/gs

function renderLatex(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    strict: false,
  })
}

/**
 * Renders a card field, turning LaTeX math (\(...\) inline, \[...\] display)
 * into typeset KaTeX while leaving everything else as plain text.
 */
export function LatexText({ text, className }: { text: string; className?: string }) {
  const parts = String(text ?? '').split(MATH_SPLIT)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const inline = part.startsWith('\\(') && part.endsWith('\\)')
        const display = part.startsWith('\\[') && part.endsWith('\\]')
        if (!inline && !display) return <span key={i}>{part}</span>
        return (
          <span
            key={i}
            className={display ? 'block my-2 overflow-x-auto' : 'inline-block align-middle'}
            dangerouslySetInnerHTML={{ __html: renderLatex(part.slice(2, -2), display) }}
          />
        )
      })}
    </span>
  )
}
