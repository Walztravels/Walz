// app/dashboard/notifications/page.tsx — Release 6.4: Notification center RSC

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, Bell, CheckCheck, Plane, Sparkles, FileText, Package2, Wifi, User, AlertCircle } from 'lucide-react'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

type NotificationCategory = 'PROPOSAL' | 'PAYMENT' | 'BOOKING' | 'DOCUMENT' | 'TRAVELLER' | 'ESIM' | 'ACCOUNT' | 'ACTION'

function CategoryIcon({ category }: { category: string }) {
  switch (category as NotificationCategory) {
    case 'PROPOSAL': return <Sparkles className="w-4 h-4 text-[#C9A84C]" />
    case 'PAYMENT':  return <Package2  className="w-4 h-4 text-green-400" />
    case 'BOOKING':  return <Plane     className="w-4 h-4 text-blue-400" />
    case 'DOCUMENT': return <FileText  className="w-4 h-4 text-orange-400" />
    case 'TRAVELLER': return <User     className="w-4 h-4 text-purple-400" />
    case 'ESIM':     return <Wifi      className="w-4 h-4 text-cyan-400" />
    case 'ACTION':   return <AlertCircle className="w-4 h-4 text-red-400" />
    default:         return <Bell      className="w-4 h-4 text-white/50" />
  }
}

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/notifications')

  const notifications = await prisma.portalNotification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const unreadCount = notifications.filter(n => !n.read).length
  const recent  = notifications.filter(n => !n.read)
  const earlier = notifications.filter(n => n.read)

  function NotifCard({ n }: { n: typeof notifications[0] }) {
    const data = (n.data && typeof n.data === 'object') ? n.data as Record<string, unknown> : {}
    const href = (n as Record<string, unknown>).href as string | null ?? null

    const inner = (
      <div className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
        !n.read
          ? 'bg-[#0B1F3A] border-[#C9A84C]/20'
          : 'bg-white/4 border-white/6'
      }`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          !n.read ? 'bg-[#C9A84C]/10' : 'bg-white/6'
        }`}>
          <CategoryIcon category={(n as Record<string, unknown>).category as string ?? 'ACCOUNT'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold leading-tight ${!n.read ? 'text-white' : 'text-white/70'}`}>
              {n.title}
            </p>
            {!n.read && <span className="w-2 h-2 bg-[#C9A84C] rounded-full flex-shrink-0 mt-1" />}
          </div>
          <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{n.body}</p>
          <p className="text-white/25 text-xs mt-1.5">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    )

    if (href && href.startsWith('/')) {
      return <Link href={href} className="block hover:opacity-90 transition-opacity">{inner}</Link>
    }
    return inner
  }

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-2xl">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[#C9A84C]" />
            <h1 className="text-white font-bold text-2xl">Notifications</h1>
            {unreadCount > 0 && (
              <span className="text-xs bg-[#C9A84C] text-[#0B1F3A] px-2 py-0.5 rounded-full font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <form action="/api/portal/notifications" method="POST">
              <input type="hidden" name="_method" value="PATCH" />
              {/* Mark all read handled client-side via API */}
              <MarkAllReadButton />
            </form>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <h3 className="text-white font-semibold text-base mb-2">No notifications yet</h3>
            <p className="text-white/40 text-sm max-w-xs mx-auto">
              Updates about your bookings, proposals and documents will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {recent.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider">
                    Unread
                    <span className="ml-2 text-white/20 font-normal normal-case">{recent.length}</span>
                  </h2>
                  {recent.length > 0 && <MarkAllReadButton compact />}
                </div>
                <div className="space-y-2">
                  {recent.map(n => <NotifCard key={n.id} n={n} />)}
                </div>
              </div>
            )}

            {earlier.length > 0 && (
              <div>
                <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
                  Earlier
                  <span className="ml-2 text-white/20 font-normal normal-case">{earlier.length}</span>
                </h2>
                <div className="space-y-2">
                  {earlier.map(n => <NotifCard key={n.id} n={n} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Client island for mark-all-read button
function MarkAllReadButton({ compact }: { compact?: boolean }) {
  return <MarkAllReadClient compact={compact} />
}

import MarkAllReadClient from './_components/MarkAllReadClient'
