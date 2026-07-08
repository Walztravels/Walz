'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowLeft, FileText, CreditCard, CheckSquare,
  CheckCircle, Clock, Loader2, MessageCircle, Upload, Download,
} from 'lucide-react'

type Stage = 'ENQUIRY' | 'DOCUMENTS_PENDING' | 'DOCUMENTS_RECEIVED' | 'PROCESSING' | 'SUBMITTED' | 'AWAITING_DECISION' | 'APPROVED' | 'REJECTED' | 'COMPLETED'

interface Update {
  id:            string
  createdAt:     string
  type:          string
  title:         string
  message:       string
  adminName:     string
  newStatus?:    string | null
  documentName?: string | null
  documentUrl?:  string | null
  emailSent:     boolean
}

interface Application {
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
  notes: string | null
  adminNotes: string | null
  trackingToken?: string | null
  createdAt: string
  updates: Update[]
  documents: { id: string; name: string; category: string; fileUrl: string; status: string; uploadedAt: string }[]
  payments: { id: string; amount: number; currency: string; description: string; status: string; paidAt: string | null; createdAt: string }[]
  checklist: { id: string; label: string; description: string | null; required: boolean; completedAt: string | null; order: number }[]
}

const STAGE_ORDER: Stage[] = ['ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'PROCESSING', 'SUBMITTED', 'AWAITING_DECISION', 'APPROVED', 'COMPLETED']
const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: 'Enquiry Received', DOCUMENTS_PENDING: 'Documents Pending',
  DOCUMENTS_RECEIVED: 'Documents Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', AWAITING_DECISION: 'Awaiting Decision',
  APPROVED: 'Approved', REJECTED: 'Refused', COMPLETED: 'Completed',
}

function updateEmoji(u: Update): string {
  if (u.documentUrl)               return '📎'
  if (u.newStatus === 'APPROVED')  return '🎉'
  if (u.newStatus === 'REJECTED')  return '😔'
  if (u.newStatus === 'SUBMITTED') return '📮'
  if (u.newStatus === 'PROCESSING')return '🔄'
  if (u.newStatus === 'AWAITING_DECISION') return '⏳'
  return '💬'
}

function updateBg(u: Update): string {
  if (u.newStatus === 'APPROVED') return 'bg-green-100'
  if (u.newStatus === 'REJECTED') return 'bg-red-100'
  if (u.documentUrl)              return 'bg-blue-100'
  return 'bg-[#F5F0E8]'
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [app,      setApp]      = useState<Application | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'updates' | 'overview' | 'docs' | 'payments' | 'checklist'>('updates')
  const [toggling, setToggling] = useState<string | null>(null)
  const [unread,   setUnread]   = useState(0)

  useEffect(() => {
    fetch(`/api/portal/applications/${id}`)
      .then(r => r.json())
      .then(d => { setApp(d.application); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!app?.updates) return
    const seen = JSON.parse(localStorage.getItem(`seen_updates_${app.id}`) ?? '[]') as string[]
    setUnread(app.updates.filter(u => !seen.includes(u.id)).length)
  }, [app])

  function markUpdatesRead() {
    if (!app?.updates) return
    localStorage.setItem(`seen_updates_${app.id}`, JSON.stringify(app.updates.map(u => u.id)))
    setUnread(0)
  }

  const toggleChecklist = async (itemId: string) => {
    setToggling(itemId)
    const res  = await fetch(`/api/portal/checklist/${itemId}/complete`, { method: 'PATCH' })
    const data = await res.json() as { item: { id: string; completedAt: string | null } }
    if (data.item) {
      setApp(prev => prev ? {
        ...prev,
        checklist: prev.checklist.map(c => c.id === itemId ? { ...c, completedAt: data.item.completedAt } : c),
      } : prev)
    }
    setToggling(null)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" /></div>
  if (!app)    return <div className="p-8 text-center text-gray-500">Application not found.</div>

  const progress = app.stage === 'REJECTED' ? 100 : Math.round(((STAGE_ORDER.indexOf(app.stage) + 1) / STAGE_ORDER.length) * 100)
  const completedChecklist = app.checklist.filter(c => c.completedAt).length

  const waLink = `https://wa.me/12317902336?text=${encodeURIComponent(
    `Hi Walz Travels, I have a question about my ${app.destination ?? ''} visa application (Ref: ${app.refNumber})`
  )}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-4">
        <Link href="/portal/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0B1F3A] mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400">{app.refNumber}</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#8B6914]">
                {STAGE_LABELS[app.stage]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">{app.title}</h1>
            {app.destination && (
              <p className="text-sm text-gray-500 mt-0.5">
                {app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}
              </p>
            )}
          </div>
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
            <MessageCircle className="w-4 h-4" /> Help
          </a>
        </div>

        {/* Progress bar */}
        {app.stage !== 'REJECTED' && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Application progress</span><span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${app.stage === 'APPROVED' || app.stage === 'COMPLETED' ? 'bg-green-500' : 'bg-[#C9A84C]'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              {STAGE_ORDER.map((s, i) => (
                <div key={s} className={`text-[9px] text-center ${i <= STAGE_ORDER.indexOf(app.stage) ? 'text-[#C9A84C] font-semibold' : 'text-gray-300'}`}
                  style={{ width: `${100 / STAGE_ORDER.length}%` }}>
                  {STAGE_LABELS[s].split(' ')[0]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b border-gray-100 overflow-x-auto">
          {([
            { key: 'updates',   label: 'Updates',   badge: unread },
            { key: 'overview',  label: 'Overview' },
            { key: 'docs',      label: 'Documents' },
            { key: 'payments',  label: 'Payments' },
            { key: 'checklist', label: 'Checklist', badge: completedChecklist < app.checklist.length && app.checklist.length > 0 ? `${completedChecklist}/${app.checklist.length}` : undefined },
          ] as { key: string; label: string; badge?: number | string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key as typeof tab)
                if (t.key === 'updates') markUpdatesRead()
              }}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== 0 && t.badge !== '' && (
                typeof t.badge === 'number' ? (
                  <span className="w-4 h-4 bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold rounded-full flex items-center justify-center leading-none">
                    {t.badge}
                  </span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{t.badge}</span>
                )
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-3xl">

        {/* ─── UPDATES TAB ─── */}
        {tab === 'updates' && (
          <div className="space-y-4">

            {/* Next steps card */}
            {app.stage !== 'APPROVED' && app.stage !== 'COMPLETED' && app.stage !== 'REJECTED' && (
              <div className="bg-[#F5F0E8] rounded-2xl p-5">
                <p className="text-xs font-semibold text-[#C9A84C] uppercase tracking-wider mb-2">What happens next</p>
                <p className="text-[#0B1F3A] font-semibold text-sm mb-2">
                  {app.stage === 'ENQUIRY'            && 'Our team is reviewing your enquiry'}
                  {app.stage === 'DOCUMENTS_PENDING'  && 'Please upload your required documents'}
                  {app.stage === 'DOCUMENTS_RECEIVED' && "We're preparing your application"}
                  {app.stage === 'PROCESSING'         && 'Your application is being processed'}
                  {app.stage === 'SUBMITTED'          && 'Waiting for embassy decision'}
                  {app.stage === 'AWAITING_DECISION'  && 'Embassy is reviewing your application'}
                </p>
                {app.stage === 'DOCUMENTS_PENDING' ? (
                  <Link href="/portal/documents" className="text-sm text-[#C9A84C] font-semibold hover:underline">
                    → Upload required documents
                  </Link>
                ) : (
                  <p className="text-gray-500 text-xs">
                    {"We'll notify you by email when there's an update."}
                  </p>
                )}
              </div>
            )}

            {/* Approved banner */}
            {app.stage === 'APPROVED' && (
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 text-center">
                <p className="text-3xl mb-2">🎉</p>
                <p className="font-bold text-green-700 text-lg">Your Visa Has Been Approved!</p>
                <p className="text-green-600 text-sm mt-1">
                  Check the updates below for your visa letter and next steps.
                </p>
              </div>
            )}

            {/* Rejected banner */}
            {app.stage === 'REJECTED' && (
              <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-5">
                <p className="font-bold text-red-700 mb-1">Application Refused</p>
                <p className="text-red-600 text-sm">
                  Please read the latest update below for refusal reasons. Our team will contact you to discuss reapplication options.
                </p>
              </div>
            )}

            {/* Timeline */}
            {app.updates.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-5 h-5 text-gray-300" />
                </div>
                <p className="text-gray-400 text-sm">No updates yet</p>
                <p className="text-gray-300 text-xs mt-1">
                  {"We'll notify you by email when there are updates to your application."}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <p className="font-semibold text-[#0B1F3A] mb-5 text-sm">
                  {app.updates.length} update{app.updates.length !== 1 ? 's' : ''} from Walz Travels
                </p>
                <div className="space-y-6">
                  {app.updates.map((u, i) => (
                    <div key={u.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-9 h-9 rounded-full ${updateBg(u)} flex items-center justify-center text-lg flex-shrink-0`}>
                          {updateEmoji(u)}
                        </div>
                        {i < app.updates.length - 1 && (
                          <div className="w-0.5 bg-gray-100 flex-1 mt-2 min-h-[24px]" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="font-semibold text-[#0B1F3A] text-sm">{u.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(u.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'long', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })} · {u.adminName}
                        </p>
                        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{u.message}</p>
                        {u.documentUrl && (
                          <a href={u.documentUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 mt-3 bg-[#F5F0E8] text-[#0B1F3A] text-xs font-semibold px-4 py-2 rounded-full hover:bg-[#C9A84C]/20 transition-colors">
                            <Download className="w-3.5 h-3.5" />
                            {u.documentName ?? 'Download Document'}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact card */}
            <div className="bg-[#0B1F3A] rounded-2xl p-5">
              <p className="text-white font-semibold text-sm mb-1">Have a question?</p>
              <p className="text-white/50 text-xs mb-4">
                Contact us directly about your {app.destination ?? ''} visa application.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href={waLink} target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold py-2.5 rounded-xl text-sm hover:bg-white transition-colors">
                  <MessageCircle className="w-4 h-4" /> WhatsApp Us
                </a>
                <a href={`mailto:contact@walztravels.com?subject=Re: ${app.destination ?? ''} Visa - ${app.refNumber}`}
                  className="flex-1 flex items-center justify-center gap-2 border border-white/20 text-white/70 py-2.5 rounded-xl text-sm hover:border-white hover:text-white transition-colors">
                  Email Us
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ─── OVERVIEW TAB ─── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-[#0B1F3A] mb-3">Application Details</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-gray-400">Type</dt><dd className="font-medium text-[#0B1F3A]">{app.type}</dd></div>
                <div><dt className="text-gray-400">Stage</dt><dd className="font-medium text-[#0B1F3A]">{STAGE_LABELS[app.stage]}</dd></div>
                {app.destination && <div><dt className="text-gray-400">Destination</dt><dd className="font-medium text-[#0B1F3A]">{app.destination}</dd></div>}
                {app.travelDate && <div><dt className="text-gray-400">Travel Date</dt><dd className="font-medium text-[#0B1F3A]">{app.travelDate}</dd></div>}
                <div><dt className="text-gray-400">Created</dt><dd className="font-medium text-[#0B1F3A]">{format(new Date(app.createdAt), 'd MMM yyyy')}</dd></div>
                <div><dt className="text-gray-400">Reference</dt><dd className="font-mono text-xs text-gray-600">{app.refNumber}</dd></div>
              </dl>
            </div>
            {app.amount && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-[#0B1F3A] mb-3">Payment Summary</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total amount</p>
                    <p className="text-2xl font-bold text-[#0B1F3A]">{app.currency} {app.amount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Paid so far</p>
                    <p className="text-xl font-bold text-green-600">{app.currency} {app.amountPaid.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full"
                    style={{ width: `${Math.min(100, (app.amountPaid / app.amount) * 100)}%` }} />
                </div>
              </div>
            )}
            {app.adminNotes && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Note from Walz Travels</p>
                <p className="text-sm text-blue-800">{app.adminNotes}</p>
              </div>
            )}
          </div>
        )}

        {/* ─── DOCUMENTS TAB ─── */}
        {tab === 'docs' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-500">{app.documents.length} document{app.documents.length !== 1 ? 's' : ''} uploaded</p>
              <Link href="/portal/documents" className="flex items-center gap-1.5 text-sm font-semibold text-[#C9A84C] hover:underline">
                <Upload className="w-3.5 h-3.5" /> Upload more
              </Link>
            </div>
            {app.documents.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No documents uploaded yet</p>
                <Link href="/portal/documents" className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-[#C9A84C] hover:underline">
                  <Upload className="w-3.5 h-3.5" /> Upload documents
                </Link>
              </div>
            ) : app.documents.map(doc => (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-[#C9A84C]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#0B1F3A] text-sm truncate">{doc.name}</p>
                    <p className="text-xs text-gray-400">{doc.category} · {format(new Date(doc.uploadedAt), 'd MMM yyyy')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    doc.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                    : doc.status === 'REJECTED' ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>{doc.status}</span>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A84C] hover:underline">View</a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── PAYMENTS TAB ─── */}
        {tab === 'payments' && (
          <div className="space-y-3">
            {app.payments.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No payments recorded yet</p>
              </div>
            ) : app.payments.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#0B1F3A] text-sm">{p.description}</p>
                  <p className="text-xs text-gray-400">{p.paidAt ? format(new Date(p.paidAt), 'd MMM yyyy') : format(new Date(p.createdAt), 'd MMM yyyy')}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#0B1F3A]">{p.currency} {p.amount.toLocaleString()}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    p.status === 'PAID' ? 'bg-green-100 text-green-700'
                    : p.status === 'REFUNDED' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
                  }`}>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── CHECKLIST TAB ─── */}
        {tab === 'checklist' && (
          <div className="space-y-2">
            {app.checklist.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <CheckSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No checklist items yet</p>
              </div>
            ) : app.checklist.map(item => (
              <button
                key={item.id}
                onClick={() => toggleChecklist(item.id)}
                disabled={toggling === item.id}
                className={`w-full flex items-start gap-3 p-4 rounded-xl border transition-all text-left ${
                  item.completedAt ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-[#C9A84C]/40'
                }`}
              >
                {toggling === item.id ? (
                  <Loader2 className="w-5 h-5 text-[#C9A84C] animate-spin flex-shrink-0 mt-0.5" />
                ) : item.completedAt ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-sm font-medium ${item.completedAt ? 'text-green-700 line-through' : 'text-[#0B1F3A]'}`}>{item.label}</p>
                  {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                  {item.required && !item.completedAt && <span className="text-[10px] text-amber-600 font-semibold">Required</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
