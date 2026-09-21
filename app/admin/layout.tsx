import type { Metadata, Viewport } from 'next'
import { getAdminSession } from '@/lib/admin-auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AdminMobilePWA } from '@/components/admin/AdminMobilePWA'
import { TwilioPhonePanel } from '@/components/admin/TwilioPhonePanel'
import { JadeStaffWidget } from './components/JadeStaffWidget'
import { FloatingTeamHubProvider } from './team/floating/FloatingTeamHubProvider'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#0b1f3a',
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
}

export const metadata: Metadata = {
  // Internal staff area — never indexed. Authentication is the real
  // protection; robots directives are defence in depth.
  title: 'Walz Admin',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
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
    <FloatingTeamHubProvider>
      <div className="flex h-[100dvh] bg-[#0a1628] overflow-hidden" data-admin-layout style={{ cursor: 'default' }}>

        {/* Sidebar — desktop only */}
        <div className="hidden md:flex flex-shrink-0">
          <AdminSidebar />
        </div>

        {/* Main column */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Top header */}
          <AdminHeader adminEmail={session.email} />

          {/* Scrollable page content — extra bottom padding on mobile for nav bar.
              INBOX UX-1: a route that marks its root with [data-inbox-fullbleed]
              (the inbox) takes ownership of this box instead — globals.css zeroes
              the padding and sets overflow:hidden via main:has([data-inbox-fullbleed]),
              so that route's internal panes are the only scrollers.
              data-admin-content-area: the Admin-wide Floating Team Hub (UI-only —
              app/admin/team/floating/FloatingTeamHubContext.tsx) reads this
              element's live getBoundingClientRect() to drag/resize/maximize
              the floating window within exactly this region — never over the
              sidebar/header/footer, and always correct at any viewport size
              without hard-coding any of their pixel dimensions. */}
          <main data-admin-content-area className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-6 lg:pb-8">
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
    </FloatingTeamHubProvider>
  )
}
