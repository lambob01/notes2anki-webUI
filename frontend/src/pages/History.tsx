import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Clock, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function HistoryPage() {
  const queryClient = useQueryClient()
  const { data: generations, isLoading } = useQuery({
    queryKey: ['generations'],
    queryFn: api.generate.list,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['generations'] })

  const clearAll = useMutation({
    mutationFn: () => api.generate.clear(),
    onSuccess: () => {
      invalidate()
      toast.success('History cleared')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteOne = useMutation({
    mutationFn: (id: string) => api.generate.delete(id),
    onSuccess: () => {
      invalidate()
      toast.success('Generation deleted')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const handleClearAll = () => {
    if (!window.confirm('Delete all generations and their cards, slides, and uploads? This cannot be undone.')) return
    clearAll.mutate()
  }

  const handleDelete = (g: any) => {
    if (!window.confirm(`Delete "${g.title}" and its cards? This cannot be undone.`)) return
    deleteOne.mutate(g.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading history...
      </div>
    )
  }

  const empty = !generations || generations.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Generation History</h1>
          <p className="text-gray-500 mt-1 dark:text-gray-400">View and manage past card generations</p>
        </div>
        <button
          onClick={handleClearAll}
          disabled={empty || clearAll.isPending}
          className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
        >
          {clearAll.isPending ? 'Clearing...' : 'Clear All'}
        </button>
      </div>

      {empty ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Clock className="w-10 h-10 mx-auto mb-3" />
          <p>No generations yet. Create one from the Dashboard.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {generations.map((g: any) => (
            <div key={g.id} className="flex items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow dark:bg-gray-800 dark:border-gray-700">
              <Link to={`/review/${g.id}`} className="flex flex-1 items-center gap-4">
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
              <button
                onClick={() => handleDelete(g)}
                disabled={deleteOne.isPending}
                aria-label={`Delete ${g.title}`}
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
