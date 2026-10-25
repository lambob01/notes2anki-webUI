import { Panel, Skeleton, SkeletonText } from '@/components/ui'

export function RouteFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-line pb-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <Panel className="space-y-3 p-4">
        <Skeleton className="h-5 w-40" />
        <SkeletonText lines={2} />
      </Panel>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <Panel key={index} className="space-y-3 p-4">
            <Skeleton className="h-36 w-full" />
            <SkeletonText lines={3} />
          </Panel>
        ))}
      </div>
    </div>
  )
}
