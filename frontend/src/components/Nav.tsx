import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { Home, Settings, Sparkles, Clock, BookOpen } from 'lucide-react'

const links = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Nav() {
  const pathname = useLocation().pathname
  return (
    <nav className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col p-4 gap-1 shrink-0">
      <div className="flex items-center gap-2 mb-6 px-2">
        <BookOpen className="w-6 h-6 text-indigo-600" />
        <span className="font-bold text-lg">Notes2Anki</span>
      </div>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          to={href}
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            pathname === href
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <Icon className="w-4 h-4" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
