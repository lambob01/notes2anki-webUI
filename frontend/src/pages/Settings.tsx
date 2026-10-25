import { useSearchParams } from 'react-router-dom'
import { LayoutTemplate, Palette, Plug, Zap } from 'lucide-react'
import { PageHeader, Tabs } from '@/components/ui'
import { AnkiTab } from '@/pages/settings/AnkiTab'
import { AppearanceTab } from '@/pages/settings/AppearanceTab'
import { ProvidersTab } from '@/pages/settings/ProvidersTab'
import { TemplatesTab } from '@/pages/settings/TemplatesTab'

const TABS = [
  { id: 'providers', label: 'Providers', icon: Plug },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'anki', label: 'Anki', icon: Zap },
  { id: 'appearance', label: 'Appearance', icon: Palette },
]

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') ?? 'providers'
  const tab = TABS.some((item) => item.id === requested) ? requested : 'providers'

  const changeTab = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', id)
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Connect providers, shape your card templates, and configure Anki."
      />

      <Tabs ariaLabel="Settings sections" tabs={TABS} value={tab} onChange={changeTab} />

      <div>
        {tab === 'providers' ? <ProvidersTab /> : null}
        {tab === 'templates' ? <TemplatesTab /> : null}
        {tab === 'anki' ? <AnkiTab /> : null}
        {tab === 'appearance' ? <AppearanceTab /> : null}
      </div>
    </div>
  )
}
