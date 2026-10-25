import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { buttonVariants, EmptyState, PageHeader } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="404"
        title="Page not found"
        description="The route you followed does not exist in this app."
      />
      <EmptyState
        icon={Compass}
        title="Nothing lives at this address"
        description="Head back to the generation workspace and pick up where you left off."
        action={
          <Link to="/" className={buttonVariants({ variant: 'primary' })}>
            New generation
          </Link>
        }
      />
    </div>
  )
}
