import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { Home, Settings, Sparkles, Clock, BookOpen, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'

const links = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Nav() {
  const pathname = useLocation().pathname
  const { theme, toggle } = useTheme()
  return (
    <nav className="w-56 min-h-screen bg-white border-r border-gray-200 dark:bg-gray-900 dark:border-gray-800 flex flex-col p-4 gap-1 shrink-0">
      <div className="flex items-center gap-2 mb-6 px-2">
        <BookOpen className="w-6 h-6 text-red-600 dark:text-red-400" />
        <span className="font-bold text-lg">Notes2Anki</span>
      </div>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          to={href}
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            pathname === href
              ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
          )}
        >
          <Icon className="w-4 h-4" />
          {label}
        </Link>
      ))}
      <button
        onClick={toggle}
        className="mt-auto flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
      </button>
    </nav>
  )
}
