'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowLeft, FileText, CreditCard, CheckSquare,
  CheckCircle, Clock, Loader2, MessageCircle, Upload,
} from 'lucide-react'

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
  currency: string
  amountPaid: number
  notes: string | null
  adminNotes: string | null
  createdAt: string
  documents: { id: string; name: string; category: string; fileUrl: string; status: string; uploadedAt: string }[]
  payments: { id: string; amount: number; currency: string; description: string; status: string; paidAt: string | null; createdAt: string }[]
  checklist: { id: string; label: string; description: string | null; required: boolean; completedAt: string | null; order: number }[]
}

const STAGE_ORDER: Stage[] = ['ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'PROCESSING', 'SUBMITTED', 'APPROVED', 'COMPLETED']
const STAGE_LABELS: Record<Stage, string> = {
  ENQUIRY: 'Enquiry Received', DOCUMENTS_PENDING: 'Documents Pending',
  DOCUMENTS_RECEIVED: 'Documents Received', PROCESSING: 'Processing',
  SUBMITTED: 'Submitted', APPROVED: 'Approved', REJECTED: 'Rejected', COMPLETED: 'Completed',
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [app, setApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'docs' | 'payments' | 'checklist'>('overview')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/portal/applications/${id}`)
      .then(r => r.json())
      .then(d => { setApp(d.application); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  const toggleChecklist = async (itemId: string) => {
    setToggling(itemId)
    const res = await fetch(`/api/portal/checklist/${itemId}/complete`, { method: 'PATCH' })
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
  if (!app) return <div className="p-8 text-center text-gray-500">Application not found.</div>

  const progress = app.stage === 'REJECTED' ? 100 : Math.round(((STAGE_ORDER.indexOf(app.stage) + 1) / STAGE_ORDER.length) * 100)
  const completedChecklist = app.checklist.filter(c => c.completedAt).length

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
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#8B6914]">{STAGE_LABELS[app.stage]}</span>
            </div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">{app.title}</h1>
            {app.destination && <p className="text-sm text-gray-500 mt-0.5">{app.destination}{app.travelDate ? ` · ${app.travelDate}` : ''}</p>}
          </div>
          <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
            <MessageCircle className="w-4 h-4" /> Help
          </a>
        </div>

        {/* Progress */}
        {app.stage !== 'REJECTED' && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Application progress</span><span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${app.stage === 'APPROVED' || app.stage === 'COMPLETED' ? 'bg-green-500' : 'bg-[#C9A84C]'}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-2">
              {STAGE_ORDER.map((s, i) => (
                <div key={s} className={`text-[9px] text-center ${i <= STAGE_ORDER.indexOf(app.stage) ? 'text-[#C9A84C] font-semibold' : 'text-gray-300'}`} style={{ width: `${100 / STAGE_ORDER.length}%` }}>
                  {STAGE_LABELS[s].split(' ')[0]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b border-gray-100">
          {(['overview', 'docs', 'payments', 'checklist'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t === 'docs' ? 'Documents' : t}
              {t === 'checklist' && app.checklist.length > 0 && <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{completedChecklist}/{app.checklist.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-3xl">
        {/* Overview */}
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
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, (app.amountPaid / app.amount) * 100)}%` }} />
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

        {/* Documents */}
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
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${doc.status === 'APPROVED' ? 'bg-green-100 text-green-700' : doc.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {doc.status}
                  </span>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A84C] hover:underline">View</a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payments */}
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
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.status === 'PAID' ? 'bg-green-100 text-green-700' : p.status === 'REFUNDED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Checklist */}
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
                className={`w-full flex items-start gap-3 p-4 rounded-xl border transition-all text-left ${item.completedAt ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-[#C9A84C]/40'}`}
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
