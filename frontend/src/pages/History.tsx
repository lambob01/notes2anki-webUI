import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Clock, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function HistoryPage() {
  const { data: generations, isLoading } = useQuery({
    queryKey: ['generations'],
    queryFn: api.generate.list,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading history...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Generation History</h1>
        <p className="text-gray-500 mt-1 dark:text-gray-400">View and manage past card generations</p>
      </div>

      {(!generations || generations.length === 0) ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Clock className="w-10 h-10 mx-auto mb-3" />
          <p>No generations yet. Create one from the Dashboard.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {generations.map((g: any) => (
            <Link
              key={g.id}
              to={`/review/${g.id}`}
              className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow dark:bg-gray-800 dark:border-gray-700"
            >
              {g.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {g.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
              {g.status === 'running' && <Loader2 className="w-5 h-5 text-red-500 animate-spin" />}
              {g.status === 'pending' && <Clock className="w-5 h-5 text-gray-400" />}

              <div className="flex-1">
                <p className="text-sm font-medium">{g.title}</p>
                <p className="text-xs text-gray-400">
                  {g.model_name} &middot; {g.deck_name} &middot; {g.cards?.length || 0} cards
                </p>
              </div>

              <div className="text-xs text-gray-400">
                {new Date(g.created_at).toLocaleDateString()}
              </div>

              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                g.status === 'completed' ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                g.status === 'failed' ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                g.status === 'running' ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {g.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
