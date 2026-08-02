import { useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, Copy, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { anki, AnkiConnectError } from '@/lib/ankiconnect'

export function AnkiConnectPanel() {
  const [status, setStatus] = useState<'unknown' | 'ok' | 'error'>('unknown')
  const [detail, setDetail] = useState<string>('')
  const [testing, setTesting] = useState(false)

  const origin = window.location.origin

  const test = async () => {
    setTesting(true)
    try {
      const version = await anki.version()
      const decks = await anki.deckNames()
      setStatus('ok')
      setDetail(`AnkiConnect v${version} · ${decks.length} deck(s) found`)
      toast.success('Connected to Anki')
    } catch (e: any) {
      setStatus('error')
      setDetail(e instanceof AnkiConnectError ? e.message : String(e))
    }
    setTesting(false)
  }

  const copyOrigin = () => {
    navigator.clipboard.writeText(origin)
    toast.success('Origin copied')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-600" />
          <h2 className="font-semibold text-gray-700">Anki Connection</h2>
        </div>
        <button
          onClick={test}
          disabled={testing}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
          Test connection
        </button>
      </div>

      {status !== 'unknown' && (
        <div
          className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
            status === 'ok'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {status === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{detail}</span>
        </div>
      )}

      <div className="text-sm text-gray-600 space-y-3">
        <p className="text-gray-500">
          Cards are sent from your browser straight to Anki, so Anki never has to
          be reachable over the network. One-time setup:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-600">
          <li>
            Install the{' '}
            <a
              href="https://ankiweb.net/shared/info/2055492159"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              AnkiConnect add-on
            </a>{' '}
            (code <code className="bg-gray-100 px-1 rounded">2055492159</code>).
          </li>
          <li>
            In Anki: <strong>Tools → Add-ons → AnkiConnect → Config</strong>, and
            add this page's address to <code>webCorsOriginList</code>:
          </li>
        </ol>

        <div className="relative">
          <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
{`{
    "webCorsOriginList": [
        "http://localhost",
        "${origin}"
    ]
}`}
          </pre>
          <button
            onClick={copyOrigin}
            title="Copy this app's origin"
            className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Restart Anki after editing the config. Anki must stay open while adding
          cards. If you'd rather not use AnkiConnect at all, the Review page can
          still download a .apkg file to import manually.
        </p>
      </div>
    </div>
  )
}
