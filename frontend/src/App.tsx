import { Routes, Route } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import Dashboard from '@/pages/Dashboard'
import History from '@/pages/History'
import Review from '@/pages/Review'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <div className="flex">
      <Nav />
      <main className="flex-1 p-6 max-w-7xl">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          {/* Was app/review/[id]/page.tsx under Next's file-based routing. */}
          <Route path="/review/:id" element={<Review />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
