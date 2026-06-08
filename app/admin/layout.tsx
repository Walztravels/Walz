import { getAdminSession } from '@/lib/admin-auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()

  // Login page — no chrome at all
  if (!session) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden">

      {/* Sidebar — always visible */}
      <AdminSidebar />

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top header */}
        <AdminHeader adminEmail={session.email} />

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>

        {/* Minimal admin footer */}
        <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">
            Walz Travels Admin — Internal Use Only
          </span>
          <span className="text-xs text-gray-300">v1.0</span>
        </footer>

      </div>
    </div>
  )
}
