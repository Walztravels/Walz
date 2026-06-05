'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Mail, MessageCircle, ChevronDown, ChevronUp,
  FileText, CreditCard, CheckSquare, RefreshCw,
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

interface Client {
  id: string
  name: string | null
  email: string
  createdAt: string
  portalApplications: PortalApp[]
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Clients</h1>
          <p className="text-gray-500 text-sm mt-1">{total} client{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 px-4 py-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      <div className="space-y-3">
        {loading && !clients.length ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400">No clients found.</div>
        ) : clients.map(c => {
          const isOpen = expanded === c.id
          const apps   = c.portalApplications ?? []

          return (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Client row */}
              <button
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : c.id)}
              >
                <div className="w-10 h-10 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#C9A84C] font-bold text-sm">
                    {(c.name ?? c.email)[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#0B1F3A] truncate">{c.name ?? c.email}</div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                    {c.name && <span>{c.email}</span>}
                    <span>{c._count?.bookings ?? 0} booking{(c._count?.bookings ?? 0) !== 1 ? 's' : ''}</span>
                    <span className="font-medium text-[#0B1F3A]">{apps.length} portal app{apps.length !== 1 ? 's' : ''}</span>
                    <span>since {format(new Date(c.createdAt), 'MMM yyyy')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <a href={`mailto:${c.email}`}
                    className="p-2 text-gray-400 hover:text-[#C9A84C] hover:bg-amber-50 rounded-lg transition-colors">
                    <Mail className="w-4 h-4" />
                  </a>
                  <a href={`https://wa.me/447398753797?text=${encodeURIComponent(`Hi, I'm contacting you about client ${c.name ?? c.email}`)}`}
                    target="_blank" rel="noreferrer"
                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>

              {/* Expanded: portal applications */}
              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50 space-y-3">
                  {apps.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No portal applications for this client yet.</p>
                  ) : apps.map(app => {
                    const approvedDocs = app.documents.filter(d => d.status === 'APPROVED').length
                    const totalPaid    = app.payments.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)
                    const doneCl       = app.checklist.filter(ci => ci.completedAt).length

                    return (
                      <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STAGE_COLOR[app.stage]}`}>
                                {STAGE_LABEL[app.stage]}
                              </span>
                              <span className="text-xs font-mono text-gray-400">{app.refNumber}</span>
                              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{app.type}</span>
                            </div>
                            <h3 className="font-bold text-[#0B1F3A] text-sm">{app.title}</h3>
                            {app.destination && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {format(new Date(app.createdAt), 'd MMM yyyy')}
                          </span>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 mb-3 flex-wrap text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />
                            {approvedDocs}/{app.documents.length} docs approved
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckSquare className="w-3.5 h-3.5" />
                            {doneCl}/{app.checklist.length} checklist
                          </span>
                          {app.amount && (
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5" />
                              {app.currency} {totalPaid.toLocaleString()} / {app.amount.toLocaleString()} paid
                            </span>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-end gap-3 flex-wrap">
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Stage</label>
                            <select
                              value={app.stage}
                              disabled={saving === app.id}
                              onChange={e => updateStage(app.id, e.target.value as Stage)}
                              className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-[#C9A84C] disabled:opacity-50"
                            >
                              {STAGES.map(s => (
                                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-[160px]">
                            <label className="text-xs text-gray-400 block mb-1">Note to client</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={editNotes[app.id] ?? app.adminNotes ?? ''}
                                onChange={e => setEditNotes(p => ({ ...p, [app.id]: e.target.value }))}
                                placeholder="e.g. Please upload passport"
                                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C]"
                              />
                              <button
                                onClick={() => saveNotes(app.id)}
                                disabled={saving === app.id}
                                className="px-3 py-2 bg-[#0B1F3A] text-white text-xs font-semibold rounded-lg hover:bg-[#0d2040] disabled:opacity-50"
                              >
                                {saving === app.id ? '…' : 'Save'}
                              </button>
                            </div>
                          </div>
                          <a
                            href={`mailto:${c.email}?subject=Re: ${encodeURIComponent(app.title)}`}
                            className="text-xs text-[#C9A84C] hover:underline whitespace-nowrap pb-2"
                          >
                            Email client
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
