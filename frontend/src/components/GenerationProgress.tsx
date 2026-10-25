import { Brain, FileImage, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  phase: string | null
  totalSlides: number
  completedSlides: number
  cardsGenerated: number
  failedSlides?: number
}

const PHASE_LABELS: Record<string, string> = {
  starting: 'Starting up',
  analyzing: 'Reading the document for overall context',
  rendering: 'Rendering slides to images',
  generating: 'Generating flashcards',
  writing: 'Writing flashcards from the topic',
  done: 'Complete',
  failed: 'Failed',
  skipped_all_duplicates: 'No new slides to process',
}

const PHASE_ICONS: Record<string, typeof Loader2> = {
  analyzing: Brain,
  rendering: FileImage,
  generating: Sparkles,
  writing: Sparkles,
}

export function GenerationProgress({
  phase,
  totalSlides,
  completedSlides,
  cardsGenerated,
  failedSlides = 0,
}: Props) {
  const label = PHASE_LABELS[phase ?? ''] ?? 'Working'
  const Icon = PHASE_ICONS[phase ?? ''] ?? Loader2
  const determinate = totalSlides > 0
  const pct = determinate
    ? Math.min(100, Math.round((completedSlides / totalSlides) * 100))
    : 0

  return (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-panel">
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'h-4 w-4 text-muted',
            phase !== 'done' && 'animate-pulse'
          )}
        />
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {determinate ? (
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">
            {completedSlides} / {totalSlides} slides
          </span>
        ) : null}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
        {determinate ? (
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-[progressSlide_1.4s_ease-in-out_infinite] rounded-full bg-ink/50" />
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <p className="eyebrow">Progress</p>
          <p className="mt-0.5 font-mono text-[13px] tabular-nums text-ink">
            {determinate ? `${pct}%` : '—'}
          </p>
        </div>
        <div>
          <p className="eyebrow">Cards so far</p>
          <p className="mt-0.5 font-mono text-[13px] tabular-nums text-ink">
            {cardsGenerated}
          </p>
        </div>
        <div>
          <p className="eyebrow">Failures</p>
          <p
            className={cn(
              'mt-0.5 font-mono text-[13px] tabular-nums',
              failedSlides > 0 ? 'text-warning' : 'text-ink'
            )}
          >
            {failedSlides}
          </p>
        </div>
      </div>
    </div>
  )
}
