import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-raised px-1.5 font-mono text-[10px] leading-none text-muted',
        className
      )}
    >
      {children}
    </kbd>
  )
}
