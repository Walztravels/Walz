import { getAdminSession } from '@/lib/admin-auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware already protects all /admin/* routes except /admin/login.
  // Here we just decide whether to show the sidebar shell (authenticated pages)
  // or pass through bare (login page — session will be null).
  const session = await getAdminSession()

  if (!session) {
    // Login page — no chrome
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-[#F4F6F9]">
      <AdminSidebar adminEmail={session.email} />
      <div className="flex-1 flex flex-col min-h-screen">
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
