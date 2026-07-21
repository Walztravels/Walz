import type { Metadata, Viewport } from 'next'
import { getAdminSession } from '@/lib/admin-auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminMobilePWA } from '@/components/admin/AdminMobilePWA'
import { TwilioPhonePanel } from '@/components/admin/TwilioPhonePanel'
import { JadeStaffWidget } from './components/JadeStaffWidget'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#0b1f3a',
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
}

export const metadata: Metadata = {
  manifest: '/staff-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Walz Staff',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()

  // Login page — no chrome at all
  if (!session) {
    return <>{children}</>
  }

  return (
    <div className="flex h-[100dvh] bg-[#0a1628] overflow-hidden" style={{ cursor: 'default' }}>

      {/* Sidebar — desktop only */}
      <div className="hidden md:flex flex-shrink-0">
        <AdminSidebar />
      </div>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top header */}
        <AdminHeader adminEmail={session.email} />

        {/* Scrollable page content — extra bottom padding on mobile for nav bar */}
        <main className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-6 lg:p-8 pb-24 md:pb-6 lg:pb-8">
          {children}
        </main>

        {/* Footer — desktop only */}
        <footer className="hidden md:flex flex-shrink-0 border-t border-white/8 bg-[#0d1e35] px-6 py-2 items-center justify-between">
          <span className="text-xs text-white/30 font-medium">
            Walz Travels Admin — Internal Use Only
          </span>
          <span className="text-xs text-white/15">v1.0</span>
        </footer>

      </div>

      {/* Mobile PWA: bottom nav + drawer + SW + install prompt */}
      <AdminMobilePWA />

      {/* Twilio browser phone — floating panel + mobile FAB */}
      <TwilioPhonePanel />

      {/* Jade Staff Assistant — floating widget on all pages except itinerary builder */}
      <JadeStaffWidget />

    </div>
  )
}
