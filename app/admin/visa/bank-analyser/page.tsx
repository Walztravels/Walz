'use client'

import { useState, Component, type ReactNode } from 'react'
import type {
  BankStatementAnalysis, FinancialCredibilityScore, RiskFlag,
  BehavioralAnomaly, MultiAgentConsensus,
} from '@/lib/analyzeBankStatement'
import { ClientReportView } from '@/components/ClientReportView'

// ─── Error boundary ───────────────────────────────────────────────────────────

class AnalysisErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 mx-4 my-4">
          <p className="font-bold mb-1">Could not display analysis results</p>
          <p className="text-sm">{this.state.error}</p>
          <p className="text-xs text-red-500 mt-2">
            The analysis may have completed — check Supabase bank_statement_analyses table.
            Try refreshing and running the analysis again.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Sanitize raw AI output before setting state ──────────────────────────────

function sanitizeAnalysis(raw: unknown): BankStatementAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    ...(r as unknown as BankStatementAnalysis),
    status:          ['PASS', 'REVIEW', 'FLAG'].includes(r.status as string) ? r.status as 'PASS'|'REVIEW'|'FLAG' : 'REVIEW',
    summary:         typeof r.summary    === 'string' ? r.summary    : '',
    agentNotes:      typeof r.agentNotes === 'string' ? r.agentNotes : '',
    currency:        typeof r.currency   === 'string' ? r.currency   : '',
    statementPeriod: typeof r.statementPeriod === 'string' ? r.statementPeriod : '',
    confidence:      ['high','medium','low'].includes(r.confidence as string) ? r.confidence as 'high'|'medium'|'low' : 'medium',
    recommendations: Array.isArray(r.recommendations)
      ? r.recommendations.map((x: unknown) => typeof x === 'string' ? x : JSON.stringify(x))
      : [],
    warnings: Array.isArray(r.warnings)
      ? r.warnings.map((x: unknown) => typeof x === 'string' ? x : JSON.stringify(x))
      : [],
    suspiciousTransactions: Array.isArray(r.suspiciousTransactions)
      ? r.suspiciousTransactions.map((t: unknown) => {
          const tx = (t ?? {}) as Record<string, unknown>
          return {
            date:        String(tx.date        ?? ''),
            description: String(tx.description ?? ''),
            amount:      Number(tx.amount      ?? 0),
            type:        (tx.type === 'credit' ? 'credit' : 'debit') as 'credit'|'debit',
            reason:      String(tx.reason      ?? ''),
            severity:    (['high','medium','low'].includes(tx.severity as string) ? tx.severity : 'low') as 'high'|'medium'|'low',
          }
        })
      : [],
    largeUnexplainedWithdrawals: Array.isArray(r.largeUnexplainedWithdrawals)
      ? r.largeUnexplainedWithdrawals.map((w: unknown) => {
          const wx = (w ?? {}) as Record<string, unknown>
          return { date: String(wx.date ?? ''), amount: Number(wx.amount ?? 0), description: String(wx.description ?? '') }
        })
      : [],
    averageMonthlyBalance:  Number(r.averageMonthlyBalance  ?? 0),
    lowestBalance:          Number(r.lowestBalance          ?? 0),
    highestBalance:         Number(r.highestBalance         ?? 0),
    closingBalance:         Number(r.closingBalance         ?? 0),
    totalCredits:           Number(r.totalCredits           ?? 0),
    totalDebits:            Number(r.totalDebits            ?? 0),
    estimatedMonthlyIncome: Number(r.estimatedMonthlyIncome ?? 0),
    embassyMinimumRequired: Number(r.embassyMinimumRequired ?? 0),
    overdraftCount:         Number(r.overdraftCount         ?? 0),
    // Ensure nested array fields are never null
    monthlyBreakdown:       Array.isArray(r.monthlyBreakdown)       ? r.monthlyBreakdown       : [],
    spendingCategories:     Array.isArray(r.spendingCategories)     ? r.spendingCategories      : [],
    sourceOfFunds:          Array.isArray(r.sourceOfFunds)          ? r.sourceOfFunds            : [],
    largeTransactions:      Array.isArray(r.largeTransactions)      ? r.largeTransactions        : [],
    balanceDipsBelow:       Array.isArray(r.balanceDipsBelow)       ? r.balanceDipsBelow         : [],
    riskFlags:              Array.isArray(r.riskFlags)              ? r.riskFlags                : [],
    embassyAssessments:     Array.isArray(r.embassyAssessments)     ? r.embassyAssessments       : [],
    behavioralAnomalies:    Array.isArray(r.behavioralAnomalies)    ? r.behavioralAnomalies      : [],
    otherIncomeSources:     Array.isArray(r.otherIncomeSources)     ? r.otherIncomeSources       : [],
  }
}

const MAX_MB = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, currency = ''): string {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const str = abs >= 1_000_000
    ? (abs / 1_000_000).toFixed(1) + 'M'
    : abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${currency} ${str}` : str
}

function scoreColor(s: number): string {
  if (s >= 80) return '#22c55e'
  if (s >= 60) return '#eab308'
  if (s >= 40) return '#f97316'
  return '#ef4444'
}

function scoreLabel(s: number): string {
  if (s >= 80) return 'Excellent'
  if (s >= 60) return 'Good'
  if (s >= 40) return 'Fair'
  return 'Poor'
}

function riskBadge(risk: 'low' | 'medium' | 'high') {
  const m = { low: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', high: 'bg-red-100 text-red-700' }
  return `inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${m[risk]}`
}

function flagColor(s: RiskFlag['status']) {
  return { ok: 'bg-green-50 border-green-200 text-green-800', warning: 'bg-yellow-50 border-yellow-300 text-yellow-800', danger: 'bg-red-50 border-red-300 text-red-800' }[s]
}
function flagIcon(s: RiskFlag['status'])   { return s === 'ok' ? '✓' : s === 'warning' ? '!' : '✗' }
function flagIconBg(s: RiskFlag['status']) { return s === 'ok' ? 'bg-green-500' : s === 'warning' ? 'bg-yellow-400' : 'bg-red-500' }

function probColor(n: number) {
  if (n >= 80) return '#22c55e'
  if (n >= 60) return '#eab308'
  if (n >= 40) return '#f97316'
  return '#ef4444'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreCircle({ score, size = 100 }: { score: number; size?: number }) {
  const r    = (size - 16) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={scoreColor(score)} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

function ProbCircle({ score, size = 80 }: { score: number; size?: number }) {
  const r    = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={probColor(score)} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs font-bold" style={{ color: scoreColor(score) }}>{score}/100</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
      </div>
    </div>
  )
}

function ProbBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-white/70">{label}</span>
        <span className="text-xs font-bold" style={{ color: probColor(score) }}>{score}%</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: probColor(score) }} />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'PASS' | 'REVIEW' | 'FLAG' }) {
  const m = { PASS: 'bg-green-100 text-green-800 border-green-300', REVIEW: 'bg-yellow-100 text-yellow-800 border-yellow-300', FLAG: 'bg-red-100 text-red-800 border-red-300' }
  const i = { PASS: '✓', REVIEW: '◐', FLAG: '✗' }
  return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${m[status]}`}>{i[status]} {status}</span>
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Multi-Agent Consensus Card ───────────────────────────────────────────────

function ConsensusCard({ c }: { c: MultiAgentConsensus }) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    strong_approve:      { bg: 'bg-green-500',   text: 'STRONG APPROVAL',     icon: '✓✓' },
    approve:             { bg: 'bg-green-400',   text: 'APPROVE',             icon: '✓'  },
    approve_with_caution:{ bg: 'bg-yellow-500', text: 'APPROVE WITH CAUTION', icon: '◐'  },
    conditional:         { bg: 'bg-orange-500', text: 'CONDITIONAL',          icon: '◐'  },
    decline:             { bg: 'bg-red-500',    text: 'DECLINE',              icon: '✗'  },
  }
  const cfg = colorMap[c.consensus] ?? colorMap.conditional
  const agreeColor = c.agreementLevel === 'unanimous' ? 'text-green-400' : c.agreementLevel === 'majority' ? 'text-yellow-400' : 'text-orange-400'

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      <div className="bg-[#0f2040] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest">Multi-Agent Consensus</span>
          <span className="text-[10px] text-white/40 bg-white/10 px-2 py-0.5 rounded-full">Level 11</span>
        </div>
        <span className={`text-xs font-bold ${agreeColor}`}>
          {c.agreementLevel === 'unanimous' ? '● Unanimous' : c.agreementLevel === 'majority' ? '● Majority' : '◐ Split Decision'}
        </span>
      </div>

      <div className="bg-[#0a1628] p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Primary */}
        <div className="text-center">
          <p className="text-xs text-white/40 mb-1 uppercase tracking-wide">Primary</p>
          <p className="text-[10px] text-white/50 mb-2">{c.primaryAgent}</p>
          <p className={`text-sm font-bold uppercase ${c.primaryVerdict === 'recommend' ? 'text-green-400' : c.primaryVerdict === 'conditional' ? 'text-yellow-400' : 'text-red-400'}`}>
            {c.primaryVerdict}
          </p>
          <p className="text-lg font-black mt-0.5" style={{ color: scoreColor(c.primaryScore) }}>{c.primaryScore}<span className="text-xs text-white/40">/100</span></p>
        </div>

        {/* Consensus */}
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${cfg.bg} text-white text-2xl font-black mb-2`}>
            {cfg.icon}
          </div>
          <p className="text-white font-bold text-sm">{cfg.text}</p>
          <p className="text-white/50 text-xs mt-1 leading-relaxed">{c.consensusNote}</p>
        </div>

        {/* Secondary */}
        <div className="text-center">
          <p className="text-xs text-white/40 mb-1 uppercase tracking-wide">Validator</p>
          <p className="text-[10px] text-white/50 mb-2">{c.secondaryAgent}</p>
          <p className={`text-sm font-bold uppercase ${c.secondaryVerdict === 'recommend' ? 'text-green-400' : c.secondaryVerdict === 'conditional' ? 'text-yellow-400' : 'text-red-400'}`}>
            {c.secondaryVerdict}
          </p>
          <p className="text-lg font-black mt-0.5" style={{ color: probColor(c.secondaryScore) }}>{c.secondaryScore}<span className="text-xs text-white/40">/100</span></p>
        </div>
      </div>
    </div>
  )
}

// ─── Approval Probability Card ─────────────────────────────────────────────────

function ApprovalProbabilityCard({ a }: { a: BankStatementAnalysis }) {
  const prob = a.approvalProbability
  if (!prob) return null

  return (
    <div className="bg-[#0a1628] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest">Approval Probability Engine</span>
          <span className="text-[10px] text-white/40 bg-white/10 px-2 py-0.5 rounded-full">Level 12</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${prob.riskFactors === 'none' ? 'bg-green-900 text-green-400' : prob.riskFactors === 'low' ? 'bg-yellow-900 text-yellow-400' : prob.riskFactors === 'medium' ? 'bg-orange-900 text-orange-400' : 'bg-red-900 text-red-400'}`}>
          {prob.riskFactors} risk
        </span>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-[120px] h-[120px]">
            <ProbCircle score={prob.overall} size={120} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black" style={{ color: probColor(prob.overall) }}>{prob.overall}</span>
              <span className="text-[10px] text-white/40">% probability</span>
            </div>
          </div>
          <p className="text-white/60 text-xs mt-2 text-center">Financial evidence<br/>supports approval</p>
        </div>

        <div className="md:col-span-2 space-y-3">
          <ProbBar label="Financial Strength"        score={prob.financial} />
          <ProbBar label="Source of Funds Clarity"  score={prob.sourceOfFunds} />
          <ProbBar label="Transaction Authenticity" score={prob.transactionAuthenticity} />
          <ProbBar label="Travel Affordability"     score={prob.travelAffordability} />
          {prob.note && (
            <p className="text-xs text-white/50 pt-1 leading-relaxed italic">"{prob.note}"</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Immigration Officer Simulation ───────────────────────────────────────────

function OfficerSimulationCard({ a }: { a: BankStatementAnalysis }) {
  const sim = a.officerSimulation
  if (!sim) return null

  const recMap = {
    approve:                  { color: 'bg-green-500', label: 'APPROVE', icon: '✓' },
    approve_with_conditions:  { color: 'bg-yellow-500', label: 'APPROVE WITH CONDITIONS', icon: '◐' },
    request_more_info:        { color: 'bg-orange-500', label: 'REQUEST MORE INFORMATION', icon: '?' },
    refuse:                   { color: 'bg-red-500', label: 'REFUSE', icon: '✗' },
  }
  const rec = recMap[sim.approvalRecommendation] ?? recMap.request_more_info

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="bg-[#0f2040] px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#c9a84c] text-sm font-bold uppercase tracking-widest">Immigration Officer Simulation</span>
          <span className="text-[10px] text-white/40 bg-white/10 px-2 py-0.5 rounded-full">Level 9</span>
        </div>
        <span className={`text-xs font-bold text-white px-3 py-1 rounded-full ${rec.color}`}>
          {rec.icon} {rec.label}
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Officer view prose */}
        {sim.immigrationOfficerView && (
          <div className="bg-[#0a1628] rounded-xl p-5">
            <p className="text-[#c9a84c] text-[10px] uppercase tracking-widest font-bold mb-3">
              First-Person Officer Assessment
            </p>
            <p className="text-blue-100 text-sm leading-relaxed whitespace-pre-line">
              {sim.immigrationOfficerView}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Reasons to approve */}
          {(sim.reasonsToApprove?.length ?? 0) > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-3">Reasons to Approve</p>
              <ul className="space-y-2">
                {(sim.reasonsToApprove ?? []).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-green-800">
                    <span className="flex-shrink-0 w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5">{i+1}</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reasons for concern */}
          <div className={`rounded-xl p-4 border ${(sim.reasonsForConcern?.length ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${(sim.reasonsForConcern?.length ?? 0) > 0 ? 'text-red-700' : 'text-gray-500'}`}>Reasons for Concern</p>
            {(sim.reasonsForConcern?.length ?? 0) > 0 ? (
              <ul className="space-y-2">
                {(sim.reasonsForConcern ?? []).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-red-800">
                    <span className="flex-shrink-0 text-red-500 mt-0.5">⚠</span>
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500 italic">No significant concerns identified</p>
            )}
          </div>
        </div>

        {/* Officer conclusion */}
        {sim.officerConclusion && (
          <div className="bg-gray-50 border-l-4 border-[#0a1628] rounded-r-xl px-4 py-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Officer File Conclusion</p>
            <p className="text-sm text-gray-800 leading-relaxed">{sim.officerConclusion}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Source of Funds Classification ───────────────────────────────────────────

function SourceOfFundsClassificationCard({ a }: { a: BankStatementAnalysis }) {
  const sof = a.sourceOfFundsClassification
  if (!sof || !Array.isArray(sof.categories) || sof.categories.length === 0) return null

  const typeColors: Record<string, string> = {
    salary: '#22c55e', business_income: '#3b82f6', client_payments: '#6366f1',
    investment: '#8b5cf6', rental: '#ec4899', foreign_transfer: '#f59e0b',
    family_support: '#14b8a6', cash_deposit: '#f97316', unknown: '#9ca3af',
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Source of Funds Classification</h3>
          <span className="text-[10px] text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Level 3</span>
        </div>
        <span className="text-xs font-bold text-gray-500">Confidence: {sof.confidence}%</span>
      </div>

      <div className="p-5">
        {/* Verified breakdown bar */}
        <div className="mb-5">
          <div className="flex gap-1 h-4 rounded-full overflow-hidden mb-2">
            <div style={{ width: `${sof.verifiedPercentage}%`, backgroundColor: '#22c55e' }} title={`Verified: ${sof.verifiedPercentage}%`} />
            <div style={{ width: `${sof.partiallyVerifiedPercentage}%`, backgroundColor: '#eab308' }} title={`Partial: ${sof.partiallyVerifiedPercentage}%`} />
            <div style={{ width: `${sof.unverifiedPercentage}%`, backgroundColor: '#ef4444' }} title={`Unverified: ${sof.unverifiedPercentage}%`} />
          </div>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Verified <span className="font-bold text-green-700">{sof.verifiedPercentage}%</span></span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Partial <span className="font-bold text-yellow-700">{sof.partiallyVerifiedPercentage}%</span></span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Unverified <span className="font-bold text-red-700">{sof.unverifiedPercentage}%</span></span>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="space-y-3 mb-4">
          {sof.categories.map((cat, i) => (
            <div key={i}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs text-gray-700">{cat.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cat.verified === 'verified' ? 'bg-green-100 text-green-700' : cat.verified === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    {cat.verified}
                  </span>
                </div>
                <span className="text-xs text-gray-500">{cat.percentage}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, backgroundColor: typeColors[cat.type] ?? '#9ca3af' }} />
              </div>
              {cat.verificationNote && (
                <p className="text-[10px] text-gray-400 mt-0.5">{cat.verificationNote}</p>
              )}
            </div>
          ))}
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-xl px-4 py-3">
          <p className="text-sm text-gray-700">{sof.conclusion}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BankAnalyserPage() {
  const [file,        setFile]        = useState<File | null>(null)
  const [destination, setDestination] = useState('')
  const [clientName,  setClientName]  = useState('')
  const [country,     setCountry]     = useState('Nigeria')
  const [clientEmail, setClientEmail] = useState('')

  const [loading,     setLoading]     = useState(false)
  const [progress,    setProgress]    = useState('')
  const [analysis,    setAnalysis]    = useState<BankStatementAnalysis | null>(null)
  const [appId,       setAppId]       = useState('')
  const [error,       setError]       = useState('')

  const [activeTab,   setActiveTab]   = useState<'internal' | 'client'>('internal')
  const [reportUrl,   setReportUrl]   = useState('')
  const [publishBusy, setPublishBusy] = useState(false)
  const [emailBusy,   setEmailBusy]   = useState(false)
  const [emailSent,   setEmailSent]   = useState(false)
  const [workflowMsg, setWorkflowMsg] = useState('')

  const fileSizeMB = file ? file.size / 1024 / 1024 : 0

  async function handleAnalyse() {
    if (!file || !destination.trim() || !clientName.trim()) {
      setError('Please fill in all fields and select a PDF file.')
      return
    }
    if (fileSizeMB > MAX_MB) {
      setError(`File too large (${fileSizeMB.toFixed(1)} MB). Maximum is ${MAX_MB} MB.`)
      return
    }

    setLoading(true); setError(''); setAnalysis(null); setReportUrl(''); setEmailSent(false)

    try {
      setProgress('Preparing secure upload…')
      const presignRes = await fetch('/api/admin/bank-analyser/presign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileSize: file.size }),
      })
      if (!presignRes.ok) {
        const j = await presignRes.json().catch(() => ({ error: presignRes.statusText }))
        throw new Error(j?.error ?? `Presign failed (${presignRes.status})`)
      }
      const { uploadUrl, storagePath } = await presignRes.json()

      setProgress(`Uploading ${fileSizeMB.toFixed(1)} MB…`)
      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file })
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`)

      setProgress('Running multi-agent forensic analysis — may take 45–120 seconds…')
      const id = `standalone-${Date.now()}`
      const res = await fetch('/api/analyze-bank-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-target-table': 'bank_statement_analyses' },
        body: JSON.stringify({ applicationId: id, storagePath, destination, applicantName: clientName, passportCountry: country, uploadedBy: 'admin' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(j?.error ?? `Analysis failed (${res.status})`)
      }
      const data = await res.json()
      if (!data.success || !data.analysis) throw new Error('No analysis returned')

      setAnalysis(sanitizeAnalysis(data.analysis))
      setAppId(id)
      setProgress('')
      setActiveTab('internal')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  async function handlePublish() {
    if (!analysis) return
    setPublishBusy(true); setWorkflowMsg('')
    try {
      const res = await fetch('/api/admin/bank-analyser/publish-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, clientName, clientEmail, destination, passportCountry: country, applicationId: appId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not publish report')
      setReportUrl(data.reportUrl)
      setWorkflowMsg('Report link generated.')
    } catch (e: unknown) {
      setWorkflowMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setPublishBusy(false)
    }
  }

  async function handleSendEmail() {
    if (!analysis || !clientEmail) { setWorkflowMsg('Enter client email first.'); return }
    setEmailBusy(true); setWorkflowMsg('')
    try {
      const res = await fetch('/api/admin/bank-analyser/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEmail, clientName, destination, analysis, refId: appId, reportUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not send email')
      setEmailSent(true)
      setWorkflowMsg(`Email sent to ${clientEmail}`)
    } catch (e: unknown) {
      setWorkflowMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setEmailBusy(false)
    }
  }

  const fcs: FinancialCredibilityScore | undefined = analysis?.financialCredibilityScore ?? analysis?.visaScore

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f7f8fc]">

      {/* Top bar */}
      <div className="bg-[#0a1628] text-white px-6 py-4 flex items-center justify-between sticky top-0 z-20 print:hidden">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏦</span>
          <div>
            <h1 className="text-lg font-bold">Visa Financial Intelligence Platform</h1>
            <p className="text-xs text-blue-300">Multi-Agent Forensic Analysis · Walz Travels</p>
          </div>
        </div>
        {analysis && (
          <div className="flex items-center gap-2">
            <button onClick={() => setActiveTab('internal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'internal' ? 'bg-white text-[#0a1628]' : 'text-white/70 hover:text-white'}`}>
              🔒 Internal View
            </button>
            <button onClick={() => setActiveTab('client')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'client' ? 'bg-[#c9a84c] text-[#0a1628]' : 'text-white/70 hover:text-white'}`}>
              📄 Client Report
            </button>
          </div>
        )}
      </div>

      {/* Client Report Tab */}
      <AnalysisErrorBoundary>
      {analysis && activeTab === 'client' && (
        <ClientReportView
          analysis={analysis}
          clientName={clientName}
          destination={destination}
          onPrint={() => {
            if (reportUrl) {
              window.open(reportUrl, '_blank')
            } else {
              window.print()
            }
          }}
        />
      )}
      </AnalysisErrorBoundary>

      {/* Internal View + Upload */}
      {(activeTab === 'internal' || !analysis) && (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

          {/* Upload card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 print:hidden">
            <h2 className="text-base font-bold text-gray-800 mb-5">Upload Bank Statement</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client Name</label>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="Full name as on passport"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client Email</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                  placeholder="client@email.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Passport Country</label>
                <select value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {['Nigeria','Ghana','Kenya','South Africa','India','Pakistan','Bangladesh','Philippines','Egypt','Morocco','Other'].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Destination</label>
                <select value={destination} onChange={e => setDestination(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select destination…</option>
                  {[
                    { value: 'uk',        label: '🇬🇧 United Kingdom' },
                    { value: 'canada',    label: '🇨🇦 Canada' },
                    { value: 'schengen',  label: '🇪🇺 Schengen / Europe' },
                    { value: 'uae',       label: '🇦🇪 UAE' },
                    { value: 'usa',       label: '🇺🇸 United States' },
                    { value: 'australia', label: '🇦🇺 Australia' },
                  ].map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Bank Statement PDF <span className="font-normal text-gray-400">(max {MAX_MB} MB)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer border-2 border-dashed border-gray-200 rounded-lg px-3 py-2 hover:border-blue-400 transition-colors">
                  <span className="text-lg">📄</span>
                  <span className="text-sm text-gray-500 flex-1 truncate">
                    {file ? `${file.name} (${fileSizeMB.toFixed(1)} MB)` : 'Click to choose PDF…'}
                  </span>
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); setAnalysis(null); setReportUrl(''); setEmailSent(false) }} />
                </label>
              </div>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}
            {progress && (
              <div className="mb-4 flex items-center gap-3 text-sm text-blue-700 bg-blue-50 border border-blue-100 px-4 py-3 rounded-lg">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                {progress}
              </div>
            )}

            <button onClick={handleAnalyse}
              disabled={loading || !file || !destination || !clientName}
              className="w-full bg-[#0a1628] hover:bg-[#132038] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors">
              {loading ? 'Running Multi-Agent Analysis…' : '🔍 Run Forensic Intelligence Analysis'}
            </button>
          </div>

          {/* Workflow actions */}
          {analysis && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 print:hidden">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Report Workflow</h3>
              <div className="flex flex-wrap gap-3 items-center">

                {/* Step 1 — generate shareable link */}
                <button onClick={handlePublish} disabled={publishBusy}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${reportUrl ? 'bg-green-100 text-green-700' : 'bg-[#0a1628] text-white hover:bg-[#132038]'} disabled:opacity-40`}>
                  {publishBusy ? <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Generating…</> : reportUrl ? '✓ Link Generated' : '🔗 Generate Client Link'}
                </button>

                {/* Step 2 — copy + preview (only after link exists) */}
                {reportUrl && (
                  <button onClick={() => { navigator.clipboard.writeText(reportUrl); setWorkflowMsg('Link copied!') }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
                    📋 Copy Link
                  </button>
                )}
                {reportUrl && (
                  <a href={reportUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100">
                    👁 Preview Report
                  </a>
                )}

                {/* Step 3 — send email (always available once analysis exists + email entered) */}
                <button onClick={handleSendEmail} disabled={emailBusy || emailSent || !clientEmail}
                  title={!clientEmail ? 'Add client email in the form above' : ''}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${emailSent ? 'bg-green-100 text-green-700' : 'bg-[#c9a84c] text-[#0a1628] hover:bg-[#b8973b]'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                  {emailBusy ? <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Sending…</> : emailSent ? '✓ Email Sent' : '📧 Send to Client'}
                </button>

                {/* Step 3b — save PDF directly without needing a link */}
                <button onClick={() => { setActiveTab('client') }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
                  🖨 View & Print PDF
                </button>
              </div>

              {/* Report URL display */}
              {reportUrl && (
                <div className="mt-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-500 flex-shrink-0">Report URL:</span>
                  <span className="text-xs text-blue-600 truncate font-mono">{reportUrl}</span>
                </div>
              )}

              {!clientEmail && (
                <p className="text-xs text-amber-600 mt-2">Add client email in the form above to enable email sending</p>
              )}

              {workflowMsg && (
                <p className={`text-xs mt-2 font-medium whitespace-pre-wrap ${workflowMsg.toLowerCase().includes('sent') || workflowMsg.includes('copied') || workflowMsg.includes('generated') ? 'text-green-600' : 'text-red-600'}`}>
                  {workflowMsg}
                </p>
              )}
            </div>
          )}

          {/* ══ INTERNAL ANALYST REPORT ════════════════════════════════ */}
          <AnalysisErrorBoundary>
          {analysis && (
            <div className="space-y-5">

              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <span className="text-amber-600">🔒</span>
                <p className="text-xs text-amber-800 font-semibold">Internal Analyst View — risk scores, officer simulation, and forensic findings are not shown to clients</p>
              </div>

              {/* Report header */}
              <div className="bg-[#0a1628] text-white rounded-2xl p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <StatusBadge status={analysis.status} />
                      <span className="text-sm text-blue-300">{analysis.analysisEngine}</span>
                      {analysis.multiAgentConsensus && (
                        <span className="text-xs bg-[#c9a84c]/20 text-[#c9a84c] px-2 py-0.5 rounded-full font-semibold">
                          Multi-Agent ✓
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold">{clientName || 'Applicant'}</h2>
                    <p className="text-blue-300 text-sm mt-1">
                      {analysis.statementPeriod} · {analysis.monthsAnalyzed} months · {analysis.currency}
                    </p>
                    <p className="text-blue-200 text-xs mt-0.5">{destination.toUpperCase()} visa · {country}</p>
                  </div>
                  {fcs && (
                    <div className="flex items-center gap-4 bg-white/10 rounded-xl px-5 py-4 flex-shrink-0">
                      <div className="relative w-[100px] h-[100px]">
                        <ScoreCircle score={fcs.overall} size={100} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-black" style={{ color: scoreColor(fcs.overall) }}>{fcs.overall}</span>
                          <span className="text-[10px] text-white/60">/ 100</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-white/60 uppercase tracking-wider mb-0.5">Credibility Score</p>
                        <p className="text-lg font-bold" style={{ color: scoreColor(fcs.overall) }}>{fcs.label ?? scoreLabel(fcs.overall)}</p>
                        <p className="text-xs text-white/50 mt-1">Confidence: <span className="text-white/80 capitalize">{analysis.confidence}</span></p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Forensic Verdict ─────────────────────────────────── */}
              {analysis.finalVerdict && (
                <div className={`rounded-2xl border-2 p-5 ${
                  analysis.finalVerdict === 'recommend' ? 'bg-green-50 border-green-300' :
                  analysis.finalVerdict === 'conditional' ? 'bg-yellow-50 border-yellow-300' :
                  'bg-red-50 border-red-300'
                }`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Forensic Verdict</p>
                      <p className={`text-2xl font-black ${
                        analysis.finalVerdict === 'recommend' ? 'text-green-700' :
                        analysis.finalVerdict === 'conditional' ? 'text-yellow-700' : 'text-red-700'
                      }`}>
                        {analysis.finalVerdict === 'recommend' ? '✓ RECOMMEND' :
                         analysis.finalVerdict === 'conditional' ? '◐ CONDITIONAL' : '✗ DECLINE'}
                      </p>
                      <p className="text-sm text-gray-700 mt-1">{analysis.verdictReason}</p>
                    </div>
                    <div className="flex gap-4">
                      {[
                        { label: 'Fraud Indicators', value: analysis.fraudIndicators ?? 'none', map: { none: 'bg-green-100 text-green-700', low: 'bg-yellow-100 text-yellow-700', medium: 'bg-orange-100 text-orange-700', high: 'bg-red-100 text-red-700' } },
                        { label: 'Embassy Risk', value: analysis.embassyRiskLevel ?? 'medium', map: { low: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', high: 'bg-red-100 text-red-700' } },
                      ].map(item => (
                        <div key={item.label} className="text-center">
                          <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${(item.map as Record<string,string>)[item.value] ?? 'bg-gray-100 text-gray-600'}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Multi-Agent Consensus ─────────────────────────────── */}
              {analysis.multiAgentConsensus && (
                <ConsensusCard c={analysis.multiAgentConsensus} />
              )}

              {/* ── Approval Probability Engine ───────────────────────── */}
              {analysis.approvalProbability && (
                <ApprovalProbabilityCard a={analysis} />
              )}

              {/* ── Immigration Officer Simulation ────────────────────── */}
              {analysis.officerSimulation && (
                <OfficerSimulationCard a={analysis} />
              )}

              {/* ── Embassy Officer Narrative ─────────────────────────── */}
              {analysis.embassyOfficerNarrative && (
                <Section title="Embassy Officer Narrative" icon="🏛">
                  <div className="bg-[#0a1628] rounded-xl p-5">
                    <p className="text-xs text-[#c9a84c] uppercase tracking-wider font-semibold mb-3">Case File Notes — Senior Visa Officer Grade</p>
                    <p className="text-blue-100 text-sm leading-relaxed">{analysis.embassyOfficerNarrative}</p>
                  </div>
                </Section>
              )}

              {/* ── Financial Credibility Score ───────────────────────── */}
              {fcs && (
                <Section title="Financial Credibility Score" icon="🎯">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <ScoreBar label="Income Stability"          score={fcs.incomeStability ?? 0} />
                      <ScoreBar label="Source of Funds Clarity"   score={fcs.sourceOfFunds ?? 0} />
                      <ScoreBar label="Balance Sustainability"     score={fcs.balanceSustainability ?? 0} />
                      <ScoreBar label="Transaction Authenticity"  score={fcs.transactionAuthenticity ?? 0} />
                      <ScoreBar label="Travel Affordability"      score={fcs.travelAffordability ?? 0} />
                      <ScoreBar label="Immigration Risk Index"    score={fcs.immigrationRisk ?? 0} />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-2.5">
                      <p className="font-semibold text-gray-500 uppercase tracking-wide mb-3">Scale</p>
                      {[['80–100','Exceptional / Strong','#22c55e'],['60–79','Good / Adequate','#eab308'],['40–59','Fair — Improvement Needed','#f97316'],['0–39','Weak / Insufficient','#ef4444']].map(([r,l,c]) => (
                        <div key={r} className="flex items-start gap-2">
                          <span className="flex-shrink-0 w-14 font-bold mt-0.5" style={{ color: c }}>{r}</span>
                          <span className="text-gray-600">{l}</span>
                        </div>
                      ))}
                      <div className="pt-3 border-t border-gray-200">
                        <p className="text-gray-500 text-[11px]">Immigration Risk Index: 100 = no flags. Deductions per finding (income inflation, parking, circular transfers, etc.)</p>
                      </div>
                    </div>
                  </div>
                </Section>
              )}

              {/* ── Source of Funds Classification ────────────────────── */}
              {analysis.sourceOfFundsClassification && (
                <SourceOfFundsClassificationCard a={analysis} />
              )}

              {/* ── Forensic Investigation ────────────────────────────── */}
              {(analysis.incomeForensics || analysis.balanceForensics || analysis.spendingForensics || analysis.sourceOfFundsForensics) && (
                <Section title="Forensic Investigation" icon="🔬">
                  <div className="space-y-5">

                    {analysis.incomeForensics && (
                      <div className={`rounded-xl border p-4 ${analysis.incomeForensics.verified ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${analysis.incomeForensics.verified ? 'bg-green-500' : 'bg-red-500'}`}>
                              {analysis.incomeForensics.verified ? '✓' : '✗'}
                            </span>
                            <span className="font-bold text-gray-800 text-sm">Income Authenticity</span>
                          </div>
                          <span className="text-xs font-bold text-gray-500">Confidence: {analysis.incomeForensics.confidence}%</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{analysis.incomeForensics.conclusion}</p>
                        {analysis.incomeForensics.amountVariance && (
                          <p className="text-xs text-gray-600 bg-white/60 rounded-lg px-3 py-2 mb-1">
                            <span className="font-semibold">Amount variance:</span> {analysis.incomeForensics.amountVariance}
                          </p>
                        )}
                        {analysis.incomeForensics.timingPattern && (
                          <p className="text-xs text-gray-600 bg-white/60 rounded-lg px-3 py-2 mb-1">
                            <span className="font-semibold">Timing pattern:</span> {analysis.incomeForensics.timingPattern}
                          </p>
                        )}
                        {analysis.incomeForensics.inflationDetected && analysis.incomeForensics.inflationNote && (
                          <p className="text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2 font-semibold">⚠ Salary inflation: {analysis.incomeForensics.inflationNote}</p>
                        )}
                      </div>
                    )}

                    {analysis.balanceForensics && (
                      <div className={`rounded-xl border p-4 ${analysis.balanceForensics.parkingDetected || analysis.balanceForensics.endOfStatementBoostDetected ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${analysis.balanceForensics.parkingDetected || analysis.balanceForensics.endOfStatementBoostDetected ? 'bg-red-500' : 'bg-green-500'}`}>
                            {analysis.balanceForensics.parkingDetected || analysis.balanceForensics.endOfStatementBoostDetected ? '✗' : '✓'}
                          </span>
                          <span className="font-bold text-gray-800 text-sm">Balance Manipulation Check</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                          {[
                            { label: 'Funds Parking', val: analysis.balanceForensics.parkingDetected, note: analysis.balanceForensics.parkingEvidence },
                            { label: 'End-of-Statement Boost', val: analysis.balanceForensics.endOfStatementBoostDetected, note: analysis.balanceForensics.boostNote ?? 'Not detected' },
                            { label: 'Rapid Salary Withdrawal', val: analysis.balanceForensics.rapidWithdrawalAfterSalary, note: analysis.balanceForensics.rapidWithdrawalDetail ?? 'Within normal range' },
                          ].map(c => (
                            <div key={c.label} className={`rounded-lg p-2 ${c.val ? 'bg-red-100' : 'bg-white/60'}`}>
                              <p className="font-semibold text-gray-700 mb-0.5">{c.label}: <span className={c.val ? 'text-red-600' : 'text-green-600'}>{c.val ? 'DETECTED' : 'Clear'}</span></p>
                              <p className="text-gray-600">{c.note}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-600 bg-white/60 rounded-lg px-3 py-2 mt-2">
                          <span className="font-semibold">Sustainability ({analysis.balanceForensics.sustainabilityTrend}):</span> {analysis.balanceForensics.sustainabilityNote}
                        </p>
                      </div>
                    )}

                    {analysis.spendingForensics && (
                      <div className={`rounded-xl border p-4 ${analysis.spendingForensics.accountCharacter === 'genuine' ? 'bg-green-50 border-green-200' : analysis.spendingForensics.accountCharacter === 'engineered' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${analysis.spendingForensics.accountCharacter === 'genuine' ? 'bg-green-500' : analysis.spendingForensics.accountCharacter === 'engineered' ? 'bg-red-500' : 'bg-yellow-500'}`}>
                              {analysis.spendingForensics.accountCharacter === 'genuine' ? '✓' : analysis.spendingForensics.accountCharacter === 'engineered' ? '✗' : '!'}
                            </span>
                            <span className="font-bold text-gray-800 text-sm">Account Activity Analysis</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-gray-500">Avg transactions/month</p>
                            <p className="text-lg font-black text-gray-800">{analysis.spendingForensics.avgTransactionsPerMonth}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 mb-3">{analysis.spendingForensics.characterConclusion}</p>
                        {(analysis.spendingForensics.dormantPeriods ?? []).length > 0 && (
                          <div className="mb-2">
                            {(analysis.spendingForensics.dormantPeriods ?? []).map((d, i) => (
                              <p key={i} className="text-xs text-red-700 bg-red-100 rounded px-2 py-1 mb-1">⚠ Dormant: {d.from} – {d.to} ({d.days} days) — {d.note}</p>
                            ))}
                          </div>
                        )}
                        {(analysis.spendingForensics.recurringExpenses ?? []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">Recurring patterns:</p>
                            {(analysis.spendingForensics.recurringExpenses ?? []).map((e, i) => (
                              <p key={i} className="text-xs text-gray-600 bg-white/60 rounded px-2 py-1 mb-1">✓ {e}</p>
                            ))}
                          </div>
                        )}
                        {analysis.spendingForensics.circularTransfersDetected && (
                          <p className="text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2 mt-2 font-semibold">⚠ Circular transfers: {analysis.spendingForensics.circularTransferNote}</p>
                        )}
                      </div>
                    )}

                    {analysis.sourceOfFundsForensics && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">$</span>
                            <span className="font-bold text-gray-800 text-sm">Source of Funds — Forensic Trace</span>
                          </div>
                          <span className="text-xs font-bold text-gray-500">Confidence: {analysis.sourceOfFundsForensics.confidence}%</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-3">{analysis.sourceOfFundsForensics.conclusion}</p>
                        {(analysis.sourceOfFundsForensics.unexplainedCredits ?? []).length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-red-600 mb-1">Unexplained credits:</p>
                            {(analysis.sourceOfFundsForensics.unexplainedCredits ?? []).map((c, i) => (
                              <p key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-1">
                                {c.date} — {c.description}: {analysis.currency} {c.amount.toLocaleString()} <span className={riskBadge(c.risk)}>{c.risk}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        {(analysis.sourceOfFundsForensics.roundNumberDeposits ?? []).length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-yellow-600 mb-1">Round-number deposits:</p>
                            {(analysis.sourceOfFundsForensics.roundNumberDeposits ?? []).map((d, i) => (
                              <p key={i} className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mb-1">
                                {d.date}: {analysis.currency} {d.amount.toLocaleString()} — {d.note}
                              </p>
                            ))}
                          </div>
                        )}
                        {analysis.sourceOfFundsForensics.finalMonthInjection && (
                          <p className="text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2 font-semibold">⚠ Final-month injection: {analysis.sourceOfFundsForensics.finalMonthNote}</p>
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Behavioral Anomaly Detection ──────────────────────── */}
              {(analysis.behavioralAnomalies?.length ?? 0) > 0 && (
                <Section title="Behavioral Anomaly Detection" icon="🧠">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {analysis.behavioralAnomalies!.map((a: BehavioralAnomaly, i: number) => (
                      <div key={i} className={`rounded-xl border p-3 ${a.detected ? (a.risk === 'high' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200') : 'bg-green-50 border-green-200'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold mt-0.5 ${a.detected ? (a.risk === 'high' ? 'bg-red-500' : 'bg-yellow-500') : 'bg-green-500'}`}>
                            {a.detected ? '!' : '✓'}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-xs font-bold text-gray-800">
                                {a.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              </p>
                              {a.detected && <span className={riskBadge(a.risk)}>{a.risk}</span>}
                            </div>
                            <p className="text-xs text-gray-600">{a.evidence}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Trip Affordability ────────────────────────────────── */}
              {analysis.tripAffordability && (
                <Section title="Trip Affordability" icon="✈️">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    {[
                      { label: 'Disposable Income/mo', value: fmt(analysis.tripAffordability.estimatedDisposableIncome, analysis.tripAffordability.currency) },
                      { label: 'Est. Trip Cost', value: fmt(analysis.tripAffordability.estimatedTripCost, analysis.tripAffordability.currency) },
                      { label: 'Months to Accumulate', value: String(analysis.tripAffordability.monthsToAccumulate) },
                      { label: 'Affordability', value: analysis.tripAffordability.rating },
                    ].map(m => (
                      <div key={m.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                        <p className="text-sm font-bold text-gray-900 capitalize">{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-gray-700">{analysis.tripAffordability.conclusion}</p>
                </Section>
              )}

              {/* Key metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Avg Balance',     value: fmt(analysis.averageMonthlyBalance, analysis.currency), icon: '💳' },
                  { label: 'Monthly Income',  value: fmt(analysis.estimatedMonthlyIncome, analysis.currency), icon: '💰' },
                  { label: 'Savings Rate',    value: `${analysis.savingsRate ?? 0}%`, icon: '📈' },
                  { label: 'Closing Balance', value: fmt(analysis.closingBalance, analysis.currency), icon: '🏁' },
                ].map(m => (
                  <div key={m.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-xl mb-1">{m.icon}</p>
                    <p className="text-lg font-black text-gray-900">{m.value}</p>
                    <p className="text-xs font-semibold text-gray-600 mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Salary Verification */}
              {analysis.salaryVerification && (
                <Section title="Salary Verification" icon="💼">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="md:col-span-2 space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Employer</p>
                          <p className="text-sm font-bold text-gray-900">{analysis.salaryVerification.employer ?? 'Not detected'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Amount</p>
                          <p className="text-sm font-bold text-gray-900">{fmt(analysis.salaryAmount, analysis.currency)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Consistency</p>
                          <p className="text-sm font-black" style={{ color: scoreColor(analysis.salaryVerification.consistencyScore) }}>
                            {analysis.salaryVerification.consistencyScore}%
                          </p>
                        </div>
                      </div>
                      {(analysis.salaryVerification.depositDates ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(analysis.salaryVerification.depositDates ?? []).map((d, i) => (
                            <span key={i} className="bg-green-50 text-green-700 border border-green-200 text-xs px-2.5 py-1 rounded-full font-medium">{d} ✓</span>
                          ))}
                          {(analysis.salaryVerification.missingMonths ?? []).map((m, i) => (
                            <span key={i} className="bg-red-50 text-red-700 border border-red-200 text-xs px-2.5 py-1 rounded-full font-medium">{m} ✗</span>
                          ))}
                        </div>
                      )}
                      {analysis.salaryVerification.notes && (
                        <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">{analysis.salaryVerification.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-4">
                      <div className="relative w-[80px] h-[80px]">
                        <ScoreCircle score={analysis.salaryVerification.consistencyScore} size={80} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-black" style={{ color: scoreColor(analysis.salaryVerification.consistencyScore) }}>{analysis.salaryVerification.consistencyScore}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Consistency</p>
                      <p className="text-xs font-bold mt-0.5" style={{ color: scoreColor(analysis.salaryVerification.consistencyScore) }}>{scoreLabel(analysis.salaryVerification.consistencyScore)}</p>
                    </div>
                  </div>
                </Section>
              )}

              {/* Monthly Cash Flow */}
              {(analysis.monthlyBreakdown?.length ?? 0) > 0 && (
                <Section title="Cash Flow" icon="📊">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Month</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Opening</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-green-600 uppercase">Credits</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-red-500 uppercase">Debits</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Net</th>
                          <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.monthlyBreakdown!.map((m, i) => {
                          const net = m.netFlow ?? (m.totalCredits - m.totalDebits)
                          return (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2.5 pr-4 font-semibold text-gray-800">{m.month}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600">{fmt(m.openingBalance)}</td>
                              <td className="py-2.5 px-3 text-right text-green-600 font-medium">+{fmt(m.totalCredits)}</td>
                              <td className="py-2.5 px-3 text-right text-red-500 font-medium">-{fmt(m.totalDebits)}</td>
                              <td className="py-2.5 px-3 text-right font-semibold" style={{ color: net >= 0 ? '#22c55e' : '#ef4444' }}>{net >= 0 ? '+' : ''}{fmt(net)}</td>
                              <td className="py-2.5 text-right font-bold text-gray-900">{fmt(m.closingBalance)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {analysis.monthlyBreakdown!.some(m => (m.transactions?.length ?? 0) > 0) && (
                    <div className="mt-5 space-y-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notable Transactions</p>
                      {analysis.monthlyBreakdown!.map((m, mi) => (
                        (m.transactions?.length ?? 0) > 0 && (
                          <div key={mi} className="border border-gray-100 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2"><span className="text-xs font-bold text-gray-700">{m.month}</span></div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left py-1.5 px-3 text-gray-400 font-medium">Date</th>
                                  <th className="text-left py-1.5 px-3 text-gray-400 font-medium">Description</th>
                                  <th className="text-right py-1.5 px-3 text-green-600 font-medium">Credit</th>
                                  <th className="text-right py-1.5 px-3 text-red-500 font-medium">Debit</th>
                                  <th className="text-right py-1.5 px-3 text-gray-400 font-medium">Balance</th>
                                  <th className="text-left py-1.5 px-3 text-gray-400 font-medium">Flag</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.transactions!.map((tx, ti) => (
                                  <tr key={ti} className={`border-b border-gray-50 ${tx.flag ? 'bg-yellow-50' : ''}`}>
                                    <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{tx.date}</td>
                                    <td className="py-1.5 px-3 text-gray-700 max-w-[180px] truncate">{tx.description}</td>
                                    <td className="py-1.5 px-3 text-right text-green-600 font-medium whitespace-nowrap">{tx.type === 'credit' ? fmt(tx.amount) : ''}</td>
                                    <td className="py-1.5 px-3 text-right text-red-500 font-medium whitespace-nowrap">{tx.type === 'debit' ? fmt(tx.amount) : ''}</td>
                                    <td className="py-1.5 px-3 text-right text-gray-600 whitespace-nowrap">{tx.runningBalance != null ? fmt(tx.runningBalance) : '—'}</td>
                                    <td className="py-1.5 px-3">{tx.flag && <span className="text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded text-[10px]">{tx.flag}</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {/* Spending + Source */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(analysis.spendingCategories?.length ?? 0) > 0 && (
                  <Section title="Spending Categories" icon="🏷">
                    <div className="space-y-3.5">
                      {analysis.spendingCategories!.map((cat, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">{cat.category}</span>
                            <span className="text-gray-500">{analysis.currency} {fmt(cat.amount)} · {cat.percentage}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, backgroundColor: ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#6b7280'][i % 6] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
                {(analysis.sourceOfFunds?.length ?? 0) > 0 && (
                  <Section title="Income Sources" icon="🔍">
                    <div className="space-y-4">
                      {analysis.sourceOfFunds!.map((s, i) => (
                        <div key={i}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold text-gray-700">{s.source}</span>
                            <span className={riskBadge(s.risk)}>{s.risk} risk</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                            <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, backgroundColor: s.risk === 'low' ? '#22c55e' : s.risk === 'medium' ? '#eab308' : '#ef4444' }} />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>{s.note}</span>
                            <span>{analysis.currency} {fmt(s.amount)} ({s.percentage}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>

              {/* Large Transactions */}
              {(analysis.largeTransactions?.length ?? 0) > 0 && (
                <Section title="Large Transactions" icon="🔎">
                  <div className="space-y-3">
                    {analysis.largeTransactions!.map((tx, i) => (
                      <div key={i} className={`border rounded-xl p-4 ${tx.risk === 'high' ? 'border-red-200 bg-red-50' : tx.risk === 'medium' ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-xs text-gray-500">{tx.date}</span>
                              <span className={`text-xs font-bold ${tx.type === 'credit' ? 'text-green-700' : 'text-red-700'}`}>{tx.type === 'credit' ? '↑ Credit' : '↓ Debit'}</span>
                              <span className={riskBadge(tx.risk)}>{tx.risk} risk</span>
                            </div>
                            <p className="text-sm font-semibold text-gray-800 truncate">{tx.description}</p>
                            <p className="text-xs text-gray-600 mt-1">{tx.aiExplanation}</p>
                          </div>
                          <p className={`text-base font-black flex-shrink-0 ${tx.type === 'credit' ? 'text-green-700' : 'text-red-700'}`}>
                            {tx.type === 'credit' ? '+' : '-'}{analysis.currency} {fmt(tx.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Risk Flags */}
              {(analysis.riskFlags?.length ?? 0) > 0 && (
                <Section title="Risk Engine" icon="🚦">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {analysis.riskFlags!.map((f, i) => (
                      <div key={i} className={`flex items-start gap-3 border rounded-xl p-3 ${flagColor(f.status)}`}>
                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5 ${flagIconBg(f.status)}`}>{flagIcon(f.status)}</span>
                        <div>
                          <p className="text-xs font-bold">{f.category}</p>
                          <p className="text-xs mt-0.5 opacity-80">{f.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Embassy Assessment */}
              {(analysis.embassyAssessments?.length ?? 0) > 0 && (
                <Section title="Embassy Assessment" icon="🏛">
                  <div className="space-y-4">
                    {analysis.embassyAssessments!.map((ea, i) => (
                      <div key={i} className={`rounded-xl border p-4 ${ea.met ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-bold text-gray-900">{ea.destination}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${ea.met ? 'bg-green-500' : 'bg-red-500'}`}>{ea.met ? '✓ Threshold Met' : '✗ Below Threshold'}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                          <div><span className="text-gray-500">Required:</span><span className="font-semibold ml-1">{ea.currency} {fmt(ea.requiredAmount)}</span></div>
                          <div><span className="text-gray-500">Applicant:</span><span className="font-semibold ml-1">{ea.currency} {fmt(ea.applicantEquivalent)}</span></div>
                          <div><span className="text-gray-500">Confidence:</span><span className="font-semibold ml-1" style={{ color: scoreColor(ea.confidence) }}>{ea.confidence}%</span></div>
                        </div>
                        {ea.recommendation && <p className={`text-xs font-medium px-3 py-2 rounded-lg ${ea.met ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>📋 {ea.recommendation}</p>}
                        {(ea.concerns ?? []).filter(Boolean).map((c, ci) => (
                          <p key={ci} className="text-xs text-gray-700 flex items-start gap-1.5 mt-1"><span className="text-yellow-500">⚠</span> {c}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Suspicious Transactions */}
              {(analysis.suspiciousTransactions?.length ?? 0) > 0 && (
                <Section title="Suspicious Transactions" icon="⚠️">
                  <div className="space-y-2">
                    {analysis.suspiciousTransactions!.map((tx, i) => (
                      <div key={i} className={`flex items-start gap-3 border rounded-xl p-3 ${tx.severity === 'high' ? 'bg-red-50 border-red-200' : tx.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                        <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 ${tx.severity === 'high' ? 'bg-red-100 text-red-700' : tx.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{tx.severity}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{tx.date}</span>
                            <span className={tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}>{tx.type === 'credit' ? '↑' : '↓'} {analysis.currency} {fmt(tx.amount)}</span>
                          </div>
                          <p className="text-xs font-semibold text-gray-800 truncate">{tx.description}</p>
                          <p className="text-xs text-gray-600">{tx.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Agent Notes */}
              {analysis.agentNotes && (
                <div className="bg-[#0a1628] rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span>🔒</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wide">Agent Notes — Internal Only</h3>
                  </div>
                  <p className="text-blue-200 text-sm leading-relaxed whitespace-pre-line">{analysis.agentNotes}</p>
                  {(analysis.warnings?.length ?? 0) > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {analysis.warnings!.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-3 py-2">
                          <span className="text-yellow-400 flex-shrink-0 mt-0.5">⚠</span>
                          <span className="text-yellow-200 text-xs">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Recommendations */}
              {(analysis.recommendations?.length ?? 0) > 0 && (
                <Section title="Recommendations" icon="💡">
                  <ul className="space-y-2.5">
                    {analysis.recommendations!.map((r, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span className="text-sm text-gray-700">{r}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

            </div>
          )}
          </AnalysisErrorBoundary>
        </div>
      )}
    </div>
  )
}
