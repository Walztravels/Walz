'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { LayoutDashboard, RefreshCw, ChevronDown, CheckCircle, FileText, CreditCard, ExternalLink, Send, X, Loader2 } from 'lucide-react'
import BankStatementCard from '@/components/admin/BankStatementCard'
import Link from 'next/link'

type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'AWAITING_DECISION' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

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
  walzFee:     number | null
  walzCurrency: string | null
  govFee:      number | null
  govCurrency: string | null
  govFeeNote:  string | null
  createdAt: string
  user: { name: string | null; email: string | null }
  documents: { id: string; status: string }[]
  payments:  { id: string; amount: number; status: string }[]
  checklist: { id: string; completedAt: string | null }[]
}

const STAGES: Stage[] = ['ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'PROCESSING', 'SUBMITTED', 'AWAITING_DECISION', 'APPROVED', 'REJECTED', 'COMPLETED']
const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: 'Enquiry', DOCUMENTS_PENDING: 'Docs Pending',
  DOCUMENTS_RECEIVED: 'Docs Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', AWAITING_DECISION: 'Awaiting Decision',
  APPROVED: 'Approved', REJECTED: 'Rejected', COMPLETED: 'Completed',
}
const STAGE_COLOR: Record<Stage, string> = {
  ENQUIRY: 'bg-blue-100 text-blue-700', DOCUMENTS_PENDING: 'bg-amber-100 text-amber-700',
  DOCUMENTS_RECEIVED: 'bg-yellow-100 text-yellow-700', PROCESSING: 'bg-purple-100 text-purple-700',
  SUBMITTED: 'bg-indigo-100 text-indigo-700', AWAITING_DECISION: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', COMPLETED: 'bg-gray-100 text-gray-600',
}

interface SendUpdateModal {
  appId: string
  refNumber: string
  email: string | null
}

export default function AdminPortalPage() {
  const [apps, setApps]         = useState<Application[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [stage, setStage]       = useState<string>('ALL')
  const [saving, setSaving]     = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})

  // Send Update modal state
  const [sendModal, setSendModal]             = useState<SendUpdateModal | null>(null)
  const [sendSubject, setSendSubject]         = useState('')
  const [sendMessage, setSendMessage]         = useState('')
  const [sendApptDate, setSendApptDate]       = useState('')
  const [sendApptLoc, setSendApptLoc]         = useState('')
  const [sendApptNotes, setSendApptNotes]     = useState('')
  const [sendStatus, setSendStatus]           = useState('')
  const [sendLoading, setSendLoading]         = useState(false)
  const [sendSuccess, setSendSuccess]         = useState(false)

  // Fee editing — one app at a time
  const [editingFeesFor, setEditingFeesFor] = useState<string | null>(null)
  const [walzFee,     setWalzFee]     = useState<number | ''>('')
  const [walzCur,     setWalzCur]     = useState('GBP')
  const [govFee,      setGovFee]      = useState<number | ''>('')
  const [govCur,      setGovCur]      = useState('GBP')
  const [govNote,     setGovNote]     = useState('paid later')
  const [feesSaving,  setFeesSaving]  = useState(false)

  function openFeeEditor(app: Application) {
    setWalzFee(app.walzFee ?? app.amount ?? '')
    setWalzCur(app.walzCurrency ?? app.currency ?? 'GBP')
    setGovFee(app.govFee ?? '')
    setGovCur(app.govCurrency ?? 'GBP')
    setGovNote(app.govFeeNote ?? 'paid later')
    setEditingFeesFor(app.id)
  }

  async function saveFees(appId: string) {
    setFeesSaving(true)
    const fee = walzFee !== '' ? Number(walzFee) : null
    await fetch(`/api/admin/portal/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walzFee:     fee,
        walzCurrency: walzCur,
        govFee:      govFee !== '' ? Number(govFee) : null,
        govCurrency: govCur,
        govFeeNote:  govNote,
        // keep amount in sync for backwards-compat
        amount:   fee,
        currency: walzCur,
      }),
    })
    await load()
    setEditingFeesFor(null)
    setFeesSaving(false)
  }

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

  function openSendModal(app: Application) {
    setSendModal({ appId: app.id, refNumber: app.refNumber, email: app.user.email })
    setSendSubject(`Update on your visa application — Ref: ${app.refNumber}`)
    setSendMessage('')
    setSendApptDate('')
    setSendApptLoc('')
    setSendApptNotes('')
    setSendStatus('')
    setSendSuccess(false)
  }

  async function submitSendUpdate() {
    if (!sendModal) return
    setSendLoading(true)
    await fetch(`/api/admin/visa-applications/${sendModal.appId}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject:             sendSubject,
        message:             sendMessage,
        appointmentDate:     sendApptDate || undefined,
        appointmentLocation: sendApptLoc  || undefined,
        appointmentNotes:    sendApptNotes || undefined,
        updateStatus:        sendStatus   || undefined,
      }),
    })
    setSendLoading(false)
    setSendSuccess(true)
    setTimeout(() => setSendModal(null), 1500)
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
                    <button
                      onClick={() => openSendModal(app)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#C9A84C] hover:bg-[#d4b45f] px-3 py-2 rounded-lg transition-colors"
                    >
                      <Send className="w-3 h-3" /> Send Update
                    </button>
                    <Link
                      href={`/admin/portal/${app.id}`}
                      className="flex items-center gap-1 text-xs font-semibold text-[#0B1F3A] bg-[#C9A84C]/10 hover:bg-[#C9A84C]/20 border border-[#C9A84C]/30 px-3 py-2 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> View &amp; Update
                    </Link>
                  </div>

                  {/* ── Fee Summary ── */}
                  <div className="mt-4 bg-gray-50 rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-[#0B1F3A] text-sm">Fee Summary</h4>
                      {editingFeesFor !== app.id ? (
                        <button
                          onClick={() => openFeeEditor(app)}
                          className="text-xs text-[#C9A84C] hover:underline font-medium"
                        >
                          Edit fees
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingFeesFor(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {editingFeesFor !== app.id ? (
                      /* Read-only display */
                      <div className="space-y-2 text-sm">
                        {app.walzFee != null && app.walzFee > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Walz Travels Service Fee</span>
                              <span className="font-semibold text-[#0B1F3A]">
                                {app.walzCurrency ?? app.currency} {app.walzFee.toLocaleString()}
                              </span>
                            </div>
                            {app.govFee != null && app.govFee > 0 && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">
                                  Government Fee
                                  {app.govFeeNote && <span className="text-gray-400 ml-1">({app.govFeeNote})</span>}
                                </span>
                                <span className="font-semibold text-gray-600">
                                  {app.govCurrency ?? app.currency} {app.govFee.toLocaleString()}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                              <span className="font-semibold text-[#0B1F3A]">Due today</span>
                              <span className="font-bold text-[#C9A84C]">
                                {app.walzCurrency ?? app.currency} {app.walzFee.toLocaleString()}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-gray-400 text-xs text-center py-1">
                            No fees set — click <span className="text-[#C9A84C]">Edit fees</span> to add
                          </p>
                        )}
                      </div>
                    ) : (
                      /* Editable form */
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Walz Travels Service Fee</label>
                          <div className="flex gap-2">
                            <select
                              value={walzCur}
                              onChange={e => setWalzCur(e.target.value)}
                              className="w-24 border border-gray-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-[#C9A84C]"
                            >
                              {['GBP','USD','EUR','CAD','NGN','GHS','AED'].map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={walzFee}
                              onChange={e => setWalzFee(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0.00"
                              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Government / Embassy Fee</label>
                          <div className="flex gap-2">
                            <select
                              value={govCur}
                              onChange={e => setGovCur(e.target.value)}
                              className="w-24 border border-gray-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-[#C9A84C]"
                            >
                              {['GBP','USD','EUR','CAD','NGN','GHS','AED'].map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={govFee}
                              onChange={e => setGovFee(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0.00 (optional)"
                              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]"
                            />
                          </div>
                          <select
                            value={govNote}
                            onChange={e => setGovNote(e.target.value)}
                            className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#C9A84C]"
                          >
                            <option value="paid later">paid later</option>
                            <option value="paid at embassy">paid at embassy</option>
                            <option value="paid direct">paid direct</option>
                            <option value="included">included</option>
                          </select>
                        </div>
                        <button
                          onClick={() => saveFees(app.id)}
                          disabled={feesSaving}
                          className="w-full bg-[#C9A84C] text-[#0B1F3A] font-bold py-2 rounded-xl text-sm hover:bg-[#d4b45f] disabled:opacity-50 transition-colors"
                        >
                          {feesSaving ? 'Saving…' : 'Save Fees'}
                        </button>
                      </div>
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

      {/* Send Update Modal */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-[#0B1F3A]">Send Update</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Ref: {sendModal.refNumber} · {sendModal.email ?? 'No email on file'}
                </p>
              </div>
              <button onClick={() => setSendModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Subject</label>
                <input value={sendSubject} onChange={e => setSendSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Message</label>
                <textarea value={sendMessage} onChange={e => setSendMessage(e.target.value)} rows={4}
                  placeholder="Write your update message to the client…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
              </div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Appointment (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Date &amp; Time</label>
                    <input type="datetime-local" value={sendApptDate} onChange={e => setSendApptDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
                    <input value={sendApptLoc} onChange={e => setSendApptLoc(e.target.value)}
                      placeholder="e.g. VFS London"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Appointment Notes</label>
                  <input value={sendApptNotes} onChange={e => setSendApptNotes(e.target.value)}
                    placeholder="e.g. Bring original passport"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Update Status (optional)</label>
                <select value={sendStatus} onChange={e => setSendStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]">
                  <option value="">— Keep current status —</option>
                  <option value="received">Received</option>
                  <option value="documents_pending">Documents Pending</option>
                  <option value="under_review">Under Review</option>
                  <option value="ready_to_submit">Ready to Submit</option>
                  <option value="submitted_to_embassy">Submitted to Embassy</option>
                  <option value="decision_pending">Decision Pending</option>
                  <option value="approved">Approved</option>
                  <option value="refused">Refused</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setSendModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={submitSendUpdate} disabled={sendLoading || sendSuccess || !sendModal.email}
                className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-semibold hover:bg-[#0B1F3A]/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {sendLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : sendSuccess ? (
                  <>✓ Sent!</>
                ) : (
                  <><Send className="w-4 h-4" /> Send Email</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
