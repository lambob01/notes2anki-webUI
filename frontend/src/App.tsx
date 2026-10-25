import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RouteFallback } from '@/components/RouteFallback'
import NotFound from '@/pages/NotFound'

// Route-level chunks keep KaTeX and the review surface out of the initial
// dashboard payload.
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const History = lazy(() => import('@/pages/History'))
const Review = lazy(() => import('@/pages/Review'))
const Settings = lazy(() => import('@/pages/Settings'))

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          {/* Was app/review/[id]/page.tsx under Next's file-based routing. */}
          <Route path="/review/:id" element={<Review />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
