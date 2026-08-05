import { Loader2, FileImage, Brain, Sparkles } from 'lucide-react'

interface Props {
  phase: string | null
  totalSlides: number
  completedSlides: number
  cardsGenerated: number
}

// Ingestion phases have no per-item count, so the bar is indeterminate until
// the slide total is known.
const PHASE_LABELS: Record<string, string> = {
  starting: 'Starting up',
  analyzing: 'Reading the document for overall context',
  rendering: 'Rendering slides to images',
  generating: 'Generating flashcards',
  done: 'Complete',
  failed: 'Failed',
  skipped_all_duplicates: 'No new slides to process',
}

const PHASE_ICONS: Record<string, typeof Loader2> = {
  analyzing: Brain,
  rendering: FileImage,
  generating: Sparkles,
}

export function GenerationProgress({
  phase,
  totalSlides,
  completedSlides,
  cardsGenerated,
}: Props) {
  const label = PHASE_LABELS[phase ?? ''] ?? 'Working'
  const Icon = PHASE_ICONS[phase ?? ''] ?? Loader2
  const determinate = totalSlides > 0
  const pct = determinate
    ? Math.min(100, Math.round((completedSlides / totalSlides) * 100))
    : 0

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-red-600 animate-pulse dark:text-red-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
        {determinate && (
          <span className="text-sm text-gray-400 ml-auto tabular-nums dark:text-gray-500">
            {completedSlides} / {totalSlides} slides
          </span>
        )}
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden dark:bg-gray-700">
        {determinate ? (
          <div
            className="h-full bg-red-600 rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          // Indeterminate: a sliding bar, since we can't know the total yet.
          <div className="h-full w-1/3 bg-red-400 rounded-full animate-[progressSlide_1.4s_ease-in-out_infinite]" />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>
          {cardsGenerated > 0
            ? `${cardsGenerated} card${cardsGenerated === 1 ? '' : 's'} so far`
            : 'No cards yet'}
        </span>
        {determinate && <span className="tabular-nums">{pct}%</span>}
      </div>
    </div>
  )
}
