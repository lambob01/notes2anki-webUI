import { cn } from '@/lib/cn'

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('text-ink', className)}
    >
      <rect x="3" y="4.5" width="18" height="3.5" rx="1.75" fill="currentColor" />
      <rect
        x="3"
        y="10.25"
        width="13.5"
        height="3.5"
        rx="1.75"
        fill="currentColor"
        opacity="0.72"
      />
      <rect
        x="3"
        y="16"
        width="9"
        height="3.5"
        rx="1.75"
        fill="currentColor"
        opacity="0.42"
      />
    </svg>
  )
}
