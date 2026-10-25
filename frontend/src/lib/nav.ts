import { Clock, Settings, Sparkles, type LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  keys: string
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'New generation', icon: Sparkles, keys: 'G D' },
  { href: '/history', label: 'History', icon: Clock, keys: 'G H' },
  { href: '/settings', label: 'Settings', icon: Settings, keys: 'G S' },
]

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  if (href === '/history') {
    return pathname.startsWith('/history') || pathname.startsWith('/review')
  }
  return pathname.startsWith(href)
}

export function routeTitle(pathname: string): string {
  if (pathname.startsWith('/history')) return 'History'
  if (pathname.startsWith('/review')) return 'Review'
  if (pathname.startsWith('/settings')) return 'Settings'
  return 'New generation'
}
