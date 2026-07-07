'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CallButton } from '@/components/admin/CallButton'
import {
  ArrowLeft, Save, RefreshCw, Loader2, CheckCircle, AlertTriangle,
  FileText, User, Globe, Briefcase, Plane, Shield, MessageCircle,
  ChevronDown, Plus, Send, Edit3, X, Clock, Building2, Phone,
  Mail, Check, AlertCircle, ExternalLink, Pencil,
  ClipboardList, StickyNote, Flag, Calendar, FolderUp, Upload,
} from 'lucide-react'
import type { BankStatementAnalysis } from '@/lib/analyzeBankStatement'
import { BankStatementPanel } from '@/components/admin/BankStatementPanel'
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
  initiatedBy: string
  appointmentDate: string | null; appointmentLocation: string | null; appointmentNotes: string | null
  lastEmailSentAt: string | null
  createdAt: string; updatedAt: string
  user: { name: string | null; email: string | null } | null
  notes: VisaNote[]
  // Bank statement (added via SQL, not in Prisma schema)
  bank_statement_url?: string | null
  bank_statement_admin_url?: string | null
  bank_statement_analysis?: BankStatementAnalysis | null
  bank_statement_analyzed_at?: string | null
  bank_statement_uploaded_by?: string | null
}

interface DocUpload {
  id: string; docName: string; fileName: string
  fileUrl: string; uploadedAt: string; status: string
}

interface DocRequest {
  id: string; status: string
  uploadedCount: number; totalRequired: number
  requestedDocs: Array<{ name: string; description?: string; required?: boolean }>
  message: string | null; createdAt: string
  uploads: DocUpload[]
}

type DocItem = { name: string; description: string; required: boolean }

function getDocList(destIso2: string): DocItem[] {
  const isUK = destIso2?.toLowerCase() === 'gb'
  return [
    { name: 'Passport (bio data page)',          description: 'Clear scan of passport info page',                   required: true  },
    { name: isUK ? 'Bank Statement (6 months)' : 'Bank Statement (3 months)',
                                                  description: isUK ? 'Last 6 months showing salary credits' : 'Last 3 months showing salary credits', required: true },
    { name: 'Proof of Employment',               description: 'Employment letter or recent pay slip',               required: true  },
    { name: 'Utility Bill',                      description: 'Proof of address, not older than 3 months',          required: false },
    { name: 'Travel Itinerary',                  description: 'Confirmed or dummy flight booking',                  required: false },
    { name: 'Hotel Booking',                     description: 'Hotel reservation confirmation',                     required: false },
    { name: 'Travel Insurance',                  description: 'Policy covering travel dates',                       required: false },
    { name: 'Invitation Letter',                 description: 'From host in destination country',                   required: false },
    { name: 'Passport Photo',                    description: 'White background, recent photo',                     required: false },
    { name: 'Sponsor Letter',                    description: 'Letter from financial sponsor',                      required: false },
    { name: 'Birth Certificate',                 description: 'For family or dependent applications',               required: false },
    { name: 'Marriage Certificate',              description: 'For married applicants / spouse visa',               required: false },
  ]
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
  const [clientEmail, setClientEmail] = useState(app.email ?? '')
  const [clientName, setClientName] = useState([app.firstName, app.lastName].filter(Boolean).join(' '))
  const [personalMsg, setPersonalMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [sentLink, setSentLink] = useState<string | null>(null)

  async function sendForm() {
    setSending(true)
    try {
      const res = await fetch(`/api/admin/visa-applications/${app.id}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEmail, clientName, personalMessage: personalMsg }),
      })
      const d = await res.json()
      if (res.ok) {
        setSentLink(d.link)
      } else {
        alert(d.error ?? 'Failed to send form link')
      }
    } finally {
      setSending(false)
    }
  }

  if (sentLink) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="font-bold text-[#0B1F3A] text-xl mb-2">Form Link Sent!</h3>
          <p className="text-gray-500 text-sm mb-4">A secure form link has been emailed to <strong>{clientEmail}</strong>. Valid for 7 days — no payment required.</p>
          <div className="bg-gray-50 rounded-xl p-3 mb-5 text-left">
            <p className="text-xs text-gray-500 mb-1 font-medium">Form link (also emailed):</p>
            <p className="text-xs text-[#C9A84C] font-mono break-all">{sentLink}</p>
          </div>
          <button onClick={onClose} className="px-6 py-2.5 bg-[#0B1F3A] text-white rounded-xl font-semibold text-sm">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#0B1F3A] text-lg">Send Application Form to Client</h3>
            <p className="text-xs text-gray-500 mt-0.5">Generates a secure 7-day link — no payment required</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Client Name</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Client Email *</label>
            <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} type="email"
              className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Personal message <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea value={personalMsg} onChange={e => setPersonalMsg(e.target.value)} rows={3}
              placeholder="e.g. Hi Sarah, please complete your application form at your earliest convenience…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            🔔 A unique secure link will be emailed to the client. <strong>No payment will be collected.</strong>
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

// ─── Embassy Pack Section ────────────────────────────────────────────────────

const DEFAULT_EMBASSY_DOCS: Record<string, string[]> = {
  CA: [
    'Valid passport (original + 1 copy of bio data page)',
    'Completed IMM 5257 application form',
    'Two recent passport-sized photographs',
    'Proof of funds — bank statements (last 3 months)',
    'Employment letter or proof of business',
    'Return flight itinerary',
    'Hotel or accommodation booking confirmation',
    'Invitation letter (if visiting family/friends)',
    'Travel insurance covering your trip',
    'Utility bill or proof of address',
    'Any previous visas (copies)',
  ],
  GB: [
    'Valid passport (original + photocopy of bio data page)',
    'Completed UK Visitor Visa application (online)',
    'Biometric enrolment confirmation letter',
    'Two recent passport-sized photographs',
    'Bank statements (last 6 months)',
    'Employer letter confirming employment, salary, and approved leave',
    'Proof of accommodation in the UK',
    'Return flight itinerary',
    'Travel insurance (minimum £30,000 cover)',
    'Proof of ties to home country',
  ],
  US: [
    'Valid passport',
    'DS-160 confirmation page',
    'Visa interview appointment letter',
    'SEVIS fee receipt (student visas)',
    'One recent passport-sized photograph (5x5cm, white background)',
    'Bank statements (last 6 months)',
    'Employment letter / proof of funds',
    'Invitation letter (if applicable)',
    'Proof of property or family ties',
  ],
  AE: [
    'Original valid passport',
    'Passport-sized photograph (white background)',
    'Visa approval printout (sent by Walz Travels)',
    'Return flight itinerary',
    'Hotel or accommodation confirmation',
    'Travel insurance',
    'Proof of funds',
  ],
  FR: [
    'Valid passport (valid for at least 3 months beyond travel dates)',
    'Completed Schengen visa application form',
    'Two recent passport-sized photographs',
    'Travel itinerary (flights + hotel)',
    'Travel insurance (minimum €30,000 coverage)',
    'Bank statements (last 3 months)',
    'Employment letter or business registration',
    'Proof of accommodation',
  ],
}

function EmbassyPackSection({ app, onSuccess }: { app: VisaApp; onSuccess: () => void }) {
  const defaultDocs = DEFAULT_EMBASSY_DOCS[app.destinationIso2?.toUpperCase() ?? ''] ?? [
    'Valid passport (original)',
    'Completed visa application form',
    'Two passport-sized photographs',
    'Bank statements (last 3 months)',
    'Employment letter / proof of funds',
    'Travel itinerary (flights + hotel)',
    'Travel insurance',
  ]

  const [appointmentDate,     setAppointmentDate]     = useState(app.appointmentDate?.split('T')[0] ?? '')
  const [appointmentTime,     setAppointmentTime]     = useState(app.appointmentDate?.split('T')[1]?.substring(0, 5) ?? '')
  const [appointmentLocation, setAppointmentLocation] = useState(app.appointmentLocation ?? '')
  const [appointmentRef,      setAppointmentRef]      = useState(app.embassyReference ?? '')
  const [docList,           setDocList]           = useState<string[]>(defaultDocs)
  const [customDoc,         setCustomDoc]         = useState('')
  const [extraInstructions, setExtraInstructions] = useState(app.appointmentNotes ?? '')
  const [sending,           setSending]           = useState(false)
  const [sentOk,            setSentOk]            = useState(false)
  const [attachFiles,       setAttachFiles]       = useState<File[]>([])
  const [dragOver,          setDragOver]          = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addCustomDoc() {
    if (!customDoc.trim()) return
    setDocList(prev => [...prev, customDoc.trim()])
    setCustomDoc('')
  }

  function removeDoc(i: number) {
    setDocList(prev => prev.filter((_, idx) => idx !== i))
  }

  async function sendPack() {
    if (!app.email) return
    setSending(true)
    try {
      const formData = new FormData()
      formData.append('appointmentDate',     appointmentDate     || '')
      formData.append('appointmentTime',     appointmentTime     || '')
      formData.append('appointmentLocation', appointmentLocation || '')
      formData.append('appointmentRef',      appointmentRef      || '')
      formData.append('documents',           JSON.stringify(docList))
      formData.append('extraInstructions',   extraInstructions   || '')
      attachFiles.forEach((file, i) => {
        formData.append(`attachment_${i}`, file, file.name)
      })

      const res = await fetch(`/api/admin/visa-applications/${app.id}/embassy-pack`, {
        method: 'POST',
        body:   formData,
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; emailSent?: boolean; to?: string; saved?: Record<string, string | null> }
      if (res.ok && data.ok) {
        setSentOk(true)
        onSuccess()
      } else {
        alert(data.error ?? 'Failed to send. Please try again.')
      }
    } catch (err) {
      console.error('[EmbassyPack]', err)
      alert('Failed to send. Please try again.')
    }
    setSending(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700">
          📋 Send the client a preparation pack with their appointment details
          and a full list of documents to bring to the embassy.
        </p>
      </div>

      {/* Appointment details */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Appointment Details</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 font-semibold uppercase block mb-1">Date</label>
            <input type="date" value={appointmentDate}
              onChange={e => setAppointmentDate(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#C9A84C]" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-semibold uppercase block mb-1">Time</label>
            <input type="time" value={appointmentTime}
              onChange={e => setAppointmentTime(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#C9A84C]" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 font-semibold uppercase block mb-1">Embassy / VFS Location</label>
          <input value={appointmentLocation}
            onChange={e => setAppointmentLocation(e.target.value)}
            placeholder="e.g. VFS Global, 66-68 Hammersmith Rd, London W14 8UD"
            className="w-full h-9 px-3 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#C9A84C]" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 font-semibold uppercase block mb-1">
            Appointment / GWF Reference <span className="text-gray-400 font-normal normal-case">(optional)</span>
          </label>
          <input value={appointmentRef}
            onChange={e => setAppointmentRef(e.target.value)}
            placeholder="e.g. GWF075XXXXXX"
            className="w-full h-9 px-3 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#C9A84C]" />
        </div>
      </div>

      {/* Document list */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Documents to Bring ({docList.length})
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {docList.map((doc, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <span className="text-green-500 text-xs">✓</span>
              <span className="text-xs text-[#0B1F3A] flex-1">{doc}</span>
              <button onClick={() => removeDoc(i)}
                className="text-gray-300 hover:text-red-400 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={customDoc} onChange={e => setCustomDoc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomDoc()}
            placeholder="Add a document…"
            className="flex-1 h-8 px-3 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#C9A84C]" />
          <button onClick={addCustomDoc}
            className="px-3 h-8 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-600 transition-colors">
            Add
          </button>
        </div>
      </div>

      {/* Extra instructions */}
      <div>
        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
          Additional Instructions{' '}
          <span className="text-gray-400 font-normal normal-case">(optional)</span>
        </label>
        <textarea value={extraInstructions}
          onChange={e => setExtraInstructions(e.target.value)}
          placeholder="e.g. Please arrive 15 minutes early. Wear smart casual clothing."
          rows={3}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#C9A84C] resize-none leading-relaxed" />
      </div>

      {/* Document Attachments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Attach Documents{' '}
            <span className="text-gray-400 font-normal normal-case">(optional)</span>
          </p>
          {attachFiles.length > 0 && (
            <span className="text-[10px] bg-[#C9A84C]/10 text-[#C9A84C] font-bold px-2 py-0.5 rounded-full">
              {attachFiles.length} file{attachFiles.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* File list */}
        {attachFiles.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {attachFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#0B1F3A] truncate">{file.name}</p>
                  <p className="text-[10px] text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachFiles(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            const dropped = Array.from(e.dataTransfer.files)
            if (dropped.length) setAttachFiles(prev => [...prev, ...dropped])
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver
              ? 'border-[#C9A84C] bg-[#C9A84C]/5 text-[#C9A84C]'
              : 'border-gray-200 hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C]'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span className="text-sm">
            {attachFiles.length > 0 ? 'Add more files' : 'Drop files or click to browse'}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files || [])
            if (files.length) setAttachFiles(prev => [...prev, ...files])
            e.target.value = ''
          }}
        />
        <p className="text-[10px] text-gray-400 mt-1">
          PDF, Word, or image · max 10 MB each · all files attached to client email
        </p>
      </div>

      {app.lastEmailSentAt && !sentOk && (
        <p className="text-[10px] text-gray-400 text-center -mb-1">
          Last sent{' '}
          {new Date(app.lastEmailSentAt).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>
      )}

      {!app.email && (
        <p className="text-xs text-red-400">⚠️ No email address on file — cannot send embassy pack.</p>
      )}
      <button
        onClick={sendPack}
        disabled={sending || !app.email}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 bg-[#0B1F3A] text-white hover:bg-[#162d52]"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? 'Sending…' : 'Send Embassy Pack to Client'}
      </button>

      {sentOk && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <p className="text-green-700 font-bold text-sm flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" /> Embassy Pack Sent
          </p>
          <p className="text-green-600 text-xs mt-0.5">Email sent to {app.email}</p>
          {appointmentDate && (
            <p className="text-green-600 text-xs mt-0.5">
              Appointment saved:{' '}
              {new Date(appointmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              {appointmentTime ? ` at ${appointmentTime}` : ''}
            </p>
          )}
        </div>
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
  const [svcFeeEdit, setSvcFeeEdit] = useState('')
  const [svcCurEdit, setSvcCurEdit] = useState('USD')
  const [govFeeEdit, setGovFeeEdit] = useState('')
  const [feesSaving, setFeesSaving] = useState(false)
  const [embassyRef, setEmbassyRef] = useState('')
  const [submissionDate, setSubmissionDate] = useState('')
  const [decisionStatus, setDecisionStatus] = useState<'approved' | 'refused'>('approved')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [recordingDecision, setRecordingDecision] = useState(false)
  const [openSection, setOpenSection] = useState<string>('status')

  // Document request state
  const [docRequests,   setDocRequests]   = useState<DocRequest[]>([])
  const [docReqLoaded,  setDocReqLoaded]  = useState(false)
  const [docReqLoading, setDocReqLoading] = useState(false)
  const [showDocModal,  setShowDocModal]  = useState(false)
  const [selectedDocs,  setSelectedDocs]  = useState<string[]>([])
  const [docMessage,    setDocMessage]    = useState('')
  // Inline doc editing
  const [docOverrides,    setDocOverrides]    = useState<Record<string, Partial<DocItem>>>({})
  const [docEditing,      setDocEditing]      = useState<string | null>(null)
  const [docEditName,     setDocEditName]     = useState('')
  const [docEditDesc,     setDocEditDesc]     = useState('')
  // Custom / special docs
  const [docCustomList,   setDocCustomList]   = useState<DocItem[]>([])
  const [docAddingCustom, setDocAddingCustom] = useState(false)
  const [docAddName,      setDocAddName]      = useState('')
  const [docAddDesc,      setDocAddDesc]      = useState('')

  // Trustpilot review request
  const [reviewSent,    setReviewSent]    = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [sendingDocs,   setSendingDocs]   = useState(false)
  const [docSentOk,     setDocSentOk]     = useState(false)

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
      setSvcFeeEdit(d.application.serviceFeeAmount ?? '')
      setSvcCurEdit(d.application.serviceFeeCurrency ?? 'USD')
      setGovFeeEdit(d.application.govtFeeAmount ?? '')
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

  async function sendReviewRequest() {
    if (!app) return
    setReviewLoading(true)
    try {
      const res = await fetch(`/api/admin/visa-applications/${app.id}/review-request`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error ?? 'Failed to send review request')
        return
      }
      setReviewSent(true)
    } catch {
      alert('Failed to send review request')
    } finally {
      setReviewLoading(false)
    }
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

  async function saveFeeOverrides() {
    if (!app) return
    setFeesSaving(true)
    await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceFeeAmount: svcFeeEdit !== '' ? Number(svcFeeEdit) : null,
        serviceFeeCurrency: svcCurEdit || 'USD',
        govtFeeAmount: govFeeEdit !== '' ? Number(govFeeEdit) : null,
      }),
    })
    setSaveMsg('Fees saved')
    setTimeout(() => setSaveMsg(''), 2500)
    setFeesSaving(false)
    load()
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

  async function loadDocRequests() {
    if (docReqLoaded || docReqLoading || !app) return
    setDocReqLoading(true)
    try {
      const res  = await fetch(`/api/admin/document-requests?visaAppId=${app.id}`)
      const data = await res.json()
      setDocRequests(
        (data.requests ?? []).map((r: DocRequest & { requestedDocs: unknown }) => ({
          ...r,
          requestedDocs: typeof r.requestedDocs === 'string'
            ? JSON.parse(r.requestedDocs)
            : r.requestedDocs,
        }))
      )
      setDocReqLoaded(true)
    } catch {}
    setDocReqLoading(false)
  }

  async function sendDocRequest() {
    if (!app || (selectedDocs.length === 0 && docCustomList.length === 0)) return
    setSendingDocs(true)
    try {
      const docList = getDocList(app.destinationIso2 ?? '')
      const baseDocs = selectedDocs.map(name => {
        const base = docList.find(d => d.name === name) ?? { name, description: '', required: true }
        const override = docOverrides[name] ?? {}
        return { ...base, ...override }
      })
      const docs = [...baseDocs, ...docCustomList]
      const res = await fetch('/api/admin/document-requests', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          visaAppId:     app.id,
          clientEmail:   app.email ?? '',
          clientName:    [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant',
          requestedDocs: docs,
          message:       docMessage || null,
        }),
      })
      if (res.ok) {
        setDocSentOk(true)
        setDocReqLoaded(false)
        setTimeout(() => {
          setDocSentOk(false)
          setShowDocModal(false)
          setSelectedDocs([])
          setDocMessage('')
          setDocOverrides({})
          setDocEditing(null)
          setDocCustomList([])
          loadDocRequests()
        }, 1500)
      }
    } catch {}
    setSendingDocs(false)
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
  function EditableField({ label, field, type = 'text', dateField = false }: { label: string; field: keyof VisaApp; type?: string; dateField?: boolean }) {
    const val = editing ? (edits[field] as string | null ?? '') : (app![field] as string | null ?? '')
    const displayVal = !editing && dateField ? fmtDate(val as string) : (String(val) || '—')
    return (
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        {editing ? (
          <input type={type} value={val as string}
            onChange={e => editField(field as string, e.target.value)}
            className={inputCls} />
        ) : (
          <p className={inputCls}>{displayVal}</p>
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

  function ActionSection({ id: sId, title, icon: Icon, children, onOpen }: {
    id: string; title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onOpen?: () => void
  }) {
    const open = openSection === sId
    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button onClick={() => { const willOpen = !open; setOpenSection(willOpen ? sId : ''); if (willOpen && onOpen) onOpen() }}
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
            {app.initiatedBy === 'admin'
              ? <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-semibold">🔔 Admin Initiated</span>
              : <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-semibold">💳 Client Applied</span>
            }
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

      {/* Trustpilot review request — only shown when approved */}
      {app.status === 'approved' && (
        <div className="mb-6 flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm text-green-800">
            <span>⭐</span>
            <span>Application approved — invite client to leave a Trustpilot review</span>
          </div>
          <button
            onClick={sendReviewRequest}
            disabled={reviewLoading || reviewSent}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60 ${
              reviewSent
                ? 'bg-green-100 text-green-700 border border-green-300'
                : 'bg-white border border-green-300 text-green-700 hover:border-green-500 hover:bg-green-50'
            }`}
          >
            {reviewLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              : reviewSent
                ? <><Check className="w-4 h-4" /> Sent</>
                : <>⭐ Request Review</>
            }
          </button>
        </div>
      )}

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
              <EditableField label="Date of Birth" field="dateOfBirth" type={editing ? 'date' : 'text'} dateField />
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
              <EditableField label="Issue Date" field="passportIssueDate" type={editing ? 'date' : 'text'} dateField />
              <EditableField label="Expiry Date" field="passportExpiryDate" type={editing ? 'date' : 'text'} dateField />
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
              <EditableField label="Arrival Date" field="arrivalDate" type={editing ? 'date' : 'text'} dateField />
              <EditableField label="Return Date" field="returnDate" type={editing ? 'date' : 'text'} dateField />
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

          {/* Bank Statement */}
          <BankStatementPanel
            applicationId={app.id}
            destination={
              app.destinationIso2?.toLowerCase() === 'gb' ? 'uk'
              : app.destinationIso2?.toLowerCase() === 'fr' ? 'schengen'
              : app.destinationIso2?.toLowerCase() ?? 'uk'
            }
            applicantName={[app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'}
            applicantPhone={app.phone}
            passportCountry={app.nationality ?? 'Nigeria'}
            clientFileUrl={app.bank_statement_url ?? null}
            adminFileUrl={app.bank_statement_admin_url ?? null}
            analysis={app.bank_statement_analysis ?? null}
            analyzedAt={app.bank_statement_analyzed_at ?? null}
            uploadedBy={app.bank_statement_uploaded_by ?? null}
          />

          {/* Document checklist */}
          <ActionSection id="checklist" title="Document Checklist" icon={ClipboardList}>
            <DocumentChecklist appId={app.id} destIso2={app.destinationIso2} />
          </ActionSection>

          {/* Request Documents */}
          <ActionSection id="docrequest" title="Request Documents" icon={FolderUp} onOpen={loadDocRequests}>
            <div className="space-y-3">
              {docReqLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                </div>
              )}
              {!docReqLoading && docRequests.length === 0 && (
                <p className="text-xs text-gray-400 py-1">No document requests sent yet.</p>
              )}
              {docRequests.map(req => (
                <div key={req.id} className="bg-gray-50 rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                      req.status === 'completed' ? 'bg-green-100 text-green-700' :
                      req.status === 'partial'   ? 'bg-amber-100 text-amber-700' :
                                                   'bg-blue-100 text-blue-700'
                    }`}>{req.status}</span>
                    <span className="text-gray-400">{new Date(req.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-gray-500">
                    {req.uploadedCount}/{req.totalRequired} docs uploaded
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {req.requestedDocs.map((d, i) => (
                      <span key={i} className="bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => setShowDocModal(true)}
                className="w-full flex items-center justify-center gap-2 bg-[#0B1F3A] text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-[#0a1a31] transition-colors"
              >
                <FolderUp className="w-3.5 h-3.5" />
                Send Document Request
              </button>
            </div>
          </ActionSection>

          {/* Fee Overrides */}
          <ActionSection id="fees" title="Fee Overrides" icon={Building2}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Service Fee</label>
                  <input type="number" value={svcFeeEdit} onChange={e => setSvcFeeEdit(e.target.value)}
                    placeholder={`Default: ${config?.serviceFeeUsd ?? '—'}`}
                    className="w-full h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div className="w-24">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Currency</label>
                  <input value={svcCurEdit} onChange={e => setSvcCurEdit(e.target.value.toUpperCase())}
                    placeholder="USD" maxLength={3}
                    className="w-full h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] uppercase" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Government Fee Amount</label>
                <input type="number" value={govFeeEdit} onChange={e => setGovFeeEdit(e.target.value)}
                  placeholder={`Default: ${config?.govtFeeDisplay ?? '—'}`}
                  className="w-full h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
              </div>
              <button onClick={saveFeeOverrides} disabled={feesSaving}
                className="w-full py-2 bg-[#0B1F3A] text-[#C9A84C] text-xs font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                {feesSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Fee Overrides
              </button>
            </div>
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

          {/* Embassy Appointment Pack */}
          <ActionSection id="embassypack" title="Embassy Appointment Pack" icon={ClipboardList}>
            <EmbassyPackSection app={app} onSuccess={load} />
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
            {app.phone && (
              <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100">
                <span className="text-sm text-[#0B1F3A] font-semibold">Call Client</span>
                <CallButton phoneNumber={app.phone} />
              </div>
            )}
            <a href={`mailto:${app.email}`}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors">
              <span className="text-sm text-[#0B1F3A] font-semibold">Email Client</span>
              <Mail className="w-4 h-4 text-gray-400" />
            </a>
          </div>
        </div>
      </div>

      {/* Request Documents Modal */}
      {showDocModal && app && (() => {
        const docList = getDocList(app.destinationIso2 ?? '')
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <FolderUp className="w-5 h-5 text-[#C9A84C]" />
                <h2 className="text-base font-bold text-[#0B1F3A]">Request Documents</h2>
              </div>
              <button onClick={() => { setShowDocModal(false); setSelectedDocs([]); setDocMessage(''); setDocOverrides({}); setDocEditing(null); setDocCustomList([]) }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Recipient info */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 space-y-0.5">
                <p><span className="font-semibold text-gray-700">To:</span> {[app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'}</p>
                <p><span className="font-semibold text-gray-700">Email:</span> {app.email ?? '—'}</p>
              </div>

              {/* Document selector — single column with inline edit */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Documents</p>
                <div className="space-y-1.5">
                  {docList.map(doc => {
                    const selected  = selectedDocs.includes(doc.name)
                    const override  = docOverrides[doc.name] ?? {}
                    const dispName  = override.name ?? doc.name
                    const dispDesc  = override.description ?? doc.description
                    const isEditing = docEditing === doc.name
                    return (
                      <div key={doc.name}
                        className={`rounded-xl border transition-all ${
                          selected ? 'border-[#C9A84C] bg-amber-50' : 'border-gray-100'
                        }`}
                      >
                        {/* Row */}
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDocs(prev =>
                              selected ? prev.filter(n => n !== doc.name) : [...prev, doc.name]
                            )}
                            className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                              selected ? 'bg-[#C9A84C] border-[#C9A84C]' : 'border-gray-300'
                            }`}
                          >
                            {selected && <Check className="w-2.5 h-2.5 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold leading-snug ${selected ? 'text-[#0B1F3A]' : 'text-gray-600'}`}>{dispName}</p>
                            {dispDesc && <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{dispDesc}</p>}
                          </div>
                          {selected && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditing) { setDocEditing(null) }
                                else { setDocEditing(doc.name); setDocEditName(dispName); setDocEditDesc(dispDesc) }
                              }}
                              className="flex-shrink-0 p-1 rounded hover:bg-[#C9A84C]/20 text-[#C9A84C] transition-colors"
                              title="Edit name / description"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {/* Inline edit panel */}
                        {isEditing && (
                          <div className="px-3 pb-3 space-y-2 border-t border-[#C9A84C]/20 pt-2">
                            <input
                              value={docEditName}
                              onChange={e => setDocEditName(e.target.value)}
                              placeholder="Document name"
                              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#C9A84C]"
                            />
                            <input
                              value={docEditDesc}
                              onChange={e => setDocEditDesc(e.target.value)}
                              placeholder="Description (optional)"
                              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#C9A84C]"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setDocOverrides(prev => ({ ...prev, [doc.name]: { name: docEditName, description: docEditDesc } }))
                                  setDocEditing(null)
                                }}
                                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8973f] transition-colors"
                              >Save</button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDocOverrides(prev => { const n = {...prev}; delete n[doc.name]; return n })
                                  setDocEditing(null)
                                }}
                                className="text-[10px] px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                              >Reset</button>
                              <button
                                type="button"
                                onClick={() => setDocEditing(null)}
                                className="text-[10px] px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                              >Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Custom docs added this session */}
                  {docCustomList.map((doc, i) => (
                    <div key={`custom-${i}`} className="rounded-xl border border-blue-200 bg-blue-50 flex items-center gap-2 px-3 py-2.5">
                      <div className="w-4 h-4 flex-shrink-0 rounded border bg-blue-400 border-blue-400 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#0B1F3A] leading-snug">{doc.name}</p>
                        {doc.description && <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{doc.description}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDocCustomList(prev => prev.filter((_, j) => j !== i))}
                        className="flex-shrink-0 p-1 rounded hover:bg-red-100 text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add special document */}
                  {docAddingCustom ? (
                    <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-3 py-3 space-y-2">
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Special Document</p>
                      <input
                        value={docAddName}
                        onChange={e => setDocAddName(e.target.value)}
                        placeholder="Document name *"
                        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                      <input
                        value={docAddDesc}
                        onChange={e => setDocAddDesc(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!docAddName.trim()) return
                            setDocCustomList(prev => [...prev, { name: docAddName.trim(), description: docAddDesc.trim(), required: true }])
                            setDocAddName(''); setDocAddDesc(''); setDocAddingCustom(false)
                          }}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                        >Add</button>
                        <button
                          type="button"
                          onClick={() => { setDocAddingCustom(false); setDocAddName(''); setDocAddDesc('') }}
                          className="text-[10px] px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDocAddingCustom(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add special document
                    </button>
                  )}
                </div>
              </div>

              {/* Message */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Message (optional)</p>
                <textarea
                  value={docMessage}
                  onChange={e => setDocMessage(e.target.value)}
                  rows={3}
                  placeholder="Any specific instructions for the client…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] resize-none text-[#0B1F3A] placeholder:text-gray-300"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">
                {selectedDocs.length + docCustomList.length} doc{selectedDocs.length + docCustomList.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDocModal(false); setSelectedDocs([]); setDocMessage(''); setDocOverrides({}); setDocEditing(null); setDocCustomList([]) }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendDocRequest}
                  disabled={sendingDocs || (selectedDocs.length === 0 && docCustomList.length === 0)}
                  className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#b8973f] disabled:opacity-50 transition-colors"
                >
                  {sendingDocs ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : docSentOk ? (
                    <><Check className="w-4 h-4" /> Sent!</>
                  ) : (
                    <><FolderUp className="w-4 h-4" /> Send Request</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
