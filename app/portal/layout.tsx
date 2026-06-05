import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/portal/PortalSidebar'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  // Login page — no sidebar chrome
  // We detect by checking if children is the login page via URL
  // Layout wraps all /portal/* including /portal/login
  // For login page, session will be null and we render bare
  if (!session) {
    // Pass through bare — login page handles its own UI
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-[#F4F6F9]">
      <PortalSidebar userName={session.user?.name ?? session.user?.email ?? 'Client'} userEmail={session.user?.email ?? ''} />
      <div className="flex-1 flex flex-col min-h-screen overflow-auto">
        {children}
      </div>
    </div>
  )
}
