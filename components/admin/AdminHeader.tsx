'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Bell, LogOut, ChevronRight } from 'lucide-react'

// ── Page title map ────────────────────────────────────────────────────────────
const PAGE_META: Record<string, { title: string; section: string }> = {
  '/admin/dashboard':           { title: 'Dashboard',         section: 'Overview' },
  '/admin/clients':             { title: 'All Clients',        section: 'Clients' },
  '/admin/clients/new':         { title: 'New Client',         section: 'Clients' },
  '/admin/leads':               { title: 'Leads',              section: 'Clients' },
  '/admin/bookings':            { title: 'All Bookings',       section: 'Bookings' },
  '/admin/flights':             { title: 'Flights',            section: 'Bookings' },
  '/admin/tours':               { title: 'Tours',              section: 'Content' },
  '/admin/visa-applications':   { title: 'Visa Applications',  section: 'Visa' },
  '/admin/visa-intelligence':   { title: 'Visa Intelligence',  section: 'Visa' },
  '/admin/visa':                { title: 'Visa Services',      section: 'Visa' },
  '/admin/blog':                { title: 'Blog',               section: 'Content' },
  '/admin/vouchers':            { title: 'Gift Vouchers',      section: 'Content' },
  '/admin/images':              { title: 'Images',             section: 'Content' },
  '/admin/widgets':             { title: 'Widgets',            section: 'Content' },
  '/admin/staff':               { title: 'Staff',              section: 'Team' },
  '/admin/activity':            { title: 'Activity Log',       section: 'Team' },
  '/admin/settings':            { title: 'Settings',           section: 'Settings' },
  '/admin/settings/payments':   { title: 'Payments',           section: 'Settings' },
  '/admin/settings/emails':     { title: 'Emails',             section: 'Settings' },
  '/admin/portal':              { title: 'Client Portal',      section: 'Admin' },
}

function getPageMeta(pathname: string) {
  // Exact match first
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  // Prefix match for detail pages (e.g. /admin/visa-applications/[id])
  const sorted = Object.keys(PAGE_META).sort((a, b) => b.length - a.length)
  for (const key of sorted) {
    if (pathname.startsWith(key + '/')) return PAGE_META[key]
  }
  return { title: 'Admin', section: 'Admin' }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  adminEmail: string
}

export function AdminHeader({ adminEmail }: Props) {
  const pathname = usePathname() ?? ''
  const router   = useRouter()
  const { title, section } = getPageMeta(pathname)

  // Derive display name from email (e.g. jade@walztravels.com → Jade)
  const displayName = adminEmail.split('@')[0]
    .replace(/[._-]/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  async function handleLogout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <header className="flex-shrink-0 h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 z-10">

      {/* Page title + breadcrumb */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span>Admin</span>
          <ChevronRight className="w-3 h-3" />
          <span>{section}</span>
          {section !== title && (
            <>
              <ChevronRight className="w-3 h-3" />
              <span className="text-gray-600 font-medium">{title}</span>
            </>
          )}
        </div>
        <h1 className="text-base font-bold text-[#0B1F3A] leading-tight">{title}</h1>
      </div>

      {/* Right — user + actions */}
      <div className="flex items-center gap-3 flex-shrink-0">

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700">
          <Bell className="w-4 h-4" />
        </button>

        {/* User pill */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-7 h-7 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
            <span className="text-[#C9A84C] text-xs font-bold">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-[#0B1F3A] leading-none">{displayName}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-none">{adminEmail}</p>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          title="Sign out"
          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>

      </div>
    </header>
  )
}
