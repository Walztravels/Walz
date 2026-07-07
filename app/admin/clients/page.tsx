'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Mail, MessageCircle, ChevronDown, ChevronUp,
  FileText, CreditCard, CheckSquare, RefreshCw, UserPlus, Loader2, KeyRound,
} from 'lucide-react'
import { format } from 'date-fns'

type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

interface PortalApp {
  id: string
  refNumber: string
  title: string
  type: string
  stage: Stage
  destination: string | null
  travelDate: string | null
  amount: number | null
  currency: string
  amountPaid: number
  createdAt: string
  adminNotes: string | null
  documents: { id: string; status: string }[]
  payments:  { id: string; amount: number; status: string }[]
  checklist: { id: string; completedAt: string | null }[]
}

interface VisaApp {
  id: string
  referenceNumber: string
  destinationIso2: string
  visaType: string
  status: string
  createdAt: string
}

interface Client {
  id: string
  name: string | null
  email: string
  createdAt: string
  portalApplications: PortalApp[]
  visaApplications: VisaApp[]
  _count: { bookings: number }
}

const STAGE_LABEL: Record<Stage, string> = {
  ENQUIRY: 'Enquiry', DOCUMENTS_PENDING: 'Docs Pending',
  DOCUMENTS_RECEIVED: 'Docs Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected',
  COMPLETED: 'Completed',
}
const STAGE_COLOR: Record<Stage, string> = {
  ENQUIRY: 'bg-blue-100 text-blue-700', DOCUMENTS_PENDING: 'bg-amber-100 text-amber-700',
  DOCUMENTS_RECEIVED: 'bg-yellow-100 text-yellow-700', PROCESSING: 'bg-purple-100 text-purple-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700', APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', COMPLETED: 'bg-gray-100 text-gray-600',
}
const STAGES: Stage[] = ['ENQUIRY','DOCUMENTS_PENDING','DOCUMENTS_RECEIVED','PROCESSING','SUBMITTED','APPROVED','REJECTED','COMPLETED']

export default function AdminClientsPage() {
  const [clients, setClients]     = useState<Client[]>([])
  const [total, setTotal]         = useState(0)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [saving, setSaving]       = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})
  const [converting, setConverting]   = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState<string | null>(null)
  const [resetSent, setResetSent]       = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function sendReset(email: string) {
    setResetLoading(email)
    try {
      const res  = await fetch('/api/admin/client-accounts/send-reset', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok) {
        setResetSent(email)
        showToast(`Password reset email sent to ${email}`)
        setTimeout(() => setResetSent(null), 6000)
      } else {
        showToast(data.error ?? 'Failed to send reset email')
      }
    } catch {
      showToast('Failed to send reset email')
    }
    setResetLoading(null)
  }

  async function convertToLead(c: Client) {
    setConverting(c.id)
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:    c.name ?? c.email.split('@')[0],
          email:   c.email,
          source:  'CLIENT_CONVERSION',
          service: 'Other',
          notes:   `Converted from client: ${c._count?.bookings ?? 0} bookings`,
        }),
      })
      const data = await res.json()
      showToast(data.lead?.id ? 'Created as lead!' : 'Failed to create lead')
    } catch { showToast('Error converting to lead') }
    setConverting(null)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams(search ? { search } : {})
    const res  = await fetch(`/api/admin/clients?${params}`)
    const data = await res.json() as { clients: Client[]; total: number }
    setClients(data.clients ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const updateStage = async (appId: string, stage: Stage) => {
    setSaving(appId)
    await fetch(`/api/admin/portal/applications/${appId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ stage }),
    })
    setClients(prev => prev.map(c => ({
      ...c,
      portalApplications: c.portalApplications.map(a =>
        a.id === appId ? { ...a, stage } : a
      ),
    })))
    setSaving(null)
  }

  const saveNotes = async (appId: string) => {
    setSaving(appId)
    await fetch(`/api/admin/portal/applications/${appId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ adminNotes: editNotes[appId] }),
    })
    setClients(prev => prev.map(c => ({
      ...c,
      portalApplications: c.portalApplications.map(a =>
        a.id === appId ? { ...a, adminNotes: editNotes[appId] ?? null } : a
      ),
    })))
    setSaving(null)
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#112240] text-white px-4 py-3 rounded-xl shadow-xl text-sm border border-white/10">
          {toast}
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-white/40 text-sm mt-1">{total} client{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-white/10 rounded-xl text-sm text-white/50 hover:bg-white/5 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-white/5 rounded-2xl border border-white/8 mb-4 px-4 py-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none bg-transparent text-white placeholder-white/25"
        />
      </div>

      <div className="space-y-3">
        {loading && !clients.length ? (
          <div className="bg-[#112240] rounded-2xl p-12 text-center text-white/30 ring-1 ring-white/5">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="bg-[#112240] rounded-2xl p-12 text-center text-white/30 ring-1 ring-white/5">No clients found.</div>
        ) : clients.map(c => {
          const isOpen  = expanded === c.id
          const apps    = c.portalApplications ?? []
          const visaApps = c.visaApplications ?? []

          return (
            <div key={c.id} className="bg-[#112240] rounded-2xl ring-1 ring-white/5 overflow-hidden">
              {/* Client row */}
              <button
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : c.id)}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-amber-400 font-bold text-sm">
                    {(c.name ?? c.email)[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{c.name ?? c.email}</div>
                  <div className="flex items-center gap-3 text-xs text-white/35 mt-0.5 flex-wrap">
                    {c.name && <span>{c.email}</span>}
                    <span>{c._count?.bookings ?? 0} booking{(c._count?.bookings ?? 0) !== 1 ? 's' : ''}</span>
                    <span className="font-medium text-amber-400/70">{visaApps.length} visa app{visaApps.length !== 1 ? 's' : ''}</span>
                    <span>since {format(new Date(c.createdAt), 'MMM yyyy')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <a href={`mailto:${c.email}`}
                    className="p-2 text-white/30 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
                    <Mail className="w-4 h-4" />
                  </a>
                  <a href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi, I'm contacting you about client ${c.name ?? c.email}`)}`}
                    target="_blank" rel="noreferrer"
                    className="p-2 text-white/30 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors">
                    <MessageCircle className="w-4 h-4" />
                  </a>
                  <button onClick={() => convertToLead(c)} disabled={converting === c.id}
                    title="Convert to Lead"
                    className="p-2 text-white/30 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50">
                    {converting === c.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <UserPlus className="w-4 h-4" />}
                  </button>
                  <button onClick={() => sendReset(c.email)} disabled={resetLoading === c.email}
                    title="Send password reset email"
                    className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                      resetSent === c.email
                        ? 'text-green-400 bg-green-500/10'
                        : 'text-white/30 hover:text-amber-400 hover:bg-amber-500/10'
                    }`}>
                    {resetLoading === c.email
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <KeyRound className="w-4 h-4" />}
                  </button>
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />}
              </button>

              {/* Expanded: visa applications */}
              {isOpen && (
                <div className="border-t border-white/5 px-5 py-4 bg-black/10 space-y-2">
                  {visaApps.length === 0 ? (
                    <p className="text-sm text-white/30 py-2">No applications found for this client.</p>
                  ) : visaApps.map(app => (
                    <a
                      key={app.id}
                      href={`/admin/visa-applications/${app.id}`}
                      className="flex items-center justify-between p-3 bg-white/5 border border-white/8 rounded-xl hover:bg-white/8 transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-medium text-white capitalize">
                          {app.visaType} Visa — {app.destinationIso2.toUpperCase()}
                        </p>
                        <p className="text-xs text-white/35 mt-0.5">
                          Ref: {app.referenceNumber} · {format(new Date(app.createdAt), 'd MMM yyyy')}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                        app.status === 'approved'
                          ? 'bg-green-500/15 text-green-400'
                          : app.status === 'refused'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {app.status.replace(/_/g, ' ')}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
