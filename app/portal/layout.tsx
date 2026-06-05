import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PortalSidebar } from '@/components/portal/PortalSidebar'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    // Middleware should have already redirected, but this is the safety net.
    // Read the current path so we can pass it as callbackUrl.
    const headersList = headers()
    const pathname = headersList.get('x-invoke-path') ?? '/portal/dashboard'
    redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`)
  }

  return (
    <div className="flex min-h-screen bg-[#F4F6F9]">
      <PortalSidebar
        userName={session.user?.name ?? session.user?.email ?? 'Client'}
        userEmail={session.user?.email ?? ''}
      />
      <div className="flex-1 flex flex-col min-h-screen overflow-auto">
        {children}
      </div>
    </div>
  )
}
