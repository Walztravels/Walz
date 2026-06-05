'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, RefreshCw, Loader2, CheckCircle, AlertTriangle,
  FileText, User, Globe, Briefcase, Plane, Shield, MessageCircle,
  ChevronDown, Plus, Send, Edit3, X, Clock, Building2, Phone,
  Mail, Check, AlertCircle, ExternalLink,
  ClipboardList, StickyNote, Flag, Calendar,
} from 'lucide-react'
import {
  STATUS_CONFIG, VISA_AGENTS, VISA_CONFIGS, getVisaConfig, ISO2_TO_SLUG,
} from '@/lib/visa-config'

// ─── Types ────────────────────────────────────────────────────────────────────
interface VisaNote {
  id: string; authorName: string; content: string; createdAt: string
}

interface VisaApp {
  id: string; referenceNumber: string; destinationIso2: string; visaType: string
  firstName: string | null; middleName: string | null; lastName: string | null
  dateOfBirth: string | null; sex: string | null; placeOfBirth: string | null
  nationality: string | null; maritalStatus: string | null
  passportNumber: string | null; passportType: string | null
  passportIssueDate: string | null; passportExpiryDate: string | null
  issuingAuthority: string | null; issuingCountry: string | null
  phone: string | null; email: string | null
  homeAddress: string | null; homeAddress2: string | null
  city: string | null; stateRegion: string | null; country: string | null; postalCode: string | null
  employmentStatus: string | null; employerName: string | null; jobTitle: string | null
  employerAddress: string | null; monthlyIncome: string | null
  arrivalDate: string | null; returnDate: string | null; purposeOfVisit: string | null
  accommodationName: string | null; accommodationAddress: string | null; portOfEntry: string | null
  previousRefusal: boolean; previousRefusalDetails: string | null
  previousVisits: boolean; previousVisitDetails: string | null
  criminalRecord: boolean; communicableDisease: boolean; deportedBefore: boolean
  countrySpecific: Record<string, unknown>
  declarationAccurate: boolean; declarationAuthorise: boolean; declarationFeePolicy: boolean
  status: string; isDraft: boolean
  assignedTo: string | null; embassyReference: string | null
  submissionDate: string | null; decisionDate: string | null
  decisionNotes: string | null; govtFeeInstructions: string | null
  serviceFeePaid: boolean; serviceFeeAmount: string | null; serviceFeeCurrency: string
  stripePaymentIntentId: string | null
  govtFeePaid: boolean; govtFeeAmount: string | null
  createdAt: string; updatedAt: string
  user: { name: string | null; email: string | null } | null
  notes: VisaNote[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.received
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
      <Icon className="w-4 h-4 text-[#C9A84C]" />
      <h3 className="text-xs font-bold text-[#0B1F3A] uppercase tracking-wider">{label}</h3>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display = value === true ? 'Yes' : value === false ? 'No' : (value ?? '—')
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-[#0B1F3A]">{String(display)}</p>
    </div>
  )
}

// ─── Send Form Modal ──────────────────────────────────────────────────────────
function SendFormModal({ app, onClose }: { app: VisaApp; onClose: () => void }) {
  const config = getVisaConfig(app.destinationIso2)
  const slug = ISO2_TO_SLUG[app.destinationIso2] ?? app.destinationIso2.toLowerCase()
  const formUrl = `https://walztravels.us/visa/apply/${slug}?draft=${app.id}`

  const [clientEmail, setClientEmail] = useState(app.email ?? '')
  const [clientName, setClientName] = useState([app.firstName, app.lastName].filter(Boolean).join(' '))
  const [personalMsg, setPersonalMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function sendForm() {
    setSending(true)
    await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _sendFormLink: { clientEmail, clientName, personalMessage: personalMsg } }),
    })
    setSent(true)
    setSending(false)
  }

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="font-bold text-[#0B1F3A] text-xl mb-2">Form Link Sent!</h3>
          <p className="text-gray-500 text-sm mb-6">Form link sent to <strong>{clientEmail}</strong></p>
          <button onClick={onClose} className="px-6 py-2.5 bg-[#0B1F3A] text-white rounded-xl font-semibold text-sm">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="font-bold text-[#0B1F3A] text-lg">Send Application Form to Client</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-[#F4F6F9] rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Form URL</p>
            <p className="text-xs font-mono text-[#C9A84C] break-all">{formUrl}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Client Name</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Client Email</label>
            <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} type="email"
              className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Personal message (optional)</label>
            <textarea value={personalMsg} onChange={e => setPersonalMsg(e.target.value)} rows={3}
              placeholder="e.g. Hi Sarah, please complete your application form at your earliest convenience…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={sendForm} disabled={sending || !clientEmail}
              className="flex-1 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Form Link
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Document Checklist ───────────────────────────────────────────────────────
const DEFAULT_CHECKLIST = [
  'Passport (valid for 6+ months, with blank pages)',
  'Completed application form (signed)',
  'Recent passport-size photographs (white background)',
  'Bank statements (last 3–6 months)',
  'Proof of employment / business ownership',
  'Travel itinerary / flight reservation',
  'Hotel booking confirmation',
  'Travel insurance certificate',
  'Proof of accommodation',
  'Sponsor letter (if applicable)',
]

function DocumentChecklist({ appId, destIso2 }: { appId: string; destIso2: string }) {
  const [items, setItems] = useState<{ text: string; checked: boolean }[]>(
    DEFAULT_CHECKLIST.map(t => ({ text: t, checked: false }))
  )
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggle(i: number) {
    setItems(prev => prev.map((x, idx) => idx === i ? { ...x, checked: !x.checked } : x))
  }
  function addItem() {
    if (!newItem.trim()) return
    setItems(prev => [...prev, { text: newItem.trim(), checked: false }])
    setNewItem('')
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function sendChecklist() {
    setSaving(true)
    const text = items.map(x => `${x.checked ? '✓' : '○'} ${x.text}`).join('\n')
    await fetch(`/api/admin/visa-applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'documents_pending' }),
    })
    await fetch(`/api/admin/visa-applications/${appId}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `Document checklist sent to client:\n${text}`, authorName: 'Admin' }),
    })
    setSaved(true)
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <button onClick={() => toggle(i)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.checked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
              {item.checked && <Check className="w-3 h-3 text-white" />}
            </button>
            <span className={`text-xs flex-1 ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.text}</span>
            <button onClick={() => removeItem(i)} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={newItem} onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Add item…" className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#C9A84C]" />
        <button onClick={addItem} className="px-2 bg-gray-100 rounded-lg hover:bg-gray-200">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {saved ? (
        <div className="flex items-center gap-2 text-green-600 text-xs font-semibold">
          <CheckCircle className="w-4 h-4" /> Checklist sent & status updated to Documents Pending
        </div>
      ) : (
        <button onClick={sendChecklist} disabled={saving}
          className="w-full py-2 bg-[#0B1F3A] text-[#C9A84C] text-xs font-bold rounded-xl flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Email Checklist to Client
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminVisaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [app, setApp] = useState<VisaApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [showSendForm, setShowSendForm] = useState(false)

  // Editable form state (mirrors app fields)
  const [edits, setEdits] = useState<Partial<VisaApp>>({})

  // Action panel state
  const [newStatus, setNewStatus] = useState('')
  const [newAgent, setNewAgent] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteAuthor, setNoteAuthor] = useState('Jade')
  const [addingNote, setAddingNote] = useState(false)
  const [govtFeeText, setGovtFeeText] = useState('')
  const [sendingGovtFee, setSendingGovtFee] = useState(false)
  const [embassyRef, setEmbassyRef] = useState('')
  const [submissionDate, setSubmissionDate] = useState('')
  const [decisionStatus, setDecisionStatus] = useState<'approved' | 'refused'>('approved')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [recordingDecision, setRecordingDecision] = useState(false)
  const [openSection, setOpenSection] = useState<string>('status')

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/visa-applications/${id}`)
    const d = await res.json()
    if (d.application) {
      setApp(d.application)
      setEdits(d.application)
      setNewStatus(d.application.status)
      setNewAgent(d.application.assignedTo ?? '')
      setGovtFeeText(d.application.govtFeeInstructions ?? '')
      setEmbassyRef(d.application.embassyReference ?? '')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line

  function editField(key: string, value: unknown) {
    setEdits(prev => ({ ...prev, [key]: value }))
  }

  async function saveEdits() {
    if (!app) return
    setSaving(true)
    const res = await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits),
    })
    const d = await res.json()
    if (d.application) { setApp(d.application); setEditing(false) }
    setSaveMsg('Saved')
    setTimeout(() => setSaveMsg(''), 2500)
    setSaving(false)
  }

  async function updateStatus() {
    if (!app || !newStatus) return
    setSaving(true)
    const res = await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const d = await res.json()
    if (d.application) setApp(d.application)
    setSaveMsg('Status updated')
    setTimeout(() => setSaveMsg(''), 2500)
    setSaving(false)
  }

  async function updateAgent() {
    if (!app) return
    setSaving(true)
    const res = await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: newAgent || null }),
    })
    const d = await res.json()
    if (d.application) setApp(d.application)
    setSaveMsg('Agent assigned')
    setTimeout(() => setSaveMsg(''), 2500)
    setSaving(false)
  }

  async function addNote() {
    if (!app || !noteText.trim()) return
    setAddingNote(true)
    const res = await fetch(`/api/admin/visa-applications/${app.id}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteText.trim(), authorName: noteAuthor }),
    })
    const d = await res.json()
    if (d.note) {
      setApp(prev => prev ? { ...prev, notes: [d.note, ...prev.notes] } : null)
      setNoteText('')
    }
    setAddingNote(false)
  }

  async function sendGovtFeeInstructions() {
    if (!app || !govtFeeText.trim()) return
    setSendingGovtFee(true)
    await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ govtFeeInstructions: govtFeeText.trim(), status: 'ready_to_submit' }),
    })
    setSaveMsg('Govt fee instructions sent')
    setTimeout(() => setSaveMsg(''), 2500)
    setSendingGovtFee(false)
    load()
  }

  async function markSubmitted() {
    if (!app) return
    setSaving(true)
    await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'submitted_to_embassy',
        embassyReference: embassyRef || null,
        submissionDate: submissionDate || new Date().toISOString(),
      }),
    })
    setSaveMsg('Marked as submitted')
    setTimeout(() => setSaveMsg(''), 2500)
    setSaving(false)
    load()
  }

  async function recordDecision() {
    if (!app) return
    setRecordingDecision(true)
    await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: decisionStatus,
        decisionNotes: decisionNotes || null,
        decisionDate: new Date().toISOString(),
      }),
    })
    setSaveMsg(`Decision recorded: ${decisionStatus}`)
    setTimeout(() => setSaveMsg(''), 2500)
    setRecordingDecision(false)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
    </div>
  )

  if (!app) return (
    <div className="flex items-center justify-center min-h-[60vh] flex-col gap-3">
      <AlertTriangle className="w-10 h-10 text-gray-300" />
      <p className="text-gray-400">Application not found</p>
      <Link href="/admin/visa-applications" className="text-[#C9A84C] text-sm hover:underline">← Back to Applications</Link>
    </div>
  )

  const config = getVisaConfig(app.destinationIso2)
  const agent = VISA_AGENTS.find(a => a.id === app.assignedTo)
  const slug = ISO2_TO_SLUG[app.destinationIso2] ?? app.destinationIso2.toLowerCase()
  const countrySpecific = (app.countrySpecific as Record<string, unknown>) ?? {}

  const inputCls = editing
    ? 'border border-[#C9A84C]/50 bg-amber-50/30 rounded-lg px-2 py-1 text-sm text-[#0B1F3A] outline-none focus:border-[#C9A84C] w-full'
    : 'text-sm font-medium text-[#0B1F3A]'

  // Helper to render editable or read-only field
  function EditableField({ label, field, type = 'text' }: { label: string; field: keyof VisaApp; type?: string }) {
    const val = editing ? (edits[field] as string | null ?? '') : (app![field] as string | null ?? '')
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        {editing ? (
          <input type={type} value={val as string}
            onChange={e => editField(field as string, e.target.value)}
            className={inputCls} />
        ) : (
          <p className={inputCls}>{String(val) || '—'}</p>
        )}
      </div>
    )
  }

  function EditableSelect({ label, field, options }: { label: string; field: keyof VisaApp; options: string[] }) {
    const val = editing ? (edits[field] as string ?? '') : (app![field] as string ?? '')
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        {editing ? (
          <select value={val} onChange={e => editField(field as string, e.target.value)}
            className={`${inputCls} bg-white`}>
            <option value="">—</option>
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <p className={inputCls}>{val || '—'}</p>
        )}
      </div>
    )
  }

  function EditableBool({ label, field }: { label: string; field: keyof VisaApp }) {
    const val = editing ? (edits[field] as boolean ?? false) : (app![field] as boolean ?? false)
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        {editing ? (
          <select value={val ? 'yes' : 'no'} onChange={e => editField(field as string, e.target.value === 'yes')}
            className={`${inputCls} bg-white`}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        ) : (
          <p className={inputCls}>{val ? 'Yes' : 'No'}</p>
        )}
      </div>
    )
  }

  function ActionSection({ id: sId, title, icon: Icon, children }: {
    id: string; title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode
  }) {
    const open = openSection === sId
    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button onClick={() => setOpenSection(open ? '' : sId)}
          className={`w-full flex items-center justify-between p-4 text-left transition-colors ${open ? 'bg-[#0B1F3A] text-white' : 'bg-white hover:bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${open ? 'text-[#C9A84C]' : 'text-gray-400'}`} />
            <span className={`text-sm font-semibold ${open ? 'text-white' : 'text-[#0B1F3A]'}`}>{title}</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180 text-[#C9A84C]' : 'text-gray-400'}`} />
        </button>
        {open && <div className="p-4 bg-white border-t border-gray-100">{children}</div>}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {showSendForm && <SendFormModal app={app} onClose={() => setShowSendForm(false)} />}

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <Link href="/admin/visa-applications"
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm mt-1">
          <ArrowLeft className="w-4 h-4" /> All Applications
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-wrap">
          {saveMsg && (
            <span className="flex items-center gap-1.5 text-green-600 text-xs font-semibold bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
              <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
            </span>
          )}
          <button onClick={() => setShowSendForm(true)}
            className="flex items-center gap-2 px-3 py-2 border border-[#C9A84C] text-[#C9A84C] rounded-xl text-sm font-semibold hover:bg-[#C9A84C]/5 transition-colors">
            <Send className="w-4 h-4" /> Send Form to Client
          </button>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#C9A84C]' : 'text-gray-400'}`} />
          </button>
        </div>
      </div>

      {/* Hero strip */}
      <div className="bg-[#0B1F3A] rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="text-4xl">{config?.flag ?? '🌍'}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={app.status} />
            {app.isDraft && <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-semibold">DRAFT</span>}
            {app.serviceFeePaid && <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-semibold">💰 SERVICE FEE PAID</span>}
            {app.govtFeePaid && <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full font-semibold">🏛️ GOVT FEE PAID</span>}
          </div>
          <h1 className="text-white text-xl font-bold">
            {[app.firstName, app.lastName].filter(Boolean).join(' ') || app.user?.name || 'Unknown Client'}
          </h1>
          <p className="text-white/50 text-sm mt-0.5">
            {config?.name ?? app.destinationIso2} · {app.visaType}
            {agent ? ` · Assigned to ${agent.name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-wider">Reference</p>
          <p className="text-white font-mono font-bold text-xl">{app.referenceNumber}</p>
          <p className="text-white/40 text-xs mt-1">{fmtDate(app.createdAt)}</p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">

        {/* ── LEFT: Application Details ─────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Edit toolbar */}
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[#0B1F3A] text-base">Application Details</h2>
            <div className="flex gap-2">
              {editing ? (
                <>
                  <button onClick={() => { setEditing(false); setEdits(app) }}
                    className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={saveEdits} disabled={saving}
                    className="px-3 py-1.5 text-xs font-bold bg-[#C9A84C] text-[#0B1F3A] rounded-xl flex items-center gap-1.5 disabled:opacity-60">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save Changes
                  </button>
                </>
              ) : (
                <button onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
                  <Edit3 className="w-3 h-3" /> Edit Fields
                </button>
              )}
            </div>
          </div>

          {editing && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Editing mode — all changes saved when you click "Save Changes"
            </div>
          )}

          {/* Personal */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={User} label="Personal Information" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <EditableField label="First Name" field="firstName" />
              <EditableField label="Middle Name" field="middleName" />
              <EditableField label="Last Name" field="lastName" />
              <EditableField label="Date of Birth" field="dateOfBirth" type={editing ? 'date' : 'text'} />
              <EditableSelect label="Sex" field="sex" options={['Male', 'Female', 'Other']} />
              <EditableField label="Place of Birth" field="placeOfBirth" />
              <EditableField label="Nationality" field="nationality" />
              <EditableSelect label="Marital Status" field="maritalStatus"
                options={['Single', 'Married', 'Divorced', 'Widowed', 'Separated']} />
            </div>
          </div>

          {/* Passport */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={FileText} label="Passport Details" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <EditableField label="Passport Number" field="passportNumber" />
              <EditableSelect label="Passport Type" field="passportType"
                options={['Regular', 'Official', 'Diplomatic', 'Service', 'Emergency']} />
              <EditableField label="Issue Date" field="passportIssueDate" type={editing ? 'date' : 'text'} />
              <EditableField label="Expiry Date" field="passportExpiryDate" type={editing ? 'date' : 'text'} />
              <EditableField label="Issuing Authority" field="issuingAuthority" />
              <EditableField label="Issuing Country" field="issuingCountry" />
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={Phone} label="Contact Information" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <EditableField label="Email" field="email" />
              <EditableField label="Phone" field="phone" />
              <EditableField label="Home Address" field="homeAddress" />
              <EditableField label="Address Line 2" field="homeAddress2" />
              <EditableField label="City" field="city" />
              <EditableField label="State / Region" field="stateRegion" />
              <EditableField label="Country of Residence" field="country" />
              <EditableField label="Postal Code" field="postalCode" />
            </div>
          </div>

          {/* Employment */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={Briefcase} label="Employment" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <EditableSelect label="Employment Status" field="employmentStatus"
                options={['Employed', 'Self-employed', 'Business Owner', 'Student', 'Retired', 'Unemployed', 'Homemaker', 'Other']} />
              <EditableField label="Employer Name" field="employerName" />
              <EditableField label="Job Title" field="jobTitle" />
              <EditableField label="Employer Address" field="employerAddress" />
              <EditableField label="Monthly Income" field="monthlyIncome" />
            </div>
          </div>

          {/* Travel */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={Plane} label="Travel Information" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <EditableField label="Arrival Date" field="arrivalDate" type={editing ? 'date' : 'text'} />
              <EditableField label="Return Date" field="returnDate" type={editing ? 'date' : 'text'} />
              <EditableField label="Purpose of Visit" field="purposeOfVisit" />
              <EditableField label="Accommodation Name" field="accommodationName" />
              <EditableField label="Accommodation Address" field="accommodationAddress" />
              <EditableField label="Port of Entry" field="portOfEntry" />
            </div>
          </div>

          {/* Travel History */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={Globe} label="Travel History" />
            <div className="grid grid-cols-2 gap-4">
              <EditableBool label="Previous visa refusal?" field="previousRefusal" />
              {(editing ? edits.previousRefusal : app.previousRefusal) && (
                <EditableField label="Refusal details" field="previousRefusalDetails" />
              )}
              <EditableBool label="Previous visits to this country?" field="previousVisits" />
              {(editing ? edits.previousVisits : app.previousVisits) && (
                <EditableField label="Previous visit details" field="previousVisitDetails" />
              )}
            </div>
          </div>

          {/* Background */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={Shield} label="Background Declarations" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <EditableBool label="Criminal record?" field="criminalRecord" />
              <EditableBool label="Communicable disease?" field="communicableDisease" />
              <EditableBool label="Previously deported?" field="deportedBefore" />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
              <Field label="Declaration: Accurate" value={app.declarationAccurate} />
              <Field label="Declaration: Authorise" value={app.declarationAuthorise} />
              <Field label="Declaration: Fee policy" value={app.declarationFeePolicy} />
            </div>
          </div>

          {/* Country-specific */}
          {config && config.extraFields.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <SectionHeader icon={Flag} label={`${config.name} — Specific Information`} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {config.extraFields.map(f => (
                  <div key={f.key}>
                    <p className="text-xs text-gray-400 mb-0.5">{f.label}</p>
                    <p className="text-sm font-medium text-[#0B1F3A]">
                      {countrySpecific[f.key] != null
                        ? String(countrySpecific[f.key] === true ? 'Yes' : countrySpecific[f.key] === false ? 'No' : countrySpecific[f.key])
                        : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <SectionHeader icon={Calendar} label="Payment & Submission" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Service Fee Paid" value={app.serviceFeePaid} />
              <Field label="Service Fee Amount" value={app.serviceFeeAmount ? `${app.serviceFeeCurrency} ${app.serviceFeeAmount}` : null} />
              <Field label="Stripe Payment Intent" value={app.stripePaymentIntentId} />
              <Field label="Govt Fee Paid (client)" value={app.govtFeePaid} />
              <Field label="Embassy Reference" value={app.embassyReference} />
              <Field label="Submission Date" value={fmtDate(app.submissionDate)} />
              <Field label="Decision Date" value={fmtDate(app.decisionDate)} />
            </div>
            {app.decisionNotes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Decision Notes</p>
                <p className="text-sm text-gray-700 leading-relaxed">{app.decisionNotes}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Action Panel ──────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Status update */}
          <ActionSection id="status" title="Update Status" icon={ChevronDown}>
            <div className="space-y-3">
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white">
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'draft').map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button onClick={updateStatus} disabled={saving || newStatus === app.status}
                className="w-full py-2.5 bg-[#0B1F3A] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Update Status
              </button>
              <p className="text-xs text-gray-400 text-center">Client will receive an email notification</p>
            </div>
          </ActionSection>

          {/* Assign agent */}
          <ActionSection id="agent" title="Assign Agent" icon={User}>
            <div className="space-y-3">
              <select value={newAgent} onChange={e => setNewAgent(e.target.value)}
                className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white">
                <option value="">Unassigned</option>
                {VISA_AGENTS.filter(a => a.id !== 'unassigned').map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button onClick={updateAgent} disabled={saving}
                className="w-full py-2.5 bg-[#0B1F3A] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Assign
              </button>
            </div>
          </ActionSection>

          {/* Internal notes */}
          <ActionSection id="notes" title={`Internal Notes (${app.notes.length})`} icon={StickyNote}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)}
                  placeholder="Author" className="w-24 h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#C9A84C]" />
                <div className="flex-1" />
              </div>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder="Add internal note…"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
              <button onClick={addNote} disabled={addingNote || !noteText.trim()}
                className="w-full py-2 bg-[#0B1F3A] text-[#C9A84C] text-xs font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {addingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Note
              </button>
              {app.notes.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {app.notes.map(n => (
                    <div key={n.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-[#0B1F3A]">{n.authorName}</span>
                        <span className="text-[10px] text-gray-400">{fmtDateTime(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ActionSection>

          {/* Document checklist */}
          <ActionSection id="checklist" title="Document Checklist" icon={ClipboardList}>
            <DocumentChecklist appId={app.id} destIso2={app.destinationIso2} />
          </ActionSection>

          {/* Govt fee instructions */}
          <ActionSection id="govtfee" title="Government Fee Instructions" icon={Building2}>
            <div className="space-y-3">
              {app.govtFeeInstructions && (
                <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                  <p className="text-xs text-green-700 font-semibold mb-1">Previously sent:</p>
                  <p className="text-xs text-green-800 whitespace-pre-wrap">{app.govtFeeInstructions}</p>
                </div>
              )}
              <textarea value={govtFeeText} onChange={e => setGovtFeeText(e.target.value)} rows={5}
                placeholder={`e.g. Please pay the ${config?.govtFeeDisplay ?? 'government'} fee via the official payment portal.\n\n1. Go to: [payment URL]\n2. Enter reference: [your ref]\n3. Pay ${config?.govtFeeDisplay ?? 'govt fee'}\n\nMark as paid in your Walz portal once complete.`}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs outline-none focus:border-[#C9A84C] resize-none leading-relaxed" />
              <p className="text-xs text-gray-400">
                Status will be set to <strong>Ready to Submit</strong> and client receives an email.
              </p>
              <button onClick={sendGovtFeeInstructions} disabled={sendingGovtFee || !govtFeeText.trim()}
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {sendingGovtFee ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Instructions to Client
              </button>
            </div>
          </ActionSection>

          {/* Embassy submission */}
          <ActionSection id="embassy" title="Embassy Submission" icon={Globe}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Embassy / VFS Reference</label>
                <input value={embassyRef} onChange={e => setEmbassyRef(e.target.value)}
                  placeholder="Embassy reference number"
                  className="w-full h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Submission Date</label>
                <input type="date" value={submissionDate} onChange={e => setSubmissionDate(e.target.value)}
                  className="w-full h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <p className="text-xs text-gray-400">Status → Submitted to Embassy. Client notified by email.</p>
              <button onClick={markSubmitted} disabled={saving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Mark as Submitted
              </button>
            </div>
          </ActionSection>

          {/* Decision */}
          <ActionSection id="decision" title="Record Decision" icon={Flag}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setDecisionStatus('approved')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${decisionStatus === 'approved' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}>
                  ✅ Approved
                </button>
                <button onClick={() => setDecisionStatus('refused')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${decisionStatus === 'refused' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500'}`}>
                  ❌ Refused
                </button>
              </div>
              <textarea value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} rows={3}
                placeholder={decisionStatus === 'refused' ? 'Refusal reason (shown to client)…' : 'Additional notes (optional)…'}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
              <p className="text-xs text-gray-400">Client will receive a decision email with your notes.</p>
              <button onClick={recordDecision} disabled={recordingDecision}
                className={`w-full py-2.5 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 ${decisionStatus === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {recordingDecision ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Record {decisionStatus === 'approved' ? 'Approval' : 'Refusal'}
              </button>
            </div>
          </ActionSection>

          {/* Quick links */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Links</p>
            <Link href={`/portal/visa-application/${app.id}`} target="_blank"
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors">
              <span className="text-sm text-[#0B1F3A] font-semibold">Client Portal View</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </Link>
            <Link href={`/visa/apply/${slug}?draft=${app.id}`} target="_blank"
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors">
              <span className="text-sm text-[#0B1F3A] font-semibold">Application Form</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </Link>
            <a href={`https://wa.me/${app.phone?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors">
              <span className="text-sm text-[#0B1F3A] font-semibold">WhatsApp Client</span>
              <MessageCircle className="w-4 h-4 text-green-500" />
            </a>
            <a href={`mailto:${app.email}`}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors">
              <span className="text-sm text-[#0B1F3A] font-semibold">Email Client</span>
              <Mail className="w-4 h-4 text-gray-400" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
