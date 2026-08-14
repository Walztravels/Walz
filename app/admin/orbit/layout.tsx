import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin-auth'

export default async function OrbitLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()

  if (!session) {
    redirect('/admin/login')
  }

  if (session.role !== 'super_admin') {
    // Hard 403 — not a redirect, not a soft block
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center space-y-3">
          <p className="text-5xl font-bold text-red-500">403</p>
          <p className="text-lg font-medium">Access Denied</p>
          <p className="text-sm text-gray-400">Orbit is restricted to super-admin users.</p>
          <a href="/admin/dashboard" className="inline-block mt-4 text-sm text-blue-400 underline">
            Back to dashboard
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-6">
        <span className="font-bold tracking-tight text-white text-lg">
          <span className="text-indigo-400">Orbit</span>
          <span className="ml-2 text-xs text-gray-500 font-normal">Internal SEO Platform</span>
        </span>
        <div className="flex gap-4 text-sm">
          <a href="/admin/orbit/dashboard" className="text-gray-300 hover:text-white transition-colors">Dashboard</a>
          <a href="/admin/orbit/audit" className="text-gray-300 hover:text-white transition-colors">Audits</a>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span>{session.email}</span>
          <a href="/admin/dashboard" className="text-gray-400 hover:text-white transition-colors">← Admin</a>
        </div>
      </nav>
      <main className="px-6 py-8 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  )
}
