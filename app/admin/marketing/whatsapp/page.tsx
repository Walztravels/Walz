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

import { useState, useEffect, useCallback } from 'react'
import {
  MessageSquare, Plus, Loader2, Sparkles, Send, Clock, CheckCircle, X, ChevronDown,
  ShieldAlert, ShieldCheck, Check, AlertTriangle, Ban,
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
}

type PreviewResponse = {
  breakdown: Breakdown
  templateValid: boolean
  templateErrors: string[]
  consentNotice: string | null
  error?: string
}

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

const STEPS = [
  { label: 'Audience',  sub: 'Who receives this' },
  { label: 'Template',  sub: 'Approved Meta template' },
  { label: 'Preview',   sub: 'Real eligible counts' },
  { label: 'Schedule',  sub: 'Now or later' },
  { label: 'Confirm',   sub: 'Final check' },
] as const

type Step = 1 | 2 | 3 | 4 | 5

type ParamRow = { kind: 'static' | 'lead_field'; value: string; fallback: string }

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
      <Stat label="Total matched"   value={b.totalMatched} />
      <Stat label="Eligible"        value={b.eligible} tone={b.eligible > 0 ? 'good' : 'warn'} />
      <Stat label="Opted out"       value={b.optedOut} />
      <Stat label="Missing consent" value={b.missingConsent} tone={b.missingConsent > 0 ? 'warn' : undefined} />
      <Stat label="Invalid number"  value={b.invalidNumber} />
      <Stat label="Duplicates removed" value={b.duplicatesRemoved} />
      <Stat label="Country filtered"   value={b.countryFiltered} />
      <Stat label="Final send count"   value={b.finalSendCount} tone={b.finalSendCount > 0 ? 'good' : 'bad'} />
    </div>
  )
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
  const [templateName, setTemplateName]   = useState('')
  const [templateLanguage, setTemplateLanguage] = useState('en')
  const [params, setParams]             = useState<ParamRow[]>([])
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
    if (!detailId) { setDetail(null); return }
    void fetch(`/api/admin/marketing/whatsapp-broadcast/${detailId}`)
      .then(r => r.json())
      .then((d: DetailResponse) => setDetail(d))
  }, [detailId])

  const targetFilter = {
    ...(filterCountry && { country: filterCountry }),
    ...(filterService && { service: filterService }),
  }

  const templatePayload = {
    templateName: templateName.trim(),
    templateLanguage: templateLanguage.trim(),
    templateParams: params.map(p =>
      p.kind === 'static'
        ? { type: 'static' as const, value: p.value }
        : { type: 'lead_field' as const, field: p.value, ...(p.fallback ? { fallback: p.fallback } : {}) },
    ),
  }

  async function runPreview(target: 'step' | 'confirm') {
    setPreviewLoading(true)
    setWizardError('')
    try {
      const r = await fetch('/api/admin/marketing/whatsapp-broadcast/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetFilter, ...templatePayload }),
      })
      const d = (await r.json()) as PreviewResponse
      if (target === 'confirm') setConfirmPreview(d)
      else setPreview(d)
      return d
    } finally {
      setPreviewLoading(false)
    }
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
    setTemplateName(''); setTemplateLanguage('en'); setParams([]); setScheduledAt('')
    setSendMode('send'); setPreview(null); setConfirmPreview(null); setWizardError('')
  }

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
          name, message, targetFilter, ...templatePayload,
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
  const step1Valid = name.trim().length > 0 && message.trim().length > 0
  const step2Valid = /^[a-z0-9_]{1,512}$/.test(templateName.trim()) &&
                     /^[a-z]{2,3}(_[A-Z]{2})?$/.test(templateLanguage.trim()) &&
                     params.every(p => (p.kind === 'static' ? p.value.trim().length > 0 : LEAD_FIELDS.includes(p.value as typeof LEAD_FIELDS[number])))
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
            <p className="text-sm text-gray-500">Consent-checked campaigns sent as approved Meta templates</p>
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
                {readiness.canReceiveStatusCallbacks
                  ? 'Delivery and read receipts will be recorded from Meta’s status callbacks.'
                  : 'Delivery receipts are unavailable: the webhook secrets are not both set, so sent/delivered/read callbacks cannot be authenticated.'}
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
                    Internal note only — never sent. The message clients receive is the approved Meta template chosen in the next step.
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

                <div>
                  <label className={`${labelCls} mb-2`}>Target Audience</label>
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
                  <p className="text-xs text-gray-400 mt-1.5">
                    Service filters on the lead record. There is no stored country field, so country is derived from the
                    dialling prefix of each lead’s WhatsApp number.
                  </p>
                </div>
              </>
            )}

            {/* ── Step 2 — Template ──────────────────────────────────── */}
            {step === 2 && (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-600">
                    Broadcasts are sent only as templates Meta has already approved on your WhatsApp Business Account.
                    There is no free-text fallback: if the template is rejected, the send fails and is reported — it is
                    never downgraded to a plain message.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Template Name</label>
                    <input
                      value={templateName}
                      onChange={e => setTemplateName(e.target.value)}
                      placeholder="summer_visa_offer"
                      className={inputCls}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Lowercase letters, digits and underscores.</p>
                  </div>
                  <div>
                    <label className={labelCls}>Language</label>
                    <input
                      value={templateLanguage}
                      onChange={e => setTemplateLanguage(e.target.value)}
                      placeholder="en or en_US"
                      className={inputCls}
                    />
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
                    Whether this template is actually APPROVED on Meta’s side cannot be checked from here — only Meta can
                    confirm that. A rejected template produces a reported failure, never a silent plain-text send.
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
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1">
                      <p className="text-xs text-gray-600"><b>Campaign:</b> {name}</p>
                      <p className="text-xs text-gray-600"><b>Template:</b> {templateName} ({templateLanguage})</p>
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
                {detail.broadcast.templateName
                  ? `Template ${detail.broadcast.templateName} (${detail.broadcast.templateLanguage})`
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
                    {b.templateName ? `${b.templateName} · ${b.templateLanguage}` : 'No template'} · {b.message.slice(0, 60)}
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
