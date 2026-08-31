// app/dashboard/page.tsx — Release 6.2: Unified Client Portal Dashboard (RSC)
// Server-side data fetch via getDashboardData. Layout provides sidebar + bottom nav.
// Proposals section (new), action-required section (new), existing sections retained.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Plane, Hotel, Map, FileText, Gift, Upload,
  MessageCircle, Shield, Globe, Compass, AlertCircle,
  ChevronRight, Clock, ArrowRight, Sparkles, Package2,
} from 'lucide-react'
import { getDashboardData } from '@/lib/portal/dashboard-data'
import { deriveCustomerActions } from '@/lib/portal/customer-actions'
import {
  proposalStatusLabel, proposalStatusColor, proposalNeedsAction,
  applicationStageLabel, applicationStageColor, applicationStageProgress,
  bookingStatusLabel, bookingStatusColor,
} from '@/lib/portal/status-normalizers'
import { NotificationsBell } from './_components/NotificationsBell'
import prisma from '@/lib/db'
import { getPassportExpiryStatus } from '@/lib/portal/traveller-dto'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard')

  const userId = session.user.id

  const [data, unreadCount, vault] = await Promise.all([
    getDashboardData(userId, session.user.email ?? ''),
    prisma.portalNotification.count({ where: { userId, read: false } }),
    prisma.passportVault.findUnique({ where: { userId }, select: { expiryDate: true } }).catch(() => null),
  ])

  const actions = deriveCustomerActions({ applications: data.applications, proposals: data.proposals })

  const passportExpiryStatus = vault?.expiryDate
    ? getPassportExpiryStatus(vault.expiryDate)
    : 'NOT_PROVIDED'

  const firstName = session.user.name?.split(' ')[0] || session.user.email?.split('@')[0] || 'there'
  const apps      = data.applications
  const bookings  = data.bookings
  const proposals = data.proposals
  const vouchers  = [...data.purchasedVouchers, ...data.giftVouchers].filter(v => v.active)

  return (
    <div className="min-h-screen bg-[#060e1c]">

      {/* ── Mobile top bar ──────────────────────────── */}
      <header className="lg:hidden bg-[#0B1F3A] border-b border-white/8 px-5 py-3 flex items-center justify-between sticky top-0 z-30">
        <span className="text-white font-bold text-sm">Client Portal</span>
        <NotificationsBell />
      </header>

      {/* ── Desktop top bar ─────────────────────────── */}
      <header className="hidden lg:flex bg-[#0B1F3A]/60 border-b border-white/5 px-8 py-3 items-center justify-between sticky top-0 z-30">
        <p className="text-white/50 text-sm">Client Portal</p>
        <NotificationsBell />
      </header>

      {/* ── Welcome ─────────────────────────────────── */}
      <div className="bg-[#0B1F3A]/60 border-b border-white/5 px-5 lg:px-8 py-8">
        <p className="text-[#C9A84C] text-xs uppercase tracking-widest font-semibold mb-1">My Portal</p>
        <h1 className="text-white text-2xl lg:text-3xl font-bold">Welcome back, {firstName}</h1>
        <p className="text-white/40 text-sm mt-1">Your travel hub — itineraries, applications, and bookings in one place.</p>

        <div className="grid grid-cols-4 gap-3 mt-6 max-w-sm">
          <StatTile value={data.stats.pendingProposals}   label="Proposals"    />
          <StatTile value={data.stats.activeApplications} label="Applications" />
          <StatTile value={bookings.length}               label="Bookings"     />
          <StatTile value={vouchers.length}               label="Vouchers"     />
        </div>
      </div>

      <div className="px-5 lg:px-8 py-8 space-y-6 pb-24">

        {/* ── Action required ─────────────────────── */}
        {actions.length > 0 && (
          <div className="space-y-2">
            {actions.map(action => (
              <Link key={action.id} href={action.href}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
                  action.priority === 'urgent'
                    ? 'bg-amber-500/10 border-amber-500/25 hover:border-amber-500/40'
                    : 'bg-blue-500/8 border-blue-500/20 hover:border-blue-500/35'
                }`}>
                <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${action.priority === 'urgent' ? 'text-amber-400' : 'text-blue-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${action.priority === 'urgent' ? 'text-amber-300' : 'text-blue-300'}`}>{action.label}</p>
                  <p className="text-xs text-white/50 mt-0.5">{action.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {/* ── Notification banner ─────────────────── */}
        {unreadCount > 0 && (
          <Link href="/dashboard/notifications"
            className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/8 border border-blue-500/20 hover:border-blue-500/35 transition-all group">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex-shrink-0">
              {unreadCount}
            </span>
            <p className="flex-1 text-sm text-blue-300 font-medium">
              {unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`}
            </p>
            <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
          </Link>
        )}

        {/* ── Passport expiry warning ──────────────── */}
        {(passportExpiryStatus === 'EXPIRES_SOON' || passportExpiryStatus === 'EXPIRED') && (
          <Link href="/portal/passport-vault"
            className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/40 transition-all">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">
                {passportExpiryStatus === 'EXPIRED' ? 'Passport expired' : 'Passport expiring soon'}
              </p>
              <p className="text-xs text-white/50 mt-0.5">
                {passportExpiryStatus === 'EXPIRED'
                  ? 'Your passport has expired. Update your details before your next booking.'
                  : 'Your passport expires within 6 months. Some destinations require more validity.'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
          </Link>
        )}

        {/* ── Quick actions ────────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { href: '/portal/documents',            icon: Upload,         label: 'Upload Docs', cls: 'text-purple-400 bg-purple-500/10' },
            { href: '/flights',                      icon: Plane,          label: 'Book Flight', cls: 'text-blue-400 bg-blue-500/10' },
            { href: '/insurance',                    icon: Shield,         label: 'Insurance',   cls: 'text-[#C9A84C] bg-amber-500/10' },
            { href: '/tours',                        icon: Map,            label: 'Book Tour',   cls: 'text-green-400 bg-green-500/10' },
            { href: '/gift',                         icon: Gift,           label: 'Voucher',     cls: 'text-amber-400 bg-amber-500/10' },
            { href: 'https://wa.me/12317902336',     icon: MessageCircle,  label: 'WhatsApp',    cls: 'text-green-400 bg-green-500/10', ext: true },
          ].map(({ href, icon: Icon, label, cls, ext }) => (
            ext ? (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/8 hover:border-white/15 hover:bg-white/8 transition-all text-center">
                <div className={`w-9 h-9 rounded-lg ${cls} flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-white/60">{label}</span>
              </a>
            ) : (
              <Link key={label} href={href}
                className="flex flex-col items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/8 hover:border-white/15 hover:bg-white/8 transition-all text-center">
                <div className={`w-9 h-9 rounded-lg ${cls} flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
                <span className="text-xs font-medium text-white/60">{label}</span>
              </Link>
            )
          ))}
        </div>

        {/* ── Ask Jade CTA ─────────────────────────── */}
        <Link href="/dashboard/jade"
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#C9A84C]/10 to-[#C9A84C]/5 border border-[#C9A84C]/20 hover:border-[#C9A84C]/40 transition-all group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#a87e38] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-[#0B1F3A]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Ask Jade</p>
            <p className="text-white/40 text-xs">Your personal Walz Travels concierge — trips, bookings, and more</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#C9A84C]/60 group-hover:text-[#C9A84C] transition-colors flex-shrink-0" />
        </Link>

        {/* ── My Itineraries (proposals) ───────────── */}
        {proposals.length > 0 && (
          <Card
            title="My Itineraries"
            icon={<Sparkles className="w-4 h-4 text-[#C9A84C]" />}
            count={proposals.filter(p => proposalNeedsAction(p.status)).length || undefined}
            viewAll="/dashboard/proposals"
          >
            <div className="space-y-3">
              {proposals.slice(0, 3).map(p => (
                <Link key={p.id} href={`/itinerary/${p.referenceNumber}`}
                  className="block rounded-xl bg-white/5 border border-white/8 p-4 hover:border-[#C9A84C]/30 transition-all group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${proposalStatusColor(p.status)}`}>
                          {proposalStatusLabel(p.status)}
                        </span>
                        <span className="text-xs text-white/30 font-mono">{p.referenceNumber}</span>
                      </div>
                      <h3 className="font-bold text-white text-sm leading-tight group-hover:text-[#C9A84C] transition-colors">{p.title}</h3>
                      <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {p.destination}
                        {p.startDate && <span>· {format(new Date(p.startDate), 'MMM yyyy')}</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p.totalPrice != null && (
                        <p className="text-[#C9A84C] font-bold text-sm">{p.currency} {p.totalPrice.toLocaleString()}</p>
                      )}
                      <ChevronRight className="w-4 h-4 text-white/30 mt-1 ml-auto" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* ── Applications ──────────────────────────── */}
        <Card
          title="My Applications"
          icon={<FileText className="w-4 h-4 text-[#C9A84C]" />}
          count={apps.length || undefined}
          viewAll="/portal/application"
        >
          {apps.length === 0 ? (
            <Empty icon="🛂" title="No applications yet"
              sub="Your visa, flight, and travel applications will appear here once our team creates them."
              cta={{ label: 'Contact us on WhatsApp', href: 'https://wa.me/12317902336', ext: true }} />
          ) : (
            <div className="space-y-3">
              {apps.map(app => {
                const progress   = applicationStageProgress(app.stage)
                const docsNeeded = app.stage === 'DOCUMENTS_PENDING'
                return (
                  <div key={app.id} className="rounded-xl bg-white/5 border border-white/8 p-4 hover:border-white/15 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${applicationStageColor(app.stage)}`}>
                            {applicationStageLabel(app.stage)}
                          </span>
                          <span className="text-xs text-white/30 font-mono">{app.refNumber}</span>
                          {app.updates.length > 0 && (
                            <span className="text-xs text-[#C9A84C] font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />
                              {app.updates.length} update{app.updates.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-white leading-tight text-sm">{app.title}</h3>
                        {app.destination && (
                          <p className="text-white/40 text-xs mt-0.5">
                            {app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}
                          </p>
                        )}
                      </div>
                      <Link href={`/portal/application/${app.id}`}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 border border-white/15 text-xs font-medium text-white/70 rounded-lg hover:bg-white/8 transition-colors">
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                    {app.stage !== 'REJECTED' && (
                      <div className="mb-2">
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              app.stage === 'APPROVED' || app.stage === 'COMPLETED' ? 'bg-green-500' : 'bg-[#C9A84C]'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-white/30">
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{app.documents.length} doc{app.documents.length !== 1 ? 's' : ''}</span>
                      {app.amount && (
                        <span className="text-white/50 font-medium">
                          {app.currency} {app.amountPaid.toFixed(0)} / {app.amount.toFixed(0)} paid
                        </span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(app.createdAt), 'd MMM yyyy')}</span>
                    </div>
                    {docsNeeded && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1 text-xs">Documents required</span>
                        <Link href="/portal/documents" className="font-semibold text-xs hover:underline whitespace-nowrap">Upload →</Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* ── Bookings ──────────────────────────────── */}
        <Card
          title="My Bookings"
          icon={<Plane className="w-4 h-4 text-[#C9A84C]" />}
          count={bookings.length || undefined}
          viewAll={bookings.length > 3 ? '/dashboard/bookings' : undefined}
        >
          {bookings.length === 0 ? (
            <Empty icon="✈️" title="No bookings yet"
              sub="Flights, hotels and tours booked through Walz Travels appear here."
              cta={{ label: 'Search Flights', href: '/flights' }} />
          ) : (
            <div className="space-y-3">
              {bookings.slice(0, 5).map(b => {
                const det   = ((b.flightDetails ?? b.hotelDetails ?? {}) as Record<string, unknown>)
                const route = b.type === 'FLIGHT'
                  ? `${det.origin || ''} → ${det.destination || ''}`.trim()
                  : b.type === 'HOTEL' ? String(det.name || det.hotelName || '') : ''
                return (
                  <div key={b.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/8">
                    <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                      {b.type === 'FLIGHT'   ? <Plane    className="w-4 h-4 text-blue-400" />   :
                       b.type === 'HOTEL'    ? <Hotel    className="w-4 h-4 text-purple-400" /> :
                       b.type === 'PACKAGE'  ? <Package2 className="w-4 h-4 text-green-400" />  :
                                               <Map      className="w-4 h-4 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold text-white text-sm">{b.type}</span>
                        {route && <span className="text-white/40 text-xs">{route}</span>}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${bookingStatusColor(b.status)}`}>
                          {bookingStatusLabel(b.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-white/30">
                        <span className="font-mono">{b.bookingReference}</span>
                        <span>{b.currency} {b.totalAmount.toFixed(2)}</span>
                        <span>{format(new Date(b.createdAt), 'd MMM yyyy')}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* ── Trips (planner) ───────────────────────── */}
        <Card
          title="My Trips"
          icon={<Compass className="w-4 h-4 text-[#C9A84C]" />}
          viewAll="/plan/library"
        >
          <div className="text-center py-4">
            <p className="text-white/40 text-sm mb-4">Plan and manage your personal trips with our AI-powered trip planner.</p>
            <Link href="/plan/library"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
              <Compass className="w-4 h-4" />
              Open Trip Planner
            </Link>
          </div>
        </Card>

        {/* ── Vouchers ──────────────────────────────── */}
        {vouchers.length > 0 && (
          <Card
            title="My Vouchers"
            icon={<Gift className="w-4 h-4 text-[#C9A84C]" />}
            count={vouchers.length}
          >
            <div className="space-y-2">
              {vouchers.map(v => (
                <div key={v.id} className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <div>
                    <p className="font-mono font-bold text-white text-sm">{v.code}</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {v.currency} {v.remainingAmount.toFixed(2)} · Expires {format(new Date(v.expiresAt), 'd MMM yyyy')}
                    </p>
                  </div>
                  <span className="text-[#C9A84C] text-xs font-bold bg-[#C9A84C]/10 px-3 py-1 rounded-full">Active</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Help ──────────────────────────────────── */}
        <div className="bg-[#0B1F3A] rounded-2xl p-5 border border-white/8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white text-sm">Need help?</h3>
              <p className="text-white/40 text-xs mt-0.5">Our team is on WhatsApp 24/7 for any question.</p>
            </div>
            <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
              Chat Now
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared UI components ──────────────────────────────────────────────────────

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white/5 rounded-xl px-3 py-3 text-center">
      <p className="text-xl font-bold text-[#C9A84C]">{value}</p>
      <p className="text-white/40 text-xs mt-0.5">{label}</p>
    </div>
  )
}

function Card({
  title, icon, count, viewAll, children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  viewAll?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold text-white text-base">{title}</h2>
          {count !== undefined && count > 0 && (
            <span className="text-xs bg-[#C9A84C] text-[#0B1F3A] px-2 py-0.5 rounded-full font-bold">{count}</span>
          )}
        </div>
        {viewAll && (
          <Link href={viewAll} className="flex items-center gap-1 text-xs text-[#C9A84C] font-semibold hover:underline">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Empty({ icon, title, sub, cta }: {
  icon: string
  title: string
  sub: string
  cta?: { label: string; href: string; ext?: boolean }
}) {
  return (
    <div className="text-center py-8">
      <p className="text-4xl mb-3">{icon}</p>
      <h3 className="font-semibold text-white text-sm mb-1">{title}</h3>
      <p className="text-white/40 text-xs max-w-xs mx-auto mb-4">{sub}</p>
      {cta && (
        cta.ext ? (
          <a href={cta.href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
            {cta.label}
          </a>
        ) : (
          <Link href={cta.href}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
            {cta.label}
          </Link>
        )
      )}
    </div>
  )
}
