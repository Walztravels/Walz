import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import type { DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages'

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

// ─── Embassy requirements ─────────────────────────────────────────────────────

const EMBASSY: Record<string, { min: number; currency: string; focus: string; tripCost: number }> = {
  uk:        { min: 2500,  currency: 'GBP', tripCost: 3000,  focus: 'Affordability, income consistency, spending behaviour, no funds parking, 28-day rule' },
  canada:    { min: 5000,  currency: 'CAD', tripCost: 7000,  focus: 'Source of funds, travel purpose, home ties, genuine temporary entrant, no funds parking in final month' },
  schengen:  { min: 3000,  currency: 'EUR', tripCost: 2500,  focus: 'Account stability, daily spending capacity, return incentives, no dormant accounts' },
  uae:       { min: 3000,  currency: 'USD', tripCost: 2000,  focus: 'Regular income, account activity, stamped statement (Nigerian/Ghanaian applicants require Tier-1 bank)' },
  usa:       { min: 5000,  currency: 'USD', tripCost: 5000,  focus: 'Strong financial ties to home country, no funds parking (30 days), consistent income, Nigerian applicants face elevated scrutiny' },
  australia: { min: 5000,  currency: 'AUD', tripCost: 5000,  focus: 'Genuine temporary entrant indicators, financial capability, no unexplained large deposits' },
  nigeria:   { min: 3000,  currency: 'USD', tripCost: 3000,  focus: 'Convert NGN to USD. Tier-1 bank required. Bank stamp and signature mandatory.' },
  ghana:     { min: 3000,  currency: 'USD', tripCost: 3000,  focus: 'Convert GHS to USD. Official letterhead and bank stamp required.' },
}

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
  "verdict": "recommend|conditional|decline",
  "overallScore": 0,
  "fraudIndicators": "none|low|medium|high",
  "keyApprovals": ["Evidence-based reason 1","Reason 2","Reason 3"],
  "keyConcerns": ["Concern with date/amount if any"],
  "note": "1-2 sentence independent assessment"
}`,
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
  "status": "PASS|REVIEW|FLAG",
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
}`

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

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 7000,
    system,
    messages: [
      { role: 'user',      content: [docBlock, { type: 'text', text: user }] },
      { role: 'assistant', content: '{' },
    ],
  }) as Message

  const tail = response.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => (b as { type: string; text: string }).text)
    .join('')

  // Prefill trick prepends '{', so reconstruct the full JSON object
  const jsonStr = ('{' + tail)
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: BankStatementAnalysis
  try {
    parsed = JSON.parse(jsonStr) as BankStatementAnalysis
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) {
      parsed = JSON.parse(match[0]) as BankStatementAnalysis
    } else {
      throw new Error('Could not parse Claude (doc) response as JSON')
    }
  }
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

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 7000,
    system,
    messages: [
      { role: 'user',      content: user },
      { role: 'assistant', content: '{' },
    ],
  }) as Message

  const tail = response.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => (b as { type: string; text: string }).text)
    .join('')

  const jsonStr = ('{' + tail)
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: BankStatementAnalysis
  try {
    parsed = JSON.parse(jsonStr) as BankStatementAnalysis
  } catch {
    const match = jsonStr.match(/\{[\s\S]*\}/)
    if (match) {
      parsed = JSON.parse(match[0]) as BankStatementAnalysis
    } else {
      throw new Error('Could not parse Claude (text) response as JSON')
    }
  }
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
