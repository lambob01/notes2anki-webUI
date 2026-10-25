import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

const ACTIVE = new Set(['running', 'pending'])

/**
 * Shared generations query. Polls only while a run is active, so the sidebar,
 * history table, dashboard stats, and recent list stay in sync without a
 * permanent timer.
 */
export function useGenerations() {
  return useQuery({
    queryKey: ['generations'],
    queryFn: api.generate.list,
    staleTime: 2000,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined
      return data?.some((generation) => ACTIVE.has(generation.status)) ? 3000 : false
    },
    refetchIntervalInBackground: true,
  })
}

export function useActiveGeneration() {
  const query = useGenerations()
  const active = (query.data ?? []).filter((generation: any) =>
    ACTIVE.has(generation.status)
  )
  return {
    ...query,
    active: active[0] ?? null,
    activeCount: active.length,
  }
}
