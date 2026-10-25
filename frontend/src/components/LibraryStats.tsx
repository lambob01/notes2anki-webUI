import { formatRelativeTime } from '@/lib/format'
import { Skeleton } from '@/components/ui'

function Stat({
  label,
  value,
  loading,
}: {
  label: string
  value: string
  loading?: boolean
}) {
  return (
    <div className="px-4 py-3">
      <p className="eyebrow">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-16" />
      ) : (
        <p className="mt-1 font-mono text-lg tabular-nums leading-none text-ink">{value}</p>
      )}
    </div>
  )
}

export function LibraryStats({
  generations,
  loading,
}: {
  generations: any[] | undefined
  loading: boolean
}) {
  const runs = generations?.length ?? 0
  const cards = (generations ?? []).reduce(
    (sum: number, generation: any) => sum + (generation.card_count ?? 0),
    0
  )
  const decks = new Set(
    (generations ?? []).map((generation: any) => generation.deck_name).filter(Boolean)
  ).size
  const last = generations?.[0]?.created_at

  return (
    <div className="grid grid-cols-4 divide-x divide-line rounded-lg border border-line bg-panel shadow-panel">
      <Stat label="Generations" value={String(runs)} loading={loading} />
      <Stat label="Cards" value={String(cards)} loading={loading} />
      <Stat label="Decks" value={String(decks)} loading={loading} />
      <Stat label="Last run" value={formatRelativeTime(last)} loading={loading} />
    </div>
  )
}
