'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { LayoutDashboard, RefreshCw, ChevronDown, CheckCircle, FileText, CreditCard } from 'lucide-react'
import BankStatementCard from '@/components/admin/BankStatementCard'

type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

interface Application {
  id: string
  refNumber: string
  title: string
  type: string
  stage: Stage
  destination: string | null
  travelDate: string | null
  amount: number | null
  amountPaid: number
  currency: string
  adminNotes: string | null
  createdAt: string
  user: { name: string | null; email: string | null }
  documents: { id: string; status: string }[]
  payments:  { id: string; amount: number; status: string }[]
  checklist: { id: string; completedAt: string | null }[]
}

const STAGES: Stage[] = ['ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'PROCESSING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED']
const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: 'Enquiry', DOCUMENTS_PENDING: 'Docs Pending',
  DOCUMENTS_RECEIVED: 'Docs Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', COMPLETED: 'Completed',
}
const STAGE_COLOR: Record<Stage, string> = {
  ENQUIRY: 'bg-blue-100 text-blue-700', DOCUMENTS_PENDING: 'bg-amber-100 text-amber-700',
  DOCUMENTS_RECEIVED: 'bg-yellow-100 text-yellow-700', PROCESSING: 'bg-purple-100 text-purple-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700', APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', COMPLETED: 'bg-gray-100 text-gray-600',
}

export default function AdminPortalPage() {
  const [apps, setApps]         = useState<Application[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [stage, setStage]       = useState<string>('ALL')
  const [saving, setSaving]     = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (stage !== 'ALL') params.set('stage', stage)
    const res = await fetch(`/api/admin/portal/applications?${params}`)
    const data = await res.json() as { applications: Application[]; total: number }
    setApps(data.applications ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [stage])

  useEffect(() => { load() }, [load])

  const updateStage = async (id: string, newStage: Stage) => {
    setSaving(id)
    setApps(prev => prev.map(a => a.id === id ? { ...a, stage: newStage } : a))
    await fetch(`/api/admin/portal/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
    setSaving(null)
  }

  const saveNotes = async (id: string) => {
    setSaving(id)
    await fetch(`/api/admin/portal/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNotes: editNotes[id] }),
    })
    setApps(prev => prev.map(a => a.id === id ? { ...a, adminNotes: editNotes[id] ?? null } : a))
    setSaving(null)
  }

  return (
    <div className="flex-1 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0B1F3A]">Client Portal Applications</h1>
              <p className="text-sm text-gray-500">{total} total</p>
            </div>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Stage filter */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-white rounded-xl border border-gray-200 w-fit mb-6">
          {['ALL', ...STAGES].map(s => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${stage === s ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {s === 'ALL' ? 'All' : STAGE_LABELS[s as Stage]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-200" />)}
          </div>
        ) : apps.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <LayoutDashboard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">No portal applications yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apps.map(app => {
              const doneChecklist = app.checklist.filter(c => c.completedAt).length
              const approvedDocs  = app.documents.filter(d => d.status === 'APPROVED').length
              const totalPaid     = app.payments.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)

              return (
                <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STAGE_COLOR[app.stage]}`}>{STAGE_LABELS[app.stage]}</span>
                        <span className="text-xs font-mono text-gray-400">{app.refNumber}</span>
                      </div>
                      <h3 className="font-bold text-[#0B1F3A]">{app.title}</h3>
                      <p className="text-sm text-gray-500">
                        {app.user.name ?? app.user.email} {app.destination ? `· ${app.destination}` : ''}
                        {app.travelDate ? ` · ${app.travelDate}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 text-sm text-gray-400">
                      {format(new Date(app.createdAt), 'd MMM yyyy')}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mb-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <FileText className="w-3.5 h-3.5" />
                      {approvedDocs}/{app.documents.length} docs approved
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {doneChecklist}/{app.checklist.length} checklist
                    </div>
                    {app.amount && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <CreditCard className="w-3.5 h-3.5" />
                        {app.currency} {totalPaid.toLocaleString()} / {app.amount.toLocaleString()} paid
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex items-end gap-3 flex-wrap">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Stage</label>
                      <div className="relative">
                        <select
                          value={app.stage}
                          disabled={saving === app.id}
                          onChange={e => updateStage(app.id, e.target.value as Stage)}
                          className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-[#C9A84C] pr-7 appearance-none disabled:opacity-50"
                        >
                          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-xs text-gray-400 mb-1 block">Admin note to client</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editNotes[app.id] ?? app.adminNotes ?? ''}
                          onChange={e => setEditNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                          placeholder="e.g. Please upload passport copy"
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C]"
                        />
                        <button
                          onClick={() => saveNotes(app.id)}
                          disabled={saving === app.id}
                          className="px-3 py-2 bg-[#0B1F3A] text-white text-xs font-semibold rounded-lg hover:bg-[#0d2040] transition-colors disabled:opacity-50"
                        >
                          {saving === app.id ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                    {app.user.email && (
                      <a
                        href={`mailto:${app.user.email}?subject=Re: ${encodeURIComponent(app.title)}`}
                        className="text-xs text-[#C9A84C] hover:underline"
                      >
                        Email client
                      </a>
                    )}
                  </div>

                  <BankStatementCard
                    applicationId={app.id}
                    destination={app.destination ?? 'uk'}
                    applicantName={app.user.name ?? app.title}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
