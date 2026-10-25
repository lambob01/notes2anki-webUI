import { useMemo } from 'react'
import { Dialog } from '@/components/ui'

const SAMPLE_CONTENT: Record<string, string> = {
  prompt: 'What is the Reynolds number?',
  answer:
    'The dimensionless ratio of inertial to viscous forces in a flow. It predicts whether flow is laminar or turbulent.',
  formula: '\\(Re = \\frac{\\rho v L}{\\mu}\\)',
  'example question': 'Water flows at 2 m/s through a 10 mm pipe. Estimate Re and the flow regime.',
  solution: 'Use \\(Re = \\rho v L / \\mu\\) with \\(\\rho = 1000\\), \\(\\mu = 0.001\\).',
  topic: 'Fluid mechanics',
  extra: 'Low Re means viscous forces dominate; high Re means inertial forces dominate.',
  image: '[slide image]',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function contentFor(sources: string[]): string {
  return sources
    .map((source) => SAMPLE_CONTENT[source] ?? '')
    .filter(Boolean)
    .join('\n')
}

interface PreviewRow {
  label: string
  value: string
}

export function TemplatePreview({
  open,
  onOpenChange,
  template,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: any | null
}) {
  const rows = useMemo<PreviewRow[]>(() => {
    if (!template) return []
    const mapping = template.mapping as Record<string, string[]> | null

    if (mapping && Object.keys(mapping).length > 0) {
      return Object.entries(mapping)
        .filter(([, sources]) => sources.length > 0)
        .map(([field, sources]) => ({
          label: field,
          value: contentFor(sources),
        }))
    }

    return (template.fields || []).map((field: any) => ({
      label: field.label || field.name,
      value: contentFor([field.name]),
    }))
  }, [template])

  const srcDoc = useMemo(() => {
    const css = String(template?.css ?? '').replace(/<\/style/gi, '<\\/style')
    const body = rows
      .map(
        (row) =>
          `<div class="field"><div class="label">${escapeHtml(row.label)}</div>` +
          `<div class="value">${escapeHtml(row.value).replace(/\n/g, '<br/>')}</div></div>`
      )
      .join('')

    return `<!doctype html><html><head><meta charset="utf-8" /><style>
      html, body { margin: 0; padding: 20px; background: #fff; }
      .card { font-family: Arial, sans-serif; font-size: 18px; line-height: 1.5; color: #111; }
      .field { margin-bottom: 14px; }
      .label { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #888; margin-bottom: 2px; }
      .value { white-space: pre-wrap; }
      ${css}
    </style></head><body><div class="card">${body || '<em>No fields defined.</em>'}</div></body></html>`
  }, [rows, template?.css])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={template ? `Preview — ${template.name}` : 'Template preview'}
      description="Rendered with this template's CSS. Math is shown as raw LaTeX here."
      width="xl"
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">
          Add fields or detect them from an Anki note type to see a preview.
        </p>
      ) : (
        <div className="space-y-3">
          <iframe
            title="Template preview"
            sandbox=""
            srcDoc={srcDoc}
            className="h-[420px] w-full rounded-md border border-line bg-white"
          />
          <p className="text-[11px] text-faint">
            {template?.note_type || 'Basic'} · {rows.length} rendered field
            {rows.length === 1 ? '' : 's'} · sandboxed
          </p>
        </div>
      )}
    </Dialog>
  )
}
