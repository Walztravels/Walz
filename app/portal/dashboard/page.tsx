'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import {
  FileText, Clock, CheckCircle, XCircle, Loader2, ChevronRight,
  Plus, MessageCircle, AlertCircle, Plane, Hotel, Map, Gift,
  CreditCard, Upload, Star, Users, Activity, TicketCheck,
  ArrowRight, Wallet, Globe, RefreshCw, Shield, Search,
} from 'lucide-react'
import { CountrySelectLight } from '@/components/visa/CountrySelect'

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

interface Application {
  id: string; refNumber: string; title: string; type: string; stage: Stage
  destination: string | null; travelDate: string | null
  amount: number | null; currency: string; amountPaid: number; createdAt: string; updatedAt: string
  documents: { id: string; status: string }[]
  payments: { id: string; amount: number; currency: string; status: string; paidAt: string | null; description: string }[]
  checklist: { id: string; completedAt: string | null }[]
}

interface Booking {
  id: string; bookingReference: string; type: 'FLIGHT' | 'HOTEL' | 'PACKAGE'
  status: string; paymentStatus: string; totalAmount: number; currency: string
  contactEmail: string; flightDetails: Record<string, unknown> | null
  hotelDetails: Record<string, unknown> | null; createdAt: string
}

interface Voucher {
  id: string; code: string; voucherKind: string; serviceType: string
  amount: number; currency: string; remainingAmount: number
  status: string; active: boolean; recipientName: string | null
  recipientEmail: string | null; senderName: string | null
  expiresAt: string; createdAt: string; redeemedAt: string | null
}

interface ActivityItem {
  type: string; label: string; detail: string; date: string
}

interface DashboardData {
  applications: Application[]
  bookings: Booking[]
  purchasedVouchers: Voucher[]
  giftVouchers: Voucher[]
  travelCredits: Voucher[]
  recentActivity: ActivityItem[]
  stats: { activeApplications: number; upcomingTrips: number; pendingDocuments: number }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_ORDER: Stage[] = ['ENQUIRY','DOCUMENTS_PENDING','DOCUMENTS_RECEIVED','PROCESSING','SUBMITTED','APPROVED','COMPLETED']

const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: 'Enquiry Received', DOCUMENTS_PENDING: 'Documents Pending',
  DOCUMENTS_RECEIVED: 'Documents Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', COMPLETED: 'Completed',
}

const STAGE_COLOR: Record<Stage, string> = {
  ENQUIRY: 'bg-blue-100 text-blue-700', DOCUMENTS_PENDING: 'bg-amber-100 text-amber-700',
  DOCUMENTS_RECEIVED: 'bg-yellow-100 text-yellow-700', PROCESSING: 'bg-purple-100 text-purple-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700', APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', COMPLETED: 'bg-gray-100 text-gray-600',
}

function stageProgress(stage: Stage) {
  if (stage === 'REJECTED') return 100
  const idx = STAGE_ORDER.indexOf(stage)
  return idx === -1 ? 0 : Math.round(((idx + 1) / STAGE_ORDER.length) * 100)
}

function bookingIcon(type: string) {
  if (type === 'FLIGHT') return <Plane className="w-4 h-4 text-blue-500" />
  if (type === 'HOTEL')  return <Hotel className="w-4 h-4 text-purple-500" />
  return <Map className="w-4 h-4 text-green-500" />
}

function bookingStatusColor(s: string) {
  if (s === 'CONFIRMED') return 'bg-green-100 text-green-700'
  if (s === 'CANCELLED') return 'bg-red-100 text-red-700'
  if (s === 'COMPLETED') return 'bg-gray-100 text-gray-600'
  return 'bg-amber-100 text-amber-700'
}

function activityIcon(type: string) {
  if (type === 'booking')     return <Plane className="w-3.5 h-3.5 text-blue-500" />
  if (type === 'document')    return <Upload className="w-3.5 h-3.5 text-purple-500" />
  if (type === 'payment')     return <CreditCard className="w-3.5 h-3.5 text-green-500" />
  return <Activity className="w-3.5 h-3.5 text-[#C9A84C]" />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PortalDashboard() {
  const { data: session } = useSession()
  const [data, setData]   = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('overview')
  const [vault, setVault]  = useState<{ isSetupComplete: boolean; passportIso2: string | null; expiryDate: string | null } | null>(null)
  const [visaPassport, setVisaPassport]     = useState('NG')
  const [visaDestination, setVisaDestination] = useState('')
  const [visaChecking, setVisaChecking]     = useState(false)
  const [visaResult, setVisaResult]         = useState<{ ruleType: string; label: string; badge: string } | null>(null)

  const firstName = session?.user?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there'

  useEffect(() => {
    fetch('/api/portal/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
    fetch('/api/passport-vault')
      .then(r => r.json())
      .then(d => { if (d.vault) { setVault(d.vault); if (d.vault.passportIso2) setVisaPassport(d.vault.passportIso2) } })
      .catch(() => {})
  }, [])

  async function handleVisaCheck() {
    if (!visaDestination || visaChecking) return
    setVisaChecking(true)
    setVisaResult(null)
    const res = await fetch('/api/visa-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passport_iso2: visaPassport, destination_iso2: visaDestination }),
    })
    const d = await res.json()
    if (d.rule) {
      const labels: Record<string, string> = { visa_free: 'Visa Free ✅', visa_on_arrival: 'Visa on Arrival 🛬', evisa: 'eVisa 💻', eta: 'eTA 📱', visa_required: 'Visa Required 🛂' }
      setVisaResult({ ruleType: d.rule.ruleType, label: labels[d.rule.ruleType] ?? 'Check Required', badge: d.rule.ruleType })
    } else if (d.portal) {
      setVisaResult({ ruleType: 'visa_required', label: 'Visa Required 🛂', badge: 'visa_required' })
    } else {
      setVisaResult({ ruleType: 'unknown', label: 'Contact Walz Team', badge: 'unknown' })
    }
    setVisaChecking(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
          <p className="text-sm text-gray-400">Loading your dashboard…</p>
        </div>
      </div>
    )
  }

  const d = data!
  const hasApplications  = (d?.applications?.length ?? 0) > 0
  const hasBookings      = (d?.bookings?.length ?? 0) > 0
  const hasPurchased     = (d?.purchasedVouchers?.length ?? 0) > 0
  const hasGift          = (d?.giftVouchers?.length ?? 0) > 0
  const hasCredits       = (d?.travelCredits?.length ?? 0) > 0
  const hasActivity      = (d?.recentActivity?.length ?? 0) > 0

  return (
    <div className="min-h-screen bg-[#F4F6F9]">

      {/* ── Top Welcome Bar ─────────────────────────────────────────── */}
      <div className="bg-[#0B1F3A] text-white px-5 lg:px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">Welcome back, {firstName} 👋</h1>
              <p className="text-white/50 text-sm mt-1">Your travel portal — applications, bookings, and vouchers in one place.</p>
            </div>
            <a
              href="https://wa.me/447398753797"
              target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              Support
            </a>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <div className="text-xl font-bold text-[#C9A84C]">{d?.stats?.activeApplications ?? 0}</div>
              <div className="text-white/60 text-xs mt-0.5">Active Applications</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <div className="text-xl font-bold text-[#C9A84C]">{d?.stats?.upcomingTrips ?? 0}</div>
              <div className="text-white/60 text-xs mt-0.5">Confirmed Bookings</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <div className="text-xl font-bold text-[#C9A84C]">
                {(d?.giftVouchers?.length ?? 0) + (d?.travelCredits?.length ?? 0)}
              </div>
              <div className="text-white/60 text-xs mt-0.5">Active Vouchers</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 lg:px-8 py-5">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { href: '/portal/documents', icon: Upload, label: 'Upload Docs', color: 'text-purple-600 bg-purple-50' },
            { href: '/flights',          icon: Plane,  label: 'Book Flight', color: 'text-blue-600 bg-blue-50' },
            { href: '/tours',            icon: Map,    label: 'Book Tour',   color: 'text-green-600 bg-green-50' },
            { href: '/gift',             icon: Gift,   label: 'Gift Voucher',color: 'text-amber-600 bg-amber-50' },
            { href: '/portal/referral',  icon: Users,  label: 'Refer Friend',color: 'text-pink-600 bg-pink-50' },
            { href: 'https://wa.me/447398753797', icon: MessageCircle, label: 'WhatsApp', color: 'text-green-600 bg-green-50', external: true },
          ].map(({ href, icon: Icon, label, color, external }) => (
            external ? (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all text-center">
                <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-gray-600 leading-tight">{label}</span>
              </a>
            ) : (
              <Link key={label} href={href}
                className="flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all text-center">
                <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-gray-600 leading-tight">{label}</span>
              </Link>
            )
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 lg:px-8 pb-24 space-y-6">

        {/* ── Section 1: My Applications ───────────────────────────── */}
        <Section
          id="applications"
          title="My Applications"
          icon={<FileText className="w-5 h-5 text-[#C9A84C]" />}
          count={d?.applications?.length}
          viewAll="/portal/application"
        >
          {!hasApplications ? (
            <EmptyState
              icon={<FileText className="w-10 h-10 text-gray-300" />}
              title="No applications yet"
              sub="Your visa, flight, and travel applications will appear here once our team creates them."
              cta={{ label: 'Start a new application', href: 'https://wa.me/447398753797', external: true }}
            />
          ) : (
            <div className="space-y-3">
              {d.applications.map(app => {
                const progress   = stageProgress(app.stage)
                const docsNeeded = app.stage === 'DOCUMENTS_PENDING'
                const totalCL    = app.checklist.length
                const doneCL     = app.checklist.filter(c => c.completedAt).length
                return (
                  <div key={app.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-[#C9A84C]/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLOR[app.stage]}`}>
                            {STAGE_LABELS[app.stage]}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">{app.refNumber}</span>
                        </div>
                        <h3 className="font-bold text-[#0B1F3A] leading-tight">{app.title}</h3>
                        {app.destination && (
                          <p className="text-sm text-gray-400 mt-0.5">{app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}</p>
                        )}
                      </div>
                      <Link href={`/portal/application/${app.id}`}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs font-medium text-[#0B1F3A] rounded-lg hover:bg-gray-50 transition-colors">
                        Details <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                    {app.stage !== 'REJECTED' && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Progress</span><span>{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${app.stage === 'APPROVED' || app.stage === 'COMPLETED' ? 'bg-green-500' : 'bg-[#C9A84C]'}`}
                            style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{app.documents.length} doc{app.documents.length !== 1 ? 's' : ''}</span>
                      {totalCL > 0 && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />{doneCL}/{totalCL} checklist</span>}
                      {app.amount && <span className="text-[#0B1F3A] font-medium">{app.currency} {app.amountPaid.toFixed(0)} / {app.amount.toFixed(0)} paid</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(app.createdAt), 'd MMM yyyy')}</span>
                    </div>
                    {docsNeeded && (
                      <div className="mt-3 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Documents required — please upload via the Documents tab.</span>
                        <Link href="/portal/documents" className="ml-auto font-semibold hover:underline whitespace-nowrap text-amber-800">
                          Upload →
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Section 2: My Bookings ───────────────────────────────── */}
        <Section
          id="bookings"
          title="My Bookings"
          icon={<Plane className="w-5 h-5 text-[#C9A84C]" />}
          count={d?.bookings?.length}
        >
          {!hasBookings ? (
            <EmptyState
              icon={<Plane className="w-10 h-10 text-gray-300" />}
              title="No bookings yet"
              sub="Flight, hotel and tour bookings made on the website will appear here automatically."
              cta={{ label: 'Search Flights', href: '/flights' }}
            />
          ) : (
            <div className="space-y-3">
              {d.bookings.map(b => {
                const details = (b.flightDetails ?? b.hotelDetails ?? {}) as Record<string, unknown>
                const routeLabel = b.type === 'FLIGHT'
                  ? `${(details.origin as string) || ''} → ${(details.destination as string) || ''}`.trim()
                  : b.type === 'HOTEL'
                    ? String((details.name ?? details.hotelName) || '')
                    : ''
                return (
                  <div key={b.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                      {bookingIcon(b.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold text-[#0B1F3A] text-sm">{b.type}</span>
                        {routeLabel && <span className="text-gray-400 text-xs">{routeLabel}</span>}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${bookingStatusColor(b.status)}`}>{b.status}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
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
        </Section>

        {/* ── Section 3: My Gift Vouchers ──────────────────────────── */}
        <Section
          id="vouchers"
          title="My Gift Vouchers"
          icon={<Gift className="w-5 h-5 text-[#C9A84C]" />}
          count={(d?.purchasedVouchers?.length ?? 0) + (d?.giftVouchers?.length ?? 0)}
        >
          {!hasPurchased && !hasGift ? (
            <EmptyState
              icon={<Gift className="w-10 h-10 text-gray-300" />}
              title="No gift vouchers"
              sub="Gift vouchers you purchase or receive will appear here."
              cta={{ label: 'Buy a Gift Voucher', href: '/gift' }}
            />
          ) : (
            <div className="space-y-4">
              {hasPurchased && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Purchased by you</p>
                  <div className="space-y-3">
                    {d.purchasedVouchers.map(v => <VoucherCard key={v.id} v={v} mine />)}
                  </div>
                </div>
              )}
              {hasGift && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Received</p>
                  <div className="space-y-3">
                    {d.giftVouchers.map(v => <VoucherCard key={v.id} v={v} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Section 4: Travel Credits ────────────────────────────── */}
        {(hasCredits || true) && (
          <Section
            id="credits"
            title="My Travel Credits"
            icon={<Wallet className="w-5 h-5 text-[#C9A84C]" />}
            count={d?.travelCredits?.length}
          >
            {!hasCredits ? (
              <EmptyState
                icon={<Wallet className="w-10 h-10 text-gray-300" />}
                title="No travel credits"
                sub="Travel credits issued by Walz Travels will appear here."
              />
            ) : (
              <div className="space-y-3">
                {d.travelCredits.map(v => <VoucherCard key={v.id} v={v} isCredit />)}
              </div>
            )}
          </Section>
        )}

        {/* ── Section 5: Recent Activity ───────────────────────────── */}
        <Section
          id="activity"
          title="Recent Activity"
          icon={<Activity className="w-5 h-5 text-[#C9A84C]" />}
        >
          {!hasActivity ? (
            <EmptyState
              icon={<Activity className="w-10 h-10 text-gray-300" />}
              title="No recent activity"
              sub="Your account activity will appear here."
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {d.recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {activityIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0B1F3A]">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.detail}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{format(new Date(item.date), 'd MMM')}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Visa Intelligence Widget ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#C9A84C]" />
              <h2 className="font-bold text-[#0B1F3A] text-base">Quick Visa Check</h2>
            </div>
            <Link href="/visa-hub" className="text-xs text-[#C9A84C] font-semibold hover:underline flex items-center gap-1">
              Full Hub <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-5">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <CountrySelectLight label="Going to" value={visaDestination} onChange={setVisaDestination} exclude={visaPassport} placeholder="Select destination" />
              </div>
              <button onClick={handleVisaCheck} disabled={!visaDestination || visaChecking}
                className="h-12 px-5 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-[#0d2345] transition-colors disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                {visaChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Check
              </button>
            </div>
            {visaResult && (
              <div className={`mt-3 p-3 rounded-xl text-sm font-semibold flex items-center justify-between ${
                visaResult.ruleType === 'visa_free' ? 'bg-green-50 text-green-700' :
                visaResult.ruleType === 'evisa' || visaResult.ruleType === 'eta' ? 'bg-purple-50 text-purple-700' :
                visaResult.ruleType === 'visa_on_arrival' ? 'bg-blue-50 text-blue-700' :
                'bg-red-50 text-red-700'
              }`}>
                <span>{visaResult.label}</span>
                {visaDestination && (
                  <Link href={`/visa-hub/${visaDestination.toLowerCase()}`} className="text-xs underline font-medium">
                    Full details →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Passport Vault Card ───────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#C9A84C]" />
              <h2 className="font-bold text-[#0B1F3A] text-base">Passport Vault</h2>
            </div>
          </div>
          <div className="p-5">
            {!vault?.isSetupComplete ? (
              <div className="text-center py-4">
                <Shield className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-[#0B1F3A] mb-1">Set up your Passport Vault</p>
                <p className="text-xs text-gray-400 mb-4">Store your details once. Every visa form fills in 60 seconds.</p>
                <Link href="/portal/passport-vault"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-xl hover:bg-[#b8943d] transition-colors">
                  Set Up Vault →
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">Vault ready ✓</p>
                  {vault.expiryDate && (() => {
                    const exp = new Date(vault.expiryDate)
                    const today = new Date()
                    const months = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30))
                    if (months < 6) return <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Passport expires in {months} months</p>
                    return <p className="text-xs text-gray-400 mt-0.5">Passport valid until {exp.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</p>
                  })()}
                </div>
                <Link href="/portal/passport-vault" className="text-xs text-[#C9A84C] font-semibold hover:underline">Edit</Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Help card ────────────────────────────────────────────── */}
        <div className="bg-[#0B1F3A] rounded-2xl p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Need help?</h3>
              <p className="text-white/50 text-xs mt-0.5">Our team is on WhatsApp for any question — visa, booking, or account.</p>
            </div>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
              Chat Now
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  id, title, icon, count, viewAll, children,
}: {
  id: string; title: string; icon: React.ReactNode
  count?: number; viewAll?: string; children: React.ReactNode
}) {
  return (
    <div id={id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold text-[#0B1F3A] text-base">{title}</h2>
          {count !== undefined && count > 0 && (
            <span className="text-xs bg-[#0B1F3A] text-white px-2 py-0.5 rounded-full font-semibold">{count}</span>
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

function EmptyState({
  icon, title, sub, cta,
}: {
  icon: React.ReactNode; title: string; sub: string
  cta?: { label: string; href: string; external?: boolean }
}) {
  return (
    <div className="text-center py-8">
      <div className="flex justify-center mb-3">{icon}</div>
      <h3 className="font-semibold text-[#0B1F3A] text-sm mb-1">{title}</h3>
      <p className="text-gray-400 text-xs max-w-xs mx-auto mb-4">{sub}</p>
      {cta && (
        cta.external ? (
          <a href={cta.href} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2345] transition-colors">
            {cta.label}
          </a>
        ) : (
          <Link href={cta.href}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2345] transition-colors">
            {cta.label}
          </Link>
        )
      )}
    </div>
  )
}

function VoucherCard({ v, mine, isCredit }: { v: Voucher; mine?: boolean; isCredit?: boolean }) {
  const expired  = new Date(v.expiresAt) < new Date()
  const redeemed = !!v.redeemedAt
  const active   = v.active && !expired && !redeemed

  return (
    <div className={`rounded-xl border p-4 ${active ? 'border-[#C9A84C]/30 bg-amber-50/30' : 'border-gray-100 bg-gray-50/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`font-mono text-base font-bold ${active ? 'text-[#0B1F3A]' : 'text-gray-400'}`}>{v.code}</span>
            {redeemed && <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-semibold">Redeemed</span>}
            {expired && !redeemed && <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-semibold">Expired</span>}
            {active && <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-semibold">Active</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span className="font-bold text-[#0B1F3A]">{v.currency} {v.remainingAmount.toFixed(2)}</span>
            {v.amount !== v.remainingAmount && <span className="text-gray-400">of {v.amount.toFixed(2)}</span>}
            <span>Expires {format(new Date(v.expiresAt), 'd MMM yyyy')}</span>
            <span className="capitalize">{v.serviceType === 'all' ? 'All Services' : v.serviceType}</span>
          </div>
          {mine && v.recipientName && (
            <p className="text-xs text-gray-400 mt-1">For {v.recipientName} ({v.recipientEmail})</p>
          )}
          {!mine && v.senderName && (
            <p className="text-xs text-gray-400 mt-1">From {v.senderName}</p>
          )}
        </div>
        {active && (
          <span className="text-[#C9A84C] font-bold text-lg">
            <TicketCheck className="w-6 h-6" />
          </span>
        )}
      </div>
    </div>
  )
}
