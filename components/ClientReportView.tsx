'use client'

import type { BankStatementAnalysis } from '@/lib/analyzeBankStatement'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, currency = ''): string {
  if (n == null || isNaN(n)) return '—'
  const str = Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return currency ? `${currency} ${str}` : str
}

function starRating(score: number): string {
  const stars = Math.round(score / 20)
  return '★'.repeat(stars) + '☆'.repeat(5 - stars)
}

function starColor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#eab308'
  return '#f97316'
}

function destinationName(dest: string): string {
  const map: Record<string, string> = {
    uk: 'United Kingdom', canada: 'Canada', usa: 'United States',
    schengen: 'Schengen / Europe', uae: 'United Arab Emirates',
    australia: 'Australia', nigeria: 'Nigeria', ghana: 'Ghana',
  }
  return map[dest.toLowerCase()] ?? dest.toUpperCase()
}

function visaTypeName(dest: string): string {
  const map: Record<string, string> = {
    uk: 'UK Standard Visitor Visa', canada: 'Canada Temporary Resident Visa',
    usa: 'US B1/B2 Visitor Visa', schengen: 'Schengen Short-Stay Visa (Type C)',
    uae: 'UAE Tourist Visa', australia: 'Australia Subclass 600 Visitor Visa',
  }
  return map[dest.toLowerCase()] ?? `${dest.toUpperCase()} Visitor Visa`
}

// ─── Derive strengths and improvements from the analysis ─────────────────────

function deriveStrengths(a: BankStatementAnalysis): string[] {
  const s: string[] = []
  if (a.salaryCreditsDetected && a.salaryVerification?.consistencyScore >= 70)
    s.push('Consistent monthly salary deposits confirmed')
  if (a.incomeRegular)
    s.push('Regular and verifiable income pattern')
  if (!a.overdraftsDetected)
    s.push('No overdrafts during the statement period')
  if (a.averageMonthlyBalance > 0 && a.lowestBalance > 0)
    s.push('Positive account balance maintained throughout')
  if ((a.savingsRate ?? 0) > 10)
    s.push(`Positive savings behaviour — ${a.savingsRate}% net savings rate`)
  if (a.embassyThresholdMet)
    s.push(`Meets the financial threshold for ${destinationName('uk')} visa requirements`)
  if (!a.roundNumberDeposits && !a.unusualDepositPattern)
    s.push('No unusual deposit patterns identified')
  if ((a.suspiciousTransactions?.length ?? 0) === 0)
    s.push('No suspicious transactions flagged')
  return s.slice(0, 5)
}

function deriveImprovements(a: BankStatementAnalysis): string[] {
  const imp: string[] = []
  const cashRisk = a.riskFlags?.find(f => f.category === 'Cash Deposits')
  if (cashRisk && cashRisk.status !== 'ok')
    imp.push('Provide a written explanation for any cash deposits to strengthen the application')
  if ((a.balanceDipsBelow?.length ?? 0) > 0)
    imp.push('Maintaining a consistently higher balance in future months will strengthen your profile')
  if (!a.embassyThresholdMet)
    imp.push(`Aim to maintain the required minimum balance before submitting your application`)
  const parkingFlag = a.riskFlags?.find(f => f.category === 'Funds Parking')
  if (parkingFlag && parkingFlag.status !== 'ok')
    imp.push('Avoid making large one-off deposits immediately before your application date')
  if ((a.salaryVerification?.missingMonths?.length ?? 0) > 0)
    imp.push('Obtain an employer letter to cover any months where salary deposits were irregular')
  if (!imp.length)
    imp.push('Continue maintaining your current financial habits to keep your profile strong')
  return imp.slice(0, 4)
}

// ─── Embassy Readiness Stars ──────────────────────────────────────────────────

const EMBASSY_APPROX_SCORES: Record<string, (a: BankStatementAnalysis) => number> = {
  uk: (a) => {
    let s = 50
    if (a.embassyThresholdMet) s += 20
    if (a.salaryCreditsDetected) s += 10
    if (!a.overdraftsDetected) s += 10
    if ((a.balanceDipsBelow?.length ?? 0) === 0) s += 10
    return Math.min(s, 100)
  },
  canada: (a) => {
    let s = 45
    if (a.embassyThresholdMet) s += 20
    if ((a.savingsRate ?? 0) > 15) s += 10
    if (a.salaryCreditsDetected) s += 10
    if (!a.unusualDepositPattern) s += 10
    if (!a.overdraftsDetected) s += 5
    return Math.min(s, 100)
  },
  schengen: (a) => {
    let s = 50
    if (a.embassyThresholdMet) s += 20
    if (a.incomeRegular) s += 10
    if (!a.overdraftsDetected) s += 10
    if ((a.suspiciousTransactions?.length ?? 0) === 0) s += 10
    return Math.min(s, 100)
  },
  uae: (a) => {
    let s = 55
    if (a.embassyThresholdMet) s += 20
    if (a.salaryCreditsDetected) s += 10
    if (!a.overdraftsDetected) s += 10
    if ((a.balanceDipsBelow?.length ?? 0) === 0) s += 5
    return Math.min(s, 100)
  },
  usa: (a) => {
    let s = 40
    if (a.embassyThresholdMet) s += 20
    if (a.salaryCreditsDetected && a.salaryVerification?.consistencyScore >= 80) s += 15
    if (!a.unusualDepositPattern) s += 10
    if (!a.overdraftsDetected) s += 10
    if ((a.savingsRate ?? 0) > 20) s += 5
    return Math.min(s, 100)
  },
  australia: (a) => {
    let s = 50
    if (a.embassyThresholdMet) s += 20
    if (a.incomeRegular) s += 10
    if (!a.overdraftsDetected) s += 10
    if ((a.suspiciousTransactions?.length ?? 0) === 0) s += 10
    return Math.min(s, 100)
  },
}

interface Props {
  analysis: BankStatementAnalysis
  clientName: string
  destination: string
  analyzedAt?: string
  printMode?: boolean
  onPrint?: () => void
}

export function ClientReportView({ analysis: a, clientName, destination, analyzedAt, printMode, onPrint }: Props) {
  const generatedDate = analyzedAt
    ? new Date(analyzedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const strengths    = deriveStrengths(a)
  const improvements = deriveImprovements(a)

  // Embassy readiness — always show the 4 most relevant
  const embassyDestinations = ['uk','canada','schengen','uae','usa','australia']
    .filter(d => d !== destination.toLowerCase())
    .slice(0, 3)
  const allEmbassies = [destination.toLowerCase(), ...embassyDestinations]
  const embassyScores = allEmbassies.map(d => ({
    label: destinationName(d),
    score: (EMBASSY_APPROX_SCORES[d] ?? EMBASSY_APPROX_SCORES['uk'])(a),
    primary: d === destination.toLowerCase(),
  }))

  const outcomeLabel = a.status === 'PASS'   ? 'Strong Financial Profile'
                     : a.status === 'REVIEW' ? 'Satisfactory — Minor Notes'
                     :                         'Requires Attention'
  const outcomeColor = a.status === 'PASS'   ? '#22c55e'
                     : a.status === 'REVIEW' ? '#d97706'
                     :                         '#dc2626'

  return (
    <div className="min-h-screen bg-white font-sans print:text-black">

      {/* ── Print / download button (hidden when printing) ─────────────── */}
      {!printMode && (
        <div className="bg-[#0a1628] px-6 py-3 flex items-center justify-between print:hidden sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[#c9a84c] font-bold text-sm">Walz Travels</span>
            <span className="text-white/40 text-xs">/ Financial Eligibility Report</span>
          </div>
          <button
            onClick={onPrint ?? (() => window.print())}
            className="bg-[#c9a84c] hover:bg-[#b8973b] text-[#0a1628] font-bold text-sm px-4 py-2 rounded-lg"
          >
            🖨 Save / Print PDF
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-12 print:px-0 print:py-0 print:space-y-0">

        {/* ══ COVER PAGE ═══════════════════════════════════════════════ */}
        <div className="print-page bg-[#0a1628] rounded-2xl overflow-hidden print:rounded-none print:min-h-screen print:flex print:flex-col print:justify-between">

          {/* Logo / brand bar */}
          <div className="px-10 pt-10 pb-6 border-b border-white/10">
            <p className="text-[#c9a84c] text-xs uppercase tracking-[0.2em] font-semibold mb-1">Walz Travels</p>
            <p className="text-white/40 text-xs">Visa Intelligence Division</p>
          </div>

          {/* Main cover content */}
          <div className="px-10 py-14 flex-1">
            <p className="text-[#c9a84c] text-xs uppercase tracking-[0.25em] font-semibold mb-6">Confidential</p>
            <h1 className="text-4xl font-black text-white leading-tight mb-3">
              Financial<br />Eligibility Report
            </h1>
            <div className="w-16 h-1 bg-[#c9a84c] rounded-full mb-10" />

            <div className="space-y-5">
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Prepared for</p>
                <p className="text-white text-xl font-bold">{clientName}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Visa Application</p>
                <p className="text-white text-base font-semibold">{visaTypeName(destination)}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Statement Period</p>
                <p className="text-white text-base font-semibold">{a.statementPeriod ?? '—'}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Generated</p>
                <p className="text-white text-base font-semibold">{generatedDate}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-10 py-6 border-t border-white/10">
            <p className="text-white/30 text-xs leading-relaxed">
              This report is prepared by Walz Travels Visa Intelligence Team and is advisory in nature.
              Visa decisions are made solely by immigration authorities of the destination country.
            </p>
          </div>
        </div>

        {/* ══ ASSESSMENT OUTCOME ═══════════════════════════════════════ */}
        <div className="print-page space-y-6 print:pt-10">

          <div className="border-b border-gray-100 pb-4 mb-6">
            <p className="text-[#c9a84c] text-xs uppercase tracking-[0.15em] font-semibold mb-1">Section 1</p>
            <h2 className="text-2xl font-bold text-[#0a1628]">Assessment Outcome</h2>
          </div>

          {/* Outcome card */}
          <div className="rounded-2xl p-6 border-2" style={{ borderColor: outcomeColor, background: `${outcomeColor}10` }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: outcomeColor }} />
              <p className="text-lg font-bold" style={{ color: outcomeColor }}>{outcomeLabel}</p>
            </div>
            {a.summary && (
              <p className="text-gray-700 text-sm leading-relaxed">{a.summary}</p>
            )}
          </div>

          {/* Key metrics — client-friendly only */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Statement Period',     value: a.statementPeriod ?? '—' },
              { label: 'Months Reviewed',      value: String(a.monthsAnalyzed ?? '—') },
              { label: 'Account Currency',     value: a.currency ?? '—' },
              { label: 'Average Balance',      value: fmt(a.averageMonthlyBalance, a.currency) },
              { label: 'Monthly Income',       value: fmt(a.estimatedMonthlyIncome, a.currency) },
              { label: 'Closing Balance',      value: fmt(a.closingBalance, a.currency) },
            ].map(m => (
              <div key={m.label} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{m.label}</p>
                <p className="text-base font-bold text-[#0a1628]">{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ══ FINANCIAL STRENGTHS & IMPROVEMENTS ══════════════════════ */}
        <div className="print-page space-y-6">

          <div className="border-b border-gray-100 pb-4 mb-6">
            <p className="text-[#c9a84c] text-xs uppercase tracking-[0.15em] font-semibold mb-1">Section 2</p>
            <h2 className="text-2xl font-bold text-[#0a1628]">Financial Analysis</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Strengths */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-green-600 text-lg">✓</span>
                <h3 className="font-bold text-green-800">Financial Strengths</h3>
              </div>
              <ul className="space-y-2.5">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                    <span className="flex-shrink-0 text-green-500 mt-0.5">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* Improvement areas */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-amber-600 text-lg">◆</span>
                <h3 className="font-bold text-amber-800">Improvement Areas</h3>
              </div>
              <ul className="space-y-2.5">
                {improvements.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                    <span className="flex-shrink-0 text-amber-500 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Embassy officer narrative — the premium insight */}
          {(a.embassyOfficerNarrative || a.aiNarrative) && (
            <div className="border-l-4 border-[#c9a84c] bg-[#c9a84c]/5 rounded-r-xl p-5">
              <p className="text-xs text-[#b8973b] uppercase tracking-wider font-semibold mb-2">Financial Assessment</p>
              <p className="text-gray-700 text-sm leading-relaxed">{a.embassyOfficerNarrative || a.aiNarrative}</p>
            </div>
          )}
        </div>

        {/* ══ APPLICATION STRENGTHS (from officer simulation) ══════════ */}
        {Array.isArray(a.officerSimulation?.reasonsToApprove) && a.officerSimulation!.reasonsToApprove.length > 0 && (
          <div className="print-page space-y-6">
            <div className="border-b border-gray-100 pb-4 mb-6">
              <p className="text-[#c9a84c] text-xs uppercase tracking-[0.15em] font-semibold mb-1">Section 3</p>
              <h2 className="text-2xl font-bold text-[#0a1628]">Key Application Strengths</h2>
              <p className="text-gray-500 text-sm mt-1">
                Based on our review of your bank statement, the following financial factors support your visa application.
              </p>
            </div>

            <div className="space-y-3">
              {a.officerSimulation!.reasonsToApprove.map((reason, i) => (
                <div key={i} className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-xl p-4">
                  <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full text-xs font-bold flex items-center justify-center mt-0.5">✓</span>
                  <p className="text-sm text-green-800 leading-relaxed">{reason}</p>
                </div>
              ))}
            </div>

            {/* Source of funds credibility bar — client-friendly */}
            {a.sourceOfFundsClassification && a.sourceOfFundsClassification.verifiedPercentage > 0 && (
              <div className="bg-[#0a1628] rounded-2xl p-5">
                <p className="text-[#c9a84c] text-xs uppercase tracking-wider font-semibold mb-3">Income Source Credibility</p>
                <div className="flex gap-1 h-5 rounded-full overflow-hidden mb-3">
                  <div style={{ width: `${a.sourceOfFundsClassification.verifiedPercentage}%`, backgroundColor: '#22c55e' }} />
                  <div style={{ width: `${a.sourceOfFundsClassification.partiallyVerifiedPercentage}%`, backgroundColor: '#eab308' }} />
                  <div style={{ width: `${a.sourceOfFundsClassification.unverifiedPercentage}%`, backgroundColor: '#6b7280' }} />
                </div>
                <div className="flex gap-5 text-xs">
                  <span className="flex items-center gap-1 text-white/80">
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                    Clearly Verified <span className="font-bold text-green-400 ml-1">{a.sourceOfFundsClassification.verifiedPercentage}%</span>
                  </span>
                  <span className="flex items-center gap-1 text-white/80">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                    Supporting Evidence <span className="font-bold text-yellow-400 ml-1">{a.sourceOfFundsClassification.partiallyVerifiedPercentage}%</span>
                  </span>
                  {a.sourceOfFundsClassification.unverifiedPercentage > 0 && (
                    <span className="flex items-center gap-1 text-white/50">
                      <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                      Requires Explanation <span className="font-bold text-gray-400 ml-1">{a.sourceOfFundsClassification.unverifiedPercentage}%</span>
                    </span>
                  )}
                </div>
                <p className="text-white/50 text-xs mt-3 leading-relaxed">{a.sourceOfFundsClassification.conclusion}</p>
              </div>
            )}
          </div>
        )}

        {/* ══ EMBASSY READINESS ════════════════════════════════════════ */}
        <div className="print-page space-y-6">

          <div className="border-b border-gray-100 pb-4 mb-6">
            <p className="text-[#c9a84c] text-xs uppercase tracking-[0.15em] font-semibold mb-1">Section 4</p>
            <h2 className="text-2xl font-bold text-[#0a1628]">Embassy Readiness</h2>
            <p className="text-gray-500 text-sm mt-1">Financial eligibility assessment per destination</p>
          </div>

          <div className="space-y-3">
            {embassyScores.map((e, i) => (
              <div key={i} className={`flex items-center gap-4 rounded-xl p-4 border ${e.primary ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#0a1628]">{e.label}</p>
                    {e.primary && <span className="text-[10px] bg-[#c9a84c] text-[#0a1628] font-bold px-2 py-0.5 rounded-full">Your Application</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg tracking-widest" style={{ color: starColor(e.score) }}>{starRating(e.score)}</p>
                  <p className="text-xs mt-0.5" style={{ color: starColor(e.score) }}>
                    {e.score >= 80 ? 'Strong' : e.score >= 60 ? 'Moderate' : 'Developing'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Embassy-specific notes if available */}
          {(a.embassyAssessments?.length ?? 0) > 0 && a.embassyAssessments![0]?.recommendation && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs text-blue-500 uppercase tracking-wider font-semibold mb-2">
                {destinationName(destination)} — Recommendation
              </p>
              <p className="text-sm text-blue-800">{a.embassyAssessments![0].recommendation}</p>
            </div>
          )}
        </div>

        {/* ══ SALARY & INCOME VERIFICATION ════════════════════════════ */}
        {a.salaryVerification?.detected && (
          <div className="print-page space-y-4">
            <div className="border-b border-gray-100 pb-4 mb-6">
              <p className="text-[#c9a84c] text-xs uppercase tracking-[0.15em] font-semibold mb-1">Section 5</p>
              <h2 className="text-2xl font-bold text-[#0a1628]">Income Verification</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {a.salaryVerification.employer && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 md:col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Employer</p>
                  <p className="text-base font-bold text-[#0a1628]">{a.salaryVerification.employer}</p>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Monthly Salary</p>
                <p className="text-base font-bold text-[#0a1628]">{fmt(a.salaryAmount, a.currency)}</p>
              </div>
            </div>

            {a.salaryVerification.depositDates.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Salary Credits Detected</p>
                <div className="flex flex-wrap gap-2">
                  {a.salaryVerification.depositDates.map((d, i) => (
                    <span key={i} className="bg-green-50 text-green-700 border border-green-200 text-xs px-3 py-1.5 rounded-full font-semibold">
                      {d} ✓
                    </span>
                  ))}
                  {a.salaryVerification.missingMonths.map((m, i) => (
                    <span key={i} className="bg-gray-100 text-gray-500 border border-gray-200 text-xs px-3 py-1.5 rounded-full">
                      {m} (absent)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {a.salaryVerification.notes && (
              <p className="text-xs text-gray-500 italic">{a.salaryVerification.notes}</p>
            )}
          </div>
        )}

        {/* ══ RECOMMENDATIONS ══════════════════════════════════════════ */}
        {(a.recommendations?.length ?? 0) > 0 && (
          <div className="print-page space-y-4">
            <div className="border-b border-gray-100 pb-4 mb-6">
              <p className="text-[#c9a84c] text-xs uppercase tracking-[0.15em] font-semibold mb-1">Section 6</p>
              <h2 className="text-2xl font-bold text-[#0a1628]">Next Steps</h2>
            </div>
            <ul className="space-y-3">
              {a.recommendations!.map((r, i) => (
                <li key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <span className="flex-shrink-0 w-6 h-6 bg-[#0a1628] text-white rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700 leading-relaxed">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ══ FOOTER / ABOUT ═══════════════════════════════════════════ */}
        <div className="print-page bg-[#0a1628] rounded-2xl p-8 print:mt-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="text-[#c9a84c] font-bold text-base mb-1">Walz Travels</p>
              <p className="text-white/60 text-xs leading-relaxed max-w-sm">
                This report was prepared by the Walz Travels Visa Intelligence Team on {generatedDate}.
                Our analysis is advisory and does not constitute a guarantee of visa approval.
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-white/40 text-xs">Contact Us</p>
              <p className="text-white text-sm">contact@walztravels.com</p>
              <p className="text-white/60 text-xs">www.walztravels.com</p>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @media print {
          body, html { background: white !important; margin: 0; padding: 0; }
          .print\\:hidden { display: none !important; }
          .sticky { position: relative !important; }
          .print-page {
            page-break-after: always;
            break-after: page;
            padding-top: 2rem;
          }
          .print-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
          @page {
            size: A4;
            margin: 15mm;
          }
        }
      `}</style>
    </div>
  )
}
