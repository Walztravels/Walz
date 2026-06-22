import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import type { DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages'

// ─── JSON enforcement ─────────────────────────────────────────────────────────

const JSON_ONLY = '\n\nCRITICAL: Your entire response must be valid JSON only. No preamble, no explanation, no markdown code fences, no prose before or after. Start your response with { and end with }. If you cannot analyse the document, return: {"error": "reason here", "analysable": false}'

async function callClaudeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  const delays = [1000, 2000, 4000]
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isOverloaded = (err as { status?: number })?.status === 529
      if (isOverloaded && attempt < maxRetries) {
        await new Promise<void>(r => setTimeout(r, delays[attempt] ?? 4000))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}

function parseClaudePrefillJSON<T>(text: string): T {
  // T1: direct parse
  try { return JSON.parse(text) as T } catch {}
  // T2: strip markdown fences
  const stripped = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try { return JSON.parse(stripped) as T } catch {}
  // T3: bracket-counting — find outermost {...} without greedy regex truncation
  const start = stripped.indexOf('{')
  if (start !== -1) {
    let depth = 0; let inStr = false; let esc = false
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i]
      if (esc)                    { esc = false; continue }
      if (ch === '\\' && inStr)   { esc = true;  continue }
      if (ch === '"')             { inStr = !inStr; continue }
      if (inStr)                  continue
      if (ch === '{')             depth++
      else if (ch === '}')        { depth--; if (depth === 0) { try { return JSON.parse(stripped.slice(start, i + 1)) as T } catch {} ; break } }
    }
  }
  // T4: legacy bare-tail fallback
  try { return JSON.parse('{' + text) as T } catch {}
  console.error('VisaFortress parse error — raw (first 400):', text.slice(0, 400))
  throw new Error('VisaFortress: Could not extract valid JSON from Claude response')
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialCredibilityScore {
  incomeStability: number         // /100
  sourceOfFunds: number           // /100
  balanceSustainability: number   // /100
  transactionAuthenticity: number // /100
  travelAffordability: number     // /100
  immigrationRisk: number         // /100 — higher = LESS risk (inverse)
  overall: number                 // /100 weighted
  label: 'Exceptional' | 'Strong' | 'Adequate' | 'Weak' | 'Insufficient'
}

// Keep for backward compat
export type VisaScore = FinancialCredibilityScore

export interface SalaryVerification {
  detected: boolean
  employer: string | null
  monthlyAmount: number | null
  depositDates: string[]
  consistencyScore: number
  missingMonths: string[]
  notes: string
}

export interface SourceOfFundsCategory {
  type: 'salary' | 'business_income' | 'client_payments' | 'investment' | 'rental' | 'foreign_transfer' | 'family_support' | 'cash_deposit' | 'unknown'
  label: string
  amount: number
  percentage: number
  verified: 'verified' | 'partial' | 'unverified'
  verificationNote: string
}

export interface SourceOfFundsClassification {
  categories: SourceOfFundsCategory[]
  verifiedPercentage: number
  partiallyVerifiedPercentage: number
  unverifiedPercentage: number
  primarySource: string
  conclusion: string
  confidence: number
}

export interface OfficerSimulation {
  reasonsToApprove: string[]
  reasonsForConcern: string[]
  officerConclusion: string
  approvalRecommendation: 'approve' | 'approve_with_conditions' | 'request_more_info' | 'refuse'
  immigrationOfficerView: string  // First-person prose: "If I were reviewing this application as a visa officer..."
}

export interface ApprovalProbability {
  financial: number
  sourceOfFunds: number
  transactionAuthenticity: number
  travelAffordability: number
  riskFactors: 'none' | 'low' | 'medium' | 'high'
  overall: number
  note: string
}

export interface MultiAgentConsensus {
  primaryAgent: string
  primaryVerdict: 'recommend' | 'conditional' | 'decline'
  primaryScore: number
  secondaryAgent: string
  secondaryVerdict: 'recommend' | 'conditional' | 'decline'
  secondaryScore: number
  consensus: 'strong_approve' | 'approve' | 'approve_with_caution' | 'conditional' | 'decline'
  agreementLevel: 'unanimous' | 'majority' | 'split'
  consensusNote: string
}

export interface SpendingCategory {
  category: string
  amount: number
  percentage: number
}

export interface SourceOfFunds {
  source: string
  amount: number
  percentage: number
  risk: 'low' | 'medium' | 'high'
  note: string
}

export interface LargeTransaction {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  risk: 'low' | 'medium' | 'high'
  aiExplanation: string
}

export interface EmbassyAssessment {
  destination: string
  met: boolean
  requiredAmount: number
  currency: string
  applicantEquivalent: number
  confidence: number
  concerns: string[]
  recommendation: string
}

export interface RiskFlag {
  category: string
  status: 'ok' | 'warning' | 'danger'
  detail: string
}

export interface MonthlyBreakdown {
  month: string
  openingBalance: number
  closingBalance: number
  totalCredits: number
  totalDebits: number
  netFlow: number
  transactions: Array<{
    date: string
    description: string
    amount: number
    type: 'credit' | 'debit'
    runningBalance: number | null
    flag: string | null
  }>
}

export interface IncomeForensics {
  verified: boolean
  conclusion: string
  employer: string | null
  amountVariance: string
  timingPattern: string
  inflationDetected: boolean
  inflationNote: string | null
  confidence: number
}

export interface BalanceForensics {
  parkingDetected: boolean
  parkingEvidence: string
  endOfStatementBoostDetected: boolean
  boostNote: string | null
  rapidWithdrawalAfterSalary: boolean
  rapidWithdrawalDetail: string | null
  sustainabilityTrend: 'growing' | 'stable' | 'declining'
  sustainabilityNote: string
}

export interface SpendingForensics {
  accountCharacter: 'genuine' | 'engineered' | 'uncertain'
  characterConclusion: string
  avgTransactionsPerMonth: number
  dormantPeriods: Array<{ from: string; to: string; days: number; note: string }>
  recurringExpensesDetected: boolean
  recurringExpenses: string[]
  circularTransfersDetected: boolean
  circularTransferNote: string | null
}

export interface SourceOfFundsForensics {
  primarySource: string
  confidence: number
  conclusion: string
  unexplainedCredits: Array<{ date: string; amount: number; description: string; risk: 'low' | 'medium' | 'high' }>
  roundNumberDeposits: Array<{ date: string; amount: number; note: string }>
  finalMonthInjection: boolean
  finalMonthNote: string | null
}

export interface TripAffordability {
  estimatedDisposableIncome: number
  estimatedTripCost: number
  currency: string
  monthsToAccumulate: number
  rating: 'comfortable' | 'manageable' | 'stretch' | 'insufficient'
  conclusion: string
}

export interface BehavioralAnomaly {
  type: 'salary_inflation' | 'end_of_statement_boost' | 'circular_transfers' | 'dormant_account' | 'rapid_withdrawal' | 'round_number_deposits' | 'account_reactivation'
  detected: boolean
  evidence: string
  risk: 'low' | 'medium' | 'high'
  detail: string
}

export interface BankStatementAnalysis {
  // Core
  status: 'PASS' | 'REVIEW' | 'FLAG'
  currency: string
  statementPeriod: string
  monthsAnalyzed: number

  // Financial Credibility Score (the core engine)
  financialCredibilityScore: FinancialCredibilityScore
  visaScore: FinancialCredibilityScore  // alias for backward compat

  // Approval Probability Engine
  approvalProbability: ApprovalProbability

  // Source of Funds Classification (Level 3)
  sourceOfFundsClassification: SourceOfFundsClassification

  // Immigration Officer Simulation (Level 9)
  officerSimulation: OfficerSimulation

  // Multi-agent consensus (Level 11) — only present when both engines run
  multiAgentConsensus?: MultiAgentConsensus

  // Financials
  averageMonthlyBalance: number
  lowestBalance: number
  highestBalance: number
  closingBalance: number
  totalCredits: number
  totalDebits: number
  savingsRate: number

  // Income
  incomeRegular: boolean
  estimatedMonthlyIncome: number
  salaryCreditsDetected: boolean
  salaryAmount: number | null
  salaryFrequency: 'monthly' | 'biweekly' | 'weekly' | 'irregular' | null
  otherIncomeSources: string[]
  salaryVerification: SalaryVerification

  // Forensic sections
  incomeForensics: IncomeForensics
  balanceForensics: BalanceForensics
  spendingForensics: SpendingForensics
  sourceOfFundsForensics: SourceOfFundsForensics
  tripAffordability: TripAffordability
  behavioralAnomalies: BehavioralAnomaly[]

  // Verdict
  fraudIndicators: 'none' | 'low' | 'medium' | 'high'
  embassyRiskLevel: 'low' | 'medium' | 'high'
  finalVerdict: 'recommend' | 'conditional' | 'decline'
  verdictReason: string

  // Narratives
  embassyOfficerNarrative: string
  aiNarrative: string

  // Detail tables
  monthlyBreakdown: MonthlyBreakdown[]
  spendingCategories: SpendingCategory[]
  sourceOfFunds: SourceOfFunds[]
  largeTransactions: LargeTransaction[]
  suspiciousTransactions: Array<{
    date: string; description: string; amount: number
    type: 'debit' | 'credit'; reason: string; severity: 'low' | 'medium' | 'high'
  }>
  balanceDipsBelow: Array<{ date: string; balance: number; threshold: number }>
  largeUnexplainedWithdrawals: Array<{ date: string; amount: number; description: string }>
  riskFlags: RiskFlag[]

  // Embassy
  embassyThresholdMet: boolean
  embassyMinimumRequired: number
  embassyCurrency: string
  embassyAssessments: EmbassyAssessment[]
  overdraftsDetected: boolean
  overdraftCount: number
  roundNumberDeposits: boolean
  unusualDepositPattern: boolean

  // Output
  recommendations: string[]
  summary: string
  agentNotes: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  analysisEngine?: string
}

// ─── New v2 type system ───────────────────────────────────────────────────────

export interface AgentProgress {
  agent:    1 | 2 | 3 | 4 | 5 | 6
  name:     string
  status:   'queued' | 'running' | 'done' | 'error'
  finding?: string
  ms?:      number
}

export interface ExtractedStatement {
  currency:             string
  bankName:             string
  accountHolder:        string
  accountNumber:        string
  statementPeriod:      string
  openingBalance:       number
  closingBalance:       number
  transactions: Array<{
    date:        string
    description: string
    debit:       number | null
    credit:      number | null
    balance:     number | null
    rawText:     string
  }>
  totalCredits:         number
  totalDebits:          number
  pageCount:            number
  hasBankStamp:         boolean
  hasSignature:         boolean
  bankTier:             'tier1' | 'tier2' | 'tier3' | 'unknown'
  extractionConfidence: number
}

export interface MathematicalScore {
  incomeStabilityFormula: {
    monthsWithSalary:  number
    totalMonths:       number
    salaryMean:        number
    salaryStdDev:      number
    employerClarity:   number
    computedScore:     number
  }
  sourceOfFundsFormula: {
    verifiedCredits:   number
    totalCredits:      number
    cashDepositRatio:  number
    namedSourceRatio:  number
    computedScore:     number
  }
  balanceSustainabilityFormula: {
    minBalance:        number
    embassyThreshold:  number
    trendSlope:        number
    parkingPenalty:    number
    computedScore:     number
  }
}

export interface PredictiveAssessment {
  currentReadiness:      number
  predictedReadiness30:  number
  predictedReadiness60:  number
  predictedReadiness90:  number
  recommendedApplyDate:  string
  financialTrajectory:   'improving' | 'stable' | 'declining'
  trajectoryNote:        string
  projectedBalanceAt30:  number
  projectedBalanceAt60:  number
  projectedBalanceAt90:  number
  monthlyNetFlow:        number
  monthsToQualify:       number | null
}

export interface ImprovementRoadmap {
  canApplyNow: boolean
  blockers: Array<{
    issue:         string
    impact:        string
    fix:           string
    timeToResolve: string
    priority:      'critical' | 'high' | 'medium' | 'low'
  }>
  quickWins: Array<{
    action:      string
    scoreImpact: string
    timeframe:   string
  }>
  statementRequirements: string[]
  strengthenThese:       string[]
  readyChecklist: Array<{
    item:   string
    met:    boolean
    detail: string
  }>
}

export interface BankValidation {
  bankName:            string
  country:             string
  tier:                'tier1' | 'tier2' | 'tier3' | 'unknown'
  acceptedByUK:        boolean
  acceptedByUSA:       boolean
  acceptedBySchengen:  boolean
  requiresStamp:       boolean
  requiresSignature:   boolean
  stampDetected:       boolean
  signatureDetected:   boolean
  validationNote:      string
}

export interface EnhancedBankAnalysis extends BankStatementAnalysis {
  extractedStatement:   ExtractedStatement
  mathematicalScore:    MathematicalScore
  predictiveAssessment: PredictiveAssessment
  improvementRoadmap:   ImprovementRoadmap
  bankValidation:       BankValidation
  agentPipeline:        AgentProgress[]
  analysisVersion:      string
  totalAnalysisMs:      number
  primaryModel:         'claude-sonnet-4-6'
  secondaryModel:       'gpt-4o'
}

// ─── Embassy requirements ─────────────────────────────────────────────────────

export type EmbassyConfig = {
  min:               number
  currency:          string
  tripCost:          number
  focus:             string
  refusalRate:       number
  policyNotes:       string
  requiredDocuments: string[]
  tier1BanksOnly:    boolean
  minimumMonths:     number
  parkingWindow:     number
  acceptedBanks:     string[]
}

export const EMBASSY_DB: Record<string, EmbassyConfig> = {
  uk: {
    min: 2500, currency: 'GBP', tripCost: 3000, refusalRate: 45,
    focus: 'Affordability, income consistency, spending behaviour, no funds parking (28-day rule), genuine ties to home country',
    policyNotes: 'UKBA requires 6 months statements for salaried, 12 months for self-employed. No overdrafts in last 3 months. Balance must not dip below threshold. No large unexplained deposits in final month.',
    requiredDocuments: ['6 months bank statement', 'Payslips (3 months)', 'Employment letter', 'Tax returns if self-employed'],
    tier1BanksOnly: true, minimumMonths: 6, parkingWindow: 28, acceptedBanks: [],
  },
  canada: {
    min: 7000, currency: 'CAD', tripCost: 7000, refusalRate: 35,
    focus: 'Source of funds verifiability, genuine temporary entrant, strong home country ties, no funds parking in final 30 days',
    policyNotes: 'IRCC focuses heavily on "genuine temporary entrant". Source of funds must be 100% explainable. No funds borrowed from family in final 30 days.',
    requiredDocuments: ['6 months bank statement', 'Employment letter', 'Property ownership proof', 'Family ties documentation'],
    tier1BanksOnly: true, minimumMonths: 6, parkingWindow: 30, acceptedBanks: [],
  },
  usa: {
    min: 5000, currency: 'USD', tripCost: 5000, refusalRate: 55,
    focus: 'Strong financial ties to Nigeria/home, no funds parking (30 days), consistent income, demonstrable return incentive',
    policyNotes: 'CBP requires strong non-immigrant intent. Nigerian applicants face elevated scrutiny. Funds must be consistently maintained, not accumulated suddenly.',
    requiredDocuments: ['3-6 months bank statement', 'Employment letter', 'Property deed/lease', 'Previous US visa if any'],
    tier1BanksOnly: true, minimumMonths: 3, parkingWindow: 30, acceptedBanks: [],
  },
  schengen: {
    min: 3000, currency: 'EUR', tripCost: 2500, refusalRate: 30,
    focus: 'Account stability, daily spending capacity (€100/day), return incentives, no dormant accounts',
    policyNotes: 'EU requires daily spend capacity: (balance / trip_days) ≥ €100. Account must show normal transactional activity. No large single deposits close to application.',
    requiredDocuments: ['3-6 months bank statement', 'Travel insurance €30k', 'Hotel bookings', 'Employment proof'],
    tier1BanksOnly: true, minimumMonths: 3, parkingWindow: 30, acceptedBanks: [],
  },
  uae: {
    min: 3000, currency: 'USD', tripCost: 2000, refusalRate: 20,
    focus: 'Regular income, active account, stamped statement required for Nigerian/Ghanaian applicants',
    policyNotes: 'UAE relatively straightforward. Requires bank stamp and branch manager signature for Nigerian/Ghanaian applicants.',
    requiredDocuments: ['3 months bank statement (stamped)', 'Employment letter', 'Return flight booking'],
    tier1BanksOnly: true, minimumMonths: 3, parkingWindow: 14,
    acceptedBanks: ['GTBank', 'Zenith Bank', 'First Bank', 'Access Bank', 'UBA', 'FCMB', 'Stanbic IBTC'],
  },
  australia: {
    min: 5000, currency: 'AUD', tripCost: 5000, refusalRate: 25,
    focus: 'Genuine temporary entrant (GTE) indicators, financial capability, no unexplained large deposits',
    policyNotes: 'GTE requirement is primary. Financial evidence supports but does not replace GTE assessment.',
    requiredDocuments: ['6 months bank statement', 'GTE statement', 'Employment letter'],
    tier1BanksOnly: true, minimumMonths: 6, parkingWindow: 30, acceptedBanks: [],
  },
  nigeria: {
    min: 3000, currency: 'USD', tripCost: 3000, refusalRate: 0,
    focus: 'Domestic: Convert NGN to USD. Tier-1 bank required. Bank stamp and signature mandatory.',
    policyNotes: 'Nigerian domestic assessment. Tier-1 bank required. Official letterhead. Branch stamp.',
    requiredDocuments: ['6 months statement', 'Bank stamp', 'Branch manager signature'],
    tier1BanksOnly: true, minimumMonths: 6, parkingWindow: 30,
    acceptedBanks: ['GTBank', 'Zenith Bank', 'First Bank', 'Access Bank', 'UBA', 'FCMB', 'Stanbic IBTC', 'Union Bank', 'Fidelity Bank', 'Polaris Bank'],
  },
  ghana: {
    min: 3000, currency: 'USD', tripCost: 3000, refusalRate: 0,
    focus: 'GHS to USD conversion. Official letterhead and bank stamp required.',
    policyNotes: 'Ghanaian domestic assessment. Official bank letterhead. Branch stamp required.',
    requiredDocuments: ['6 months statement', 'Bank letterhead', 'Branch stamp'],
    tier1BanksOnly: true, minimumMonths: 6, parkingWindow: 30,
    acceptedBanks: ['GCB Bank', 'Absa', 'Standard Chartered', 'Ecobank', 'Zenith Bank Ghana', 'Fidelity Bank Ghana', 'Cal Bank', 'Republic Bank'],
  },
}

// Legacy alias — keep for backward compat with v1 functions
const EMBASSY: Record<string, { min: number; currency: string; focus: string; tripCost: number }> =
  Object.fromEntries(Object.entries(EMBASSY_DB).map(([k, v]) => [k, { min: v.min, currency: v.currency, focus: v.focus, tripCost: v.tripCost }]))

export const NIGERIAN_TIER1_BANKS = [
  'GTBank', 'Guaranty Trust', 'GT Bank',
  'Zenith Bank', 'First Bank', 'First Bank of Nigeria',
  'Access Bank', 'UBA', 'United Bank for Africa',
  'FCMB', 'First City Monument Bank',
  'Stanbic IBTC', 'Union Bank', 'Fidelity Bank', 'Ecobank Nigeria',
]

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(destination: string, applicantName: string, passportCountry: string, text = '', lite = false) {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY[key] ?? EMBASSY['uk']

  const system = `You are simultaneously:
— A Senior Immigration Financial Intelligence Analyst (15 yrs, UKBA / IRCC / US CBP experience)
— A Forensic Accountant specialising in AML and source-of-funds investigation
— A Fraud Detection Specialist trained in behavioral transaction analysis
— A Visa Case Officer writing formal immigration file notes

Your output must read like a document produced by a professional immigration intelligence unit — not a chatbot summarising data. Every conclusion requires specific evidence: dates, amounts, exact descriptions.`

  const textSection = text.trim().length > 200
    ? `\nBANK STATEMENT TEXT:\n---\n${text.slice(0, 65000)}\n---\n`
    : ''

  if (lite) {
    // Lightweight secondary-agent prompt (used for multi-agent consensus)
    return {
      system,
      user: `You are providing a SECOND OPINION on this bank statement ${text.trim().length > 200 ? 'below' : '(PDF attached)'} for a ${destination.toUpperCase()} visa application.

APPLICANT: ${applicantName} | PASSPORT: ${passportCountry} | DESTINATION: ${destination.toUpperCase()}
THRESHOLD: ${req.min} ${req.currency}${textSection}

Provide a concise independent assessment. Return ONLY valid JSON starting with {.

{
  "verdict": "recommend",
  "overallScore": 0,
  "fraudIndicators": "low",
  "keyApprovals": ["Evidence-based reason 1","Reason 2","Reason 3"],
  "keyConcerns": ["Concern with date/amount if any"],
  "note": "1-2 sentence independent assessment"
}

Rules: verdict must be one of: recommend conditional decline. fraudIndicators must be one of: none low medium high.`,
    }
  }

  const user = `Perform a full Visa Financial Intelligence & Compliance Audit of this bank statement ${text.trim().length > 200 ? 'below' : 'PDF attached above'} for a ${destination.toUpperCase()} visa application.

APPLICANT: ${applicantName} | PASSPORT: ${passportCountry} | DESTINATION: ${destination.toUpperCase()}
EMBASSY THRESHOLD: ${req.min} ${req.currency} | EMBASSY FOCUS: ${req.focus}
ESTIMATED TRIP COST: ${req.currency} ${req.tripCost}
${textSection}
═══════════════════════════════════════════════
INVESTIGATION PROTOCOL
═══════════════════════════════════════════════

LEVEL 1 — FINANCIAL CREDIBILITY SCORING (each /100, must be evidence-based):
• incomeStability: How regular, consistent, and verifiable is the income? Same employer? Same amounts?
• sourceOfFunds: How clearly can ALL credits be traced to legitimate, verifiable sources?
• balanceSustainability: Does balance grow naturally, or show artificial inflation patterns?
• transactionAuthenticity: Does this look like a real person's primary bank account?
• travelAffordability: Can the applicant genuinely fund the trip on their financial profile?
• immigrationRisk: 100 = zero risk flags. Deduct for every red flag found.
• overall: Weighted mean of above

LEVEL 2 — SOURCE OF FUNDS CLASSIFICATION:
Classify EVERY credit transaction into one of: salary / business_income / client_payments / investment / rental / foreign_transfer / family_support / cash_deposit / unknown
Calculate: verified % (salary/named transfers), partially_verified % (named individuals), unverified % (cash/unknown)

LEVEL 3 — FRAUD DETECTION (check each explicitly):
• Fund parking: large deposits in final 30 days of statement?
• Temporary borrowing: deposit → statement generated → withdrawal?
• Circular movement: A→B→A within 7 days?
• Statement engineering: balance artificially maintained at round threshold?
• Structured deposits: large sums broken into smaller deposits?
• Rapid salary drain: >70% of salary withdrawn within 5 business days?
• Account reactivation: dormant account suddenly active for visa period only?

LEVEL 4 — LIFESTYLE CONSISTENCY:
Do spending patterns match declared employment/income level?
Are there luxury purchases inconsistent with stated salary?
Are there recurring genuine-living expenses (rent, utilities, food, transport)?

LEVEL 5 — IMMIGRATION OFFICER SIMULATION:
Write as a real visa case officer (UKBA / IRCC / Schengen / CBP depending on destination).
reasonsToApprove: 3-5 specific, evidence-cited reasons to approve (dates, amounts)
reasonsForConcern: Evidence-cited concerns, or empty array if none
officerConclusion: What the officer would write in the file
approvalRecommendation: approve / approve_with_conditions / request_more_info / refuse
immigrationOfficerView: Start with "If I were reviewing this application as a ${destination.toUpperCase()} visa officer:" then write 5-7 specific first-person observations using ✓ for positive and ⚠ for concerns, ending with "Conclusion:" on a new line

LEVEL 6 — APPROVAL PROBABILITY:
Score each dimension's probability of supporting the application (0-100%).
financial: Does the financial evidence support approval?
sourceOfFunds: Are funds clearly verifiable and legitimate?
transactionAuthenticity: Does the account appear genuine?
travelAffordability: Can the applicant demonstrably fund this trip?
riskFactors: Are there risk flags? none/low/medium/high
overall: Weighted probability this financial evidence supports approval

LEVEL 7 — EMBASSY OFFICER NARRATIVE (200-250 words):
Write formal case file notes as a senior immigration officer. Cite specific figures, dates, patterns. Cover: income assessment, balance behaviour, account character, source of funds verdict, risk assessment, recommendation. Continuous professional prose — no bullets.

Return ONLY valid JSON starting with {. Keep monthlyBreakdown.transactions SHORT (salary, cash events, flagged items only).

{
  "status": "PASS",
  "currency": "exact code from statement",
  "statementPeriod": "Mon YYYY – Mon YYYY",
  "monthsAnalyzed": 3,

  "financialCredibilityScore": {
    "incomeStability": 0,
    "sourceOfFunds": 0,
    "balanceSustainability": 0,
    "transactionAuthenticity": 0,
    "travelAffordability": 0,
    "immigrationRisk": 0,
    "overall": 0,
    "label": "Strong"
  },

  "approvalProbability": {
    "financial": 0,
    "sourceOfFunds": 0,
    "transactionAuthenticity": 0,
    "travelAffordability": 0,
    "riskFactors": "none",
    "overall": 0,
    "note": "Evidence-based explanation of the overall probability"
  },

  "sourceOfFundsClassification": {
    "categories": [
      {"type":"salary","label":"Employment Salary","amount":0,"percentage":0,"verified":"verified","verificationNote":"Specific evidence from statement"},
      {"type":"cash_deposit","label":"Cash Deposits","amount":0,"percentage":0,"verified":"unverified","verificationNote":"Cash deposits require source explanation"}
    ],
    "verifiedPercentage": 0,
    "partiallyVerifiedPercentage": 0,
    "unverifiedPercentage": 0,
    "primarySource": "Employment income",
    "conclusion": "Evidence-based source of funds conclusion",
    "confidence": 0
  },

  "officerSimulation": {
    "reasonsToApprove": [
      "Evidence-based reason with specific date/amount",
      "Another specific reason"
    ],
    "reasonsForConcern": [],
    "officerConclusion": "Formal file note conclusion",
    "approvalRecommendation": "approve",
    "immigrationOfficerView": "If I were reviewing this application as a ${destination.toUpperCase()} visa officer:\\n\\n✓ [Specific observation with evidence]\\n✓ [Another observation]\\n⚠ [Concern if any, or omit]\\n\\nConclusion: [Final determination]"
  },

  "averageMonthlyBalance": 0,
  "lowestBalance": 0,
  "highestBalance": 0,
  "closingBalance": 0,
  "totalCredits": 0,
  "totalDebits": 0,
  "savingsRate": 0,
  "incomeRegular": true,
  "estimatedMonthlyIncome": 0,
  "salaryCreditsDetected": true,
  "salaryAmount": 0,
  "salaryFrequency": "monthly",
  "otherIncomeSources": [],

  "salaryVerification": {
    "detected": true,
    "employer": "Name or null",
    "monthlyAmount": 0,
    "depositDates": ["28 Jul","31 Aug","29 Sep"],
    "consistencyScore": 0,
    "missingMonths": [],
    "notes": "Evidence-based note"
  },

  "incomeForensics": {
    "verified": true,
    "conclusion": "Evidence-based sentence with specific amounts and dates",
    "employer": "Name or null",
    "amountVariance": "Exact amounts each month and implication",
    "timingPattern": "Day-of-month for each credit and what it indicates",
    "inflationDetected": false,
    "inflationNote": null,
    "confidence": 0
  },

  "balanceForensics": {
    "parkingDetected": false,
    "parkingEvidence": "Evidence-based conclusion",
    "endOfStatementBoostDetected": false,
    "boostNote": null,
    "rapidWithdrawalAfterSalary": false,
    "rapidWithdrawalDetail": null,
    "sustainabilityTrend": "growing",
    "sustainabilityNote": "Specific opening and closing balance with trend interpretation"
  },

  "spendingForensics": {
    "accountCharacter": "genuine",
    "characterConclusion": "Evidence-based assessment",
    "avgTransactionsPerMonth": 0,
    "dormantPeriods": [],
    "recurringExpensesDetected": true,
    "recurringExpenses": ["Specific pattern from statement"],
    "circularTransfersDetected": false,
    "circularTransferNote": null
  },

  "sourceOfFundsForensics": {
    "primarySource": "Employment income",
    "confidence": 0,
    "conclusion": "Evidence-based conclusion",
    "unexplainedCredits": [],
    "roundNumberDeposits": [],
    "finalMonthInjection": false,
    "finalMonthNote": null
  },

  "tripAffordability": {
    "estimatedDisposableIncome": 0,
    "estimatedTripCost": ${req.tripCost},
    "currency": "${req.currency}",
    "monthsToAccumulate": 0,
    "rating": "manageable",
    "conclusion": "Specific calculation with figures"
  },

  "behavioralAnomalies": [
    {"type":"salary_inflation","detected":false,"evidence":"Specific evidence","risk":"low","detail":"Finding"},
    {"type":"end_of_statement_boost","detected":false,"evidence":"Specific dates/amounts","risk":"low","detail":"Finding"},
    {"type":"rapid_withdrawal","detected":false,"evidence":"Largest post-salary debit within 72h as % of salary","risk":"low","detail":"Finding"},
    {"type":"dormant_account","detected":false,"evidence":"Longest gap between transactions","risk":"low","detail":"Finding"},
    {"type":"circular_transfers","detected":false,"evidence":"Any A→B→A patterns","risk":"low","detail":"Finding"},
    {"type":"round_number_deposits","detected":false,"evidence":"Any round-number cash credits","risk":"low","detail":"Finding"},
    {"type":"account_reactivation","detected":false,"evidence":"Signs of dormant account reactivation","risk":"low","detail":"Finding"}
  ],

  "fraudIndicators": "none",
  "embassyRiskLevel": "low",
  "finalVerdict": "recommend",
  "verdictReason": "Concise reason citing key deciding factors",

  "embassyOfficerNarrative": "200-250 words, formal case file notes, continuous prose, specific figures",

  "monthlyBreakdown": [
    {
      "month": "July 2023",
      "openingBalance": 0,
      "closingBalance": 0,
      "totalCredits": 0,
      "totalDebits": 0,
      "netFlow": 0,
      "transactions": [
        {"date":"28 Jul","description":"EXACT DESCRIPTION FROM STATEMENT","amount":0,"type":"credit","runningBalance":0,"flag":"salary"}
      ]
    }
  ],

  "spendingCategories": [
    {"category":"Transfers Out","amount":0,"percentage":0},
    {"category":"ATM/Cash","amount":0,"percentage":0},
    {"category":"POS/Card","amount":0,"percentage":0},
    {"category":"Bills & Utilities","amount":0,"percentage":0},
    {"category":"Rent","amount":0,"percentage":0},
    {"category":"Other","amount":0,"percentage":0}
  ],

  "sourceOfFunds": [
    {"source":"Salary","amount":0,"percentage":0,"risk":"low","note":"Verified employment income"}
  ],

  "largeTransactions": [
    {"date":"dd Mon","description":"EXACT","amount":0,"type":"credit","risk":"low","aiExplanation":"Forensic explanation"}
  ],

  "suspiciousTransactions": [],
  "balanceDipsBelow": [{"date":"dd Mon","balance":0,"threshold":${req.min}}],
  "largeUnexplainedWithdrawals": [],

  "riskFlags": [
    {"category":"Income Authenticity","status":"ok","detail":"Evidence-based finding"},
    {"category":"Source of Funds","status":"ok","detail":"Evidence-based finding"},
    {"category":"Funds Parking","status":"ok","detail":"Evidence-based finding"},
    {"category":"Account Activity","status":"ok","detail":"Evidence-based finding"},
    {"category":"Balance Stability","status":"ok","detail":"Evidence-based finding"},
    {"category":"Behavioral Anomalies","status":"ok","detail":"Evidence-based finding"},
    {"category":"Embassy Threshold","status":"ok","detail":"Evidence-based finding"}
  ],

  "embassyThresholdMet": true,
  "embassyMinimumRequired": ${req.min},
  "embassyCurrency": "${req.currency}",

  "embassyAssessments": [
    {
      "destination": "${destination.toUpperCase()}",
      "met": true,
      "requiredAmount": ${req.min},
      "currency": "${req.currency}",
      "applicantEquivalent": 0,
      "confidence": 0,
      "concerns": [],
      "recommendation": "Proceed / Conditional / Wait — with specific reason"
    }
  ],

  "overdraftsDetected": false,
  "overdraftCount": 0,
  "roundNumberDeposits": false,
  "unusualDepositPattern": false,

  "recommendations": ["Specific actionable recommendation with dates/amounts"],
  "summary": "2-3 client-facing sentences. Professional, encouraging but honest.",
  "agentNotes": "INTERNAL: (1) Forensic verdict (2) Specific concerns with dates/amounts (3) Proceed or wait",
  "confidence": "high",
  "warnings": []
}

Rules:
- status must be one of: PASS REVIEW FLAG
- finalVerdict must be one of: recommend conditional decline
- approvalRecommendation must be one of: approve approve_with_conditions request_more_info refuse
- fraudIndicators must be one of: none low medium high
- riskFactors must be one of: none low medium high
- confidence must be one of: high medium low`

  return { system, user, req }
}

// ─── Claude primary (document API + prefill) ──────────────────────────────────

async function claudeDocumentAnalysis(
  base64Pdf: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { system, user } = buildPrompt(destination, applicantName, passportCountry)

  const docBlock: DocumentBlockParam = {
    type:   'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
  }

  const response = await callClaudeWithRetry(() => client.messages.create({
    model:       'claude-sonnet-4-6',
    max_tokens:  4000,
    temperature: 0,
    system:      system + JSON_ONLY,
    messages: [
      { role: 'user',      content: [docBlock, { type: 'text', text: user }] },
    ],
  }) as Promise<Message>)

  const tail = response.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => (b as { type: string; text: string }).text)
    .join('')

  const parsed = parseClaudePrefillJSON<BankStatementAnalysis>(tail)
  normalise(parsed)
  return { ...parsed, analysisEngine: 'Claude claude-sonnet-4-6' }
}

// ─── Claude text mode fallback ────────────────────────────────────────────────

async function claudeTextAnalysis(
  text: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const { system, user } = buildPrompt(destination, applicantName, passportCountry, text)

  const response = await callClaudeWithRetry(() => client.messages.create({
    model:       'claude-sonnet-4-6',
    max_tokens:  4000,
    temperature: 0,
    system:      system + JSON_ONLY,
    messages: [
      { role: 'user',      content: user },
    ],
  }) as Promise<Message>)

  const tail = response.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => (b as { type: string; text: string }).text)
    .join('')

  const parsed = parseClaudePrefillJSON<BankStatementAnalysis>(tail)
  normalise(parsed)
  return { ...parsed, analysisEngine: 'Claude claude-sonnet-4-6' }
}

// ─── OpenAI secondary agent (full analysis) ───────────────────────────────────

async function openAIFullAnalysis(
  text: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const client = new OpenAI({ apiKey })
  const { system, user } = buildPrompt(destination, applicantName, passportCountry, text)

  const response = await client.chat.completions.create({
    model:           'gpt-4o',
    max_tokens:      7000,
    temperature:     0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })

  const raw    = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as BankStatementAnalysis
  normalise(parsed)
  return { ...parsed, analysisEngine: 'ChatGPT gpt-4o' }
}

// ─── OpenAI lite second-opinion ───────────────────────────────────────────────

async function openAILiteOpinion(
  text: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
): Promise<{ verdict: string; overallScore: number; fraudIndicators: string; keyApprovals: string[]; keyConcerns: string[]; note: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || text.length < 100) return null

  try {
    const client = new OpenAI({ apiKey })
    const { system, user } = buildPrompt(destination, applicantName, passportCountry, text, true)

    const response = await client.chat.completions.create({
      model:           'gpt-4o',
      max_tokens:      600,
      temperature:     0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    })

    return JSON.parse(response.choices[0]?.message?.content ?? '{}')
  } catch (e) {
    console.warn('[OpenAI-lite] failed:', e instanceof Error ? e.message : e)
    return null
  }
}

// ─── Consensus derivation ────────────────────────────────────────────────────

function deriveConsensus(
  primary: BankStatementAnalysis,
  secondaryVerdict: string,
  secondaryScore: number,
  secondaryFraud: string,
  secondaryKey: string[],
): MultiAgentConsensus {
  const pv = primary.finalVerdict
  const sv = secondaryVerdict as 'recommend' | 'conditional' | 'decline'

  const agree   = pv === sv
  const bothGood = (pv === 'recommend') && (sv === 'recommend')
  const oneBad   = (pv === 'decline') || (sv === 'decline')
  const oneCond  = (pv === 'conditional') || (sv === 'conditional')

  const consensus: MultiAgentConsensus['consensus'] =
    bothGood                        ? 'strong_approve' :
    agree && pv === 'conditional'   ? 'conditional' :
    agree && pv === 'decline'       ? 'decline' :
    oneBad                          ? 'conditional' :
    oneCond                         ? 'approve_with_caution' :
                                      'approve'

  const pScore = primary.financialCredibilityScore?.overall ?? 0
  const agreementLevel: MultiAgentConsensus['agreementLevel'] =
    agree ? 'unanimous' :
    Math.abs(pScore - secondaryScore) < 15 ? 'majority' :
    'split'

  const noteMap: Record<typeof consensus, string> = {
    strong_approve:      'Both analysis engines independently recommend approval. Strong financial profile with no conflicting findings.',
    approve:             'Both engines indicate approval with minor divergence in scoring.',
    approve_with_caution:'Engines diverge slightly — proceed but address the noted concerns before submission.',
    conditional:         'Engines disagree. Review the concerns flagged and consider strengthening the application.',
    decline:             'Both engines raise significant concerns. Financial profile requires substantial improvement before application.',
  }

  return {
    primaryAgent:     'Claude Sonnet 4.6 (Forensic)',
    primaryVerdict:   pv,
    primaryScore:     pScore,
    secondaryAgent:   'ChatGPT GPT-4o (Validator)',
    secondaryVerdict: sv,
    secondaryScore,
    consensus,
    agreementLevel,
    consensusNote: noteMap[consensus],
  }
}

// ─── Normalise helper ─────────────────────────────────────────────────────────

function normalise(a: BankStatementAnalysis) {
  // Mirror financialCredibilityScore → visaScore for backward compat
  if (a.financialCredibilityScore && !a.visaScore) a.visaScore = a.financialCredibilityScore
  if (a.visaScore && !a.financialCredibilityScore) a.financialCredibilityScore = a.visaScore
  if (a.embassyOfficerNarrative && !a.aiNarrative) a.aiNarrative = a.embassyOfficerNarrative
  if (!a.embassyAssessments) a.embassyAssessments = []
}

// ─── PDF text extractor ───────────────────────────────────────────────────────

async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('pdf-parse') as any
    const pp  = mod.default ?? mod
    return (await pp(pdfBuffer)).text ?? ''
  } catch {
    return ''
  }
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function makeFallback(destination: string): BankStatementAnalysis {
  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY[key] ?? EMBASSY['uk']
  const emptyScore: FinancialCredibilityScore = { incomeStability: 0, sourceOfFunds: 0, balanceSustainability: 0, transactionAuthenticity: 0, travelAffordability: 0, immigrationRisk: 0, overall: 0, label: 'Insufficient' }
  return {
    status: 'REVIEW', currency: 'UNKNOWN', statementPeriod: 'Unable to determine', monthsAnalyzed: 0,
    financialCredibilityScore: emptyScore, visaScore: emptyScore,
    approvalProbability: { financial: 0, sourceOfFunds: 0, transactionAuthenticity: 0, travelAffordability: 0, riskFactors: 'medium', overall: 0, note: 'Analysis unavailable' },
    sourceOfFundsClassification: { categories: [], verifiedPercentage: 0, partiallyVerifiedPercentage: 0, unverifiedPercentage: 0, primarySource: 'Unknown', conclusion: 'Analysis unavailable', confidence: 0 },
    officerSimulation: { reasonsToApprove: [], reasonsForConcern: ['Analysis unavailable — manual review required'], officerConclusion: 'Unable to process.', approvalRecommendation: 'request_more_info', immigrationOfficerView: 'Manual review required.' },
    averageMonthlyBalance: 0, lowestBalance: 0, highestBalance: 0, closingBalance: 0, totalCredits: 0, totalDebits: 0, savingsRate: 0,
    incomeRegular: false, estimatedMonthlyIncome: 0, salaryCreditsDetected: false, salaryAmount: null, salaryFrequency: null, otherIncomeSources: [],
    salaryVerification: { detected: false, employer: null, monthlyAmount: null, depositDates: [], consistencyScore: 0, missingMonths: [], notes: '' },
    incomeForensics: { verified: false, conclusion: 'Analysis unavailable', employer: null, amountVariance: '', timingPattern: '', inflationDetected: false, inflationNote: null, confidence: 0 },
    balanceForensics: { parkingDetected: false, parkingEvidence: '', endOfStatementBoostDetected: false, boostNote: null, rapidWithdrawalAfterSalary: false, rapidWithdrawalDetail: null, sustainabilityTrend: 'stable', sustainabilityNote: '' },
    spendingForensics: { accountCharacter: 'uncertain', characterConclusion: '', avgTransactionsPerMonth: 0, dormantPeriods: [], recurringExpensesDetected: false, recurringExpenses: [], circularTransfersDetected: false, circularTransferNote: null },
    sourceOfFundsForensics: { primarySource: 'Unknown', confidence: 0, conclusion: '', unexplainedCredits: [], roundNumberDeposits: [], finalMonthInjection: false, finalMonthNote: null },
    tripAffordability: { estimatedDisposableIncome: 0, estimatedTripCost: req.tripCost, currency: req.currency, monthsToAccumulate: 0, rating: 'insufficient', conclusion: 'Analysis unavailable' },
    behavioralAnomalies: [],
    fraudIndicators: 'low', embassyRiskLevel: 'medium', finalVerdict: 'conditional', verdictReason: 'Manual review required.',
    embassyOfficerNarrative: '', aiNarrative: '',
    monthlyBreakdown: [], spendingCategories: [], sourceOfFunds: [], largeTransactions: [],
    suspiciousTransactions: [], balanceDipsBelow: [], largeUnexplainedWithdrawals: [], riskFlags: [],
    embassyAssessments: [],
    embassyThresholdMet: false, embassyMinimumRequired: req.min, embassyCurrency: req.currency,
    overdraftsDetected: false, overdraftCount: 0, roundNumberDeposits: false, unusualDepositPattern: false,
    recommendations: ['Manual review required.'],
    summary: 'Our team will review your bank statement and contact you shortly.',
    agentNotes: 'ANALYSIS UNAVAILABLE — check ANTHROPIC_API_KEY and OPENAI_API_KEY.',
    confidence: 'low', warnings: ['Automatic analysis unavailable'], analysisEngine: 'none',
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function analyzeBankStatement(
  pdfBuffer: Buffer,
  destination: string,
  applicantName: string,
  passportCountry = 'Nigeria',
): Promise<BankStatementAnalysis> {
  const base64Pdf = pdfBuffer.toString('base64')

  // Extract text in parallel (needed for OpenAI secondary agent)
  const [textResult] = await Promise.allSettled([extractPdfText(pdfBuffer)])
  const text = textResult.status === 'fulfilled' ? textResult.value : ''
  console.log('[analyzeBankStatement] extracted text:', text.length, 'chars')

  // ── Primary: Claude with native PDF (document API) ────────────────────────
  let primary: BankStatementAnalysis | null = null

  try {
    primary = await claudeDocumentAnalysis(base64Pdf, destination, applicantName, passportCountry)
    console.log('[analyzeBankStatement] Claude-doc succeeded:', primary.status, 'verdict:', primary.finalVerdict)
  } catch (e) {
    console.warn('[analyzeBankStatement] Claude-doc failed:', e instanceof Error ? e.message : e)
  }

  // ── Fallback: Claude text mode ────────────────────────────────────────────
  if (!primary && text.length > 100) {
    try {
      primary = await claudeTextAnalysis(text, destination, applicantName, passportCountry)
      console.log('[analyzeBankStatement] Claude-text succeeded:', primary.status)
    } catch (e) {
      console.warn('[analyzeBankStatement] Claude-text failed:', e instanceof Error ? e.message : e)
    }
  }

  // ── Fallback: OpenAI full analysis ────────────────────────────────────────
  if (!primary) {
    try {
      primary = await openAIFullAnalysis(text, destination, applicantName, passportCountry)
      console.log('[analyzeBankStatement] OpenAI-full succeeded:', primary.status)
    } catch (e) {
      console.error('[analyzeBankStatement] All engines failed:', e instanceof Error ? e.message : e)
      return makeFallback(destination)
    }
  }

  // ── Secondary: OpenAI lite second-opinion (runs in parallel, non-blocking) ─
  // Only run if Claude was primary and text is available (for multi-agent consensus)
  if (primary.analysisEngine?.includes('Claude') && text.length > 100 && process.env.OPENAI_API_KEY) {
    try {
      const lite = await openAILiteOpinion(text, destination, applicantName, passportCountry)
      if (lite?.verdict) {
        primary.multiAgentConsensus = deriveConsensus(
          primary,
          lite.verdict,
          lite.overallScore,
          lite.fraudIndicators,
          lite.keyConcerns,
        )
        console.log('[analyzeBankStatement] Multi-agent consensus:', primary.multiAgentConsensus.consensus)
      }
    } catch (e) {
      console.warn('[analyzeBankStatement] OpenAI-lite failed (non-fatal):', e instanceof Error ? e.message : e)
    }
  }

  return primary
}

// ─── V2 Prompt Builders ───────────────────────────────────────────────────────

function buildForensicPrompt(
  extracted: ExtractedStatement,
  txnSummary: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
  embassy: EmbassyConfig,
  mathScore: MathematicalScore,
): string {
  return `FORENSIC FINANCIAL ANALYSIS

Applicant: ${applicantName} | Passport: ${passportCountry} | Destination: ${destination.toUpperCase()}
Bank: ${extracted.bankName} (${extracted.bankTier}) | Period: ${extracted.statementPeriod}
Embassy threshold: ${embassy.min} ${embassy.currency} | Trip cost: ${embassy.tripCost} ${embassy.currency}
Estimated refusal rate for profile: ${embassy.refusalRate}%

MATHEMATICAL PRE-SCORES (adjust ±15 based on qualitative evidence):
- Income Stability:       ${mathScore.incomeStabilityFormula.computedScore}/100 (salary mean: ${Math.round(mathScore.incomeStabilityFormula.salaryMean)})
- Source of Funds:        ${mathScore.sourceOfFundsFormula.computedScore}/100 (verified: ${Math.round(mathScore.sourceOfFundsFormula.namedSourceRatio * 100)}%)
- Balance Sustainability: ${mathScore.balanceSustainabilityFormula.computedScore}/100 (min balance: ${Math.round(mathScore.balanceSustainabilityFormula.minBalance)}, parking penalty: ${mathScore.balanceSustainabilityFormula.parkingPenalty})

TRANSACTION DATA:
${txnSummary}

EMBASSY POLICY: ${embassy.focus}
PARKING WINDOW: ${embassy.parkingWindow} days
POLICY NOTES: ${embassy.policyNotes}

Perform full forensic analysis. Cite specific transactions by date and amount.
Use math pre-scores as anchors — adjust with qualitative evidence.
Return the complete BankStatementAnalysis JSON schema starting with {.
Every field must be present. No truncation. No commentary outside JSON.`
}

function buildFraudPrompt(
  extracted: ExtractedStatement,
  txnSummary: string,
  destination: string,
  applicantName: string,
  passportCountry: string,
  embassy: EmbassyConfig,
): string {
  return `FRAUD & BEHAVIORAL ANOMALY DETECTION

You are an adversarial fraud examiner. Find everything suspicious.
Applicant: ${applicantName} | Destination: ${destination.toUpperCase()} | Passport: ${passportCountry}
Parking window: ${embassy.parkingWindow} days | Threshold: ${embassy.min} ${embassy.currency}
Bank: ${extracted.bankName} | Closing balance: ${extracted.closingBalance} ${extracted.currency}

TRANSACTION DATA:
${txnSummary}

Examine each fraud pattern explicitly:
1. FUND PARKING: Any credit > ${Math.round(embassy.min * 0.3)} in final ${embassy.parkingWindow} days?
2. CIRCULAR TRANSFERS: A→B→A within 7-14 days with matching amounts?
3. BORROWED FUNDS: Large deposit → balance maintained → large withdrawal pattern?
4. ACCOUNT ENGINEERING: Artificially maintained round-number balance?
5. STRUCTURED DEPOSITS: Large sums broken into multiple smaller deposits over 2-3 days?
6. SALARY INFLATION: Same employer but amounts jump significantly near application?
7. AML PATTERNS: Any structuring, smurfing, or layering patterns?

Return ONLY valid JSON:
{
  "fraudVerdict": "clean|suspicious|engineered",
  "fraudScore": 0,
  "detectedAnomalies": [{"type":"salary_inflation","detected":false,"evidence":"specific evidence","risk":"low","detail":"finding"}],
  "fundParkingEvidence": "specific dates and amounts or None detected",
  "circularTransfers": "specific evidence or None detected",
  "borrowedFundsRisk": 0,
  "engineeredBalance": false,
  "engineeringEvidence": "specific evidence",
  "structuredDeposits": false,
  "structuringNote": "specific evidence or None detected",
  "amlFlags": ["specific flag with date/amount"],
  "overallFraudNote": "2-3 sentence fraud verdict with specific evidence"
}`
}

function buildEmbassyPrompt(
  forensic: BankStatementAnalysis | null,
  fraud: { fraudVerdict: string; fraudScore: number } | null,
  destination: string,
  applicantName: string,
  passportCountry: string,
  embassy: EmbassyConfig,
  extracted: ExtractedStatement,
  mathScore: MathematicalScore,
): string {
  return `${destination.toUpperCase()} EMBASSY INTELLIGENCE ASSESSMENT

You are a senior ${destination.toUpperCase()} visa officer reviewing this application.
Applicant: ${applicantName} | Passport: ${passportCountry}
Bank: ${extracted.bankName} (${extracted.bankTier}) | Closing balance: ${extracted.closingBalance} ${extracted.currency}
Embassy threshold: ${embassy.min} ${embassy.currency}

PRIOR AGENT FINDINGS:
- Forensic verdict: ${forensic?.finalVerdict ?? 'unavailable'} | Score: ${forensic?.financialCredibilityScore?.overall ?? 0}/100
- Fraud assessment: ${fraud?.fraudVerdict ?? 'unavailable'} | Fraud score: ${fraud?.fraudScore ?? 0}/100
- Threshold met: ${extracted.closingBalance >= embassy.min}
- Income stability score: ${mathScore.incomeStabilityFormula.computedScore}/100

${destination.toUpperCase()} SPECIFIC REQUIREMENTS:
${embassy.policyNotes}
Refusal rate for this profile: ${embassy.refusalRate}%

Required documents: ${embassy.requiredDocuments.join(', ')}
${embassy.tier1BanksOnly ? `Bank tier requirement: Tier-1 only. Detected tier: ${extracted.bankTier}` : ''}
${embassy.acceptedBanks.length > 0 ? `Accepted banks: ${embassy.acceptedBanks.join(', ')}` : ''}

Assess specifically against ${destination.toUpperCase()} immigration requirements.

Return ONLY valid JSON:
{
  "destinationVerdict": "strong|adequate|weak|insufficient",
  "thresholdMet": true,
  "meetsPolicyRequirements": true,
  "policyGaps": ["specific gap with evidence"],
  "officerLikelihood": 0,
  "embassySpecificConcerns": ["specific concern with evidence"],
  "embassySpecificStrengths": ["specific strength with evidence"],
  "embassyOfficerNarrative": "200-word formal case file in first person as ${destination.toUpperCase()} officer",
  "embassyAssessments": [{"destination":"${destination.toUpperCase()}","met":true,"requiredAmount":${embassy.min},"currency":"${embassy.currency}","applicantEquivalent":0,"confidence":0,"concerns":[],"recommendation":"Proceed/Conditional/Wait — specific reason"}],
  "officerSimulation": {
    "reasonsToApprove": ["evidence-cited reason with date/amount"],
    "reasonsForConcern": [],
    "officerConclusion": "formal file note conclusion",
    "approvalRecommendation": "approve",
    "immigrationOfficerView": "If I were reviewing this application as a ${destination.toUpperCase()} visa officer:\\n\\n✓ [specific observation]\\n\\nConclusion: [verdict]"
  }
}`
}

function buildImprovementPrompt(
  forensic: BankStatementAnalysis | null,
  fraud: { fraudScore: number; amlFlags: string[] } | null,
  embassyInfo: { policyGaps: string[]; officerLikelihood: number } | null,
  predictive: PredictiveAssessment,
  mathScore: MathematicalScore,
  destination: string,
  applicantName: string,
  embassyConfig: EmbassyConfig,
  extracted: ExtractedStatement,
): string {
  return `VISA APPLICATION IMPROVEMENT ROADMAP

Applicant: ${applicantName} | Destination: ${destination.toUpperCase()}
Current readiness: ${predictive.currentReadiness}% | Trajectory: ${predictive.financialTrajectory}
Months to qualify: ${predictive.monthsToQualify ?? 0}

CURRENT SCORES:
- Income stability:       ${mathScore.incomeStabilityFormula.computedScore}/100
- Source of funds:        ${mathScore.sourceOfFundsFormula.computedScore}/100
- Balance sustainability: ${mathScore.balanceSustainabilityFormula.computedScore}/100
- Overall forensic:       ${forensic?.financialCredibilityScore?.overall ?? 0}/100
- Fraud risk:             ${fraud?.fraudScore ?? 0}/100 (lower = better)

ISSUES IDENTIFIED:
- Forensic concerns: ${forensic?.riskFlags?.filter(f => f.status !== 'ok').map(f => f.detail).join('; ') ?? 'None'}
- Policy gaps: ${embassyInfo?.policyGaps?.join('; ') ?? 'None'}
- AML flags: ${fraud?.amlFlags?.join('; ') ?? 'None'}
- Approval likelihood: ${embassyInfo?.officerLikelihood ?? 50}%

Embassy requirements: ${embassyConfig.requiredDocuments.join(', ')}
Required minimum: ${embassyConfig.min} ${embassyConfig.currency}
Current balance: ${extracted.closingBalance} ${extracted.currency}

Create specific, actionable improvement plan with exact amounts and dates.

Return ONLY valid JSON:
{
  "canApplyNow": false,
  "blockers": [{"issue":"specific issue","impact":"reduces score by N points","fix":"specific action with amounts","timeToResolve":"immediately|1-4 weeks|1-3 months|3-6 months","priority":"critical|high|medium|low"}],
  "quickWins": [{"action":"specific action","scoreImpact":"+N points","timeframe":"1 week"}],
  "statementRequirements": ["exactly what the embassy needs"],
  "strengthenThese": ["what is already good but could be stronger"],
  "readyChecklist": [{"item":"Embassy threshold met (${embassyConfig.min} ${embassyConfig.currency})","met":false,"detail":"Current balance vs requirement"}]
}`
}

function buildConsensusPrompt(
  forensic: BankStatementAnalysis | null,
  fraud: { fraudVerdict: string; fraudScore: number; overallFraudNote: string } | null,
  embassyAssessment: { destinationVerdict: string; officerLikelihood: number; embassySpecificConcerns: string[] } | null,
  predictive: PredictiveAssessment,
  roadmap: ImprovementRoadmap,
  applicantName: string,
  destination: string,
): string {
  return `CHIEF ANALYST CONSENSUS REVIEW

Applicant: ${applicantName} | Destination: ${destination.toUpperCase()}

AGENT 2 — FORENSIC (Claude claude-sonnet-4-6):
Verdict: ${forensic?.finalVerdict ?? 'unavailable'} | Score: ${forensic?.financialCredibilityScore?.overall ?? 0}/100
Summary: ${forensic?.summary ?? 'unavailable'}
Risk flags: ${forensic?.riskFlags?.filter(f => f.status !== 'ok').length ?? 0} warnings
Fraud indicators: ${forensic?.fraudIndicators ?? 'unknown'}

AGENT 3 — FRAUD DETECTION (GPT-4o):
Verdict: ${fraud?.fraudVerdict ?? 'unavailable'} | Fraud score: ${fraud?.fraudScore ?? 'N/A'}/100
Note: ${fraud?.overallFraudNote ?? 'unavailable'}

AGENT 4 — EMBASSY INTELLIGENCE (Claude):
Destination verdict: ${embassyAssessment?.destinationVerdict ?? 'unavailable'}
Officer likelihood: ${embassyAssessment?.officerLikelihood ?? 0}%
Concerns: ${embassyAssessment?.embassySpecificConcerns?.join('; ') ?? 'None'}

AGENT 5 — PREDICTIVE ENGINE (GPT-4o):
Current readiness: ${predictive.currentReadiness}% | Trajectory: ${predictive.financialTrajectory}
Can apply now: ${roadmap.canApplyNow} | Apply date: ${predictive.recommendedApplyDate}
Critical blockers: ${roadmap.blockers?.filter(b => b.priority === 'critical').length ?? 0}

CONFLICTS TO RESOLVE:
- If forensic says "recommend" but fraud says "suspicious": adjudicate based on evidence weight
- If embassy likelihood < 50% but forensic says "recommend": flag the gap
- If roadmap says cannot apply now but forensic says "recommend": trust roadmap

Produce the definitive final verdict. Resolve any agent conflicts.

Return ONLY valid JSON:
{
  "finalVerdict": "recommend",
  "finalScore": 0,
  "consensusNote": "1-2 sentence explanation of how agents were reconciled",
  "resolvedConflicts": ["specific conflict and how it was resolved"],
  "summary": "2-3 sentence client-facing summary",
  "agentNotes": "INTERNAL: forensic verdict + fraud verdict + embassy likelihood + recommendation",
  "recommendations": ["specific actionable recommendation"],
  "warnings": ["specific warning with evidence"]
}

Rules: finalVerdict must be one of: recommend conditional decline`
}

// ─── V2: 6-Agent Orchestrated Pipeline ───────────────────────────────────────

export async function analyzeBankStatementV2(
  pdfBuffer:       Buffer,
  destination:     string,
  applicantName:   string,
  passportCountry: string = 'Nigeria',
  onProgress?:     (progress: AgentProgress) => void,
): Promise<EnhancedBankAnalysis> {

  const startTime  = Date.now()
  const embassyKey = destination.toLowerCase().replace(/\s+/g, '')
  const embassy    = EMBASSY_DB[embassyKey] ?? EMBASSY_DB['uk']

  const report = (
    agent:    AgentProgress['agent'],
    name:     string,
    status:   AgentProgress['status'],
    finding?: string,
  ) => {
    onProgress?.({
      agent, name, status, finding,
      ms: status === 'done' || status === 'error' ? Date.now() - startTime : undefined,
    })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

  // ── AGENT 1 — Document Intelligence (Claude) ──────────────────────────────
  report(1, 'Document Intelligence', 'running')

  const base64Pdf = pdfBuffer.toString('base64')
  let extracted: ExtractedStatement

  try {
    const docBlock: DocumentBlockParam = {
      type:   'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
    }
    const extractResponse = await callClaudeWithRetry(() => anthropic.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  4000,
      temperature: 0,
      system:      'You are a document data extraction specialist. Extract structured financial data from bank statements with 100% accuracy. Return ONLY valid JSON. Never interpret — only extract exactly what is in the document.' + JSON_ONLY,
      messages: [
        { role: 'user', content: [docBlock, { type: 'text', text: `Extract ALL transaction data from this bank statement. Return JSON only, starting with { and nothing else:
{
  "currency": "exact ISO code",
  "bankName": "exact bank name as printed",
  "accountHolder": "exact account holder name",
  "accountNumber": "last 4 digits only",
  "statementPeriod": "e.g. 01 Jan 2024 - 31 Mar 2024",
  "openingBalance": 0.00,
  "closingBalance": 0.00,
  "transactions": [{"date":"01 Jan 2024","description":"EXACT description","debit":null,"credit":0.00,"balance":0.00,"rawText":"full line"}],
  "totalCredits": 0.00,
  "totalDebits": 0.00,
  "pageCount": 1,
  "hasBankStamp": false,
  "hasSignature": false,
  "bankTier": "tier1|tier2|tier3|unknown",
  "extractionConfidence": 0
}` }] },
        ],
    }))

    const extractTail = extractResponse.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
    extracted = parseClaudePrefillJSON<ExtractedStatement>(extractTail)
    if (!extracted.transactions) extracted.transactions = []
    report(1, 'Document Intelligence', 'done',
      `Extracted ${extracted.transactions.length} transactions from ${extracted.bankName}`)
  } catch {
    report(1, 'Document Intelligence', 'error', 'Extraction failed — using text fallback')
    const text = await extractPdfText(pdfBuffer)
    extracted = {
      currency: 'UNKNOWN', bankName: 'Unknown', accountHolder: applicantName,
      accountNumber: '****', statementPeriod: 'Unknown',
      openingBalance: 0, closingBalance: 0, transactions: [],
      totalCredits: 0, totalDebits: 0, pageCount: 0,
      hasBankStamp: false, hasSignature: false,
      bankTier: 'unknown', extractionConfidence: text.length > 100 ? 30 : 5,
    }
  }

  // ── Mathematical Scoring (deterministic, instant) ─────────────────────────
  const { computeMathematicalScore, computePredictiveAssessment } =
    await import('./visaScoring')

  const mathScore = computeMathematicalScore(
    extracted, embassy.min, embassy.minimumMonths, embassy.parkingWindow,
  )
  const predictive = computePredictiveAssessment(
    extracted, mathScore, embassy.min, extracted.currency,
  )

  // ── AGENTS 2 & 3 — True Parallel: Forensic (Claude) + Fraud (GPT-4o) ─────
  report(2, 'Forensic Analysis', 'running')
  report(3, 'Fraud Detection', 'running')

  const txnSummary = JSON.stringify({
    transactions: extracted.transactions.slice(0, 120),
    totals: {
      credits:  extracted.totalCredits,
      debits:   extracted.totalDebits,
      opening:  extracted.openingBalance,
      closing:  extracted.closingBalance,
    },
    mathScore,
  })

  const docBlock2: DocumentBlockParam = {
    type:   'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
  }

  const [forensicResult, fraudResult] = await Promise.allSettled([
    // AGENT 2 — Claude: full BankStatementAnalysis
    callClaudeWithRetry(() => anthropic.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  4000,
      temperature: 0,
      system:      `You are a Senior Immigration Financial Intelligence Analyst with 15 years at UKBA and IRCC. Forensic accountant specializing in AML and source-of-funds investigation. You have been given pre-extracted transaction data AND the original PDF. Your job is ANALYSIS ONLY. Every score must cite specific transactions by date and amount. Return ONLY valid JSON starting with {.` + JSON_ONLY,
      messages: [
        {
          role: 'user',
          content: [
            docBlock2,
            { type: 'text', text: buildForensicPrompt(extracted, txnSummary, destination, applicantName, passportCountry, embassy, mathScore) },
          ],
        },
        ],
    })).then(res => {
      const forensicTail = res.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
      return parseClaudePrefillJSON<BankStatementAnalysis>(forensicTail)
    }),

    // AGENT 3 — GPT-4o: specialized fraud & behavioral detection
    openai.chat.completions.create({
      model:           'gpt-4o',
      max_tokens:      2500,
      temperature:     0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a Financial Crime specialist trained in AML, forensic accounting, and visa fraud detection. You specialize in detecting fund parking, circular transfers, borrowed funds, account engineering, structured deposits. Form your own independent judgment. Return ONLY valid JSON.' },
        { role: 'user',   content: buildFraudPrompt(extracted, txnSummary, destination, applicantName, passportCountry, embassy) },
      ],
    }).then(res => JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
      fraudVerdict:        'clean' | 'suspicious' | 'engineered'
      fraudScore:          number
      detectedAnomalies:   BehavioralAnomaly[]
      fundParkingEvidence: string
      circularTransfers:   string
      borrowedFundsRisk:   number
      engineeredBalance:   boolean
      engineeringEvidence: string
      structuredDeposits:  boolean
      structuringNote:     string
      amlFlags:            string[]
      overallFraudNote:    string
    }),
  ])

  let forensicAnalysis = forensicResult.status === 'fulfilled' ? forensicResult.value : null
  const fraudAnalysis  = fraudResult.status    === 'fulfilled' ? fraudResult.value    : null

  // If Claude forensic failed, fall back to OpenAI full analysis
  if (!forensicAnalysis && process.env.OPENAI_API_KEY) {
    report(2, 'Forensic Analysis', 'running', 'Claude failed — retrying with OpenAI GPT-4o')
    try {
      const pdfText = await extractPdfText(pdfBuffer)
      forensicAnalysis = await openAIFullAnalysis(
        pdfText.length > 100 ? pdfText : txnSummary,
        destination, applicantName, passportCountry,
      )
    } catch (fallbackErr) {
      console.error('[Agent2-OpenAI-fallback] failed:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr)
    }
  }

  report(2, 'Forensic Analysis', forensicAnalysis ? 'done' : 'error',
    forensicAnalysis
      ? `Verdict: ${forensicAnalysis.finalVerdict} | Score: ${forensicAnalysis.financialCredibilityScore?.overall ?? 0}/100`
      : 'Forensic analysis failed')

  report(3, 'Fraud Detection', fraudResult.status === 'fulfilled' ? 'done' : 'error',
    fraudResult.status === 'fulfilled'
      ? `${fraudAnalysis?.fraudVerdict} | Anomalies: ${fraudAnalysis?.detectedAnomalies?.length ?? 0}`
      : 'Fraud detection failed')

  // ── AGENT 4 — Embassy Intelligence (Claude) ───────────────────────────────
  report(4, 'Embassy Intelligence', 'running')

  let embassyAssessment: {
    destinationVerdict:       'strong' | 'adequate' | 'weak' | 'insufficient'
    thresholdMet:             boolean
    meetsPolicyRequirements:  boolean
    policyGaps:               string[]
    officerLikelihood:        number
    embassySpecificConcerns:  string[]
    embassySpecificStrengths: string[]
    embassyOfficerNarrative:  string
    embassyAssessments:       EmbassyAssessment[]
    officerSimulation:        OfficerSimulation
  }

  try {
    const embassyRes = await callClaudeWithRetry(() => anthropic.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  2500,
      temperature: 0,
      system:      `You are a senior ${destination.toUpperCase()} immigration officer. Assess this application specifically against ${destination.toUpperCase()} visa policy. Another agent has done forensic analysis. Return ONLY valid JSON.` + JSON_ONLY,
      messages: [
        { role: 'user', content: buildEmbassyPrompt(forensicAnalysis, fraudAnalysis, destination, applicantName, passportCountry, embassy, extracted, mathScore) },
        ],
    }))
    const embassyTail = embassyRes.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
    embassyAssessment = parseClaudePrefillJSON(embassyTail)
    report(4, 'Embassy Intelligence', 'done',
      `${destination.toUpperCase()} approval likelihood: ${embassyAssessment.officerLikelihood}%`)
  } catch {
    report(4, 'Embassy Intelligence', 'error', 'Embassy assessment unavailable')
    embassyAssessment = {
      destinationVerdict: 'adequate',
      thresholdMet: extracted.closingBalance >= embassy.min,
      meetsPolicyRequirements: false,
      policyGaps: ['Unable to assess — manual review required'],
      officerLikelihood: 50,
      embassySpecificConcerns: [],
      embassySpecificStrengths: [],
      embassyOfficerNarrative: 'Manual review required.',
      embassyAssessments: [],
      officerSimulation: {
        reasonsToApprove: [],
        reasonsForConcern: ['Analysis incomplete — manual review required'],
        officerConclusion: 'Manual review required.',
        approvalRecommendation: 'request_more_info',
        immigrationOfficerView: 'Manual review required.',
      },
    }
  }

  // ── AGENT 5 — Predictive Engine / Improvement Roadmap (GPT-4o) ───────────
  report(5, 'Predictive Engine', 'running')

  let improvementRoadmap: ImprovementRoadmap

  try {
    const predictiveRes = await openai.chat.completions.create({
      model:           'gpt-4o',
      max_tokens:      2000,
      temperature:     0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a visa application coach specializing in financial preparation. Create specific, actionable improvement plans. Be precise: specific amounts, specific timeframes, specific actions. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: buildImprovementPrompt(
            forensicAnalysis, fraudAnalysis, embassyAssessment,
            predictive, mathScore, destination, applicantName, embassy, extracted,
          ),
        },
      ],
    })
    improvementRoadmap = JSON.parse(predictiveRes.choices[0]?.message?.content ?? '{}')
    if (!Array.isArray(improvementRoadmap.blockers))       improvementRoadmap.blockers       = []
    if (!Array.isArray(improvementRoadmap.quickWins))      improvementRoadmap.quickWins      = []
    if (!Array.isArray(improvementRoadmap.readyChecklist)) improvementRoadmap.readyChecklist = []
    report(5, 'Predictive Engine', 'done',
      `Can apply ${improvementRoadmap.canApplyNow ? 'NOW' : `in ~${predictive.monthsToQualify ?? '?'} months`}`)
  } catch {
    report(5, 'Predictive Engine', 'error', 'Improvement roadmap unavailable')
    improvementRoadmap = {
      canApplyNow: extracted.closingBalance >= embassy.min,
      blockers: [], quickWins: [],
      statementRequirements: embassy.requiredDocuments,
      strengthenThese: [], readyChecklist: [],
    }
  }

  // ── AGENT 6 — Consensus & Reconciliation (Claude) ────────────────────────
  report(6, 'Consensus & Reconciliation', 'running')

  let consensusEnhancements: {
    finalVerdict:      BankStatementAnalysis['finalVerdict']
    finalScore:        number
    consensusNote:     string
    resolvedConflicts: string[]
    summary:           string
    agentNotes:        string
    recommendations:   string[]
    warnings:          string[]
  } | null = null

  try {
    const consensusRes = await callClaudeWithRetry(() => anthropic.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  2000,
      temperature: 0,
      system:      'You are the Chief Immigration Intelligence Analyst. You receive reports from 5 specialist agents and produce the definitive final verdict. Resolve conflicts based on evidence weight. Return ONLY valid JSON.' + JSON_ONLY,
      messages: [
        {
          role: 'user',
          content: buildConsensusPrompt(
            forensicAnalysis, fraudAnalysis, embassyAssessment,
            predictive, improvementRoadmap, applicantName, destination,
          ),
        },
        ],
    }))
    const consensusTail = consensusRes.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
    consensusEnhancements = parseClaudePrefillJSON(consensusTail)
    report(6, 'Consensus & Reconciliation', 'done',
      `Final: ${consensusEnhancements?.finalVerdict} | Score: ${consensusEnhancements?.finalScore}/100`)
  } catch {
    report(6, 'Consensus & Reconciliation', 'error', 'Using forensic primary verdict')
  }

  // ── Merge all agent outputs ───────────────────────────────────────────────
  const base = forensicAnalysis ?? makeFallback(destination)
  normalise(base)

  // Incorporate fraud findings
  if (fraudAnalysis) {
    base.behavioralAnomalies = fraudAnalysis.detectedAnomalies ?? base.behavioralAnomalies ?? []
    if (fraudAnalysis.fraudVerdict === 'engineered') {
      base.fraudIndicators = 'high'
      base.status          = 'FLAG'
    } else if (fraudAnalysis.fraudVerdict === 'suspicious') {
      base.fraudIndicators = 'medium'
      if (base.status === 'PASS') base.status = 'REVIEW'
    }
  }

  // Incorporate embassy assessment
  if (embassyAssessment.officerSimulation) {
    base.officerSimulation       = embassyAssessment.officerSimulation
    base.embassyOfficerNarrative = embassyAssessment.embassyOfficerNarrative
    base.aiNarrative             = embassyAssessment.embassyOfficerNarrative
  }
  if (embassyAssessment.embassyAssessments?.length) {
    base.embassyAssessments = embassyAssessment.embassyAssessments
  }
  base.embassyThresholdMet    = embassyAssessment.thresholdMet
  base.embassyMinimumRequired = embassy.min
  base.embassyCurrency        = embassy.currency

  // Apply consensus
  if (consensusEnhancements) {
    base.finalVerdict    = consensusEnhancements.finalVerdict
    base.summary         = consensusEnhancements.summary
    base.agentNotes      = consensusEnhancements.agentNotes
    base.recommendations = consensusEnhancements.recommendations ?? base.recommendations
    base.warnings        = consensusEnhancements.warnings ?? base.warnings
    if (base.financialCredibilityScore) {
      base.financialCredibilityScore.overall = consensusEnhancements.finalScore
      if (base.visaScore) base.visaScore.overall = consensusEnhancements.finalScore
    }
  }

  // Multi-agent consensus object
  const multiAgentConsensus: MultiAgentConsensus = {
    primaryAgent:     'Claude claude-sonnet-4-6 (Forensic)',
    primaryVerdict:   forensicAnalysis?.finalVerdict ?? 'conditional',
    primaryScore:     forensicAnalysis?.financialCredibilityScore?.overall ?? 0,
    secondaryAgent:   'GPT-4o (Fraud Detection)',
    secondaryVerdict: fraudAnalysis?.fraudVerdict === 'clean'
      ? 'recommend'
      : fraudAnalysis?.fraudVerdict === 'suspicious'
      ? 'conditional'
      : 'decline',
    secondaryScore:   fraudAnalysis ? Math.max(0, 100 - (fraudAnalysis.fraudScore ?? 0)) : 50,
    consensus:        base.status === 'PASS'   ? 'strong_approve' :
                      base.status === 'REVIEW' ? 'approve_with_caution' :
                                                 'decline',
    agreementLevel:   forensicAnalysis?.finalVerdict === base.finalVerdict ? 'unanimous' : 'majority',
    consensusNote:    consensusEnhancements?.consensusNote ??
                      `${base.status} — ${base.verdictReason}`,
  }
  base.multiAgentConsensus = multiAgentConsensus

  // Bank validation
  const bankValidation: BankValidation = {
    bankName:           extracted.bankName,
    country:            passportCountry,
    tier:               extracted.bankTier,
    acceptedByUK:       extracted.bankTier === 'tier1',
    acceptedByUSA:      extracted.bankTier === 'tier1',
    acceptedBySchengen: extracted.bankTier === 'tier1',
    requiresStamp:      ['nigeria', 'ghana', 'ng', 'gh'].some(c =>
                          passportCountry.toLowerCase().includes(c)),
    requiresSignature:  true,
    stampDetected:      extracted.hasBankStamp,
    signatureDetected:  extracted.hasSignature,
    validationNote:     extracted.hasBankStamp
      ? 'Bank stamp detected — document appears authentic'
      : 'No bank stamp detected — embassy may require stamped copy',
  }

  return {
    ...base,
    extractedStatement:   extracted,
    mathematicalScore:    mathScore,
    predictiveAssessment: predictive,
    improvementRoadmap,
    bankValidation,
    agentPipeline: [
      { agent: 1, name: 'Document Intelligence',      status: 'done' },
      { agent: 2, name: 'Forensic Analysis',          status: forensicResult.status === 'fulfilled' ? 'done' : 'error' },
      { agent: 3, name: 'Fraud Detection',            status: fraudResult.status    === 'fulfilled' ? 'done' : 'error' },
      { agent: 4, name: 'Embassy Intelligence',       status: 'done' },
      { agent: 5, name: 'Predictive Engine',          status: 'done' },
      { agent: 6, name: 'Consensus & Reconciliation', status: 'done' },
    ],
    analysisVersion: 'v2.0-multi-agent',
    totalAnalysisMs: Date.now() - startTime,
    primaryModel:    'claude-sonnet-4-6',
    secondaryModel:  'gpt-4o',
  }
}
