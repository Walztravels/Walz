'use client'

import { useSession, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Loader2, Plane, Hotel, Map, FileText, Gift, Upload,
  MessageCircle, Shield, Globe, Compass, AlertCircle,
  ChevronRight, CheckCircle, XCircle, Clock, Activity,
  CreditCard, Package2, Car, TicketCheck, LogOut, Signal,
  Download, ArrowRight,
} from 'lucide-react'

type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'AWAITING_DECISION' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

interface Application {
  id: string; refNumber: string; title: string; stage: Stage
  destination: string | null; travelDate: string | null
  amount: number | null; currency: string; amountPaid: number; createdAt: string
  documents: { id: string }[]; checklist: { id: string; completedAt: string | null }[]
  updates?: { id: string; title: string }[]
}

interface Booking {
  id: string; bookingReference: string; type: 'FLIGHT' | 'HOTEL' | 'PACKAGE'
  status: string; totalAmount: number; currency: string
  flightDetails: Record<string, unknown> | null
  hotelDetails: Record<string, unknown> | null; createdAt: string
}

interface DashboardData {
  applications: Application[]
  bookings: Booking[]
  purchasedVouchers: { id: string; code: string; currency: string; remainingAmount: number; expiresAt: string; active: boolean }[]
  giftVouchers: { id: string; code: string; currency: string; remainingAmount: number; expiresAt: string; active: boolean }[]
  stats: { activeApplications: number; upcomingTrips: number; pendingDocuments: number }
}

const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: 'Enquiry', DOCUMENTS_PENDING: 'Docs Needed',
  DOCUMENTS_RECEIVED: 'Docs Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', AWAITING_DECISION: 'Decision Pending',
  APPROVED: 'Approved', REJECTED: 'Refused', COMPLETED: 'Completed',
}

const STAGE_COLOR: Record<Stage, string> = {
  ENQUIRY: 'bg-blue-500/15 text-blue-400', DOCUMENTS_PENDING: 'bg-amber-500/15 text-amber-400',
  DOCUMENTS_RECEIVED: 'bg-yellow-500/15 text-yellow-400', PROCESSING: 'bg-purple-500/15 text-purple-400',
  SUBMITTED: 'bg-indigo-500/15 text-indigo-400', AWAITING_DECISION: 'bg-orange-500/15 text-orange-400',
  APPROVED: 'bg-green-500/15 text-green-400', REJECTED: 'bg-red-500/15 text-red-400',
  COMPLETED: 'bg-white/10 text-white/50',
}

const STAGE_ORDER: Stage[] = ['ENQUIRY','DOCUMENTS_PENDING','DOCUMENTS_RECEIVED','PROCESSING','SUBMITTED','AWAITING_DECISION','APPROVED','COMPLETED']
function stageProgress(s: Stage) {
  if (s === 'REJECTED') return 100
  const i = STAGE_ORDER.indexOf(s)
  return i === -1 ? 0 : Math.round(((i + 1) / STAGE_ORDER.length) * 100)
}

const navLinks = [
  { href: '/plan/library',        label: 'My Trips',      icon: Compass         },
  { href: '/portal/application',  label: 'Applications',  icon: FileText        },
  { href: '/portal/documents',    label: 'Documents',     icon: Upload          },
  { href: '/portal/profile',      label: 'Profile',       icon: Shield          },
]

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [data, setData]     = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState('/walz-logo.png')
  const [trips, setTrips]   = useState<{ id: string; title: string; destination: string; status: string; coverImage: string | null }[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = '/login?callbackUrl=/dashboard'
    }
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/portal/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
    fetch('/api/trips').then(r => r.json()).then(d => { if (d.trips) setTrips(d.trips.slice(0, 3)) }).catch(() => {})
    fetch('/api/media/logo_main').then(r => r.json()).then(d => { if (d.url) setLogoUrl(d.url) }).catch(() => {})
  }, [status])

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="min-h-screen bg-[#060e1c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
          <p className="text-white/40 text-sm">Loading your portal…</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  const firstName = session?.user?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there'
  const d = data
  const apps = d?.applications ?? []
  const bookings = d?.bookings ?? []
  const vouchers = [...(d?.purchasedVouchers ?? []), ...(d?.giftVouchers ?? [])].filter(v => v.active)

  return (
    <div className="min-h-screen bg-[#060e1c]">

      {/* ── Top bar ──────────────────────────────── */}
      <header className="bg-[#0B1F3A] border-b border-white/8 px-5 lg:px-8 py-3 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Walz Travels" className="h-8 w-auto object-contain brightness-0 invert" />
            <div className="h-4 w-px bg-white/20 hidden sm:block" />
            <span className="text-white/50 text-sm hidden sm:block">Client Portal</span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/8 text-sm transition-all">
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="text-white/50 text-sm hidden lg:block">{session?.user?.email}</span>
            <button onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 text-sm transition-all">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Welcome bar ──────────────────────────── */}
      <div className="bg-[#0B1F3A]/60 border-b border-white/5 px-5 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-[#C9A84C] text-xs uppercase tracking-widest font-semibold mb-1">My Portal</p>
          <h1 className="text-white text-2xl lg:text-3xl font-bold">Welcome back, {firstName} 👋</h1>
          <p className="text-white/40 text-sm mt-1">Your travel portal — applications, bookings & vouchers in one place.</p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-6 max-w-sm">
            <div className="bg-white/5 rounded-xl px-3 py-3 text-center">
              <p className="text-xl font-bold text-[#C9A84C]">{d?.stats?.activeApplications ?? 0}</p>
              <p className="text-white/40 text-xs mt-0.5">Applications</p>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-3 text-center">
              <p className="text-xl font-bold text-[#C9A84C]">{bookings.length}</p>
              <p className="text-white/40 text-xs mt-0.5">Bookings</p>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-3 text-center">
              <p className="text-xl font-bold text-[#C9A84C]">{vouchers.length}</p>
              <p className="text-white/40 text-xs mt-0.5">Vouchers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 lg:px-8 py-8 space-y-6 pb-24">

        {/* ── Quick actions ─────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { href: '/portal/documents', icon: Upload,         label: 'Upload Docs',  cls: 'text-purple-400 bg-purple-500/10' },
            { href: '/flights',          icon: Plane,          label: 'Book Flight',  cls: 'text-blue-400 bg-blue-500/10' },
            { href: '/insurance',        icon: Shield,         label: 'Insurance',    cls: 'text-[#C9A84C] bg-amber-500/10' },
            { href: '/tours',            icon: Map,            label: 'Book Tour',    cls: 'text-green-400 bg-green-500/10' },
            { href: '/gift',             icon: Gift,           label: 'Gift Voucher', cls: 'text-amber-400 bg-amber-500/10' },
            { href: 'https://wa.me/447398753797', icon: MessageCircle, label: 'WhatsApp', cls: 'text-green-400 bg-green-500/10', ext: true },
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

        {/* ── Trips ─────────────────────────────── */}
        {trips.length > 0 && (
          <Card title="My Trips" icon={<Compass className="w-4 h-4 text-[#C9A84C]" />} viewAll="/plan/library">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {trips.map(t => (
                <Link key={t.id} href={`/plan/${t.id}`}
                  className="block rounded-xl bg-white/5 border border-white/8 hover:border-[#C9A84C]/30 overflow-hidden transition-all group">
                  <div className="h-20 bg-[#0B1F3A] relative overflow-hidden">
                    {t.coverImage && <img src={t.coverImage} alt={t.title} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" />}
                  </div>
                  <div className="p-3">
                    <p className="text-white text-sm font-bold truncate">{t.title}</p>
                    <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1"><Globe className="w-3 h-3" />{t.destination}</p>
                  </div>
                </Link>
              ))}
              <Link href="/plan/new"
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-white/10 hover:border-[#C9A84C]/30 min-h-[120px] text-white/30 hover:text-[#C9A84C]/60 transition-all">
                <span className="text-2xl">+</span>
                <span className="text-xs font-semibold">New trip</span>
              </Link>
            </div>
          </Card>
        )}

        {/* ── Applications ──────────────────────── */}
        <Card title="My Applications" icon={<FileText className="w-4 h-4 text-[#C9A84C]" />} count={apps.length} viewAll="/portal/application">
          {apps.length === 0 ? (
            <Empty icon="🛂" title="No applications yet" sub="Your visa, flight, and travel applications will appear here once our team creates them." cta={{ label: 'Contact us on WhatsApp', href: 'https://wa.me/447398753797', ext: true }} />
          ) : (
            <div className="space-y-3">
              {apps.map(app => {
                const progress = stageProgress(app.stage)
                const docsNeeded = app.stage === 'DOCUMENTS_PENDING'
                return (
                  <div key={app.id} className="rounded-xl bg-white/5 border border-white/8 p-4 hover:border-white/15 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[app.stage]}`}>{STAGE_LABELS[app.stage]}</span>
                          <span className="text-xs text-white/30 font-mono">{app.refNumber}</span>
                          {(app.updates?.length ?? 0) > 0 && <span className="text-xs text-[#C9A84C] font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse" />{app.updates!.length} update{app.updates!.length !== 1 ? 's' : ''}</span>}
                        </div>
                        <h3 className="font-bold text-white leading-tight text-sm">{app.title}</h3>
                        {app.destination && <p className="text-white/40 text-xs mt-0.5">{app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}</p>}
                      </div>
                      <Link href={`/portal/application/${app.id}`}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 border border-white/15 text-xs font-medium text-white/70 rounded-lg hover:bg-white/8 transition-colors">
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                    {app.stage !== 'REJECTED' && (
                      <div className="mb-2">
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${app.stage === 'APPROVED' || app.stage === 'COMPLETED' ? 'bg-green-500' : 'bg-[#C9A84C]'}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-white/30">
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{app.documents.length} doc{app.documents.length !== 1 ? 's' : ''}</span>
                      {app.amount && <span className="text-white/50 font-medium">{app.currency} {app.amountPaid.toFixed(0)} / {app.amount.toFixed(0)} paid</span>}
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

        {/* ── Bookings ──────────────────────────── */}
        <Card title="My Bookings" icon={<Plane className="w-4 h-4 text-[#C9A84C]" />} count={bookings.length}>
          {bookings.length === 0 ? (
            <Empty icon="✈️" title="No bookings yet" sub="Flights, hotels and tours booked through Walz Travels appear here." cta={{ label: 'Search Flights', href: '/flights' }} />
          ) : (
            <div className="space-y-3">
              {bookings.map(b => {
                const det = (b.flightDetails ?? b.hotelDetails ?? {}) as Record<string, unknown>
                const route = b.type === 'FLIGHT' ? `${det.origin || ''} → ${det.destination || ''}`.trim() : b.type === 'HOTEL' ? String(det.name || det.hotelName || '') : ''
                const statusCls = b.status === 'CONFIRMED' ? 'bg-green-500/15 text-green-400' : b.status === 'CANCELLED' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                return (
                  <div key={b.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/8">
                    <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                      {b.type === 'FLIGHT' ? <Plane className="w-4 h-4 text-blue-400" /> : b.type === 'HOTEL' ? <Hotel className="w-4 h-4 text-purple-400" /> : <Map className="w-4 h-4 text-green-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold text-white text-sm">{b.type}</span>
                        {route && <span className="text-white/40 text-xs">{route}</span>}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCls}`}>{b.status}</span>
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

        {/* ── Vouchers ──────────────────────────── */}
        {vouchers.length > 0 && (
          <Card title="My Vouchers" icon={<Gift className="w-4 h-4 text-[#C9A84C]" />} count={vouchers.length}>
            <div className="space-y-2">
              {vouchers.map(v => (
                <div key={v.id} className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <div>
                    <p className="font-mono font-bold text-white text-sm">{v.code}</p>
                    <p className="text-white/40 text-xs mt-0.5">{v.currency} {v.remainingAmount.toFixed(2)} · Expires {format(new Date(v.expiresAt), 'd MMM yyyy')}</p>
                  </div>
                  <span className="text-[#C9A84C] text-xs font-bold bg-[#C9A84C]/10 px-3 py-1 rounded-full">Active</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Get Help ──────────────────────────── */}
        <div className="bg-[#0B1F3A] rounded-2xl p-5 border border-white/8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white text-sm">Need help?</h3>
              <p className="text-white/40 text-xs mt-0.5">Our team is on WhatsApp 24/7 for any question.</p>
            </div>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
              Chat Now
            </a>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom nav ─────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0B1F3A] border-t border-white/10 md:hidden">
        <div className="flex items-stretch h-16">
          {[
            { href: '/dashboard',          label: 'Home',     icon: FileText },
            { href: '/plan/library',       label: 'Trips',    icon: Compass  },
            { href: '/portal/application', label: 'Visas',    icon: Globe    },
            { href: '/portal/documents',   label: 'Docs',     icon: Upload   },
            { href: '/portal/profile',     label: 'Account',  icon: Shield   },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={label} href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-white/50 hover:text-[#C9A84C] transition-all">
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Card({ title, icon, count, viewAll, children }: { title: string; icon: React.ReactNode; count?: number; viewAll?: string; children: React.ReactNode }) {
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

function Empty({ icon, title, sub, cta }: { icon: string; title: string; sub: string; cta?: { label: string; href: string; ext?: boolean } }) {
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
