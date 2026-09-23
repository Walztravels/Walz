'use client'

/**
 * WhatsApp Broadcasts (V1).
 *
 * Visual language is the page's existing one, unchanged: light theme,
 * green WhatsApp accent, amber Jade accent, rounded-2xl cards with
 * `border border-gray-200 shadow-sm`, rounded-xl inputs with a
 * green focus ring, uppercase-tracking field labels.
 *
 * Structure follows the Quote Builder's wizard convention
 * (app/admin/quotes/new/page.tsx): a `STEPS` const array, a narrow `Step`
 * union, a local `StepIndicator`, sibling `{step === n && …}` blocks and a
 * derived per-step validity boolean gating the Next button.
 *
 * TRUTHFULNESS RULES THIS PAGE OBEYS
 *  - No client-side env check anywhere. The readiness banner is fed by
 *    GET …/readiness, a server route. `NEXT_PUBLIC_WA_TOKEN` (which the
 *    old page read, and which would have exposed a token to every
 *    browser) is gone, as is the banner's reference to the non-existent
 *    `WHATSAPP_TOKEN` variable.
 *  - Every count shown comes from a server response. Nothing is estimated
 *    or placeheld.
 *  - The confirmation step RE-FETCHES the preview from the server
 *    immediately before queueing, so the number a human approves is never
 *    a value cached from an earlier step.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  MessageSquare, Plus, Loader2, Sparkles, Send, Clock, CheckCircle, X, ChevronDown,
  ShieldAlert, ShieldCheck, Check, AlertTriangle, Ban, Search, Users, FileText, Phone,
  Trash2, Info, Download,
} from 'lucide-react'

// ── Types mirroring the API responses ───────────────────────────────────

type Broadcast = {
  id: string
  name: string
  message: string
  mediaUrl: string | null
  targetFilter: Record<string, string>
  recipientCount: number
  sentCount: number
  deliveredCount: number
  readCount: number
  failedCount: number
  skippedCount: number
  // V1.2.1: Twilio Content SID. Null on a legacy V1/V1.1 broadcast, which
  // instead has templateName/templateLanguage populated (kept for read
  // compatibility — see prisma/schema.prisma).
  contentSid: string | null
  templateName: string | null
  templateLanguage: string | null
  status: string
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
}

type Breakdown = {
  totalMatched: number
  eligible: number
  optedOut: number
  missingConsent: number
  invalidNumber: number
  duplicatesRemoved: number
  countryFiltered: number
  templateUnresolvable: number
  finalSendCount: number
  // V1.1 — present only on a multi-source breakdown.
  totalSelected?: number
  validNumber?: number
  manualRejected?: number
  bySource?: Record<string, number>
  sendableBySource?: Record<string, number>
}

/** A counted exclusion WITH a reason. Never a bare number. */
type ExclusionBucket = { reason: string; count: number; description: string }

type ManualReport = {
  valid: Array<{ raw: string; normalizedNumber: string; displayName: string | null; consentStatus?: string }>
  invalid: Array<{ raw: string; reason: string }>
  duplicates: Array<{ raw: string; normalizedNumber: string; firstSeenAs: string }>
  totalEntries: number
}

type PreviewResponse = {
  multiSource?: boolean
  breakdown: Breakdown
  exclusions?: ExclusionBucket[]
  manual?: ManualReport
  sample?: Array<{
    maskedNumber: string; status: string; sourceType?: string
    sources?: string[]; displayName?: string | null; reason?: string | null
  }>
  templateValid: boolean
  templateErrors: string[]
  consentNotice: string | null
  error?: string
}

// ── V1.1 recipient picker shapes ────────────────────────────────────────

type LeadOption = {
  id: string
  name: string | null
  email: string | null
  normalizedNumber: string | null
  service: string | null
  destination: string | null
  optedOut: boolean
  consentStatus: string
  hasValidNumber: boolean
}

type VisaOption = {
  id: string
  referenceNumber: string
  name: string | null
  email: string | null
  normalizedNumber: string | null
  destinationIso2: string
  visaType: string
  status: string
  assignedTo: string | null
  optedOut: boolean
  consentStatus: string
  hasValidNumber: boolean
}

type LeadSearchResponse = {
  leads?: LeadOption[]
  total?: number
  truncated?: boolean
  totalIsBeforeCountryFilter?: boolean
}
type VisaSearchResponse = { applications?: VisaOption[]; total?: number; truncated?: boolean }

type Readiness = {
  canSend: boolean
  canReceiveStatusCallbacks: boolean
  checks: Record<string, 'PRESENT' | 'MISSING'>
  missing: string[]
}

type DetailResponse = {
  broadcast: Broadcast
  counts: {
    total: number; queued: number; sending: number; sent: number
    delivered: number; read: number; failed: number
    skippedOptOut: number; skippedNoConsent: number; skippedInvalidNumber: number
    dispatched: number; skipped: number; deliveredOrBetter: number
  }
  rates: { deliveryPct: number; readPct: number; failurePct: number }
  failureReasons: Array<{ code: string; count: number; example: string | null }>
  bySource?: Array<{ sourceType: string; count: number }>
}

// ── Static vocabularies (must match the server) ─────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT:           'bg-gray-100 text-gray-600',
  READY:           'bg-sky-50 text-sky-700',
  SCHEDULED:       'bg-amber-50 text-amber-700',
  QUEUED:          'bg-indigo-50 text-indigo-700',
  SENDING:         'bg-blue-50 text-blue-700',
  COMPLETED:       'bg-emerald-50 text-emerald-700',
  PARTIAL_FAILURE: 'bg-orange-50 text-orange-700',
  FAILED:          'bg-red-50 text-red-700',
  CANCELLED:       'bg-gray-100 text-gray-500',
}

const COUNTRIES = [
  { value: '',   label: 'All Countries' },
  { value: 'NG', label: 'Nigeria (+234)' },
  { value: 'GH', label: 'Ghana (+233)' },
  { value: 'KE', label: 'Kenya (+254)' },
  { value: 'ZA', label: 'South Africa (+27)' },
  { value: 'GB', label: 'United Kingdom (+44)' },
  { value: 'US', label: 'United States (+1)' },
]

// Lead.service values that actually exist in the database.
const SERVICES = [
  { value: '',                 label: 'All Services'    },
  { value: 'Visa Processing',  label: 'Visa Processing' },
  { value: 'Flight Booking',   label: 'Flight Booking'  },
  { value: 'Holiday Package',  label: 'Holiday Package' },
  { value: 'Group Travel',     label: 'Group Travel'    },
  { value: 'Corporate Travel', label: 'Corporate Travel'},
  { value: 'Hotel Only',       label: 'Hotel Only'      },
  { value: 'Other',            label: 'Other'           },
]

const LEAD_FIELDS = ['name', 'destination', 'service', 'travelDate'] as const

// VisaApplication.status — the real stored vocabulary (lib/visa-config.ts).
const VISA_STATUSES = [
  { value: '',                     label: 'Any status' },
  { value: 'received',             label: 'Application Received' },
  { value: 'documents_pending',    label: 'Documents Pending' },
  { value: 'under_review',         label: 'Under Review' },
  { value: 'ready_to_submit',      label: 'Ready to Submit' },
  { value: 'submitted_to_embassy', label: 'Submitted to Embassy' },
  { value: 'decision_pending',     label: 'Decision Pending' },
  { value: 'approved',             label: 'Approved' },
  { value: 'refused',              label: 'Refused' },
  { value: 'info_required',        label: 'Info Required' },
  { value: 'draft',                label: 'Draft' },
]

/**
 * Meta's real template-category taxonomy, RECORDED ONLY.
 *
 * Choosing one here changes NOTHING about who can be sent to. The server
 * runs the full affirmative-consent check for every broadcast built in
 * this wizard, whatever is picked. The UI says so out loud rather than
 * implying a "non-marketing" shortcut that does not exist.
 */
const TEMPLATE_CATEGORIES = [
  { value: '',               label: 'Not recorded' },
  { value: 'MARKETING',      label: 'Marketing' },
  { value: 'UTILITY',        label: 'Utility' },
  { value: 'AUTHENTICATION', label: 'Authentication' },
]

const SOURCE_LABELS: Record<string, string> = {
  LEAD: 'Client / Lead',
  VISA_APPLICATION: 'Visa application',
  MANUAL: 'Manual number',
  CLIENT: 'Client',
}

const STEPS = [
  { label: 'Recipients', sub: 'Choose who receives this' },
  { label: 'Template',   sub: 'Approved WhatsApp template' },
  { label: 'Preview',    sub: 'Real eligible counts' },
  { label: 'Schedule',   sub: 'Now or later' },
  { label: 'Confirm',    sub: 'Final check' },
] as const

type Step = 1 | 2 | 3 | 4 | 5
type RecipientTab = 'leads' | 'visa' | 'manual'

type ParamRow = { kind: 'static' | 'lead_field'; value: string; fallback: string }
type ApprovedTemplate = { contentSid: string; friendlyName: string; category: string | null; variableKeys: string[] }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Step indicator (Quote Builder convention, green accent) ─────────────

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STEPS.map((s, i) => {
        const n = (i + 1) as Step
        const done = n < current
        const active = n === current
        return (
          <div key={s.label} className="flex items-center gap-1.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                done ? 'bg-green-500 text-white' : active ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : n}
            </div>
            <span className={`text-xs font-medium hidden sm:inline ${active ? 'text-gray-900' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className={`w-5 h-px ${done ? 'bg-green-300' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Reusable bits ───────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'warn' }) {
  const colour =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${colour}`}>{value}</p>
    </div>
  )
}

function BreakdownGrid({ b }: { b: Breakdown }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {typeof b.totalSelected === 'number' && <Stat label="Total selected" value={b.totalSelected} />}
      <Stat label="Total matched"   value={b.totalMatched} />
      {typeof b.validNumber === 'number' && <Stat label="Valid WhatsApp number" value={b.validNumber} />}
      <Stat label="Eligible"        value={b.eligible} tone={b.eligible > 0 ? 'good' : 'warn'} />
      <Stat label="Opted out"       value={b.optedOut} />
      <Stat label="Missing consent" value={b.missingConsent} tone={b.missingConsent > 0 ? 'warn' : undefined} />
      <Stat label="Invalid number"  value={b.invalidNumber} />
      <Stat label="Duplicates removed" value={b.duplicatesRemoved} />
      <Stat label="Country filtered"   value={b.countryFiltered} />
      {typeof b.manualRejected === 'number' && b.manualRejected > 0 && (
        <Stat label="Manual entries rejected" value={b.manualRejected} tone="warn" />
      )}
      <Stat label="Final send count"   value={b.finalSendCount} tone={b.finalSendCount > 0 ? 'good' : 'bad'} />
    </div>
  )
}

/**
 * Exclusions WITH reasons. This is the direct answer to "why is my
 * eligible count zero" — every excluded person is accounted for in a
 * named bucket that explains itself, rather than an unexplained number.
 */
function ExclusionList({ buckets }: { buckets: ExclusionBucket[] }) {
  if (buckets.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Why recipients were excluded</p>
      <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
        {buckets.map(x => (
          <div key={x.reason} className="px-3 py-2.5">
            <p className="text-xs font-semibold text-gray-800">{x.reason} · {x.count}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{x.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Per-source contribution, straight from the server's own counts. */
function SourceCounts({ bySource, title }: { bySource: Record<string, number>; title: string }) {
  const rows = Object.entries(bySource).filter(([, n]) => n > 0)
  if (rows.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {rows.map(([k, n]) => (
          <span key={k} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
            {SOURCE_LABELS[k] ?? k}: {n}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The advisory consent label on a picker row.
 *
 * SELECTION IS NEVER GATED BY THIS. It exists so a staff member can see,
 * while building a list, who will be excluded and why — the server decides
 * eligibility for itself at preview and again at approval.
 */
function ConsentChip({ optedOut, consentStatus, hasValidNumber }: {
  optedOut: boolean; consentStatus: string; hasValidNumber: boolean
}) {
  if (optedOut) return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-600">Opted out</span>
  if (!hasValidNumber) return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">No valid number</span>
  if (consentStatus === 'SUBSCRIBED') return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Consented</span>
  if (consentStatus === 'OPTED_OUT') return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-600">Opted out</span>
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">No consent</span>
}

// ── Page ────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading]       = useState(true)
  const [showNew, setShowNew]       = useState(false)
  const [readiness, setReadiness]   = useState<Readiness | null>(null)

  // Wizard state
  const [step, setStep]                 = useState<Step>(1)
  const [name, setName]                 = useState('')
  const [message, setMessage]           = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterService, setFilterService] = useState('')
  // V1.2.1: staff pick an approved WhatsApp template from a server-side
  // catalogue (Twilio Content API, listed via GET .../templates) rather
  // than typing a name — see that route for why a hand-typed value can
  // never be trusted as "approved".
  const [contentSid, setContentSid] = useState('')
  const [templates, setTemplates] = useState<ApprovedTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState('')
  const [templateCategory, setTemplateCategory] = useState('')
  const [params, setParams]             = useState<ParamRow[]>([])

  // ── V1.1 recipient builder ──────────────────────────────────────────
  const [tab, setTab] = useState<RecipientTab>('leads')

  // Clients & Leads tab
  const [leadQuery, setLeadQuery]       = useState('')
  const [leadResults, setLeadResults]   = useState<LeadOption[]>([])
  const [leadTotal, setLeadTotal]       = useState(0)
  const [leadTruncated, setLeadTruncated] = useState(false)
  const [leadCountBeforeCountry, setLeadCountBeforeCountry] = useState(false)
  const [leadSearching, setLeadSearching] = useState(false)
  const [selectedLeads, setSelectedLeads] = useState<LeadOption[]>([])
  /** "Select all from this explicitly resolved filter" — never implicit. */
  const [useLeadFilter, setUseLeadFilter] = useState(false)

  // Visa Applications tab
  const [visaQuery, setVisaQuery]         = useState('')
  const [visaDest, setVisaDest]           = useState('')
  const [visaType, setVisaType]           = useState('')
  const [visaStatus, setVisaStatus]       = useState('')
  const [visaFrom, setVisaFrom]           = useState('')
  const [visaTo, setVisaTo]               = useState('')
  const [visaResults, setVisaResults]     = useState<VisaOption[]>([])
  const [visaTotal, setVisaTotal]         = useState(0)
  const [visaTruncated, setVisaTruncated] = useState(false)
  const [visaSearching, setVisaSearching] = useState(false)
  const [selectedVisa, setSelectedVisa]   = useState<VisaOption[]>([])
  const [useVisaFilter, setUseVisaFilter] = useState(false)

  // Add Numbers tab
  const [manualBlob, setManualBlob]     = useState('')
  const [manualReport, setManualReport] = useState<ManualReport | null>(null)
  const [manualChecking, setManualChecking] = useState(false)
  /** Accepted manual recipients, as the SERVER normalized them. */
  const [manualAccepted, setManualAccepted] = useState<Array<{ raw: string; normalizedNumber: string; displayName: string | null; consentStatus?: string }>>([])
  const [scheduledAt, setScheduledAt]   = useState('')
  const [sendMode, setSendMode]         = useState<'send' | 'schedule'>('send')

  const [preview, setPreview]           = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmPreview, setConfirmPreview] = useState<PreviewResponse | null>(null)
  // `submitting` is the client half of the double-submit guard; the server
  // half is the lifecycle check + conditional status claim in
  // …/[id]/schedule. Neither is relied on alone.
  const [submitting, setSubmitting]     = useState(false)
  const [wizardError, setWizardError]   = useState('')
  const [saveMsg, setSaveMsg]           = useState('')

  // Detail panel
  const [detailId, setDetailId]   = useState<string | null>(null)
  const [detail, setDetail]       = useState<DetailResponse | null>(null)

  // Jade ideas (copywriting assistance ONLY — Jade cannot send anything)
  const [jadeQ, setJadeQ]             = useState('')
  const [jadeLoading, setJadeLoading] = useState(false)
  const [jadeIdeas, setJadeIdeas]     = useState('')
  const [showJade, setShowJade]       = useState(false)

  const loadBroadcasts = useCallback(async () => {
    const r = await fetch('/api/admin/marketing/whatsapp-broadcast')
    const d = (await r.json()) as { broadcasts?: Broadcast[] }
    setBroadcasts(d.broadcasts ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void loadBroadcasts() }, [loadBroadcasts])

  useEffect(() => {
    // Server-derived readiness — never process.env in the browser.
    fetch('/api/admin/marketing/whatsapp-broadcast/readiness')
      .then(r => (r.ok ? r.json() : null))
      .then((d: Readiness | null) => setReadiness(d))
      .catch(() => setReadiness(null))
  }, [])

  useEffect(() => {
    // Server-resolved approved-template catalogue (Twilio Content API) —
    // never a hand-typed name/SID. Loaded once; the wizard's Template step
    // picks FROM this list.
    setTemplatesLoading(true)
    fetch('/api/admin/marketing/whatsapp-broadcast/templates')
      .then(r => r.json())
      .then((d: { templates?: ApprovedTemplate[]; error?: string }) => {
        setTemplates(d.templates ?? [])
        setTemplatesError(d.error ?? '')
      })
      .catch(() => setTemplatesError('Could not load the approved template list.'))
      .finally(() => setTemplatesLoading(false))
  }, [])

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    void fetch(`/api/admin/marketing/whatsapp-broadcast/${detailId}`)
      .then(r => r.json())
      .then((d: DetailResponse) => setDetail(d))
  }, [detailId])

  const targetFilter = useMemo(() => ({
    ...(filterCountry && { country: filterCountry }),
    ...(filterService && { service: filterService }),
  }), [filterCountry, filterService])

  const visaFilter = useMemo(() => ({
    ...(visaDest && { destinationIso2: visaDest }),
    ...(visaType && { visaType }),
    ...(visaStatus && { status: visaStatus }),
    ...(visaFrom && { createdFrom: visaFrom }),
    ...(visaTo && { createdTo: visaTo }),
  }), [visaDest, visaType, visaStatus, visaFrom, visaTo])

  /**
   * THE SELECTION SENT TO THE SERVER — pointers only.
   *
   * Ids, filters and the RAW text of each manual entry. Deliberately no
   * phone number belonging to a record, no name, no consent status and no
   * count: the server re-reads every named record itself at preview time
   * and again at approval, so nothing this browser believes about who is
   * eligible can influence who is actually sent to.
   */
  const audienceSelection = useMemo(() => ({
    ...(Object.keys(targetFilter).length > 0 && { leadFilter: targetFilter }),
    ...(useLeadFilter && { useLeadFilter: true }),
    ...(selectedLeads.length > 0 && { leadIds: selectedLeads.map(l => l.id) }),
    ...(Object.keys(visaFilter).length > 0 && { visaFilter }),
    ...(useVisaFilter && { useVisaFilter: true }),
    ...(selectedVisa.length > 0 && { visaApplicationIds: selectedVisa.map(v => v.id) }),
    ...(manualAccepted.length > 0 && {
      manualEntries: manualAccepted.map(m => ({ number: m.raw, displayName: m.displayName })),
    }),
  }), [targetFilter, useLeadFilter, selectedLeads, visaFilter, useVisaFilter, selectedVisa, manualAccepted])

  const hasAnySelection =
    useLeadFilter || useVisaFilter ||
    selectedLeads.length > 0 || selectedVisa.length > 0 || manualAccepted.length > 0

  // ── Export Contacts (V1.2) ─────────────────────────────────────────────
  // Downloads exactly the current selection, resolved server-side — never
  // a client-built CSV of what's shown in the tray above. Gated server-side
  // behind the separate marketing_whatsapp_export permission; a staff
  // member without it sees a clear error rather than a silent failure.
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  async function handleExportContacts() {
    setExportError('')
    setExporting(true)
    try {
      const res = await fetch('/api/admin/marketing/whatsapp-broadcast/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selection: audienceSelection }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setExportError(data.error ?? 'Export failed.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `whatsapp-contacts-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  /** Running count of individually-picked recipients (filters are separate). */
  const trayCount = selectedLeads.length + selectedVisa.length + manualAccepted.length

  const templatePayload = {
    contentSid: contentSid.trim(),
    // Twilio Content Templates use {{1}},{{2}},… placeholders — the
    // existing ordered parameter list maps directly onto those numbered
    // keys, so the mapping UI itself did not need to change.
    variables: Object.fromEntries(params.map((p, i) => [
      String(i + 1),
      p.kind === 'static'
        ? { type: 'static' as const, value: p.value }
        : { type: 'lead_field' as const, field: p.value, ...(p.fallback ? { fallback: p.fallback } : {}) },
    ])),
    // Recorded for the operator's own bookkeeping. The server does not use
    // it to relax any check — every broadcast here is consent-gated in full.
    templateCategory: templateCategory || undefined,
  }

  async function runPreview(target: 'step' | 'confirm') {
    setPreviewLoading(true)
    setWizardError('')
    try {
      const r = await fetch('/api/admin/marketing/whatsapp-broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetFilter, audienceSelection, ...templatePayload }),
      })
      const d = (await r.json()) as PreviewResponse
      if (target === 'confirm') setConfirmPreview(d)
      else setPreview(d)
      return d
    } finally {
      setPreviewLoading(false)
    }
  }

  // ── Recipient search — SELECTION, never gated by consent ──────────────

  const searchLeads = useCallback(async () => {
    setLeadSearching(true)
    try {
      const qs = new URLSearchParams()
      if (leadQuery.trim()) qs.set('q', leadQuery.trim())
      if (filterService) qs.set('service', filterService)
      if (filterCountry) qs.set('country', filterCountry)
      const r = await fetch(`/api/admin/marketing/whatsapp-broadcast/recipients/leads?${qs.toString()}`)
      const d = (await r.json()) as LeadSearchResponse
      setLeadResults(d.leads ?? [])
      setLeadTotal(d.total ?? 0)
      setLeadTruncated(Boolean(d.truncated))
      setLeadCountBeforeCountry(Boolean(d.totalIsBeforeCountryFilter))
    } finally {
      setLeadSearching(false)
    }
  }, [leadQuery, filterService, filterCountry])

  const searchVisa = useCallback(async () => {
    setVisaSearching(true)
    try {
      const qs = new URLSearchParams()
      if (visaQuery.trim()) qs.set('q', visaQuery.trim())
      Object.entries(visaFilter).forEach(([k, v]) => qs.set(k, String(v)))
      const r = await fetch(`/api/admin/marketing/whatsapp-broadcast/recipients/visa-applications?${qs.toString()}`)
      const d = (await r.json()) as VisaSearchResponse
      setVisaResults(d.applications ?? [])
      setVisaTotal(d.total ?? 0)
      setVisaTruncated(Boolean(d.truncated))
    } finally {
      setVisaSearching(false)
    }
  }, [visaQuery, visaFilter])

  /**
   * Validate the manual paste SERVER-SIDE. The browser never decides that
   * a number is valid — it only displays what the server concluded, and
   * the server re-parses the same raw strings again at approval time.
   */
  async function checkManualNumbers() {
    if (!manualBlob.trim()) return
    setManualChecking(true)
    try {
      const r = await fetch('/api/admin/marketing/whatsapp-broadcast/recipients/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blob: manualBlob }),
      })
      const d = (await r.json()) as ManualReport
      setManualReport(d)
      setManualAccepted(prev => {
        const seen = new Set(prev.map(p => p.normalizedNumber))
        return [...prev, ...(d.valid ?? []).filter(v => !seen.has(v.normalizedNumber))]
      })
      setManualBlob('')
    } finally {
      setManualChecking(false)
    }
  }

  function toggleLead(l: LeadOption) {
    setSelectedLeads(prev => (prev.some(x => x.id === l.id) ? prev.filter(x => x.id !== l.id) : [...prev, l]))
  }
  function toggleVisa(v: VisaOption) {
    setSelectedVisa(prev => (prev.some(x => x.id === v.id) ? prev.filter(x => x.id !== v.id) : [...prev, v]))
  }

  async function askJade() {
    if (!jadeQ.trim()) return
    setJadeLoading(true)
    setJadeIdeas('')
    try {
      const res = await fetch('/api/admin/marketing/jade-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: jadeQ }),
      })
      const data = (await res.json()) as { ideas: string }
      setJadeIdeas(data.ideas ?? '')
    } finally {
      setJadeLoading(false)
    }
  }

  function resetWizard() {
    setStep(1); setName(''); setMessage(''); setFilterCountry(''); setFilterService('')
    setContentSid(''); setTemplateCategory(''); setParams([]); setScheduledAt('')
    setSendMode('send'); setPreview(null); setConfirmPreview(null); setWizardError('')
    setTab('leads')
    setLeadQuery(''); setLeadResults([]); setSelectedLeads([]); setUseLeadFilter(false)
    setVisaQuery(''); setVisaDest(''); setVisaType(''); setVisaStatus(''); setVisaFrom(''); setVisaTo('')
    setVisaResults([]); setSelectedVisa([]); setUseVisaFilter(false)
    setManualBlob(''); setManualReport(null); setManualAccepted([])
  }

  /**
   * ── VISA CONTEXTUAL ACTION ──────────────────────────────────────────
   * /admin/marketing/whatsapp?visaApplicationId=<id> opens this wizard
   * with that ONE applicant pre-selected as the INTENDED recipient.
   *
   * It pre-populates and stops there. No template is chosen, no preview is
   * approved, and nothing is queued: the staff member still walks every
   * step and presses the final button themselves. Nothing on this page
   * sends on mount, and the server would refuse anyway — queueing requires
   * a template, a non-zero server-computed eligible count and an explicit
   * POST to …/schedule.
   *
   * Read from window.location rather than useSearchParams so this client
   * page needs no Suspense boundary at build time.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = new URLSearchParams(window.location.search).get('visaApplicationId')
    if (!id) return
    let cancelled = false
    void (async () => {
      const r = await fetch(
        `/api/admin/marketing/whatsapp-broadcast/recipients/visa-applications?id=${encodeURIComponent(id)}`,
      )
      if (!r.ok) return
      const d = (await r.json()) as VisaSearchResponse
      const app = d.applications?.[0]
      if (!app || cancelled) return
      setShowNew(true)
      setStep(1)
      setTab('visa')
      setSelectedVisa([app])
      setName(n => n || `WhatsApp — ${app.name ?? app.referenceNumber}`)
      setMessage(m => m || `Single-recipient WhatsApp template for visa application ${app.referenceNumber}.`)
    })()
    return () => { cancelled = true }
  }, [])

  /** Save the draft, then approve + queue it. Two server calls, one click. */
  async function queueBroadcast() {
    if (submitting) return              // client half of the double-submit guard
    setSubmitting(true)
    setWizardError('')
    try {
      const createRes = await fetch('/api/admin/marketing/whatsapp-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, message, targetFilter, audienceSelection, ...templatePayload,
          scheduledAt: sendMode === 'schedule' ? scheduledAt : undefined,
        }),
      })
      const created = (await createRes.json()) as { broadcast?: Broadcast; error?: string; details?: string[] }
      if (!createRes.ok || !created.broadcast) {
        throw new Error([created.error, ...(created.details ?? [])].filter(Boolean).join(' — ') || 'Could not save broadcast')
      }

      const queueRes = await fetch(`/api/admin/marketing/whatsapp-broadcast/${created.broadcast.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: sendMode,
          scheduledAt: sendMode === 'schedule' ? scheduledAt : undefined,
          // The count the human actually saw. The server re-computes and
          // rejects the request if the audience moved in the meantime.
          confirmedCount: confirmPreview?.breakdown.finalSendCount,
        }),
      })
      const queued = (await queueRes.json()) as { error?: string; details?: string[]; breakdown?: Breakdown }
      if (!queueRes.ok) {
        throw new Error([queued.error, ...(queued.details ?? [])].filter(Boolean).join(' — ') || 'Could not queue broadcast')
      }

      setSaveMsg(sendMode === 'schedule' ? 'Scheduled.' : 'Queued — the sender picks it up within 5 minutes.')
      setShowNew(false)
      resetWizard()
      await loadBroadcasts()
    } catch (e) {
      setWizardError(e instanceof Error ? e.message : 'Could not queue broadcast')
    } finally {
      setSubmitting(false)
      setTimeout(() => setSaveMsg(''), 6000)
    }
  }

  async function cancelBroadcast(id: string) {
    const r = await fetch(`/api/admin/marketing/whatsapp-broadcast/${id}/cancel`, { method: 'POST' })
    const d = (await r.json()) as { error?: string }
    setSaveMsg(r.ok ? 'Broadcast cancelled.' : d.error ?? 'Could not cancel')
    await loadBroadcasts()
    if (detailId === id) {
      const dr = await fetch(`/api/admin/marketing/whatsapp-broadcast/${id}`)
      setDetail((await dr.json()) as DetailResponse)
    }
    setTimeout(() => setSaveMsg(''), 6000)
  }

  // ── Per-step validity (Quote Builder convention) ──────────────────────
  // A campaign must now name SOMEBODY — an individual, a group from an
  // explicitly resolved filter, or a manual number. There is no shape here
  // that means "everyone".
  const step1Valid = name.trim().length > 0 && message.trim().length > 0 && hasAnySelection
  const selectedTemplate = templates.find(t => t.contentSid === contentSid)
  const step2Valid = /^HX[0-9a-f]{32}$/.test(contentSid.trim()) &&
                     params.every(p => (p.kind === 'static' ? p.value.trim().length > 0 : LEAD_FIELDS.includes(p.value as typeof LEAD_FIELDS[number]))) &&
                     // A selected catalogue template's variable count must match the
                     // params rows exactly — otherwise Twilio rejects EVERY recipient
                     // at actual dispatch time, after the audience snapshot is already
                     // spent. Skipped when the template isn't in the loaded catalogue
                     // (e.g. an existing draft's contentSid predates this account's
                     // current catalogue) rather than blocking on a fetch that may fail.
                     (!selectedTemplate || params.length === selectedTemplate.variableKeys.length)
  const step3Valid = !!preview && preview.templateValid && preview.breakdown.finalSendCount > 0
  const step4Valid = sendMode === 'send' || (!!scheduledAt && new Date(scheduledAt).getTime() > Date.now())

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50'
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1'

  return (
    <div className="space-y-5 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">WhatsApp Broadcasts</h1>
            <p className="text-sm text-gray-500">Consent-checked campaigns sent as approved WhatsApp templates</p>
          </div>
        </div>
        <button
          onClick={() => { setShowNew(!showNew); if (!showNew) resetWizard() }}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm transition"
        >
          <Plus className="w-4 h-4" /> New Broadcast
        </button>
      </div>

      {/* ── Readiness banner — server-derived, PRESENT/MISSING only ───── */}
      {readiness && (
        readiness.canSend ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-700">WhatsApp sending is configured</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Delivery and read receipts will be recorded from Twilio’s status callbacks.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-700">WhatsApp sending is not configured</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Set{' '}
                {readiness.missing.map((m, i) => (
                  <span key={m}>
                    {i > 0 && ', '}
                    <code className="bg-amber-100 px-1 rounded">{m}</code>
                  </span>
                ))}{' '}
                in the Vercel environment. Broadcasts can be drafted, but queueing is refused by the server until then.
              </p>
            </div>
          </div>
        )
      )}

      {saveMsg && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
          <p className="text-xs text-gray-700">{saveMsg}</p>
        </div>
      )}

      {/* ── Wizard ────────────────────────────────────────────────────── */}
      {showNew && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 flex-wrap">
            <h2 className="font-semibold text-gray-900 text-sm">New Broadcast</h2>
            <StepIndicator current={step} />
            <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">

            {/* ── Step 1 — Audience ──────────────────────────────────── */}
            {step === 1 && (
              <>
                <div>
                  <label className={labelCls}>Broadcast Name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. UK Visa Reminder — July 2026"
                    className={inputCls}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls}>Internal Description</label>
                    <button
                      onClick={() => setShowJade(!showJade)}
                      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                    >
                      <Sparkles className="w-3 h-3" /> Ask Jade for ideas
                    </button>
                  </div>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={3}
                    placeholder="What this campaign is for. Internal only."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50 resize-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Internal note only — never sent. The message clients receive is the approved WhatsApp template chosen in the next step.
                  </p>
                </div>

                {showJade && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-amber-700">Ask Jade for WhatsApp ideas</p>
                    <p className="text-[11px] text-amber-600">
                      Jade only drafts copy here. Jade cannot queue, schedule or send a broadcast.
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={jadeQ}
                        onChange={e => setJadeQ(e.target.value)}
                        placeholder="e.g. Ideas for a summer visa-deals template…"
                        className="flex-1 border border-amber-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                        onKeyDown={e => e.key === 'Enter' && void askJade()}
                      />
                      <button
                        onClick={() => void askJade()}
                        disabled={jadeLoading || !jadeQ.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                      >
                        {jadeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {jadeIdeas && (
                      <div className="bg-white border border-amber-100 rounded-xl p-3">
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{jadeIdeas}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Choose recipients — three sources, one tray ────── */}
                <div>
                  <label className={`${labelCls} mb-2`}>Choose Recipients</label>

                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {([
                      { k: 'leads',  label: 'Clients & Leads',   Icon: Users },
                      { k: 'visa',   label: 'Visa Applications', Icon: FileText },
                      { k: 'manual', label: 'Add Numbers',       Icon: Phone },
                    ] as const).map(t => (
                      <button
                        key={t.k}
                        onClick={() => setTab(t.k)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                          tab === t.k ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <t.Icon className="w-3.5 h-3.5" /> {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mb-3 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-gray-500 leading-snug">
                      Anyone can be searched and selected here, whatever their consent status — so you can build the list
                      and then see exactly who is excluded. Whether each person can actually be sent to is worked out
                      separately by the server, on the Preview step and again when you approve.
                    </p>
                  </div>

                  {/* ── Tab: Clients & Leads ─────────────────────────── */}
                  {tab === 'leads' && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            value={leadQuery}
                            onChange={e => setLeadQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && void searchLeads()}
                            placeholder="Search by name, email or phone…"
                            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50"
                          />
                        </div>
                        <button
                          onClick={() => void searchLeads()}
                          disabled={leadSearching}
                          className="px-3 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                        >
                          {leadSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="relative">
                          <select
                            value={filterCountry}
                            onChange={e => setFilterCountry(e.target.value)}
                            className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/50 pr-8"
                          >
                            {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        <div className="relative">
                          <select
                            value={filterService}
                            onChange={e => setFilterService(e.target.value)}
                            className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/50 pr-8"
                          >
                            {SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Service filters on the lead record. There is no stored country field, so country is derived from
                        the dialling prefix of each lead’s WhatsApp number.
                      </p>

                      {leadResults.length > 0 && (
                        <>
                          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-72 overflow-y-auto">
                            {leadResults.map(l => {
                              const picked = selectedLeads.some(x => x.id === l.id)
                              return (
                                <button
                                  key={l.id}
                                  onClick={() => toggleLead(l)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition text-left"
                                >
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    picked ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300'
                                  }`}>
                                    {picked && <Check className="w-3 h-3 text-white" />}
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-sm text-gray-900 truncate">{l.name ?? '(no name)'}</span>
                                    <span className="block text-[11px] text-gray-400 truncate">
                                      {l.normalizedNumber ?? l.email ?? '—'}{l.service ? ` · ${l.service}` : ''}
                                    </span>
                                  </span>
                                  <ConsentChip optedOut={l.optedOut} consentStatus={l.consentStatus} hasValidNumber={l.hasValidNumber} />
                                </button>
                              )
                            })}
                          </div>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-[11px] text-gray-400">
                              Showing {leadResults.length}{leadTruncated ? ' (first page)' : ''} of {leadTotal} matching this filter
                              {leadCountBeforeCountry ? ', counted before the country prefix filter' : ''}.
                            </p>
                            <button
                              onClick={() => setUseLeadFilter(v => !v)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                                useLeadFilter ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              {useLeadFilter ? '✓ All matching this filter included' : `Select all ${leadTotal} matching this filter`}
                            </button>
                          </div>
                        </>
                      )}
                      {leadResults.length === 0 && !leadSearching && (
                        <p className="text-xs text-gray-400">Search to list clients and leads.</p>
                      )}
                    </div>
                  )}

                  {/* ── Tab: Visa Applications ───────────────────────── */}
                  {tab === 'visa' && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            value={visaQuery}
                            onChange={e => setVisaQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && void searchVisa()}
                            placeholder="Search by name, email, phone or reference…"
                            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50"
                          />
                        </div>
                        <button
                          onClick={() => void searchVisa()}
                          disabled={visaSearching}
                          className="px-3 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                        >
                          {visaSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <input
                          value={visaDest}
                          onChange={e => setVisaDest(e.target.value.toUpperCase().slice(0, 2))}
                          placeholder="Destination (GB)"
                          className={inputCls}
                        />
                        <input
                          value={visaType}
                          onChange={e => setVisaType(e.target.value)}
                          placeholder="Visa type (tourist)"
                          className={inputCls}
                        />
                        <div className="relative">
                          <select
                            value={visaStatus}
                            onChange={e => setVisaStatus(e.target.value)}
                            className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/50 pr-8"
                          >
                            {VISA_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        <input type="date" value={visaFrom} onChange={e => setVisaFrom(e.target.value)} className={inputCls} />
                        <input type="date" value={visaTo} onChange={e => setVisaTo(e.target.value)} className={inputCls} />
                      </div>
                      <p className="text-[11px] text-gray-400">
                        Destination, visa type, status, branch and application date are real stored fields on the visa
                        application. The applicant’s existing contact number is used — no new client record is created.
                      </p>

                      {visaResults.length > 0 && (
                        <>
                          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-72 overflow-y-auto">
                            {visaResults.map(v => {
                              const picked = selectedVisa.some(x => x.id === v.id)
                              return (
                                <button
                                  key={v.id}
                                  onClick={() => toggleVisa(v)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition text-left"
                                >
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    picked ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300'
                                  }`}>
                                    {picked && <Check className="w-3 h-3 text-white" />}
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-sm text-gray-900 truncate">{v.name ?? v.referenceNumber}</span>
                                    <span className="block text-[11px] text-gray-400 truncate">
                                      {v.referenceNumber} · {v.destinationIso2} {v.visaType} · {v.status.replace(/_/g, ' ')}
                                      {v.normalizedNumber ? ` · ${v.normalizedNumber}` : ''}
                                    </span>
                                  </span>
                                  <ConsentChip optedOut={v.optedOut} consentStatus={v.consentStatus} hasValidNumber={v.hasValidNumber} />
                                </button>
                              )
                            })}
                          </div>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-[11px] text-gray-400">
                              Showing {visaResults.length}{visaTruncated ? ' (first page)' : ''} of {visaTotal} matching this filter.
                            </p>
                            <button
                              onClick={() => setUseVisaFilter(v => !v)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                                useVisaFilter ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              {useVisaFilter ? '✓ All matching this filter included' : `Select all ${visaTotal} matching this filter`}
                            </button>
                          </div>
                        </>
                      )}
                      {visaResults.length === 0 && !visaSearching && (
                        <p className="text-xs text-gray-400">Search to list visa applications.</p>
                      )}
                    </div>
                  )}

                  {/* ── Tab: Add Numbers ─────────────────────────────── */}
                  {tab === 'manual' && (
                    <div className="space-y-3">
                      <textarea
                        value={manualBlob}
                        onChange={e => setManualBlob(e.target.value)}
                        rows={4}
                        placeholder={'+2348012345678 | Ada Obi\n+233201234567\n+254712345678, +27821234567'}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400/50 resize-none"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => void checkManualNumbers()}
                          disabled={manualChecking || !manualBlob.trim()}
                          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                        >
                          {manualChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          Add WhatsApp Numbers
                        </button>
                        <p className="text-[11px] text-gray-400">
                          One per line, or comma/semicolon separated. Optional name after “|”. Checked and normalized on
                          the server.
                        </p>
                      </div>

                      {manualReport && (
                        <div className="space-y-2">
                          {manualReport.invalid.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                              <p className="text-xs font-semibold text-red-700">
                                {manualReport.invalid.length} entr{manualReport.invalid.length === 1 ? 'y' : 'ies'} rejected
                              </p>
                              <ul className="text-[11px] text-red-600 mt-1 space-y-0.5">
                                {manualReport.invalid.slice(0, 10).map((x, i) => (
                                  <li key={`${x.raw}-${i}`}><code>{x.raw || '(empty)'}</code> — {x.reason}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {manualReport.duplicates.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                              <p className="text-xs text-amber-700">
                                {manualReport.duplicates.length} duplicate{manualReport.duplicates.length === 1 ? '' : 's'} in
                                this paste were collapsed — a number receives one message however many times it appears.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <p className="text-[11px] text-amber-700 leading-snug">
                          Typing a number here creates no client record and no consent. It is checked against the real
                          WhatsApp consent table exactly like a stored contact: with no recorded consent for that number,
                          it will be excluded at preview.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Shared selected-recipients tray ──────────────── */}
                  <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-700">
                        Selected recipients · {trayCount}
                        {(useLeadFilter || useVisaFilter) && ' + filter groups'}
                      </p>
                      {(trayCount > 0 || useLeadFilter || useVisaFilter) && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleExportContacts}
                            disabled={exporting || !hasAnySelection}
                            className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-walz-navy disabled:opacity-50"
                            title="Export the current selection as CSV — this does not grant marketing consent"
                          >
                            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            Export Contacts
                          </button>
                          <button
                            onClick={() => {
                              setSelectedLeads([]); setSelectedVisa([]); setManualAccepted([])
                              setUseLeadFilter(false); setUseVisaFilter(false)
                            }}
                            className="text-[11px] font-semibold text-gray-400 hover:text-red-500"
                          >
                            Clear all
                          </button>
                        </div>
                      )}
                    </div>
                    {exportError && (
                      <p className="px-3 py-2 text-[11px] text-red-600 bg-red-50 border-b border-red-100">{exportError}</p>
                    )}
                    <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                      {useLeadFilter && (
                        <div className="flex items-center gap-2 px-3 py-2">
                          <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="flex-1 text-xs text-gray-700">
                            All leads matching: {filterService || 'any service'}
                            {filterCountry ? ` · ${filterCountry}` : ''} ({leadTotal} matched)
                          </span>
                          <button onClick={() => setUseLeadFilter(false)} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {useVisaFilter && (
                        <div className="flex items-center gap-2 px-3 py-2">
                          <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="flex-1 text-xs text-gray-700">
                            All visa applications matching: {visaDest || 'any destination'}
                            {visaStatus ? ` · ${visaStatus.replace(/_/g, ' ')}` : ''} ({visaTotal} matched)
                          </span>
                          <button onClick={() => setUseVisaFilter(false)} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {selectedLeads.map(l => (
                        <div key={`l-${l.id}`} className="flex items-center gap-2 px-3 py-2">
                          <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">
                            {l.name ?? '(no name)'} · {l.normalizedNumber ?? 'no valid number'}
                          </span>
                          <ConsentChip optedOut={l.optedOut} consentStatus={l.consentStatus} hasValidNumber={l.hasValidNumber} />
                          <button onClick={() => toggleLead(l)} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {selectedVisa.map(v => (
                        <div key={`v-${v.id}`} className="flex items-center gap-2 px-3 py-2">
                          <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">
                            {v.name ?? v.referenceNumber} · {v.normalizedNumber ?? 'no valid number'}
                          </span>
                          <ConsentChip optedOut={v.optedOut} consentStatus={v.consentStatus} hasValidNumber={v.hasValidNumber} />
                          <button onClick={() => toggleVisa(v)} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {manualAccepted.map(m => (
                        <div key={`m-${m.normalizedNumber}`} className="flex items-center gap-2 px-3 py-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">
                            {m.displayName ? `${m.displayName} · ` : ''}{m.normalizedNumber}
                          </span>
                          <ConsentChip optedOut={false} consentStatus={m.consentStatus ?? 'UNKNOWN'} hasValidNumber />
                          <button
                            onClick={() => setManualAccepted(prev => prev.filter(x => x.normalizedNumber !== m.normalizedNumber))}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {trayCount === 0 && !useLeadFilter && !useVisaFilter && (
                        <p className="px-3 py-4 text-xs text-gray-400 text-center">
                          Nobody selected yet. Pick people from any of the three tabs above.
                        </p>
                      )}
                    </div>
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                      <p className="text-[11px] text-gray-400 leading-snug">
                        The same person selected from more than one source is one recipient: the list is de-duplicated by
                        WhatsApp number on the server, and each number receives exactly one message.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Step 2 — Template ──────────────────────────────────── */}
            {step === 2 && (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-600">
                    Broadcasts are sent only as WhatsApp templates already approved on your account. There is no
                    free-text fallback: if the template is rejected, the send fails and is reported — it is never
                    downgraded to a plain message.
                  </p>
                </div>

                <div>
                  <label className={labelCls}>WhatsApp Template</label>
                  {templatesLoading && <p className="text-xs text-gray-400">Loading approved templates…</p>}
                  {!templatesLoading && templatesError && (
                    <p className="text-xs text-red-600">{templatesError}</p>
                  )}
                  {!templatesLoading && !templatesError && templates.length === 0 && (
                    <p className="text-xs text-gray-400">No approved WhatsApp templates found on this account yet.</p>
                  )}
                  {!templatesLoading && templates.length > 0 && (
                    <div className="relative sm:max-w-md">
                      <select
                        value={contentSid}
                        onChange={e => {
                          const sid = e.target.value
                          setContentSid(sid)
                          // Switching templates invalidates whatever param rows were
                          // built for the PREVIOUS template's variable count — reset
                          // to exactly the new template's count rather than leaving
                          // stale rows that silently mismatch at dispatch time.
                          const t = templates.find(x => x.contentSid === sid)
                          setParams(t ? t.variableKeys.map(() => ({ kind: 'lead_field', value: 'name', fallback: 'there' })) : [])
                        }}
                        className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/50 pr-8"
                      >
                        <option value="">Select an approved template…</option>
                        {templates.map(t => (
                          <option key={t.contentSid} value={t.contentSid}>
                            {t.friendlyName}{t.category ? ` (${t.category})` : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  )}
                  {contentSid && selectedTemplate && (
                    <p className={`text-[11px] mt-1 ${params.length === selectedTemplate.variableKeys.length ? 'text-gray-400' : 'text-amber-600'}`}>
                      {selectedTemplate.variableKeys.length
                        ? `This template has ${selectedTemplate.variableKeys.length} placeholder${selectedTemplate.variableKeys.length === 1 ? '' : 's'} — add exactly that many parameters below, in order.`
                        : 'This template has no placeholders — no parameters needed below.'}
                      {params.length !== selectedTemplate.variableKeys.length &&
                        ` You currently have ${params.length}.`}
                    </p>
                  )}
                </div>

                {/* ── Recorded template category — bookkeeping ONLY ──────── */}
                <div>
                  <label className={labelCls}>WhatsApp Template Category (recorded only)</label>
                  <div className="relative sm:max-w-xs">
                    <select
                      value={templateCategory}
                      onChange={e => setTemplateCategory(e.target.value)}
                      className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/50 pr-8"
                    >
                      {TEMPLATE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-700 leading-snug">
                      This is stored for your own records and changes nothing about who can be messaged. Every broadcast
                      built here requires full recorded WhatsApp consent, whichever category you pick — WhatsApp decides
                      a template’s real category at approval, and a category picked here cannot be verified, so it is
                      never used to relax a consent check.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelCls}>Body Parameters</label>
                    <button
                      onClick={() => setParams(p => [...p, { kind: 'lead_field', value: 'name', fallback: 'there' }])}
                      className="text-xs font-semibold text-green-600 hover:text-green-700"
                    >
                      + Add parameter
                    </button>
                  </div>
                  {params.length === 0 && (
                    <p className="text-xs text-gray-400">No parameters — the template body has no {'{{1}}'} placeholders.</p>
                  )}
                  <div className="space-y-2">
                    {params.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-gray-400 w-10 shrink-0">{`{{${i + 1}}}`}</span>
                        <div className="relative">
                          <select
                            value={p.kind}
                            onChange={e => setParams(list => list.map((row, j) =>
                              j === i ? { ...row, kind: e.target.value as ParamRow['kind'], value: e.target.value === 'lead_field' ? 'name' : '' } : row))}
                            className="appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-green-400/50"
                          >
                            <option value="lead_field">Lead field</option>
                            <option value="static">Fixed text</option>
                          </select>
                          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                        {p.kind === 'lead_field' ? (
                          <>
                            <div className="relative">
                              <select
                                value={p.value}
                                onChange={e => setParams(list => list.map((row, j) => (j === i ? { ...row, value: e.target.value } : row)))}
                                className="appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-green-400/50"
                              >
                                {LEAD_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                              </select>
                              <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                            <input
                              value={p.fallback}
                              onChange={e => setParams(list => list.map((row, j) => (j === i ? { ...row, fallback: e.target.value } : row)))}
                              placeholder="fallback"
                              className="flex-1 min-w-[8rem] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50"
                            />
                          </>
                        ) : (
                          <input
                            value={p.value}
                            onChange={e => setParams(list => list.map((row, j) => (j === i ? { ...row, value: e.target.value } : row)))}
                            placeholder="Fixed text"
                            className="flex-1 min-w-[8rem] border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50"
                          />
                        )}
                        <button
                          onClick={() => setParams(list => list.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    The list above already only shows templates WhatsApp has approved — but approval status can change
                    between now and send time. If that happens, the send fails and is reported here, never silently
                    downgraded to a plain-text message.
                  </p>
                </div>
              </>
            )}

            {/* ── Step 3 — Preview ───────────────────────────────────── */}
            {step === 3 && (
              <>
                {previewLoading && (
                  <div className="py-10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                  </div>
                )}
                {!previewLoading && preview && (
                  <>
                    <BreakdownGrid b={preview.breakdown} />
                    {preview.breakdown.bySource && (
                      <SourceCounts bySource={preview.breakdown.bySource} title="Selected from each source" />
                    )}
                    {preview.breakdown.sendableBySource && preview.breakdown.finalSendCount > 0 && (
                      <SourceCounts bySource={preview.breakdown.sendableBySource} title="Sendable from each source" />
                    )}
                    {preview.exclusions && <ExclusionList buckets={preview.exclusions} />}
                    {preview.sample && preview.sample.length > 0 && (
                      <div>
                        <p className={labelCls}>Sample of resolved recipients</p>
                        <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                          {preview.sample.map((s, i) => (
                            <div key={`${s.maskedNumber}-${i}`} className="px-3 py-2">
                              <p className="text-xs text-gray-700">
                                <span className="font-mono">{s.maskedNumber}</span>
                                {s.displayName ? ` · ${s.displayName}` : ''}
                                {' · '}
                                <span className="font-semibold">{s.status.replace(/_/g, ' ').toLowerCase()}</span>
                                {s.sources && s.sources.length > 0 && (
                                  <span className="text-gray-400">
                                    {' '}· from {s.sources.map(x => SOURCE_LABELS[x] ?? x).join(' + ')}
                                  </span>
                                )}
                              </p>
                              {s.reason && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{s.reason}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {preview.consentNotice && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700">{preview.consentNotice}</p>
                      </div>
                    )}
                    {preview.templateErrors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <p className="text-xs font-semibold text-red-700">Template problems</p>
                        <ul className="text-xs text-red-600 mt-1 list-disc pl-4 space-y-0.5">
                          {preview.templateErrors.map(e => <li key={e}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                    {preview.breakdown.finalSendCount === 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <p className="text-xs font-semibold text-red-700">Nobody is eligible</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          No matching recipient has a recorded WhatsApp marketing consent. Not having opted out is not
                          the same as having opted in, so this campaign cannot be queued.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Step 4 — Schedule ──────────────────────────────────── */}
            {step === 4 && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSendMode('send')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition border ${
                      sendMode === 'send' ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    <Send className="w-4 h-4" /> Queue now
                  </button>
                  <button
                    onClick={() => setSendMode('schedule')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition border ${
                      sendMode === 'schedule' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    <Clock className="w-4 h-4" /> Schedule
                  </button>
                </div>

                {sendMode === 'schedule' && (
                  <div>
                    <label className={labelCls}>Send At</label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  Nothing is sent by this browser request. Approving writes a frozen recipient list, and a background
                  sender dispatches it in small batches. A scheduled or queued campaign can be cancelled until the
                  sender starts on it.
                </p>
              </>
            )}

            {/* ── Step 5 — Confirmation ──────────────────────────────── */}
            {step === 5 && (
              <>
                {previewLoading && (
                  <div className="py-10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                  </div>
                )}
                {!previewLoading && confirmPreview && (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-center">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">
                        Final eligible recipients
                      </p>
                      <p className="text-4xl font-bold text-green-700 mt-1">
                        {confirmPreview.breakdown.finalSendCount}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        Re-checked on the server just now — not carried over from the preview step.
                      </p>
                    </div>
                    <BreakdownGrid b={confirmPreview.breakdown} />
                    {confirmPreview.exclusions && <ExclusionList buckets={confirmPreview.exclusions} />}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1">
                      <p className="text-xs text-gray-600"><b>Campaign:</b> {name}</p>
                      <p className="text-xs text-gray-600">
                        <b>Template:</b> {templates.find(t => t.contentSid === contentSid)?.friendlyName ?? contentSid}
                        {templateCategory ? ` · recorded as ${templateCategory}` : ''}
                      </p>
                      <p className="text-xs text-gray-600">
                        <b>Recipients:</b> {trayCount} individually selected
                        {useLeadFilter ? ' + all leads matching the filter' : ''}
                        {useVisaFilter ? ' + all visa applications matching the filter' : ''}
                      </p>
                      <p className="text-xs text-gray-600">
                        <b>Timing:</b> {sendMode === 'schedule' ? `Scheduled for ${scheduledAt}` : 'Queued immediately'}
                      </p>
                    </div>
                    {confirmPreview.breakdown.finalSendCount !== preview?.breakdown.finalSendCount && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <p className="text-xs text-amber-700">
                          The audience changed since the preview step ({preview?.breakdown.finalSendCount} → {confirmPreview.breakdown.finalSendCount}).
                          The number above is the one that will be used.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {wizardError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-xs text-red-700">{wizardError}</p>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="px-5 pb-5 flex gap-2 justify-between border-t border-gray-100 pt-4 flex-wrap">
            <button
              onClick={() => setStep(s => (Math.max(1, s - 1) as Step))}
              disabled={step === 1 || submitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded-xl transition disabled:opacity-40"
            >
              ← Back
            </button>

            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl transition disabled:opacity-50"
              >
                Choose template →
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => { setStep(3); void runPreview('step') }}
                disabled={!step2Valid}
                className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl transition disabled:opacity-50"
              >
                Preview audience →
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => setStep(4)}
                disabled={!step3Valid || previewLoading}
                className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl transition disabled:opacity-50"
              >
                Choose timing →
              </button>
            )}
            {step === 4 && (
              <button
                onClick={() => { setStep(5); void runPreview('confirm') }}
                disabled={!step4Valid}
                className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl transition disabled:opacity-50"
              >
                Review &amp; confirm →
              </button>
            )}
            {step === 5 && (
              <button
                onClick={() => void queueBroadcast()}
                disabled={
                  submitting || previewLoading ||
                  !confirmPreview || confirmPreview.breakdown.finalSendCount === 0 ||
                  !readiness?.canSend
                }
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition disabled:opacity-50 ${
                  sendMode === 'schedule' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : sendMode === 'schedule' ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {submitting
                  ? 'Queueing…'
                  : sendMode === 'schedule'
                  ? `Schedule for ${confirmPreview?.breakdown.finalSendCount ?? 0}`
                  : `Queue ${confirmPreview?.breakdown.finalSendCount ?? 0} message${confirmPreview?.breakdown.finalSendCount === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Detail ────────────────────────────────────────────────────── */}
      {detail && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">{detail.broadcast.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {detail.broadcast.contentSid
                  ? `Template ${templates.find(t => t.contentSid === detail.broadcast.contentSid)?.friendlyName ?? detail.broadcast.contentSid}`
                  : detail.broadcast.templateName
                    ? `Template ${detail.broadcast.templateName} (${detail.broadcast.templateLanguage}) · legacy`
                    : 'No template set'}
              </p>
            </div>
            <button onClick={() => setDetailId(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Queued"    value={detail.counts.queued} />
              <Stat label="Sending"   value={detail.counts.sending} />
              <Stat label="Sent"      value={detail.counts.dispatched} tone="good" />
              <Stat label="Delivered" value={detail.counts.deliveredOrBetter} tone="good" />
              <Stat label="Read"      value={detail.counts.read} tone="good" />
              <Stat label="Failed"    value={detail.counts.failed} tone={detail.counts.failed > 0 ? 'bad' : undefined} />
              <Stat label="Skipped"   value={detail.counts.skipped} tone="warn" />
              <Stat label="Total"     value={detail.counts.total} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Delivery rate</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{detail.rates.deliveryPct}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Read rate</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{detail.rates.readPct}%</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Failure rate</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{detail.rates.failurePct}%</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Stat label="Skipped — opted out"     value={detail.counts.skippedOptOut} />
              <Stat label="Skipped — no consent"    value={detail.counts.skippedNoConsent} />
              <Stat label="Skipped — bad number"    value={detail.counts.skippedInvalidNumber} />
            </div>

            {detail.bySource && detail.bySource.length > 0 && (
              <SourceCounts
                bySource={Object.fromEntries(detail.bySource.map(s => [s.sourceType, s.count]))}
                title="Recipients by source (from the frozen snapshot)"
              />
            )}

            {detail.failureReasons.length > 0 && (
              <div>
                <p className={labelCls}>Failure reasons</p>
                <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                  {detail.failureReasons.map(f => (
                    <div key={f.code} className="px-3 py-2">
                      <p className="text-xs font-semibold text-gray-700">{f.code} · {f.count}</p>
                      {f.example && <p className="text-[11px] text-gray-500 mt-0.5">{f.example}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(detail.broadcast.status === 'SCHEDULED' || detail.broadcast.status === 'QUEUED') && (
              <button
                onClick={() => void cancelBroadcast(detail.broadcast.id)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-xl transition"
              >
                <Ban className="w-4 h-4" /> Cancel this broadcast
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Past Broadcasts</h2>
        </div>
        {loading ? (
          <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
        ) : broadcasts.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No broadcasts yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {broadcasts.map(b => (
              <button
                key={b.id}
                onClick={() => setDetailId(b.id === detailId ? null : b.id)}
                className="w-full text-left flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{b.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {b.contentSid
                      ? (templates.find(t => t.contentSid === b.contentSid)?.friendlyName ?? b.contentSid)
                      : b.templateName ? `${b.templateName} · ${b.templateLanguage} · legacy` : 'No template'} · {b.message.slice(0, 60)}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {b.status.replace('_', ' ')}
                </span>
                {b.recipientCount > 0 ? (
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> {b.sentCount}/{b.recipientCount}
                    </p>
                    <p className="text-[10px] text-gray-400">{fmtDate(b.sentAt ?? b.createdAt)}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 shrink-0">{fmtDate(b.createdAt)}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
