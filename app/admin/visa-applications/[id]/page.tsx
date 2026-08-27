'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CallButton } from '@/components/admin/CallButton'
import { BUSINESS } from '@/lib/config/business'
import {
  ArrowLeft, Save, RefreshCw, Loader2, CheckCircle, AlertTriangle,
  FileText, User, Globe, Briefcase, Plane, Shield, MessageCircle,
  ChevronDown, Plus, Send, Edit3, X, Clock, Building2, Phone,
  Mail, Check, AlertCircle, ExternalLink, Pencil,
  ClipboardList, StickyNote, Flag, Calendar, FolderUp, Upload,
} from 'lucide-react'
import type { BankStatementAnalysis } from '@/lib/analyzeBankStatement'
import { BankStatementPanel } from '@/components/admin/BankStatementPanel'
import { WhatsAppDrawer } from '@/app/admin/portal/components/WhatsAppDrawer'
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
  userId: string | null
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

interface ClientDoc {
  id: string; name: string; category: string; fileUrl: string; fileKey: string
  fileSize: number | null; mimeType: string | null; status: string
  reviewNote: string | null; uploadedAt: string
}

interface DocUpload {
  id: string; docName: string; fileName: string
  fileUrl: string; fileKey: string; uploadedAt: string
  fileSize: number | null; mimeType: string | null; status: string
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

// ─── Request More Info Modal ──────────────────────────────────────────────────
function RequestInfoModal({ app, onClose }: { app: VisaApp; onClose: () => void }) {
  const [clientEmail, setClientEmail] = useState(app.email ?? '')
  const [clientName, setClientName] = useState([app.firstName, app.lastName].filter(Boolean).join(' '))
  const [missingFields, setMissingFields] = useState('')
  const [sending, setSending] = useState(false)
  const [sentLink, setSentLink] = useState<string | null>(null)

  const defaultMsg = missingFields.trim()
    ? `We have reviewed your ${app.destinationIso2} visa application and need some additional information before we can proceed.\n\nPlease update the following in your form:\n\n${missingFields.trim()}\n\nKindly use the link below to access your saved form and complete these details at your earliest convenience. The link is valid for 7 days.`
    : `We have reviewed your visa application and need some additional information before we can proceed.\n\nPlease use the link below to access your saved form, complete any missing fields, and resubmit. The link is valid for 7 days.`

  async function send() {
    setSending(true)
    try {
      // Update status to info_required
      await fetch(`/api/admin/visa-applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'info_required' }),
      })
      // Send form link with the info-request message
      const res = await fetch(`/api/admin/visa-applications/${app.id}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEmail, clientName, personalMessage: defaultMsg }),
      })
      const d = await res.json()
      if (res.ok) setSentLink(d.link)
      else alert(d.error ?? 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (sentLink) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h3 className="font-bold text-[#0B1F3A] text-xl mb-2">Info Request Sent</h3>
          <p className="text-gray-500 text-sm mb-4">
            A form link has been emailed to <strong>{clientEmail}</strong>. The application status has been updated to <span className="font-semibold text-orange-600">Info Required</span>.
          </p>
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
            <h3 className="font-bold text-[#0B1F3A] text-lg">Request More Information</h3>
            <p className="text-xs text-gray-500 mt-0.5">Sends a form link and marks application as Info Required</p>
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
            <label className="text-xs font-semibold text-gray-600 block mb-1">What information is missing? <span className="text-gray-400 font-normal">(optional — shown in the email)</span></label>
            <textarea value={missingFields} onChange={e => setMissingFields(e.target.value)} rows={4}
              placeholder="e.g.&#10;— Employment history for the past 10 years&#10;— Country of birth&#10;— Contact person name and address in Canada"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700">
            ⚠️ This will update the application status to <strong>Info Required</strong> and send a secure 7-day form link to the client.
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={send} disabled={sending || !clientEmail}
              className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send & Update Status
            </button>
          </div>
        </div>
      </div>
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

// ─── Email Client Modal ───────────────────────────────────────────────────────
const EMAIL_TEMPLATES = [
  {
    label: 'Document request',
    subject: (ref: string, dest: string) => `${dest} Visa — Documents Required · ${ref}`,
    body: (name: string, ref: string, dest: string) =>
      `Dear ${name},\n\nThank you for choosing Walz Travels for your ${dest} visa application (Ref: ${ref}).\n\nTo proceed with your application, we kindly request the following documents:\n\n• [LIST DOCUMENTS HERE]\n\nPlease send your documents via the portal or reply to this email.\n\nShould you have any questions, please don't hesitate to reach out.\n\nWarm regards,\nThe Walz Travels Visa Team`,
  },
  {
    label: 'Application update',
    subject: (ref: string, dest: string) => `${dest} Visa Application Update · ${ref}`,
    body: (name: string, ref: string, dest: string) =>
      `Dear ${name},\n\nWe're writing to update you on the status of your ${dest} visa application (Ref: ${ref}).\n\n[YOUR UPDATE HERE]\n\nWe will keep you informed of any further developments. Please feel free to contact us if you have any questions.\n\nWarm regards,\nThe Walz Travels Visa Team`,
  },
  {
    label: 'Appointment confirmed',
    subject: (ref: string, dest: string) => `${dest} Visa — Appointment Confirmed · ${ref}`,
    body: (name: string, ref: string, dest: string) =>
      `Dear ${name},\n\nWe are pleased to confirm your visa appointment for your ${dest} visa application (Ref: ${ref}).\n\nAppointment details:\n• Date: [DATE]\n• Time: [TIME]\n• Location: [EMBASSY/CONSULATE ADDRESS]\n\nPlease arrive 15 minutes early with all original documents.\n\nIf you need to reschedule, please contact us immediately.\n\nWarm regards,\nThe Walz Travels Visa Team`,
  },
  {
    label: 'Visa approved',
    subject: (ref: string, dest: string) => `🎉 ${dest} Visa Approved! · ${ref}`,
    body: (name: string, ref: string, dest: string) =>
      `Dear ${name},\n\nCongratulations! We are delighted to inform you that your ${dest} visa application (Ref: ${ref}) has been APPROVED!\n\nPlease find your visa document attached.\n\n[COLLECTION/DELIVERY INSTRUCTIONS]\n\nThank you for trusting Walz Travels. We wish you a wonderful trip!\n\nWarm regards,\nThe Walz Travels Visa Team`,
  },
]

function EmailClientModal({ app, onClose, onSent }: { app: VisaApp; onClose: () => void; onSent: () => void }) {
  const clientName = [app.firstName, app.lastName].filter(Boolean).join(' ') || app.user?.name || 'Client'
  const config     = getVisaConfig(app.destinationIso2)
  const destName   = config?.name ?? app.destinationIso2

  const [to,      setTo]      = useState(app.email ?? app.user?.email ?? '')
  const [subject, setSubject] = useState(`${destName} Visa Application · ${app.referenceNumber}`)
  const [body,    setBody]    = useState('')
  const [files,      setFiles]      = useState<File[]>([])
  const [sending,    setSending]    = useState(false)
  const [err,        setErr]        = useState('')
  const [sent,       setSent]       = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function applyTemplate(tpl: typeof EMAIL_TEMPLATES[0]) {
    setSubject(tpl.subject(app.referenceNumber, destName))
    setBody(tpl.body(clientName, app.referenceNumber, destName))
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setFiles(prev => [...prev, ...Array.from(incoming)])
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    addFiles(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false)
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function send() {
    if (!to || !subject || !body) { setErr('To, Subject and Body are required'); return }
    setSending(true); setErr('')
    const form = new FormData()
    form.append('to',      to)
    form.append('subject', subject)
    form.append('body',    body)
    files.forEach((f, i) => form.append(`attachment_${i}`, f, f.name))

    const res = await fetch(`/api/admin/visa-applications/${app.id}/email-client`, {
      method: 'POST', body: form,
    })
    const d = await res.json()
    setSending(false)
    if (!res.ok) { setErr(d.error ?? 'Failed to send'); return }
    setSent(true)
    setTimeout(onSent, 1200)
  }

  if (sent) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="font-bold text-[#0B1F3A] text-xl mb-1">Email Sent!</h3>
        <p className="text-gray-500 text-sm">Delivered to <strong>{to}</strong></p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Mail className="w-5 h-5 text-[#C9A84C]" />
            <div>
              <h3 className="font-bold text-[#0B1F3A] text-lg">Email Client</h3>
              <p className="text-xs text-gray-400">{app.referenceNumber} · {destName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Quick templates */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Quick templates</p>
            <div className="flex flex-wrap gap-2">
              {EMAIL_TEMPLATES.map(tpl => (
                <button key={tpl.label} onClick={() => applyTemplate(tpl)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors font-semibold">
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* To */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">To</label>
            <input value={to} onChange={e => setTo(e.target.value)} type="email"
              className="w-full h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]"
              placeholder="client@email.com" />
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
          </div>

          {/* Body */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-y font-mono leading-relaxed"
              placeholder="Type your message here, or pick a template above…" />
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">Attachments</label>
              <button onClick={() => fileRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition-colors flex items-center gap-1.5">
                <Upload className="w-3 h-3" /> Add files
              </button>
            </div>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
            {files.length === 0 ? (
              <button
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`w-full border-2 border-dashed rounded-xl p-4 text-xs transition-colors text-center ${
                  dragActive
                    ? 'border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/5'
                    : 'border-gray-200 text-gray-400 hover:border-[#C9A84C]/40 hover:text-[#C9A84C]'
                }`}>
                {dragActive ? 'Release to attach' : 'Drop files here or click to browse'}
              </button>
            ) : (
              <div
                className={`space-y-1.5 rounded-xl border-2 border-dashed p-2 transition-colors ${
                  dragActive ? 'border-[#C9A84C] bg-[#C9A84C]/5' : 'border-transparent'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}>
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                    <FileText className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                    <span className="text-xs text-gray-700 flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => fileRef.current?.click()}
                  className="text-xs text-[#C9A84C] hover:underline ml-1">+ Add more</button>
              </div>
            )}
          </div>

          {err && <p className="text-red-500 text-xs">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-white transition-colors">
            Cancel
          </button>
          <button onClick={send} disabled={sending || !to || !subject || !body}
            className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-[#162d52] transition-colors">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : `Send Email${files.length > 0 ? ` + ${files.length} file${files.length > 1 ? 's' : ''}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Duplicate Modal ──────────────────────────────────────────────────────────
function DuplicateModal({ app, onClose, onDone }: { app: VisaApp; onClose: () => void; onDone: (newId: string, newRef: string) => void }) {
  const destinations = Object.entries(VISA_CONFIGS)
    .filter(([iso2]) => iso2 !== app.destinationIso2 && iso2.length === 2)
    .map(([iso2, cfg]) => ({ iso2, name: cfg.name, flag: cfg.flag }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const [destIso2, setDestIso2] = useState('')
  const [visaType, setVisaType] = useState('tourist')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    newApp: { id: string; referenceNumber: string; destinationIso2: string }
    requirementsDelta: { added: string[]; removed: string[] }
    documentsCarried: number
  } | null>(null)
  const [err, setErr] = useState('')

  async function submit() {
    if (!destIso2) { setErr('Please select a destination'); return }
    setLoading(true); setErr('')
    const res = await fetch(`/api/admin/visa-applications/${app.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationIso2: destIso2, visaType }),
    })
    const d = await res.json()
    setLoading(false)
    if (!res.ok) { setErr(d.error ?? 'Duplication failed'); return }
    setResult(d)
  }

  if (result) {
    const { added, removed } = result.requirementsDelta
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="font-bold text-[#0B1F3A] text-xl mb-1 text-center">Application Duplicated</h3>
          <p className="text-gray-500 text-sm text-center mb-4">
            New ref: <span className="font-mono font-bold text-[#C9A84C]">{result.newApp.referenceNumber}</span>
          </p>
          <p className="text-gray-500 text-xs text-center mb-4">{result.documentsCarried} document(s) carried over (destination-specific documents excluded)</p>
          {(added.length > 0 || removed.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 space-y-2">
              <p className="text-xs font-bold text-amber-800">Requirements delta for {destIso2}:</p>
              {added.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">+ New requirements:</p>
                  <ul className="text-xs text-green-700 space-y-0.5 list-disc list-inside">
                    {added.map(d => <li key={d}>{d}</li>)}
                  </ul>
                </div>
              )}
              {removed.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">− No longer required:</p>
                  <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside">
                    {removed.map(d => <li key={d}>{d}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Close</button>
            <button onClick={() => onDone(result.newApp.id, result.newApp.referenceNumber)}
              className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-bold">Open New Application</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#0B1F3A] text-lg">Duplicate Application</h3>
            <p className="text-xs text-gray-500 mt-0.5">Copy {[app.firstName, app.lastName].filter(Boolean).join(' ')} to a new destination</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">New Destination *</label>
            <select value={destIso2} onChange={e => setDestIso2(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white">
              <option value="">Select destination…</option>
              {destinations.map(d => (
                <option key={d.iso2} value={d.iso2}>{d.flag} {d.name} ({d.iso2})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Visa Type</label>
            <select value={visaType} onChange={e => setVisaType(e.target.value)}
              className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white">
              <option value="tourist">Tourist</option>
              <option value="business">Business</option>
              <option value="student">Student</option>
              <option value="work">Work</option>
              <option value="transit">Transit</option>
              <option value="family">Family</option>
              <option value="medical">Medical</option>
            </select>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">What gets copied:</p>
            <p>✓ Personal details, passport info, contact & employment</p>
            <p>✗ Travel dates, accommodation, cover letters, visa scores</p>
          </div>
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={loading || !destIso2}
              className="flex-1 py-2.5 bg-[#C9A84C] text-[#0B1F3A] rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              Duplicate
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
  const [showRequestInfo, setShowRequestInfo] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [showEmailClient, setShowEmailClient] = useState(false)

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

  // Client-uploaded portal documents
  const [clientDocs,        setClientDocs]        = useState<ClientDoc[]>([])
  const [clientDocsLoaded,  setClientDocsLoaded]  = useState(false)
  const [clientDocsLoading, setClientDocsLoading] = useState(false)
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

  // Create portal application
  const [portalCreating, setPortalCreating] = useState(false)
  const [portalCreated,  setPortalCreated]  = useState<string | null>(null) // refNumber on success

  // WhatsApp drawer
  const [waDrawer,    setWaDrawer]    = useState<{ conversationId: number; inboxName?: string; channelType?: string } | null>(null)
  const [waLoading,   setWaLoading]   = useState(false)
  const [waError,     setWaError]     = useState<string | null>(null)
  const [waPhone,     setWaPhone]     = useState<string>('')
  const [waEditPhone, setWaEditPhone] = useState(false)

  // Visa-scoped WhatsApp thread
  type VaMsg = { id: string; direction: string; body: string; sentBy: string | null; status: string; createdAt: string }
  const [waThreadMsgs,   setWaThreadMsgs]   = useState<VaMsg[]>([])
  const [waThreadLoading,setWaThreadLoading]= useState(false)
  const [waThreadSending,setWaThreadSending]= useState(false)
  const [waThreadInput,  setWaThreadInput]  = useState('')
  const [waThreadErr,    setWaThreadErr]    = useState<string | null>(null)
  const waThreadBottom = useRef<HTMLDivElement>(null)

  async function loadWhatsappThread() {
    if (!app) return
    setWaThreadLoading(true)
    try {
      const res  = await fetch(`/api/admin/visa-applications/${app.id}/whatsapp`)
      const data = await res.json() as { messages?: VaMsg[]; error?: string }
      if (data.messages) {
        setWaThreadMsgs(data.messages)
        setTimeout(() => waThreadBottom.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    } finally {
      setWaThreadLoading(false)
    }
  }

  async function sendWhatsappThread() {
    if (!app || !waThreadInput.trim()) return
    setWaThreadSending(true); setWaThreadErr(null)
    try {
      const res  = await fetch(`/api/admin/visa-applications/${app.id}/whatsapp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: waThreadInput.trim() }),
      })
      const data = await res.json() as { msg?: VaMsg; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Send failed')
      if (data.msg) setWaThreadMsgs(prev => [...prev, data.msg!])
      setWaThreadInput('')
      setTimeout(() => waThreadBottom.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (e) {
      setWaThreadErr(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setWaThreadSending(false)
    }
  }

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
    try {
      const res = await fetch(`/api/admin/visa-applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((d as { error?: string }).error ?? `Save failed (${res.status}) — please try again`)
        return
      }
      if ((d as { application?: unknown }).application) {
        setApp((d as { application: VisaApp }).application)
        setEditing(false)
      }
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (err) {
      alert('Network error — please check your connection and try again')
      console.error('[saveEdits]', err)
    } finally {
      setSaving(false)
    }
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

  async function loadClientDocs() {
    if (clientDocsLoaded || clientDocsLoading || !app?.userId) return
    setClientDocsLoading(true)
    try {
      const res  = await fetch(`/api/admin/portal/documents?userId=${app.userId}`)
      const data = await res.json()
      setClientDocs(data.documents ?? [])
      setClientDocsLoaded(true)
    } catch {}
    setClientDocsLoading(false)
  }

  async function createPortalApp() {
    if (!app?.userId || portalCreating) return
    setPortalCreating(true)
    try {
      const clientName = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Client'
      const res = await fetch('/api/admin/portal/applications', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:      app.userId,
          title:       `Visa Application — ${app.destinationIso2?.toUpperCase() ?? 'Unknown'} (${app.visaType ?? 'Visa'})`,
          type:        'VISA',
          stage:       'ENQUIRY',
          destination: app.destinationIso2 ?? null,
          travelDate:  app.arrivalDate ?? null,
          notes:       `Linked from visa application ${app.referenceNumber}. Applicant: ${clientName}.`,
        }),
      })
      const data = await res.json()
      if (data.application?.refNumber) {
        setPortalCreated(data.application.refNumber)
      }
    } catch {}
    setPortalCreating(false)
  }

  async function openWhatsApp() {
    if (!app) return
    const phone = (waPhone || app.phone || '').trim()
    // Always show phone confirm step if the number hasn't been verified this session
    if (!waPhone) {
      setWaPhone(phone)
      setWaEditPhone(true)
      return
    }
    setWaLoading(true); setWaError(null)
    try {
      const clientName = [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'
      const res = await fetch('/api/admin/whatsapp-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visaApplicationId: app.id, clientName, clientPhone: phone, refNumber: app.referenceNumber, fromNumber: '+447949448680' }),
      })
      const data = await res.json() as {
        conversationId?: number; error?: string; inboxName?: string; channelType?: string
        chatwootSent?: boolean
      }
      if (!res.ok || !data.conversationId) { setWaError(data.error ?? 'Failed to open chat'); return }
      setWaDrawer({ conversationId: data.conversationId, inboxName: data.inboxName, channelType: data.channelType })
    } catch { setWaError('Network error') }
    finally { setWaLoading(false) }
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
      {showRequestInfo && <RequestInfoModal app={app} onClose={() => { setShowRequestInfo(false); load() }} />}
      {showDuplicate && (
        <DuplicateModal
          app={app}
          onClose={() => setShowDuplicate(false)}
          onDone={(newId) => { setShowDuplicate(false); router.push(`/admin/visa-applications/${newId}`) }}
        />
      )}

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
          <button onClick={() => setShowDuplicate(true)}
            className="flex items-center gap-2 px-3 py-2 border border-purple-300 text-purple-600 rounded-xl text-sm font-semibold hover:bg-purple-50 transition-colors">
            <Globe className="w-4 h-4" /> Duplicate to New Destination
          </button>
          <button onClick={() => setShowRequestInfo(true)}
            className="flex items-center gap-2 px-3 py-2 border border-orange-300 text-orange-600 rounded-xl text-sm font-semibold hover:bg-orange-50 transition-colors">
            <AlertCircle className="w-4 h-4" /> Request More Info
          </button>
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
                <div key={req.id} className="bg-gray-50 rounded-xl p-3 text-xs space-y-2">
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
                  {req.uploads.length > 0 && (
                    <div className="border-t border-gray-200 pt-2 space-y-1.5">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Uploaded Files</p>
                      {req.uploads.map(u => (
                        <a
                          key={u.id}
                          href={u.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-2 hover:border-amber-400 hover:bg-amber-50 transition-colors group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-700 truncate">{u.docName}</p>
                              <p className="text-[10px] text-gray-400 truncate">{u.fileName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              u.status === 'approved' ? 'bg-green-100 text-green-700' :
                              u.status === 'rejected' ? 'bg-red-100 text-red-600'    :
                                                        'bg-gray-100 text-gray-500'
                            }`}>{u.status}</span>
                            <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-amber-500" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
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

          {/* Client Portal Documents (uploaded directly by client) */}
          {app.userId && (
            <ActionSection id="clientdocs" title="Client Portal Documents" icon={Upload} onOpen={loadClientDocs}>
              <div className="space-y-2">
                {clientDocsLoading && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                  </div>
                )}
                {!clientDocsLoading && clientDocs.length === 0 && (
                  <p className="text-xs text-gray-400 py-1">No documents uploaded directly by client yet.</p>
                )}
                {clientDocs.map(doc => (
                  <a
                    key={doc.id}
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 hover:border-amber-400 hover:bg-amber-50 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{doc.name}</p>
                        <p className="text-[10px] text-gray-400">{doc.category} · {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        doc.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                        doc.status === 'REJECTED' ? 'bg-red-100 text-red-600'    :
                                                    'bg-amber-100 text-amber-700'
                      }`}>{doc.status}</span>
                      <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-amber-500" />
                    </div>
                  </a>
                ))}
                {/* Create portal application link */}
                <div className="border-t border-gray-100 pt-2 mt-1">
                  {portalCreated ? (
                    <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Portal application created — {portalCreated}
                      <Link href="/admin/portal" className="ml-auto text-green-700 underline">View</Link>
                    </div>
                  ) : (
                    <button
                      onClick={createPortalApp}
                      disabled={portalCreating}
                      className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-2 hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                      {portalCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Create Portal Application for this Client
                    </button>
                  )}
                </div>
              </div>
            </ActionSection>
          )}

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

          {/* Scoped WhatsApp thread */}
          <ActionSection id="whatsapp-thread" title="WhatsApp (this application)" icon={MessageCircle} onOpen={loadWhatsappThread}>
            {!app.phone ? (
              <p className="text-xs text-gray-400 py-2">No phone number on this application. Add one in the Contact Information section first.</p>
            ) : (
              <div className="space-y-3">
                {/* Thread */}
                <div className="bg-gray-900 rounded-xl overflow-hidden" style={{ minHeight: 160, maxHeight: 320 }}>
                  <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: 320 }}>
                    {waThreadLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading thread…
                      </div>
                    ) : waThreadMsgs.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageCircle className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                        <p className="text-gray-500 text-xs">No messages yet.</p>
                        <p className="text-gray-600 text-xs mt-0.5">Send the first message below — it goes directly to {app.firstName ?? 'the client'} on WhatsApp.</p>
                      </div>
                    ) : (
                      waThreadMsgs.map(msg => (
                        <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs ${
                            msg.direction === 'outbound'
                              ? 'bg-green-700 text-white'
                              : 'bg-gray-800 text-gray-100'
                          }`}>
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                            <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-green-300' : 'text-gray-500'} text-right`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {msg.direction === 'outbound' && msg.status === 'failed' && ' · failed'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={waThreadBottom} />
                  </div>
                </div>

                {/* Reply box */}
                {waThreadErr && (
                  <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{waThreadErr}</p>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={waThreadInput}
                    onChange={e => setWaThreadInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendWhatsappThread() }
                    }}
                    placeholder={`Message ${app.firstName ?? 'client'}…`}
                    rows={2}
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl resize-none focus:outline-none focus:border-green-400"
                  />
                  <button
                    onClick={() => void sendWhatsappThread()}
                    disabled={!waThreadInput.trim() || waThreadSending}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition"
                  >
                    {waThreadSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 leading-snug">
                  Messages are sent via WhatsApp. Replies route back to this thread automatically while the application is active. Thread is private — not visible in the general WhatsApp inbox.
                </p>
              </div>
            )}
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
            {/* WhatsApp chat button */}
            {waEditPhone ? (
              <div className="p-2.5 rounded-xl border border-gray-100 space-y-2">
                <p className="text-xs text-gray-500 font-semibold">WhatsApp number</p>
                <input
                  value={waPhone || app.phone || ''}
                  onChange={e => setWaPhone(e.target.value)}
                  placeholder="+234..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-green-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setWaEditPhone(false); void openWhatsApp() }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
                  >Open Chat</button>
                  <button
                    onClick={() => setWaEditPhone(false)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-xl border border-gray-100">
                <button
                  onClick={() => void openWhatsApp()}
                  disabled={waLoading}
                  className="flex-1 flex items-center justify-between p-2.5 hover:bg-gray-50 rounded-l-xl transition-colors disabled:opacity-60"
                >
                  <span className="text-sm text-[#0B1F3A] font-semibold">
                    {waLoading ? 'Opening…' : 'WhatsApp Client'}
                  </span>
                  {waLoading
                    ? <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
                    : <MessageCircle className="w-4 h-4 text-green-500" />
                  }
                </button>
                <button
                  onClick={() => setWaEditPhone(true)}
                  className="px-2.5 py-2.5 hover:bg-gray-50 rounded-r-xl border-l border-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit WhatsApp number"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {waError && <p className="text-xs text-red-500 px-1">{waError}</p>}

            {/* WhatsApp note: business-initiated delivery depends on client having messaged first */}
            <div className="px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-xl text-[10px] text-blue-700 leading-snug">
              💬 Opening message sent via Chatwoot. If the client has already messaged your WhatsApp it will deliver instantly. If not, ask them to WhatsApp <strong>+{BUSINESS.contacts.nigeriaWhatsapp.e164}</strong> first.
            </div>

            {app.phone && (
              <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100">
                <span className="text-sm text-[#0B1F3A] font-semibold">Call Client</span>
                <CallButton phoneNumber={app.phone} />
              </div>
            )}
            <button
              onClick={() => setShowEmailClient(true)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors text-left">
              <span className="text-sm text-[#0B1F3A] font-semibold">Email Client</span>
              <Mail className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Email Client Modal */}
      {showEmailClient && app && (
        <EmailClientModal
          app={app}
          onClose={() => setShowEmailClient(false)}
          onSent={() => { setShowEmailClient(false); load() }}
        />
      )}

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

      {/* WhatsApp Chat Drawer */}
      {waDrawer && app && (
        <WhatsAppDrawer
          conversationId={waDrawer.conversationId}
          clientName={[app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant'}
          clientPhone={waPhone || app.phone || ''}
          applicationType="VISA"
          refNumber={app.referenceNumber}
          inboxName={waDrawer.inboxName}
          channelType={waDrawer.channelType}
          onClose={() => setWaDrawer(null)}
        />
      )}
    </div>
  )
}
