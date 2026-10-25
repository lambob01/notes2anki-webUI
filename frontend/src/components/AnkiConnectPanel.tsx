import { useState } from 'react'
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge, Button, Panel, PanelHeader } from '@/components/ui'
import { useAnkiStatus } from '@/hooks/useAnkiStatus'
import { anki, AnkiConnectError } from '@/lib/ankiconnect'
import { formatRelativeTime } from '@/lib/format'

export function AnkiConnectPanel() {
  const { status, report } = useAnkiStatus()
  const [testing, setTesting] = useState(false)
  const origin = window.location.origin

  const config = `{
    "webCorsOriginList": [
        "http://localhost",
        "${origin}"
    ]
}`

  const test = async () => {
    setTesting(true)
    try {
      const version = await anki.version()
      const decks = await anki.deckNames()
      report(true, `AnkiConnect v${version} · ${decks.length} deck(s) found`)
      toast.success('Connected to Anki')
    } catch (error: any) {
      const message =
        error instanceof AnkiConnectError ? error.message : String(error)
      report(false, message)
      toast.error(message, { duration: 8000 })
    } finally {
      setTesting(false)
    }
  }

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(config)
      toast.success('AnkiConnect config copied')
    } catch {
      toast.error('Clipboard unavailable — select and copy the config manually')
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Anki connection"
        description="Cards travel from your browser straight to Anki over AnkiConnect."
        actions={
          <Button variant="primary" size="sm" onClick={test} loading={testing}>
            {!testing ? <RefreshCw className="h-3.5 w-3.5" /> : null}
            Test connection
          </Button>
        }
      />

      <div className="space-y-5 p-4">
        <div className="flex items-start gap-3 rounded-md border border-line bg-raised/40 p-3">
          <span className="mt-0.5 shrink-0">
            {status.ok ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : status.checkedAt ? (
              <XCircle className="h-4 w-4 text-danger" />
            ) : (
              <Zap className="h-4 w-4 text-faint" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-medium text-ink">
                {status.ok
                  ? 'Connected'
                  : status.checkedAt
                    ? 'Not connected'
                    : 'Not tested yet'}
              </p>
              {status.checkedAt ? (
                <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
                  checked {formatRelativeTime(status.checkedAt)}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[12px] text-muted">
              {status.detail ||
                'Anki must be open with the AnkiConnect add-on before adding cards.'}
            </p>
          </div>
          <Badge tone={status.ok ? 'success' : status.checkedAt ? 'danger' : 'neutral'}>
            {status.ok ? 'ready' : status.checkedAt ? 'offline' : 'unknown'}
          </Badge>
        </div>

        <details open={!status.ok} className="rounded-md border border-line bg-canvas/40">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-[12px] text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            One-time setup
          </summary>
          <div className="space-y-4 border-t border-line p-3">
            <ol className="list-decimal space-y-2 pl-4 text-[12px] leading-relaxed text-muted">
              <li>
                Install the{' '}
                <a
                  href="https://ankiweb.net/shared/info/2055492159"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
                >
                  AnkiConnect add-on
                  <ExternalLink className="h-3 w-3" />
                </a>{' '}
                (code <code className="rounded bg-raised px-1 font-mono text-[11px]">2055492159</code>).
              </li>
              <li>
                In Anki, open <strong className="text-ink">Tools → Add-ons → AnkiConnect → Config</strong>{' '}
                and paste this configuration:
              </li>
            </ol>

            <div className="relative">
              <pre className="overflow-x-auto rounded-md border border-line bg-canvas p-3 font-mono text-[10px] leading-relaxed text-muted">
                {config}
              </pre>
              <button
                type="button"
                onClick={copyConfig}
                title="Copy AnkiConnect config"
                className="absolute right-2 top-2 rounded border border-line bg-panel p-1.5 text-faint transition-colors hover:text-ink"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-faint">
              Restart Anki after saving the config. Anki must stay open while cards are
              added. If you would rather not use AnkiConnect, download a .apkg from the
              review page and import it manually.
            </p>
          </div>
        </details>
      </div>
    </Panel>
  )
}
