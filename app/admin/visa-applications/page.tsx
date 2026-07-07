'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search, Globe, Clock, ChevronRight,
  Loader2, RefreshCw, Send, X, CheckCircle,
} from 'lucide-react'
import { STATUS_CONFIG, VISA_AGENTS, VISA_CONFIGS } from '@/lib/visa-config'
import { ALL_COUNTRIES } from '@/lib/countries'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import FormTracker from '@/components/admin/visa/FormTracker'

interface VisaApp {
  id: string; referenceNumber: string; destinationIso2: string; visaType: string
  firstName: string | null; lastName: string | null; email: string | null; phone: string | null
  status: string; serviceFeePaid: boolean; assignedTo: string | null; initiatedBy: string
  createdAt: string; updatedAt: string
  user: { name: string | null; email: string | null } | null
  notes: { content: string; createdAt: string }[]
  familyGroupId?: string | null
  relationship?: string | null
  isMinor?: boolean
}

type FamilyGroup = {
  familyGroupId: string
  visaType: string
  destinationIso2: string
  totalCount: number
  leadName: string
  leadEmail: string | null
  members: VisaApp[]
  createdAt: string
}

const ALL_STATUSES = [
  'all', 'received', 'documents_pending', 'under_review',
  'ready_to_submit', 'submitted_to_embassy', 'decision_pending', 'approved', 'refused',
]

const VISA_TYPES = ['tourist', 'business', 'student', 'transit', 'family', 'work']

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.received
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function InitiatedBadge({ initiatedBy }: { initiatedBy: string }) {
  if (initiatedBy === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        🔔 Admin
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
      💳 Client
    </span>
  )
}

interface SendFormState {
  clientEmail: string
  clientName: string
  destinationIso2: string
  visaType: string
  personalMessage: string
}

interface AppStats {
  total:               number
  submittedToEmbassy:  number
  inProgress:          number
  approved:            number
}

export default function AdminVisaApplicationsPage() {
  const router = useRouter()
  const { can, loading: permLoading } = useStaffPermissions()

  const [activeTab, setActiveTab]     = useState<'applications' | 'form-tracker'>('applications')
  const [stats, setStats]             = useState<AppStats | null>(null)

  const [apps, setApps]               = useState<VisaApp[]>([])
  const [loading, setLoading]         = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [destFilter, setDestFilter]   = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [search, setSearch]           = useState('')

  const [showFamily, setShowFamily]       = useState(false)
  const [familyGroups, setFamilyGroups]   = useState<FamilyGroup[]>([])
  const [familyLoading, setFamilyLoading] = useState(false)

  // Access guard
  useEffect(() => {
    if (!permLoading && !can('visa_view')) router.replace('/admin/unauthorized')
  }, [permLoading, can, router])

  // Load aggregate stats once
  useEffect(() => {
    fetch('/api/admin/visa-applications?stats=true')
      .then(r => r.json())
      .then(d => setStats(d.stats ?? null))
      .catch(() => {})
  }, [])

  // Send-form modal
  const [modalOpen, setModalOpen]   = useState(false)
  const [sending, setSending]       = useState(false)
  const [sentLink, setSentLink]     = useState<string | null>(null)
  const [sendForm, setSendForm]     = useState<SendFormState>({
    clientEmail: '', clientName: '', destinationIso2: '', visaType: 'tourist', personalMessage: '',
  })
  const [countrySearch, setCountrySearch] = useState('')
  const [walzFee,      setWalzFee]      = useState<number | ''>('')
  const [feeCurrency,  setFeeCurrency]  = useState('GBP')
  const [paymentChoice, setPaymentChoice] = useState<'now' | 'later'>('later')
  const [govtFee,      setGovtFee]      = useState<number | ''>('')
  const [govtCurrency, setGovtCurrency] = useState('USD')
  const [showGovtFee,  setShowGovtFee]  = useState(true)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (destFilter  !== 'all') params.set('destination', destFilter)
    if (agentFilter !== 'all') params.set('assignedTo', agentFilter)
    if (search.trim()) params.set('search', search.trim())
    const res = await fetch(`/api/admin/visa-applications?${params}`)
    const d = await res.json()
    setApps(d.applications ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter, destFilter, agentFilter]) // eslint-disable-line

  function handleSearch(e: React.FormEvent) { e.preventDefault(); load() }

  const fetchFamilyApps = async () => {
    setFamilyLoading(true)
    try {
      const res  = await fetch('/api/admin/visa-applications?family=true')
      const data = await res.json() as { applications: (VisaApp & { familyGroupId: string | null; relationship: string | null; isMinor: boolean })[] }

      // Group by familyGroupId
      const grouped = new Map<string, FamilyGroup>()
      for (const app of data.applications) {
        const gid = app.familyGroupId ?? `single-${app.id}`
        if (!grouped.has(gid)) {
          grouped.set(gid, {
            familyGroupId: gid,
            visaType:       app.visaType,
            destinationIso2: app.destinationIso2,
            totalCount:     0,
            leadName:       [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Unknown',
            leadEmail:      app.email,
            members:        [],
            createdAt:      app.createdAt,
          })
        }
        const g = grouped.get(gid)!
        g.members.push(app)
        g.totalCount++
        if (app.relationship === 'lead' || g.members.length === 1) {
          g.leadName  = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Unknown'
          g.leadEmail = app.email
        }
      }
      setFamilyGroups(Array.from(grouped.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } catch { /* non-fatal */ }
    setFamilyLoading(false)
  }

  async function handleSendForm(e: React.FormEvent) {
    e.preventDefault()
    if (!sendForm.clientEmail || !sendForm.destinationIso2) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/visa-applications/send-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sendForm,
          walzFee:       walzFee !== '' ? Number(walzFee) : null,
          feeCurrency,
          paymentChoice,
          govtFee:       govtFee !== '' ? Number(govtFee) : null,
          govtCurrency,
          showGovtFee,
        }),
      })
      const d = await res.json()
      if (res.ok) {
        setSentLink(d.link)
        load() // refresh list
      } else {
        alert(d.error ?? 'Failed to send form')
      }
    } finally {
      setSending(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setSentLink(null)
    setSendForm({ clientEmail: '', clientName: '', destinationIso2: '', visaType: 'tourist', personalMessage: '' })
    setCountrySearch('')
    setWalzFee('')
    setFeeCurrency('GBP')
    setPaymentChoice('later')
    setGovtFee('')
    setGovtCurrency('USD')
    setShowGovtFee(true)
  }

  const statCounts = ALL_STATUSES.slice(1).reduce<Record<string, number>>((acc, s) => {
    acc[s] = apps.filter(a => a.status === s).length
    return acc
  }, {})

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Visa Applications</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage, track and submit visa applications</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#C9A84C]' : 'text-gray-500'}`} />
            Refresh
          </button>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors">
            <Send className="w-4 h-4" />
            Send Form to Client
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Applications',    value: stats.total,              color: 'text-[#0B1F3A]',  bg: 'bg-white'        },
            { label: 'Submitted to Embassy',  value: stats.submittedToEmbassy, color: 'text-indigo-700', bg: 'bg-indigo-50'    },
            { label: 'In Progress',           value: stats.inProgress,         color: 'text-amber-700',  bg: 'bg-amber-50'     },
            { label: 'Approved',              value: stats.approved,           color: 'text-green-700',  bg: 'bg-green-50'     },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl border border-gray-100 shadow-sm p-4`}>
              <p className="text-xs text-gray-400 font-medium">{s.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-1 w-fit mb-5">
        <button onClick={() => setActiveTab('applications')}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'applications' ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-[#0B1F3A]'
          }`}>
          Applications
        </button>
        <button onClick={() => setActiveTab('form-tracker')}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'form-tracker' ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-[#0B1F3A]'
          }`}>
          Form Tracker
        </button>
      </div>

      {/* Form Tracker tab */}
      {activeTab === 'form-tracker' && <FormTracker />}

      {/* Applications tab */}
      {activeTab === 'applications' && <>

      {/* Status count pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {[
          { key: 'all', label: 'All', count: apps.length },
          ...ALL_STATUSES.slice(1).map(s => ({ key: s, label: STATUS_CONFIG[s]?.label ?? s, count: statCounts[s] ?? 0 })),
        ].map(({ key, label, count }) => (
          <button key={key} onClick={() => { setShowFamily(false); setStatusFilter(key) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              !showFamily && statusFilter === key
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
            {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${!showFamily && statusFilter === key ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>}
          </button>
        ))}
        <button onClick={() => { setShowFamily(true); fetchFamilyApps() }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            showFamily
              ? 'bg-[#0B1F3A] text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
          }`}>
          👨‍👩‍👧‍👦 Family
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, reference…"
            className="w-full pl-10 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
        </form>

        <select value={destFilter} onChange={e => setDestFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white min-w-[160px]">
          <option value="all">All Destinations</option>
          {Object.values(VISA_CONFIGS).map(c => (
            <option key={c.destinationIso2} value={c.destinationIso2}>{c.flag} {c.name}</option>
          ))}
        </select>

        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white min-w-[160px]">
          <option value="all">All Agents</option>
          {VISA_AGENTS.map(a => (
            <option key={a.id} value={a.id === 'unassigned' ? 'unassigned' : a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Table / Family view */}
      {showFamily ? (
        familyLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
        ) : familyGroups.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No family applications found</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-100">
            {familyGroups.map(group => (
              <div key={group.familyGroupId} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">👨‍👩‍👧‍👦</span>
                      <span className="font-semibold text-[#0B1F3A] text-sm">{group.familyGroupId}</span>
                      <span className="text-xs text-gray-500">· {group.visaType} · {group.totalCount} applicant{group.totalCount > 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-xs text-gray-500">Lead: {group.leadName} · {group.leadEmail}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {group.members.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-400 w-4">{i + 1}.</span>
                      <span className="font-medium text-gray-800 flex-1">{[m.firstName, m.lastName].filter(Boolean).join(' ') || '—'}</span>
                      <span className="text-gray-400 capitalize">{m.relationship ?? 'lead'}</span>
                      <StatusBadge status={m.status} />
                      <Link href={`/admin/visa-applications/${m.id}`} className="text-[#C9A84C] hover:underline">View →</Link>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-20">
          <Globe className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No applications found</p>
          <p className="text-gray-300 text-sm mt-1">Adjust filters or wait for clients to submit</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {['Reference', 'Client', 'Destination', 'Type', 'Source', 'Status', 'Assigned', 'Date', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apps.map(app => {
                  const cfg = VISA_CONFIGS[app.destinationIso2]
                  const agent = VISA_AGENTS.find(a => a.id === app.assignedTo)
                  return (
                    <tr key={app.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-[#C9A84C]">{app.referenceNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0B1F3A] text-sm">{[app.firstName, app.lastName].filter(Boolean).join(' ') || app.user?.name || '—'}</p>
                        <p className="text-gray-400 text-xs truncate max-w-[160px]">{app.email || app.user?.email || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{cfg?.flag ?? '🌍'} {cfg?.name ?? app.destinationIso2}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600 capitalize">{app.visaType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <InitiatedBadge initiatedBy={app.initiatedBy ?? 'client'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusBadge status={app.status} />
                          {app.serviceFeePaid && <p className="text-xs text-green-600 font-medium">💰 Paid</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{agent?.name ?? <span className="text-orange-500">Unassigned</span>}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-400">{new Date(app.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/visa-applications/${app.id}`}
                          className="flex items-center gap-1 text-xs text-[#C9A84C] font-semibold hover:underline whitespace-nowrap">
                          Open <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-50">
            {apps.map(app => {
              const cfg = VISA_CONFIGS[app.destinationIso2]
              const agent = VISA_AGENTS.find(a => a.id === app.assignedTo)
              return (
                <Link key={app.id} href={`/admin/visa-applications/${app.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                  <div className="text-3xl">{cfg?.flag ?? '🌍'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={app.status} />
                      <InitiatedBadge initiatedBy={app.initiatedBy ?? 'client'} />
                      <span className="font-mono text-xs text-[#C9A84C]">{app.referenceNumber}</span>
                    </div>
                    <p className="font-semibold text-[#0B1F3A] text-sm">{[app.firstName, app.lastName].filter(Boolean).join(' ') || '—'}</p>
                    <p className="text-gray-400 text-xs">{cfg?.name ?? app.destinationIso2} · {agent?.name ?? 'Unassigned'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      </>}

      {/* ── Send Form to Client Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-[#0B1F3A]">Send Application Form</h2>
                <p className="text-xs text-gray-500 mt-0.5">Client receives a direct link — no login or payment required</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {sentLink ? (
              /* Success state */
              <div className="p-6 text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-green-500" />
                  </div>
                </div>
                <h3 className="font-bold text-[#0B1F3A] mb-1">Form link sent!</h3>
                <p className="text-sm text-gray-500 mb-4">The client has been emailed their personalised application link.</p>
                <div className="bg-gray-50 rounded-xl p-3 mb-5 text-left">
                  <p className="text-xs text-gray-500 mb-1 font-medium">Form link (also emailed):</p>
                  <p className="text-xs text-[#C9A84C] font-mono break-all">{sentLink}</p>
                </div>
                <button onClick={closeModal}
                  className="w-full px-4 py-2.5 bg-[#0B1F3A] text-white font-semibold text-sm rounded-xl hover:bg-[#122b4f] transition-colors">
                  Done
                </button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSendForm} className="overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Client Email *</label>
                    <input
                      type="email" required
                      value={sendForm.clientEmail}
                      onChange={e => setSendForm(f => ({ ...f, clientEmail: e.target.value }))}
                      placeholder="client@example.com"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Client Name</label>
                    <input
                      type="text"
                      value={sendForm.clientName}
                      onChange={e => setSendForm(f => ({ ...f, clientName: e.target.value }))}
                      placeholder="Jane Smith"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Destination *</label>
                    {/* Search filter */}
                    <input
                      type="text"
                      value={countrySearch}
                      onChange={e => setCountrySearch(e.target.value)}
                      placeholder="Search country…"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] mb-1"
                    />
                    <select
                      required
                      size={5}
                      value={sendForm.destinationIso2}
                      onChange={e => setSendForm(f => ({ ...f, destinationIso2: e.target.value }))}
                      className="w-full px-2 py-1 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white"
                    >
                      <option value="">— select a country —</option>
                      {/* Full-config countries shown first */}
                      {(() => {
                        const configuredIso2 = new Set(Object.keys(VISA_CONFIGS))
                        const search = countrySearch.toLowerCase()
                        const featured = ALL_COUNTRIES.filter(c => configuredIso2.has(c.iso2) && (!search || c.name.toLowerCase().includes(search)))
                        const others   = ALL_COUNTRIES.filter(c => !configuredIso2.has(c.iso2) && (!search || c.name.toLowerCase().includes(search)))
                        return (
                          <>
                            {featured.length > 0 && (
                              <optgroup label="✅ Full embassy form">
                                {featured.map(c => (
                                  <option key={c.iso2} value={c.iso2}>{c.flag} {c.name}</option>
                                ))}
                              </optgroup>
                            )}
                            {others.length > 0 && (
                              <optgroup label="All other countries">
                                {others.sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                                  <option key={c.iso2} value={c.iso2}>{c.flag} {c.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        )
                      })()}
                    </select>
                    {sendForm.destinationIso2 && (() => {
                      const c = ALL_COUNTRIES.find(x => x.iso2 === sendForm.destinationIso2)
                      const hasConfig = !!VISA_CONFIGS[sendForm.destinationIso2]
                      return c ? (
                        <p className={`text-[10px] mt-1 font-semibold ${hasConfig ? 'text-green-600' : 'text-amber-600'}`}>
                          {c.flag} {c.name} — {hasConfig ? '✅ Full embassy form available' : '⚠️ Generic form (no country-specific fields)'}
                        </p>
                      ) : null
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Visa Type</label>
                    <select
                      value={sendForm.visaType}
                      onChange={e => setSendForm(f => ({ ...f, visaType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white">
                      {VISA_TYPES.map(t => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Personal Message <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea
                    rows={3}
                    value={sendForm.personalMessage}
                    onChange={e => setSendForm(f => ({ ...f, personalMessage: e.target.value }))}
                    placeholder="Hi Jane, please fill out your visa application using the link below…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none"
                  />
                </div>

                {/* ─── Walz Fee ─────────────────────────────────── */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Service Fee (optional)
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Walz Fee</label>
                      <input
                        type="number"
                        value={walzFee}
                        onChange={e => setWalzFee(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 150"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Currency</label>
                      <select
                        value={feeCurrency}
                        onChange={e => setFeeCurrency(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                      >
                        {['GBP', 'USD', 'EUR', 'CAD', 'NGN', 'GHS', 'AED'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ─── Payment option ────────────────────────────── */}
                {walzFee !== '' && walzFee > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Payment Option
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                        ${paymentChoice === 'later'
                          ? 'border-[#C9A84C] bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'}`}>
                        <input
                          type="radio"
                          name="paymentChoice"
                          value="later"
                          checked={paymentChoice === 'later'}
                          onChange={() => setPaymentChoice('later')}
                          className="mt-0.5 accent-[#C9A84C]"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#0B1F3A]">Submit & Pay Later</p>
                          <p className="text-xs text-gray-400 mt-0.5">Client fills form now, pays via link after</p>
                        </div>
                      </label>
                      <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                        ${paymentChoice === 'now'
                          ? 'border-[#C9A84C] bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'}`}>
                        <input
                          type="radio"
                          name="paymentChoice"
                          value="now"
                          checked={paymentChoice === 'now'}
                          onChange={() => setPaymentChoice('now')}
                          className="mt-0.5 accent-[#C9A84C]"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#0B1F3A]">Pay via Flutterwave</p>
                          <p className="text-xs text-gray-400 mt-0.5">Client pays {feeCurrency} {walzFee} when submitting</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* ─── Govt Fee ─────────────────────────────────── */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Government Fee (optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowGovtFee(p => !p)}
                      className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#0B1F3A] transition-colors"
                    >
                      <span className={showGovtFee ? 'text-[#0B1F3A] font-semibold' : 'text-gray-400'}>
                        {showGovtFee ? 'Shown to client' : 'Hidden from client'}
                      </span>
                      <span className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${showGovtFee ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showGovtFee ? 'translate-x-4' : ''}`} />
                      </span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Amount</label>
                      <input
                        type="number"
                        value={govtFee}
                        onChange={e => setGovtFee(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 100"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Currency</label>
                      <select
                        value={govtCurrency}
                        onChange={e => setGovtCurrency(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                      >
                        {['USD', 'GBP', 'EUR', 'CAD', 'NGN', 'GHS', 'AED'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  🔔 This creates a draft application and emails the client a secure 7-day link.{' '}
                  {walzFee && walzFee > 0 && paymentChoice === 'now'
                    ? <strong>Client will be asked to pay {feeCurrency} {walzFee} via Flutterwave when submitting.</strong>
                    : walzFee && walzFee > 0
                      ? <strong>Fee of {feeCurrency} {walzFee} will be shown — client pays later.</strong>
                      : <strong>No payment will be collected.</strong>}
                  {govtFee && govtFee > 0 && showGovtFee && <span> Govt fee of {govtCurrency} {govtFee} will be shown to client.</span>}
                  {govtFee && govtFee > 0 && !showGovtFee && <span> Govt fee set but <strong>hidden</strong> from client.</span>}
                </div>

                <button type="submit" disabled={sending || !sendForm.clientEmail || !sendForm.destinationIso2}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send Form Link</>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
