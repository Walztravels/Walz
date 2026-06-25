'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface VFSummary {
  accountHolder: string | null
  bank: string | null
  currency: string
  period: string
  months: number
  openingBalance: number
  openingBalanceConverted: number | null
  closingBalance: number
  closingBalanceConverted: number | null
  averageBalance: number
  averageBalanceConverted: number | null
  lowestBalance: number
  highestBalance: number
  totalCredits: number
  totalDebits: number
  transactionCount: number
  regularIncomeDetected: boolean
  averageMonthlySalary: number
  averageMonthlySalaryConverted: number | null
}

interface VFTransaction {
  date: string
  description: string
  credit: number | null
  debit: number | null
  balance: number | null
  flagged: boolean
  flagReason: string | null
}

interface VFRedFlag {
  id: string
  type: string
  title: string
  description: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  transaction: string | null
  embassyInterpretation: string
}

interface VFAnalysis {
  statementCurrency:        string
  statementCurrencySymbol:  string
  visaCountryCurrency:      string
  visaCountryCurrencySymbol: string
  conversionRate:           string
  meetsVisaRequirement:     boolean | null
  requirementGap:           string
  summary: VFSummary
  approvalScore: number
  scoreGrade: 'A' | 'B' | 'C' | 'D' | 'F'
  approvalLikelihood: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW'
  embassyEye: {
    visaType: string
    passport: string
    officerVerdict: string
    keyStrengths: string[]
    keyWeaknesses: string[]
    similarCasesApprovalRate: number
  }
  redFlags: VFRedFlag[]
  positives: { title: string; description: string }[]
  cashFlowAnalysis: {
    incomeConsistency: string
    spendingPattern: string
    savingsRate: number
    financialStability: string
    balanceTrend: string
  }
  recommendation: string
  suggestedActions: { priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'; action: string; reason: string }[]
  documentsToAdd: string[]
  transactions: VFTransaction[]
}

type Tab = 'overview' | 'redflags' | 'embassy' | 'actions' | 'transactions'

// ─── Safe coercers ─────────────────────────────────────────────────────────────

function safeArr<T>(x: unknown): T[] { return Array.isArray(x) ? (x as T[]) : [] }
function safeStr(x: unknown, fb = ''): string { return typeof x === 'string' ? x : fb }
function safeNum(x: unknown, fb = 0): number { const n = Number(x); return isNaN(n) ? fb : n }

function sanitizeVF(raw: unknown): VFAnalysis {
  const r   = (raw ?? {}) as Record<string, unknown>
  const sum = ((r.summary ?? {}) as Record<string, unknown>)
  const ee  = ((r.embassyEye ?? {}) as Record<string, unknown>)
  const cf  = ((r.cashFlowAnalysis ?? {}) as Record<string, unknown>)

  const grades   = ['A', 'B', 'C', 'D', 'F'] as const
  const likes    = ['HIGH', 'MEDIUM', 'LOW', 'VERY_LOW'] as const
  const sevs     = ['HIGH', 'MEDIUM', 'LOW'] as const
  const pris     = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

  return {
    statementCurrency:        safeStr(r.statementCurrency),
    statementCurrencySymbol:  safeStr(r.statementCurrencySymbol),
    visaCountryCurrency:      safeStr(r.visaCountryCurrency),
    visaCountryCurrencySymbol: safeStr(r.visaCountryCurrencySymbol),
    conversionRate:           safeStr(r.conversionRate),
    meetsVisaRequirement:     r.meetsVisaRequirement != null ? Boolean(r.meetsVisaRequirement) : null,
    requirementGap:           safeStr(r.requirementGap),
    summary: {
      accountHolder:                sum.accountHolder != null ? safeStr(sum.accountHolder) : null,
      bank:                         sum.bank          != null ? safeStr(sum.bank)          : null,
      currency:                     safeStr(sum.currency, 'USD'),
      period:                       safeStr(sum.period,   'Unknown'),
      months:                       safeNum(sum.months,   0),
      openingBalance:               safeNum(sum.openingBalance),
      openingBalanceConverted:      sum.openingBalanceConverted      != null ? safeNum(sum.openingBalanceConverted)      : null,
      closingBalance:               safeNum(sum.closingBalance),
      closingBalanceConverted:      sum.closingBalanceConverted      != null ? safeNum(sum.closingBalanceConverted)      : null,
      averageBalance:               safeNum(sum.averageBalance),
      averageBalanceConverted:      sum.averageBalanceConverted      != null ? safeNum(sum.averageBalanceConverted)      : null,
      lowestBalance:                safeNum(sum.lowestBalance),
      highestBalance:               safeNum(sum.highestBalance),
      totalCredits:                 safeNum(sum.totalCredits),
      totalDebits:                  safeNum(sum.totalDebits),
      transactionCount:             safeNum(sum.transactionCount),
      regularIncomeDetected:        Boolean(sum.regularIncomeDetected),
      averageMonthlySalary:         safeNum(sum.averageMonthlySalary),
      averageMonthlySalaryConverted: sum.averageMonthlySalaryConverted != null ? safeNum(sum.averageMonthlySalaryConverted) : null,
    },
    approvalScore:      Math.min(100, Math.max(0, safeNum(r.approvalScore))),
    scoreGrade:         grades.includes(r.scoreGrade as never)         ? r.scoreGrade         as 'A'|'B'|'C'|'D'|'F'            : 'C',
    approvalLikelihood: likes.includes(r.approvalLikelihood as never)  ? r.approvalLikelihood as 'HIGH'|'MEDIUM'|'LOW'|'VERY_LOW' : 'LOW',
    embassyEye: {
      visaType:                safeStr(ee.visaType,   'Unknown'),
      passport:                safeStr(ee.passport,   'Unknown'),
      officerVerdict:          safeStr(ee.officerVerdict),
      keyStrengths:            safeArr<string>(ee.keyStrengths),
      keyWeaknesses:           safeArr<string>(ee.keyWeaknesses),
      similarCasesApprovalRate: safeNum(ee.similarCasesApprovalRate, 50),
    },
    redFlags: safeArr<Record<string, unknown>>(r.redFlags).map(f => ({
      id:                   safeStr(f.id, Math.random().toString(36).slice(2)),
      type:                 safeStr(f.type),
      title:                safeStr(f.title),
      description:          safeStr(f.description),
      severity:             sevs.includes(f.severity as never) ? f.severity as 'HIGH'|'MEDIUM'|'LOW' : 'LOW',
      transaction:          f.transaction != null ? safeStr(f.transaction) : null,
      embassyInterpretation: safeStr(f.embassyInterpretation),
    })),
    positives: safeArr<Record<string, unknown>>(r.positives).map(p => ({
      title:       safeStr(p.title),
      description: safeStr(p.description),
    })),
    cashFlowAnalysis: {
      incomeConsistency:  safeStr(cf.incomeConsistency),
      spendingPattern:    safeStr(cf.spendingPattern),
      savingsRate:        safeNum(cf.savingsRate),
      financialStability: safeStr(cf.financialStability),
      balanceTrend:       safeStr(cf.balanceTrend),
    },
    recommendation:   safeStr(r.recommendation),
    suggestedActions: safeArr<Record<string, unknown>>(r.suggestedActions).map(a => ({
      priority: pris.includes(a.priority as never) ? a.priority as 'URGENT'|'HIGH'|'MEDIUM'|'LOW' : 'LOW',
      action:   safeStr(a.action),
      reason:   safeStr(a.reason),
    })),
    documentsToAdd: safeArr<string>(r.documentsToAdd),
    transactions:   safeArr<Record<string, unknown>>(r.transactions).map(t => ({
      date:        safeStr(t.date),
      description: safeStr(t.description),
      credit:      t.credit  != null ? safeNum(t.credit)  : null,
      debit:       t.debit   != null ? safeNum(t.debit)   : null,
      balance:     t.balance != null ? safeNum(t.balance) : null,
      flagged:     Boolean(t.flagged),
      flagReason:  t.flagReason != null ? safeStr(t.flagReason) : null,
    })),
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, currency = ''): string {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const str = abs >= 1_000_000
    ? (abs / 1_000_000).toFixed(1) + 'M'
    : abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const prefix = n < 0 ? '-' : ''
  return `${prefix}${currency ? currency + ' ' : ''}${str}`
}

function scoreColor(score: number): string {
  if (score >= 75) return '#22c55e'
  if (score >= 55) return '#f59e0b'
  if (score >= 35) return '#f97316'
  return '#ef4444'
}

function gradeColor(grade: string): string {
  if (grade === 'A') return '#22c55e'
  if (grade === 'B') return '#84cc16'
  if (grade === 'C') return '#f59e0b'
  if (grade === 'D') return '#f97316'
  return '#ef4444'
}

function likelihoodBadge(l: string) {
  const map: Record<string, { bg: string; text: string }> = {
    HIGH:     { bg: '#dcfce7', text: '#15803d' },
    MEDIUM:   { bg: '#fef9c3', text: '#a16207' },
    LOW:      { bg: '#ffedd5', text: '#c2410c' },
    VERY_LOW: { bg: '#fee2e2', text: '#991b1b' },
  }
  return map[l] ?? { bg: '#f1f5f9', text: '#475569' }
}

function sevBadge(s: string) {
  if (s === 'HIGH')   return 'bg-red-100 text-red-700 border border-red-200'
  if (s === 'MEDIUM') return 'bg-amber-100 text-amber-700 border border-amber-200'
  return 'bg-blue-100 text-blue-700 border border-blue-200'
}

function priDot(p: string) {
  if (p === 'URGENT') return 'bg-red-500'
  if (p === 'HIGH')   return 'bg-orange-500'
  if (p === 'MEDIUM') return 'bg-amber-400'
  return 'bg-blue-400'
}

// ─── Score Dial ────────────────────────────────────────────────────────────────

function ScoreDial({ score, grade }: { score: number; grade: string }) {
  const r   = 44
  const c   = 2 * Math.PI * r
  const arc = c * 0.75
  const fill = arc * (score / 100)
  const color = scoreColor(score)

  return (
    <div className="relative w-32 h-32 flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-[135deg]">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8"
          strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${c}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="relative flex flex-col items-center">
        <span className="text-3xl font-black text-white leading-none">{score}</span>
        <span className="text-xs font-bold mt-0.5" style={{ color }}>{grade}</span>
      </div>
    </div>
  )
}

// ─── Generated Letter Panel ────────────────────────────────────────────────────

function LetterPanel({ letter, letterType, onClose }: { letter: string; letterType: string; onClose: () => void }) {
  function download() {
    const blob = new Blob([letter], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${letterType.replace(/_/g, '-')}.txt`
    a.click()
  }

  return (
    <div className="mt-4 bg-white border border-[#0B1F3A]/10 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-[#0B1F3A]">
        <span className="text-sm font-bold text-white capitalize">
          {letterType.replace(/_/g, ' ')}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => navigator.clipboard.writeText(letter)}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors font-medium">
            Copy
          </button>
          <button onClick={download}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#E8C87A] transition-colors font-bold">
            Download .txt
          </button>
          <button onClick={onClose} className="text-white/50 hover:text-white ml-1 transition-colors text-lg leading-none">
            ×
          </button>
        </div>
      </div>
      <pre className="p-5 text-xs font-mono text-[#0B1F3A]/80 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
        {letter}
      </pre>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const VISA_TYPES = [
  'UK Visitor', 'UK Student', 'UK Work', 'UK Family',
  'Schengen Tourist', 'Schengen Business',
  'Canada Visitor', 'Canada Student',
  'USA B1/B2', 'UAE Visit', 'Australia Tourist',
]

const PASSPORT_TYPES = [
  'Nigerian', 'Ghanaian', 'Kenyan', 'South African', 'Zimbabwean',
  'Ethiopian', 'British', 'Canadian', 'Indian',
]

const STEPS = [
  'Uploading document…',
  'Running Claude forensic analysis…',
  'Detecting red flags…',
  'Scoring financial credibility…',
  'Simulating visa officer review…',
  'Compiling VisaFortress AI report…',
]

type AppEntry = { id: string; label: string; email: string; name: string }

export default function BankAnalyserPage() {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [file,         setFile]         = useState<File | null>(null)
  const [visaType,     setVisaType]     = useState('UK Visitor')
  const [passport,     setPassport]     = useState('Nigerian')
  const [clientName,   setClientName]   = useState('')
  const [clientEmail,  setClientEmail]  = useState('')

  // ── App linking ─────────────────────────────────────────────────────────────
  const [appList,       setAppList]       = useState<AppEntry[]>([])
  const [linkedAppId,   setLinkedAppId]   = useState('')
  const [bankStmtUrl,   setBankStmtUrl]   = useState<string | null>(null)
  const [bankStmtFetch, setBankStmtFetch] = useState(false)

  // ── AI model ─────────────────────────────────────────────────────────────────
  const [aiModel, setAiModel] = useState<'claude' | 'openai'>('claude')
  const [aiUsed,  setAiUsed]  = useState<string | null>(null)

  // ── Analysis state ──────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false)
  const [progress,  setProgress]  = useState('')
  const [error,     setError]     = useState('')
  const [analysis,  setAnalysis]  = useState<VFAnalysis | null>(null)

  // ── Results UI ──────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<Tab>('overview')
  const [letterLoading, setLetterLoading] = useState<string | null>(null)
  const [letter,       setLetter]       = useState<{ text: string; type: string } | null>(null)

  // ── Drag and drop ───────────────────────────────────────────────────────────
  const dropRef   = useRef<HTMLLabelElement>(null)
  const [dragging, setDragging] = useState(false)

  // ── Load application list ───────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/visa-applications?limit=100')
      .then(r => r.ok ? r.json() : null)
      .then((d: { applications?: { id: string; firstName: string; lastName: string; email: string; referenceNumber?: string }[] } | null) => {
        if (!d?.applications) return
        setAppList(d.applications.map(a => ({
          id:    a.id,
          label: `${a.referenceNumber ?? a.id.slice(0, 8)} — ${a.firstName} ${a.lastName}`,
          email: a.email ?? '',
          name:  `${a.firstName} ${a.lastName}`,
        })))
      })
      .catch(() => {})
  }, [])

  function handleLinkApp(id: string) {
    setLinkedAppId(id)
    setBankStmtUrl(null)
    if (!id) return
    const app = appList.find(a => a.id === id)
    if (app) {
      if (!clientName)  setClientName(app.name)
      if (!clientEmail) setClientEmail(app.email)
    }
    fetch(`/api/admin/visa-applications/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { application?: { bank_statement_url?: string; bank_statement_admin_url?: string } } | null) => {
        const url = d?.application?.bank_statement_admin_url ?? d?.application?.bank_statement_url ?? null
        setBankStmtUrl(url)
      })
      .catch(() => {})
  }

  async function handleScanExistingDoc() {
    if (!bankStmtUrl) return
    setBankStmtFetch(true)
    setError('')
    try {
      const res  = await fetch(bankStmtUrl)
      if (!res.ok) throw new Error(`Could not fetch document (${res.status})`)
      const blob = await res.blob()
      const name = bankStmtUrl.split('/').pop()?.split('?')[0] ?? 'bank-statement.pdf'
      setFile(new File([blob], name, { type: blob.type || 'application/pdf' }))
      setAnalysis(null)
      setLetter(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load document')
    } finally {
      setBankStmtFetch(false)
    }
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); setAnalysis(null); setLetter(null); setError('') }
  }, [])

  // ── Analyse ─────────────────────────────────────────────────────────────────
  async function handleAnalyse() {
    if (!file) { setError('Please upload a bank statement.'); return }
    if (!clientName.trim()) { setError('Please enter the client name.'); return }
    if (file.size > 50 * 1024 * 1024) { setError('File too large — maximum 50 MB.'); return }

    setLoading(true)
    setError('')
    setAnalysis(null)
    setLetter(null)
    setProgress(STEPS[0])

    let stepIdx = 0
    const timer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, STEPS.length - 1)
      setProgress(STEPS[stepIdx])
    }, 9000)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('visaType', visaType)
      fd.append('passportCountry', passport)
      fd.append('applicantName', clientName)
      fd.append('aiModel', aiModel)
      if (linkedAppId) fd.append('applicationId', linkedAppId)
      // DO NOT set Content-Type — browser sets multipart boundary automatically

      const res = await fetch('/api/admin/visa/analyse', { method: 'POST', body: fd })
      clearInterval(timer)

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error ?? `Analysis failed (${res.status})`)
      }

      const data = await res.json()
      if (!data.success || !data.analysis) throw new Error('No analysis returned from VisaFortress AI')

      setAnalysis(sanitizeVF(data.analysis))
      setAiUsed(data.aiUsed ?? null)
      setActiveTab('overview')
      setProgress('')
    } catch (e: unknown) {
      clearInterval(timer)
      setError(e instanceof Error ? e.message : String(e))
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  // ── Generate letter ─────────────────────────────────────────────────────────
  async function generateLetter(letterType: string) {
    if (!analysis) return
    setLetterLoading(letterType)
    setLetter(null)
    try {
      const res = await fetch('/api/admin/visa/generate-letter', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          letterType,
          clientName: clientName || analysis.summary.accountHolder || 'Applicant',
          visaType,
          passport,
          analysis,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Letter generation failed')
      setLetter({ text: data.letter, type: letterType })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Letter generation failed')
    } finally {
      setLetterLoading(null)
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const highFlags = analysis?.redFlags.filter(f => f.severity === 'HIGH').length ?? 0
  const currency  = analysis?.summary.currency ?? ''

  // ─── Upload state ───────────────────────────────────────────────────────────
  const uploadPanel = (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      {/* App linking */}
      {appList.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Link to Submitted Application <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <select value={linkedAppId} onChange={e => handleLinkApp(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
            <option value="">— standalone analysis —</option>
            {appList.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>

          {linkedAppId && bankStmtUrl && (
            <div className="mt-3 flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-emerald-600 text-lg flex-shrink-0">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-800">Bank statement found on this application</p>
                <p className="text-[10px] text-emerald-600 truncate">{bankStmtUrl.split('/').pop()?.split('?')[0]}</p>
              </div>
              <button onClick={handleScanExistingDoc} disabled={bankStmtFetch}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                {bankStmtFetch
                  ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading…</>
                  : '⚡ Scan This Doc'}
              </button>
            </div>
          )}
          {linkedAppId && bankStmtUrl === null && (
            <p className="mt-2 text-xs text-amber-600">⚠ No bank statement uploaded to this application yet.</p>
          )}
        </div>
      )}

      {/* Analysis config */}
      <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Visa Type</label>
            <select value={visaType} onChange={e => setVisaType(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
              {VISA_TYPES.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Passport Nationality</label>
            <select value={passport} onChange={e => setPassport(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]">
              {PASSPORT_TYPES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client Name</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="Full name"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client Email <span className="font-normal text-gray-400">(optional)</span></label>
            <input value={clientEmail} onChange={e => setClientEmail(e.target.value)}
              type="email" placeholder="email@example.com"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]" />
          </div>
        </div>

        {/* File drop zone */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Bank Statement</label>
          <label
            ref={dropRef}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 cursor-pointer border-2 border-dashed rounded-2xl px-4 py-8 transition-all ${
              dragging ? 'border-[#C9A84C] bg-amber-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-[#C9A84C] hover:bg-amber-50/30'
            }`}>
            <span className="text-3xl">{file ? '✅' : '📄'}</span>
            <div className="text-center">
              <p className="text-sm font-semibold text-[#0B1F3A]">
                {file ? file.name : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                  : 'PDF, PNG, JPG, WEBP · Max 50 MB'}
              </p>
            </div>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) { setFile(f); setAnalysis(null); setLetter(null); setError('') }
              }} />
          </label>
        </div>

        {/* AI engine selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Engine</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAiModel('claude')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold border transition-all ${
                aiModel === 'claude'
                  ? 'bg-[#0B1F3A] border-[#0B1F3A] text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-[#0B1F3A]/30'
              }`}>
              🤖 Claude Sonnet 4.6
            </button>
            <button type="button" onClick={() => setAiModel('openai')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold border transition-all ${
                aiModel === 'openai'
                  ? 'bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-400'
              }`}>
              ✦ GPT-4o
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        <button onClick={handleAnalyse}
          disabled={loading || !file || !clientName.trim()}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-[#0B1F3A] hover:bg-[#132038] text-white">
          {loading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {progress || 'Running VisaFortress AI…'}</>
            : <><span className="text-[#C9A84C] font-black">VF</span> Analyse with VisaFortress AI</>}
        </button>

        {!analysis && !loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: '🎯', title: 'Approval Score', desc: '0-100 credibility rating' },
              { icon: '🚩', title: 'Red Flag Detector', desc: 'Parking, NSFs, circular transfers' },
              { icon: '📝', title: 'Auto Letters', desc: '5 letter types generated by Claude' },
            ].map(f => (
              <div key={f.title} className="text-center p-3 bg-[#F5F7FA] rounded-xl">
                <div className="text-xl mb-1">{f.icon}</div>
                <p className="text-xs font-bold text-[#0B1F3A]">{f.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ─── Results state ──────────────────────────────────────────────────────────
  const resultsPanel = analysis && (
    <div className="flex-1 overflow-auto">
      {/* Score banner */}
      <div className="bg-[#0B1F3A] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center gap-6">
          <ScoreDial score={analysis.approvalScore} grade={analysis.scoreGrade} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h2 className="text-white font-bold text-lg leading-tight truncate">
                {analysis.summary.accountHolder || clientName || 'Analysis Complete'}
              </h2>
              {(() => {
                const lb = likelihoodBadge(analysis.approvalLikelihood)
                return (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{ backgroundColor: lb.bg, color: lb.text }}>
                    {analysis.approvalLikelihood.replace('_', ' ')} LIKELIHOOD
                  </span>
                )
              })()}
              {aiUsed && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/10 text-white/60 whitespace-nowrap">
                  {aiUsed}
                </span>
              )}
            </div>
            <p className="text-white/50 text-xs mb-2">
              {visaType} · {passport} · {analysis.summary.period} · {currency}
            </p>
            <p className="text-white/70 text-sm leading-relaxed line-clamp-2">{analysis.recommendation}</p>
          </div>

          <div className="flex-shrink-0 flex flex-col items-end gap-3">
            <div className="text-right">
              <p className="text-white/40 text-[10px] uppercase tracking-widest">Avg Balance</p>
              <p className="text-white font-bold text-lg">{fmt(analysis.summary.averageBalance, currency)}</p>
              {analysis.summary.averageBalanceConverted != null && analysis.statementCurrency !== analysis.visaCountryCurrency && (
                <p className="text-[#C9A84C] text-xs mt-0.5">≈ {analysis.visaCountryCurrencySymbol}{fmt(analysis.summary.averageBalanceConverted)}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-white/40 text-[10px] uppercase tracking-widest">Red Flags</p>
              <p className={`font-bold text-lg ${analysis.redFlags.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {analysis.redFlags.length}
                {highFlags > 0 && <span className="text-xs font-normal text-red-300 ml-1">({highFlags} HIGH)</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[#0B1F3A]/10 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex">
          {([
            { id: 'overview',      label: 'Overview' },
            { id: 'redflags',     label: `Red Flags${analysis.redFlags.length > 0 ? ` (${analysis.redFlags.length})` : ''}` },
            { id: 'embassy',      label: 'Embassy Eye' },
            { id: 'actions',      label: 'Actions' },
            { id: 'transactions', label: `Transactions${analysis.transactions.length > 0 ? ` (${analysis.transactions.length})` : ''}` },
          ] as { id: Tab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-[#C9A84C] text-[#0B1F3A]'
                  : 'border-transparent text-[#0B1F3A]/40 hover:text-[#0B1F3A]/70'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <>
            {/* Currency banner */}
            {analysis.statementCurrency && (
              <div className="bg-[#0B1F3A] rounded-2xl p-4 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💱</span>
                  <div>
                    <p className="text-white/50 text-[10px] uppercase tracking-wider">Statement Currency</p>
                    <p className="text-white font-bold">{analysis.statementCurrencySymbol} {analysis.statementCurrency}</p>
                  </div>
                </div>
                {analysis.statementCurrency !== analysis.visaCountryCurrency ? (
                  <>
                    <span className="text-white/30 text-xl">→</span>
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-white/50 text-[10px] uppercase tracking-wider">Visa Country Currency</p>
                        <p className="text-white font-bold">{analysis.visaCountryCurrencySymbol} {analysis.visaCountryCurrency}</p>
                      </div>
                      <span className="text-2xl">🎯</span>
                    </div>
                    {analysis.conversionRate && (
                      <div className="ml-auto text-right">
                        <p className="text-white/50 text-[10px] uppercase tracking-wider">Rate Used</p>
                        <p className="text-[#C9A84C] text-sm font-semibold">{analysis.conversionRate}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-white/40 text-sm">Direct {analysis.statementCurrency} assessment — no conversion needed</p>
                )}
              </div>
            )}

            {/* Visa requirement check */}
            {analysis.meetsVisaRequirement != null && (
              <div className={`rounded-2xl p-5 border ${
                analysis.meetsVisaRequirement
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}>
                <p className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Visa Financial Requirement</p>
                <p className={`font-bold text-lg ${analysis.meetsVisaRequirement ? 'text-emerald-400' : 'text-red-400'}`}>
                  {analysis.meetsVisaRequirement ? '✓ MEETS REQUIREMENT' : '✗ BELOW REQUIREMENT'}
                </p>
                {analysis.requirementGap && (
                  <p className="text-white/60 text-sm mt-1">{analysis.requirementGap}</p>
                )}
              </div>
            )}

            {/* Financial summary */}
            <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
              <h3 className="font-bold text-[#0B1F3A] mb-4">Financial Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Opening Balance', value: fmt(analysis.summary.openingBalance, currency), converted: analysis.summary.openingBalanceConverted },
                  { label: 'Closing Balance',  value: fmt(analysis.summary.closingBalance, currency),  converted: analysis.summary.closingBalanceConverted },
                  { label: 'Average Balance',  value: fmt(analysis.summary.averageBalance, currency),  converted: analysis.summary.averageBalanceConverted },
                  { label: 'Lowest Balance',   value: fmt(analysis.summary.lowestBalance, currency),   converted: null },
                  { label: 'Total Credits',    value: fmt(analysis.summary.totalCredits, currency),    converted: null },
                  { label: 'Total Debits',     value: fmt(analysis.summary.totalDebits, currency),     converted: null },
                  { label: 'Transactions',     value: analysis.summary.transactionCount.toString(),    converted: null },
                  { label: 'Period',           value: `${analysis.summary.months}mo`,                  converted: null },
                ].map(row => (
                  <div key={row.label} className="bg-[#F5F7FA] rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{row.label}</p>
                    <p className="font-bold text-[#0B1F3A] text-sm">{row.value}</p>
                    {row.converted != null && analysis.statementCurrency !== analysis.visaCountryCurrency && (
                      <p className="text-amber-600 text-[10px] mt-0.5">
                        ≈ {analysis.visaCountryCurrencySymbol}{fmt(row.converted)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {analysis.summary.regularIncomeDetected && (
                <div className="mt-3 flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 flex-wrap">
                  <span className="text-base">✓</span>
                  <span className="text-xs font-semibold">
                    Regular income detected · avg {fmt(analysis.summary.averageMonthlySalary, currency)}/month
                    {analysis.summary.averageMonthlySalaryConverted != null && analysis.statementCurrency !== analysis.visaCountryCurrency && (
                      <span className="text-amber-600 ml-1">
                        (≈ {analysis.visaCountryCurrencySymbol}{fmt(analysis.summary.averageMonthlySalaryConverted)}/month)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Cash flow */}
            <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
              <h3 className="font-bold text-[#0B1F3A] mb-4">Cash Flow Analysis</h3>
              <div className="space-y-3">
                {[
                  { label: 'Income Consistency',   value: analysis.cashFlowAnalysis.incomeConsistency },
                  { label: 'Spending Pattern',      value: analysis.cashFlowAnalysis.spendingPattern },
                  { label: 'Financial Stability',   value: analysis.cashFlowAnalysis.financialStability },
                  { label: 'Balance Trend',         value: analysis.cashFlowAnalysis.balanceTrend },
                  { label: 'Savings Rate',          value: `${analysis.cashFlowAnalysis.savingsRate}%` },
                ].map(row => (
                  <div key={row.label} className="flex items-start justify-between gap-4 py-2 border-b border-[#0B1F3A]/5 last:border-0">
                    <span className="text-xs text-gray-400 font-medium flex-shrink-0 w-36">{row.label}</span>
                    <span className="text-sm text-[#0B1F3A] font-medium text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths */}
            {analysis.positives.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
                <h3 className="font-bold text-[#0B1F3A] mb-4 flex items-center gap-2">
                  <span className="text-emerald-600">✓</span> Key Strengths
                </h3>
                <div className="space-y-3">
                  {analysis.positives.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 bg-emerald-50 rounded-xl p-3">
                      <span className="text-emerald-500 flex-shrink-0 mt-0.5">●</span>
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">{p.title}</p>
                        <p className="text-xs text-emerald-700 mt-0.5">{p.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate Documents */}
            <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
              <h3 className="font-bold text-[#0B1F3A] mb-1">Generate Documents</h3>
              <p className="text-xs text-gray-400 mb-4">Claude writes professional letters tailored to this analysis</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { type: 'bank_explanation',  label: 'Bank Explanation',   icon: '🏦' },
                  { type: 'financial_narrative', label: 'Financial Narrative', icon: '📊' },
                  { type: 'cover_letter',      label: 'Cover Letter',        icon: '✉️' },
                  { type: 'funds_declaration', label: 'Funds Declaration',   icon: '📋' },
                  { type: 'employment_letter', label: 'Employment Letter',   icon: '💼' },
                ].map(btn => (
                  <button key={btn.type}
                    onClick={() => generateLetter(btn.type)}
                    disabled={letterLoading === btn.type}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[#0B1F3A]/10 hover:border-[#C9A84C] hover:bg-amber-50/40 transition-all disabled:opacity-40 text-center">
                    <span className="text-2xl">{letterLoading === btn.type ? '⏳' : btn.icon}</span>
                    <span className="text-[11px] font-semibold text-[#0B1F3A]">{btn.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Letter panel */}
            {letter && (
              <LetterPanel letter={letter.text} letterType={letter.type} onClose={() => setLetter(null)} />
            )}
          </>
        )}

        {/* ── RED FLAGS ── */}
        {activeTab === 'redflags' && (
          <div className="space-y-4">
            {analysis.redFlags.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-bold text-emerald-800">No Red Flags Detected</p>
                <p className="text-sm text-emerald-600 mt-1">Clean statement with no suspicious financial activity</p>
              </div>
            ) : (
              [...analysis.redFlags]
                .sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.severity] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.severity] ?? 3))
                .map(flag => (
                  <div key={flag.id} className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5 ${sevBadge(flag.severity)}`}>
                        {flag.severity}
                      </span>
                      <div className="flex-1">
                        <p className="font-bold text-[#0B1F3A] text-sm">{flag.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">{flag.type}</p>
                      </div>
                    </div>
                    <p className="text-sm text-[#0B1F3A]/70 mb-3">{flag.description}</p>
                    {flag.transaction && (
                      <div className="bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700 font-mono mb-3">
                        {flag.transaction}
                      </div>
                    )}
                    {flag.embassyInterpretation && (
                      <div className="bg-[#F5F7FA] rounded-xl px-4 py-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Embassy Interpretation</p>
                        <p className="text-xs text-[#0B1F3A]/70">{flag.embassyInterpretation}</p>
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        )}

        {/* ── EMBASSY EYE ── */}
        {activeTab === 'embassy' && (
          <div className="space-y-4">
            <div className="bg-[#0B1F3A] rounded-2xl p-6">
              <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-widest mb-2">Officer Verdict</p>
              <p className="text-white text-sm leading-relaxed">{analysis.embassyEye.officerVerdict}</p>

              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/50 text-xs">Similar Cases Approval Rate</span>
                  <span className="text-[#C9A84C] font-bold">{analysis.embassyEye.similarCasesApprovalRate}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-2 bg-[#C9A84C] rounded-full transition-all"
                    style={{ width: `${analysis.embassyEye.similarCasesApprovalRate}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
                <h3 className="font-bold text-emerald-700 mb-3 flex items-center gap-2">
                  <span>✓</span> Key Strengths
                </h3>
                {analysis.embassyEye.keyStrengths.length === 0 ? (
                  <p className="text-xs text-gray-400">None identified</p>
                ) : (
                  <ul className="space-y-2">
                    {analysis.embassyEye.keyStrengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                        <span className="text-emerald-500 flex-shrink-0 mt-0.5">●</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
                <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
                  <span>✗</span> Key Weaknesses
                </h3>
                {analysis.embassyEye.keyWeaknesses.length === 0 ? (
                  <p className="text-xs text-gray-400">None identified</p>
                ) : (
                  <ul className="space-y-2">
                    {analysis.embassyEye.keyWeaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                        <span className="text-red-500 flex-shrink-0 mt-0.5">●</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIONS ── */}
        {activeTab === 'actions' && (
          <div className="space-y-5">
            {analysis.documentsToAdd.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
                <h3 className="font-bold text-[#0B1F3A] mb-3">Additional Documents Required</h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.documentsToAdd.map((doc, i) => (
                    <span key={i} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#0B1F3A]/5 text-[#0B1F3A]">
                      {doc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.suggestedActions.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 p-5">
                <h3 className="font-bold text-[#0B1F3A] mb-4">Suggested Actions</h3>
                <div className="space-y-3">
                  {analysis.suggestedActions.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-[#F5F7FA] rounded-xl">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${priDot(a.priority)}`} />
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-[#0B1F3A]">{a.action}</p>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{a.priority}</span>
                        </div>
                        <p className="text-xs text-gray-500">{a.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {activeTab === 'transactions' && (
          <div className="bg-white rounded-2xl border border-[#0B1F3A]/8 overflow-hidden">
            {analysis.transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No transactions extracted</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F5F7FA] border-b border-[#0B1F3A]/8">
                      <th className="text-left px-4 py-3 font-semibold text-[#0B1F3A]/50 uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#0B1F3A]/50 uppercase tracking-wider">Description</th>
                      <th className="text-right px-4 py-3 font-semibold text-emerald-600 uppercase tracking-wider">Credit</th>
                      <th className="text-right px-4 py-3 font-semibold text-red-600 uppercase tracking-wider">Debit</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#0B1F3A]/50 uppercase tracking-wider">Balance</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.transactions.map((t, i) => (
                      <tr key={i} className={`border-b border-[#0B1F3A]/5 last:border-0 ${t.flagged ? 'bg-red-50' : 'hover:bg-[#F5F7FA]'}`}>
                        <td className="px-4 py-2.5 text-[#0B1F3A]/50 whitespace-nowrap font-mono">{t.date}</td>
                        <td className="px-4 py-2.5 text-[#0B1F3A] max-w-xs">
                          <p className="truncate">{t.description}</p>
                          {t.flagged && t.flagReason && (
                            <p className="text-red-500 text-[10px] mt-0.5 truncate">{t.flagReason}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 font-mono font-medium whitespace-nowrap">
                          {t.credit != null ? fmt(t.credit) : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-red-600 font-mono font-medium whitespace-nowrap">
                          {t.debit != null ? fmt(t.debit) : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#0B1F3A] font-mono whitespace-nowrap">
                          {t.balance != null ? fmt(t.balance) : ''}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {t.flagged && <span title={t.flagReason ?? ''} className="text-red-500 text-sm">🚨</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Letter panel below tabs for non-overview tabs */}
        {activeTab !== 'overview' && letter && (
          <LetterPanel letter={letter.text} letterType={letter.type} onClose={() => setLetter(null)} />
        )}

      </div>
    </div>
  )

  // ─── Root ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F7FA]">
      {/* Header */}
      <div className="bg-[#0B1F3A] border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#C9A84C] flex items-center justify-center flex-shrink-0">
              <span className="text-[#0B1F3A] font-black text-xs">VF</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-base tracking-tight">
                VisaFortress <span className="text-[#C9A84C]">AI</span>
              </h1>
              <p className="text-white/30 text-[10px]">Claude Forensic Analysis · Walz Travels Admin</p>
            </div>
          </div>
          {analysis && (
            <button
              onClick={() => { setAnalysis(null); setFile(null); setLetter(null); setError('') }}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
              + New Analysis
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {analysis ? resultsPanel : uploadPanel}
    </div>
  )
}
