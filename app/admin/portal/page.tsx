'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { LayoutDashboard, RefreshCw, ChevronDown, CheckCircle, FileText, CreditCard, ExternalLink, Send, X, Loader2, FolderUp, Copy, Plus, Trash2, ChevronUp, Eye, Download, Pencil, MessageCircle, Phone } from 'lucide-react'
import { WhatsAppDrawer } from './components/WhatsAppDrawer'
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
  adminNotes:      string | null
  whatsappNumber:  string | null
  walzFee:         number | null
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

interface DocItem {
  name:         string
  description?: string
  required?:    boolean
  category?:    string
}

interface DocUpload {
  id:         string
  docName:    string
  fileName:   string
  fileSize:   number | null
  fileUrl:    string
  uploadedAt: string
  status:     string
  reviewNote: string | null
}

interface DocRequest {
  id:           string
  token:        string
  status:       string
  clientEmail:  string
  clientName:   string
  requestedBy:  string
  requestedDocs: DocItem[]
  message:      string | null
  deadline:     string | null
  expiresAt:    string
  uploadedCount: number
  totalRequired: number
  emailSentAt:  string | null
  openedAt:     string | null
  completedAt:  string | null
  createdAt:    string
  uploads:      DocUpload[]
}

const COMMON_DOCS: DocItem[] = [
  { name: 'Passport (Bio data page)',  description: 'Clear scan of passport info page',                   category: 'Identity',   required: true  },
  { name: 'Bank Statement (3 months)', description: 'Last 3 months showing salary credits',               category: 'Financial',  required: true  },
  { name: 'Proof of Employment',       description: 'Employment letter or pay slip',                      category: 'Employment', required: true  },
  { name: 'Utility Bill',              description: 'Proof of address — not older than 3 months',         category: 'Address',    required: true  },
  { name: 'Flight Itinerary',          description: 'Confirmed or dummy flight booking',                  category: 'Travel',     required: true  },
  { name: 'Hotel Booking',             description: 'Hotel reservation confirmation',                     category: 'Travel',     required: false },
  { name: 'Travel Insurance',          description: 'Policy covering the travel dates',                   category: 'Travel',     required: false },
  { name: 'Invitation Letter',         description: 'From host in destination country',                   category: 'Other',      required: false },
  { name: 'Photo (passport-size)',     description: 'White background, recent photo',                     category: 'Identity',   required: true  },
  { name: 'Birth Certificate',         description: 'For family applications',                            category: 'Identity',   required: false },
]

interface RequestDocsModal {
  appId:       string
  clientEmail: string
  clientName:  string
  refNumber:   string
  destination: string
}

function getDocList(destination: string): DocItem[] {
  const d = (destination ?? '').toLowerCase()
  const isUK = d.includes('uk') || d.includes('united kingdom') || d.includes('britain')
  return COMMON_DOCS.map(doc => {
    if (doc.name === 'Bank Statement (3 months)' && isUK) {
      return { ...doc, name: 'Bank Statement (6 months)', description: 'Last 6 months showing salary credits (UK requirement)' }
    }
    return doc
  })
}

export default function AdminPortalPage() {
  const [apps, setApps]         = useState<Application[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [stage, setStage]       = useState<string>('ALL')
  const [saving, setSaving]     = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})

  // Request Docs modal state
  const [reqDocsModal, setReqDocsModal]             = useState<RequestDocsModal | null>(null)
  const [reqDocSelected, setReqDocSelected]         = useState<Set<string>>(new Set())
  const [reqDocCustom, setReqDocCustom]             = useState<DocItem[]>([])
  const [reqDocOverrides, setReqDocOverrides]       = useState<Record<string, Partial<DocItem>>>({})
  const [reqDocEditing, setReqDocEditing]           = useState<string | null>(null)
  const [reqDocEditName, setReqDocEditName]         = useState('')
  const [reqDocEditDesc, setReqDocEditDesc]         = useState('')
  const [reqDocAddingCustom, setReqDocAddingCustom] = useState(false)
  const [reqDocAddName, setReqDocAddName]           = useState('')
  const [reqDocAddDesc, setReqDocAddDesc]           = useState('')
  const [reqDocMessage, setReqDocMessage]           = useState('')
  const [reqDocDeadline, setReqDocDeadline]         = useState('')
  const [reqDocSending, setReqDocSending]           = useState(false)
  const [reqDocResult, setReqDocResult]             = useState<{ link: string; email: string } | null>(null)
  const [copied, setCopied]                         = useState(false)
  // Document requests panel per application
  const [docReqs, setDocReqs]                 = useState<Record<string, DocRequest[]>>({})
  const [docsOpen, setDocsOpen]               = useState<Set<string>>(new Set())
  const [docsLoading, setDocsLoading]         = useState<Set<string>>(new Set())

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

  // WhatsApp chat drawer
  const [waDrawer, setWaDrawer]           = useState<{ convId: number; app: Application } | null>(null)
  const [waLoading, setWaLoading]         = useState<string | null>(null)
  const [waError, setWaError]             = useState<string | null>(null)
  const [editingPhone, setEditingPhone]   = useState<string | null>(null)
  const [phoneInputs, setPhoneInputs]     = useState<Record<string, string>>({})

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

  function openReqDocs(app: Application) {
    setReqDocsModal({ appId: app.id, clientEmail: app.user.email ?? '', clientName: app.user.name ?? app.title, refNumber: app.refNumber, destination: app.destination ?? '' })
    setReqDocSelected(new Set())
    setReqDocCustom([])
    setReqDocOverrides({})
    setReqDocEditing(null)
    setReqDocAddingCustom(false)
    setReqDocAddName('')
    setReqDocAddDesc('')
    setReqDocMessage('')
    setReqDocDeadline('')
    setReqDocResult(null)
    setCopied(false)
  }

  async function openWhatsApp(app: Application, phoneOverride?: string) {
    const phone = phoneOverride ?? app.whatsappNumber
    if (!phone) { setEditingPhone(app.id); return }
    setWaLoading(app.id)
    setWaError(null)
    const res = await fetch('/api/admin/whatsapp-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: app.id,
        clientName:    app.user.name ?? app.title,
        clientPhone:   phone,
        refNumber:     app.refNumber,
      }),
    })
    const data = await res.json() as { conversationId?: number; error?: string }
    setWaLoading(null)
    if (!res.ok || !data.conversationId) {
      setWaError(data.error ?? 'Failed to open WhatsApp chat')
      return
    }
    // Optimistically update local state so phone shows immediately
    setApps(prev => prev.map(a => a.id === app.id ? { ...a, whatsappNumber: phone } : a))
    setWaDrawer({ convId: data.conversationId, app: { ...app, whatsappNumber: phone } })
    setEditingPhone(null)
  }

  function toggleReqDoc(name: string) {
    setReqDocSelected(prev => {
      const n = new Set(prev)
      if (n.has(name)) n.delete(name); else n.add(name)
      return n
    })
  }

  async function submitReqDocs() {
    if (!reqDocsModal) return
    const docList = getDocList(reqDocsModal.destination)
    const selected = docList
      .filter(d => reqDocSelected.has(d.name))
      .map(d => ({
        ...d,
        name:        reqDocOverrides[d.name]?.name        ?? d.name,
        description: reqDocOverrides[d.name]?.description ?? d.description,
      }))
    const allDocs  = [...selected, ...reqDocCustom]
    if (allDocs.length === 0) return alert('Select at least one document')

    setReqDocSending(true)
    const res = await fetch('/api/admin/document-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: reqDocsModal.appId,
        clientEmail:   reqDocsModal.clientEmail,
        clientName:    reqDocsModal.clientName,
        requestedDocs: allDocs,
        message:       reqDocMessage || undefined,
        deadline:      reqDocDeadline || undefined,
      }),
    })
    const d = await res.json()
    setReqDocSending(false)
    if (res.ok) {
      setReqDocResult({ link: d.uploadLink, email: reqDocsModal.clientEmail })
    } else {
      alert(d.error ?? 'Failed to send request')
    }
  }

  async function loadDocRequests(appId: string) {
    if (docsLoading.has(appId)) return
    setDocsLoading(prev => new Set([...prev, appId]))
    const res = await fetch(`/api/admin/document-requests?applicationId=${appId}`)
    const d   = await res.json()
    setDocReqs(prev => ({ ...prev, [appId]: (d.requests ?? []).map((r: DocRequest & { requestedDocs: unknown }) => ({
      ...r,
      requestedDocs: typeof r.requestedDocs === 'string' ? JSON.parse(r.requestedDocs) : r.requestedDocs,
    })) }))
    setDocsLoading(prev => { const n = new Set(prev); n.delete(appId); return n })
  }

  function toggleDocsPanel(appId: string) {
    setDocsOpen(prev => {
      const n = new Set(prev)
      if (n.has(appId)) { n.delete(appId) } else { n.add(appId); loadDocRequests(appId) }
      return n
    })
  }

  async function reviewUpload(requestId: string, uploadId: string, status: string, note: string) {
    await fetch(`/api/admin/document-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, status, reviewNote: note }),
    })
    // Refresh doc requests for the parent app
    const appId = Object.keys(docReqs).find(aid =>
      docReqs[aid]?.some(r => r.id === requestId)
    )
    if (appId) {
      setDocsLoading(prev => { const n = new Set(prev); n.delete(appId); return n })
      loadDocRequests(appId)
    }
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
                    <button
                      onClick={() => openReqDocs(app)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-2 rounded-lg transition-colors"
                    >
                      <FolderUp className="w-3 h-3" /> Request Docs
                    </button>

                    {/* WhatsApp Chat button */}
                    {editingPhone === app.id ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-green-600" />
                        <input
                          type="tel"
                          autoFocus
                          value={phoneInputs[app.id] ?? app.whatsappNumber ?? ''}
                          onChange={e => setPhoneInputs(p => ({ ...p, [app.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') void openWhatsApp(app, phoneInputs[app.id] ?? '')
                            if (e.key === 'Escape') setEditingPhone(null)
                          }}
                          placeholder="+44 7700 000000"
                          className="text-xs border border-green-300 rounded-lg px-2 py-1.5 w-40 outline-none focus:border-green-500"
                        />
                        <button
                          onClick={() => void openWhatsApp(app, phoneInputs[app.id] ?? '')}
                          disabled={!phoneInputs[app.id]?.trim()}
                          className="text-xs font-semibold text-white bg-green-500 hover:bg-green-600 px-2.5 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                        >
                          Chat
                        </button>
                        <button onClick={() => setEditingPhone(null)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => void openWhatsApp(app)}
                        disabled={waLoading === app.id}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
                        title={app.whatsappNumber ? `WhatsApp: ${app.whatsappNumber}` : 'Add WhatsApp number'}
                      >
                        {waLoading === app.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <MessageCircle className="w-3 h-3" />
                        }
                        {app.whatsappNumber ? 'WhatsApp' : 'Add WhatsApp'}
                        {app.whatsappNumber && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setEditingPhone(app.id); setPhoneInputs(p => ({ ...p, [app.id]: app.whatsappNumber ?? '' })) }}
                            className="ml-0.5 opacity-70 hover:opacity-100"
                            title="Edit number"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </button>
                    )}
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

                  {/* Document Requests panel */}
                  <div className="mt-3">
                    <button
                      onClick={() => toggleDocsPanel(app.id)}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-[#0B1F3A] transition-colors"
                    >
                      {docsOpen.has(app.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      Document Requests
                      {docReqs[app.id]?.length > 0 && (
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          {docReqs[app.id].length}
                        </span>
                      )}
                    </button>

                    {docsOpen.has(app.id) && (
                      <div className="mt-2 space-y-2">
                        {docsLoading.has(app.id) ? (
                          <div className="flex items-center gap-2 py-3 text-gray-400 text-xs">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                          </div>
                        ) : (docReqs[app.id] ?? []).length === 0 ? (
                          <p className="text-xs text-gray-400 py-2">No document requests sent yet.</p>
                        ) : (
                          (docReqs[app.id] ?? []).map(req => (
                            <DocRequestCard key={req.id} req={req} onReview={reviewUpload} />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* WhatsApp error toast */}
      {waError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-red-600 text-white rounded-2xl shadow-xl text-sm font-semibold">
          {waError}
          <button onClick={() => setWaError(null)} className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* WhatsApp Chat Drawer */}
      {waDrawer && (
        <WhatsAppDrawer
          conversationId={waDrawer.convId}
          clientName={waDrawer.app.user.name ?? waDrawer.app.title}
          clientPhone={waDrawer.app.whatsappNumber ?? ''}
          applicationType={waDrawer.app.type}
          refNumber={waDrawer.app.refNumber}
          onClose={() => setWaDrawer(null)}
        />
      )}

      {/* Request Docs Modal */}
      {reqDocsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-[#0B1F3A]">Request Documents</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {reqDocsModal.clientName} · {reqDocsModal.clientEmail || 'No email on file'}
                </p>
              </div>
              <button onClick={() => setReqDocsModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {reqDocResult ? (
              /* Success state */
              <div className="p-6 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-green-800 text-sm">Request sent!</p>
                    <p className="text-green-700 text-xs mt-0.5">
                      Email sent to <strong>{reqDocResult.email}</strong> with upload link.
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">Upload link (share manually if needed):</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 truncate">
                      {reqDocResult.link}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(reqDocResult!.link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-[#0B1F3A] text-white rounded-xl text-xs font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <button onClick={() => setReqDocsModal(null)}
                  className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Close
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Common doc checklist */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Select Documents</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                    {getDocList(reqDocsModal.destination).map(doc => {
                      const override = reqDocOverrides[doc.name]
                      const displayName = override?.name ?? doc.name
                      const displayDesc = override?.description ?? doc.description
                      const isEditing   = reqDocEditing === doc.name
                      const isChecked   = reqDocSelected.has(doc.name)
                      return (
                        <div key={doc.name} className={`rounded-xl border transition-colors ${isChecked ? 'border-[#C9A84C]/40 bg-[#C9A84C]/5' : 'border-transparent hover:bg-gray-50'}`}>
                          <label className="flex items-start gap-3 cursor-pointer p-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleReqDoc(doc.name)}
                              className="mt-0.5 accent-[#C9A84C]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#0B1F3A] leading-tight">{displayName}</p>
                              {displayDesc && <p className="text-xs text-gray-400 mt-0.5">{displayDesc}</p>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                doc.required !== false ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'
                              }`}>
                                {doc.required !== false ? 'Req' : 'Opt'}
                              </span>
                              {isChecked && !isEditing && (
                                <button
                                  type="button"
                                  onClick={e => { e.preventDefault(); setReqDocEditing(doc.name); setReqDocEditName(displayName); setReqDocEditDesc(displayDesc ?? '') }}
                                  className="p-0.5 text-gray-300 hover:text-[#C9A84C] transition-colors"
                                  title="Edit label"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </label>
                          {isEditing && (
                            <div className="px-3 pb-3 space-y-1.5">
                              <input
                                value={reqDocEditName}
                                onChange={e => setReqDocEditName(e.target.value)}
                                placeholder="Document name"
                                className="w-full px-2.5 py-1.5 border border-[#C9A84C]/50 rounded-lg text-xs outline-none focus:border-[#C9A84C]"
                              />
                              <input
                                value={reqDocEditDesc}
                                onChange={e => setReqDocEditDesc(e.target.value)}
                                placeholder="Description (optional)"
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#C9A84C]"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (reqDocEditName.trim()) {
                                      setReqDocOverrides(prev => ({ ...prev, [doc.name]: { name: reqDocEditName.trim(), description: reqDocEditDesc.trim() || undefined } }))
                                    }
                                    setReqDocEditing(null)
                                  }}
                                  className="text-xs px-3 py-1 bg-[#0B1F3A] text-white rounded-lg font-semibold"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setReqDocEditing(null); setReqDocOverrides(prev => { const n = { ...prev }; delete n[doc.name]; return n }) }}
                                  className="text-xs px-3 py-1 border border-gray-200 text-gray-500 rounded-lg"
                                >
                                  Reset
                                </button>
                                <button type="button" onClick={() => setReqDocEditing(null)} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Custom docs */}
                <div className="space-y-2">
                  {reqDocCustom.length > 0 && (
                    <>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Special / Custom Documents</p>
                      {reqDocCustom.map((d, i) => (
                        <div key={i} className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#0B1F3A] font-semibold leading-tight">{d.name}</p>
                            {d.description && <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>}
                          </div>
                          <button onClick={() => setReqDocCustom(prev => prev.filter((_, j) => j !== i))}
                            className="text-gray-400 hover:text-red-500 mt-0.5 flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  {reqDocAddingCustom ? (
                    <div className="border border-blue-200 rounded-xl p-3 space-y-2 bg-blue-50/50">
                      <p className="text-xs font-bold text-blue-700">New Special Document</p>
                      <input
                        value={reqDocAddName}
                        onChange={e => setReqDocAddName(e.target.value)}
                        placeholder="Document name *"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white"
                        autoFocus
                      />
                      <input
                        value={reqDocAddDesc}
                        onChange={e => setReqDocAddDesc(e.target.value)}
                        placeholder="Instructions / description (optional)"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!reqDocAddName.trim()) return
                            setReqDocCustom(prev => [...prev, { name: reqDocAddName.trim(), description: reqDocAddDesc.trim() || undefined, required: true }])
                            setReqDocAddName(''); setReqDocAddDesc(''); setReqDocAddingCustom(false)
                          }}
                          disabled={!reqDocAddName.trim()}
                          className="text-xs px-4 py-1.5 bg-[#0B1F3A] text-white rounded-lg font-semibold disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button type="button" onClick={() => { setReqDocAddingCustom(false); setReqDocAddName(''); setReqDocAddDesc('') }}
                          className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReqDocAddingCustom(true)}
                      className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:text-blue-800"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add special document
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Message to client (optional)</label>
                  <textarea value={reqDocMessage} onChange={e => setReqDocMessage(e.target.value)} rows={3}
                    placeholder="e.g. Please upload clear scans — blurry photos will not be accepted."
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Deadline (optional)</label>
                  <input type="date" value={reqDocDeadline} onChange={e => setReqDocDeadline(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setReqDocsModal(null)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={submitReqDocs}
                    disabled={reqDocSending || (reqDocSelected.size === 0 && reqDocCustom.length === 0) || !reqDocsModal.clientEmail}
                    className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#0B1F3A]/90 transition-colors"
                  >
                    {reqDocSending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                      : <><FolderUp className="w-4 h-4" /> Send Request ({reqDocSelected.size + reqDocCustom.length} docs)</>
                    }
                  </button>
                </div>
                {!reqDocsModal.clientEmail && (
                  <p className="text-xs text-red-500 text-center">No email address on file for this client.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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

// ── DocRequestCard — shows one document request with uploads ─────────────────
function DocRequestCard({
  req,
  onReview,
}: {
  req: DocRequest
  onReview: (requestId: string, uploadId: string, status: string, note: string) => Promise<void>
}) {
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [acting, setActing]           = useState<string | null>(null)

  const statusBadge = {
    pending:  'bg-amber-100 text-amber-700',
    partial:  'bg-blue-100 text-blue-700',
    complete: 'bg-green-100 text-green-700',
    expired:  'bg-gray-100 text-gray-500',
  }[req.status] ?? 'bg-gray-100 text-gray-500'

  async function handleReview(uploadId: string, status: string) {
    setActing(uploadId)
    await onReview(req.id, uploadId, status, reviewNotes[uploadId] ?? '')
    setActing(null)
  }

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge}`}>
            {req.status}
          </span>
          <span className="text-xs text-gray-500">
            {req.uploadedCount}/{req.totalRequired} docs · sent{' '}
            {new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
          {req.openedAt && (
            <span className="text-[10px] text-blue-500 font-medium">Opened</span>
          )}
        </div>
        <a
          href={`${SITE}/upload/${req.token}`}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#C9A84C] font-mono"
          title="Open upload link"
        >
          <Eye className="w-3 h-3" />
          link
        </a>
      </div>

      {/* Requested docs summary */}
      <div className="flex flex-wrap gap-1">
        {(Array.isArray(req.requestedDocs) ? req.requestedDocs : []).map((d, i) => {
          const uploaded = req.uploads.some(u => u.docName === d.name)
          return (
            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              uploaded ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
            }`}>
              {d.name}
            </span>
          )
        })}
      </div>

      {/* Uploaded files */}
      {req.uploads.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-gray-100">
          {req.uploads.map(u => (
            <div key={u.id} className="bg-white border border-gray-100 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#0B1F3A] truncate">{u.docName}</p>
                  <p className="text-[10px] text-gray-400 truncate">{u.fileName}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  u.status === 'approved' ? 'bg-green-100 text-green-700' :
                  u.status === 'rejected' ? 'bg-red-100 text-red-600' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {u.status}
                </span>
                <a href={u.fileUrl} target="_blank" rel="noreferrer"
                  className="text-gray-400 hover:text-[#C9A84C] flex-shrink-0">
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
              {u.status === 'pending' && (
                <div className="flex items-center gap-1.5">
                  <input
                    value={reviewNotes[u.id] ?? ''}
                    onChange={e => setReviewNotes(p => ({ ...p, [u.id]: e.target.value }))}
                    placeholder="Review note (optional)"
                    className="flex-1 text-[11px] px-2 py-1 border border-gray-200 rounded-lg outline-none focus:border-[#C9A84C]"
                  />
                  <button
                    onClick={() => handleReview(u.id, 'approved')}
                    disabled={acting === u.id}
                    className="text-[11px] px-2 py-1 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    {acting === u.id ? '…' : '✓'}
                  </button>
                  <button
                    onClick={() => handleReview(u.id, 'rejected')}
                    disabled={acting === u.id}
                    className="text-[11px] px-2 py-1 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              )}
              {u.reviewNote && (
                <p className="text-[10px] text-gray-500 italic mt-1">Note: {u.reviewNote}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
