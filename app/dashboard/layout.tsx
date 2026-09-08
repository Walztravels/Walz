// app/dashboard/layout.tsx
// Release 6.2: Auth-gated layout for /dashboard/* routes.
// Mirrors /portal/layout.tsx — provides PortalSidebar (desktop) + PortalBottomNav (mobile).

import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/portal/PortalSidebar'
import { PortalBottomNav } from '@/components/portal/PortalBottomNav'
import { privateMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'

// Authenticated client area — never indexed; no client data in metadata.
export const metadata: Metadata = privateMetadata('Client Dashboard', 'Sign in to manage your Walz Travels trips and bookings.')

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login?callbackUrl=/dashboard')
  }

  return (
    <div className="flex min-h-screen bg-[#060e1c]">
      {/* Sidebar — desktop only */}
      <div className="hidden lg:flex">
        <PortalSidebar
          userName={session.user?.name ?? session.user?.email ?? 'Client'}
          userEmail={session.user?.email ?? ''}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-auto">
        {children}
      </div>

      {/* Bottom nav — mobile only */}
      <PortalBottomNav />
    </div>
  )
}
