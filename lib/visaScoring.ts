import type { ExtractedStatement, MathematicalScore, PredictiveAssessment } from './analyzeBankStatement'

// Deterministic mathematical scoring — same input always gives same output.
// No AI involved. Used as anchors for agent prompts.

export function computeMathematicalScore(
  extracted:         ExtractedStatement,
  embassyThreshold:  number,
  totalMonths:       number,
  parkingWindowDays: number,
): MathematicalScore {

  const txns    = extracted.transactions ?? []
  const credits = txns.filter(t => (t.credit ?? 0) > 0)

  // ── INCOME STABILITY ─────────────────────────────────────────────────────
  const salaryCandidates = credits.filter(t => {
    const d = (t.description ?? '').toLowerCase()
    return d.includes('salary') || d.includes('payroll') || d.includes('wages') ||
           d.includes('pay') || d.includes('s/a') || d.includes('sal ')
  })

  const salaryAmounts = salaryCandidates.map(t => t.credit ?? 0)
  const salaryMean    = salaryAmounts.length > 0
    ? salaryAmounts.reduce((a, b) => a + b, 0) / salaryAmounts.length
    : 0
  const salaryStdDev  = salaryAmounts.length > 1
    ? Math.sqrt(
        salaryAmounts.map(x => Math.pow(x - salaryMean, 2)).reduce((a, b) => a + b, 0) /
        salaryAmounts.length
      )
    : 0

  const monthsWithSalary  = Math.min(salaryCandidates.length, totalMonths)
  const varianceScore     = salaryMean > 0 ? Math.max(0, 1 - salaryStdDev / salaryMean) : 0
  const employerClarity   = salaryCandidates.length > 0 ? 0.8 : 0

  const incomeScore = Math.round(
    (monthsWithSalary / Math.max(totalMonths, 1)) * 50 +
    varianceScore * 30 +
    employerClarity * 20
  )

  // ── SOURCE OF FUNDS ───────────────────────────────────────────────────────
  const totalCreditAmount = credits.reduce((s, t) => s + (t.credit ?? 0), 0)

  const verifiedCredits = credits
    .filter(t => {
      const d = (t.description ?? '').toLowerCase()
      return d.includes('salary') || d.includes('payroll') || d.includes('wages') ||
             d.includes('transfer from') || d.includes('dividend') || d.includes('rental')
    })
    .reduce((s, t) => s + (t.credit ?? 0), 0)

  const cashDeposits = credits
    .filter(t => {
      const d = (t.description ?? '').toLowerCase()
      return d.includes('cash') || d.includes('atm deposit') || d.includes('counter credit')
    })
    .reduce((s, t) => s + (t.credit ?? 0), 0)

  const cashRatio     = totalCreditAmount > 0 ? cashDeposits / totalCreditAmount : 0
  const verifiedRatio = totalCreditAmount > 0 ? verifiedCredits / totalCreditAmount : 0

  const sourceScore = Math.round(
    verifiedRatio * 60 +
    (1 - cashRatio) * 20 +
    (verifiedRatio > 0.8 ? 20 : verifiedRatio * 20)
  )

  // ── BALANCE SUSTAINABILITY ────────────────────────────────────────────────
  const balances    = txns.map(t => t.balance ?? 0).filter(b => b > 0)
  const minBalance  = balances.length > 0 ? Math.min(...balances) : 0
  const firstBal    = balances[0] ?? 0
  const lastBal     = balances[balances.length - 1] ?? 0
  const trendSlope  = balances.length > 1 ? (lastBal - firstBal) / balances.length : 0

  // Parking: large credit in final parkingWindow days
  const lastTxnDate    = txns.length > 0 ? new Date(txns[txns.length - 1].date) : new Date()
  const parkingWindowMs = parkingWindowDays * 24 * 60 * 60 * 1000
  const parkingCredits  = credits.filter(t => {
    try {
      const d = new Date(t.date)
      return (lastTxnDate.getTime() - d.getTime()) < parkingWindowMs &&
             (t.credit ?? 0) > embassyThreshold * 0.5
    } catch { return false }
  })
  const parkingPenalty = parkingCredits.length > 0 ? 25 : 0

  const thresholdRatio  = embassyThreshold > 0 ? Math.min(minBalance / embassyThreshold, 1) : 0
  const trendScore      = trendSlope > 0 ? 30 : trendSlope === 0 ? 15 : 0
  const balanceScore    = Math.round(thresholdRatio * 40 + trendScore - parkingPenalty)

  return {
    incomeStabilityFormula: {
      monthsWithSalary,
      totalMonths,
      salaryMean,
      salaryStdDev,
      employerClarity,
      computedScore: Math.max(0, Math.min(100, incomeScore)),
    },
    sourceOfFundsFormula: {
      verifiedCredits,
      totalCredits:     totalCreditAmount,
      cashDepositRatio: cashRatio,
      namedSourceRatio: verifiedRatio,
      computedScore:    Math.max(0, Math.min(100, sourceScore)),
    },
    balanceSustainabilityFormula: {
      minBalance,
      embassyThreshold,
      trendSlope:    Math.round(trendSlope),
      parkingPenalty,
      computedScore: Math.max(0, Math.min(100, balanceScore)),
    },
  }
}

export function computePredictiveAssessment(
  extracted:        ExtractedStatement,
  mathScore:        MathematicalScore,
  embassyThreshold: number,
  currency:         string,
): PredictiveAssessment {

  const closing      = extracted.closingBalance ?? 0
  const netFlow      = extracted.totalCredits - extracted.totalDebits
  const monthlyNet   = netFlow / 3  // assume 3-month statement

  const proj30 = Math.max(0, closing + monthlyNet)
  const proj60 = Math.max(0, closing + monthlyNet * 2)
  const proj90 = Math.max(0, closing + monthlyNet * 3)

  let monthsToQualify: number | null = null
  if (closing >= embassyThreshold) {
    monthsToQualify = 0
  } else if (monthlyNet > 0) {
    monthsToQualify = Math.ceil((embassyThreshold - closing) / monthlyNet)
  }

  const scoreAvg = (
    mathScore.incomeStabilityFormula.computedScore +
    mathScore.sourceOfFundsFormula.computedScore +
    mathScore.balanceSustainabilityFormula.computedScore
  ) / 3

  const r30 = Math.min(100, scoreAvg + (monthlyNet > 0 ?  5 : -5))
  const r60 = Math.min(100, scoreAvg + (monthlyNet > 0 ? 10 : -10))
  const r90 = Math.min(100, scoreAvg + (monthlyNet > 0 ? 15 : -15))

  const threshold = embassyThreshold * 0.05
  const trajectory: PredictiveAssessment['financialTrajectory'] =
    monthlyNet >  threshold ? 'improving' :
    monthlyNet < -threshold ? 'declining' :
    'stable'

  let recommendedApplyDate = 'Apply now'
  if (monthsToQualify && monthsToQualify > 0) {
    const d = new Date()
    d.setMonth(d.getMonth() + monthsToQualify)
    recommendedApplyDate = `Apply after: ${d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`
  }

  return {
    currentReadiness:     Math.round(Math.max(0, scoreAvg)),
    predictedReadiness30: Math.round(Math.max(0, r30)),
    predictedReadiness60: Math.round(Math.max(0, r60)),
    predictedReadiness90: Math.round(Math.max(0, r90)),
    recommendedApplyDate,
    financialTrajectory:  trajectory,
    trajectoryNote: trajectory === 'improving'
      ? `Balance growing at ~${currency}${Math.round(monthlyNet).toLocaleString()}/month — financial position strengthening`
      : trajectory === 'declining'
      ? `Balance declining at ~${currency}${Math.abs(Math.round(monthlyNet)).toLocaleString()}/month — address outflows before applying`
      : 'Balance stable — maintain current pattern',
    projectedBalanceAt30: Math.round(proj30),
    projectedBalanceAt60: Math.round(proj60),
    projectedBalanceAt90: Math.round(proj90),
    monthlyNetFlow:       Math.round(monthlyNet),
    monthsToQualify,
  }
}
