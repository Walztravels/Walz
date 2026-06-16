import Anthropic from '@anthropic-ai/sdk'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankStatementAnalysis {
  status: 'PASS' | 'REVIEW' | 'FLAG'
  currency: string
  statementPeriod: string
  monthsAnalyzed: number
  averageMonthlyBalance: number
  lowestBalance: number
  highestBalance: number
  closingBalance: number
  totalCredits: number
  totalDebits: number
  incomeRegular: boolean
  estimatedMonthlyIncome: number
  salaryCreditsDetected: boolean
  salaryAmount: number | null
  salaryFrequency: 'monthly' | 'biweekly' | 'weekly' | 'irregular' | null
  otherIncomeSources: string[]
  suspiciousTransactions: Array<{
    date: string; description: string; amount: number
    type: 'debit' | 'credit'; reason: string; severity: 'low' | 'medium' | 'high'
  }>
  balanceDipsBelow: Array<{ date: string; balance: number; threshold: number }>
  largeUnexplainedWithdrawals: Array<{ date: string; amount: number; description: string }>
  embassyThresholdMet: boolean
  embassyMinimumRequired: number
  embassyCurrency: string
  overdraftsDetected: boolean
  overdraftCount: number
  roundNumberDeposits: boolean
  unusualDepositPattern: boolean
  recommendations: string[]
  summary: string
  agentNotes: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

// ─── Embassy requirements ─────────────────────────────────────────────────────

const EMBASSY_REQUIREMENTS: Record<string, { min: number; currency: string; months: number; notes: string }> = {
  uk: {
    min: 2500, currency: 'GBP', months: 3,
    notes: `UK Visas and Immigration (UKVI) looks for:
- Consistent balance above £2,500 for the past 3 months
- No large unexplained deposits in the 28 days before application ("funds parking")
- Regular income pattern — salary or business income
- No overdrafts or returned payments
- Cash deposits are heavily scrutinised — must be explained
- Balance spikes just before statement end date are a red flag`,
  },
  canada: {
    min: 5000, currency: 'CAD', months: 3,
    notes: `Immigration, Refugees and Citizenship Canada (IRCC) looks for:
- Minimum CAD 5,000 for single applicant, add CAD 1,500 per additional family member
- Consistent balance — not just a high closing balance
- Stable income source (employment letter must match salary credits on statement)
- No large unexplained deposits — IRCC officers are trained to spot funds parking
- Savings pattern matters: gradual accumulation is stronger than a sudden large deposit`,
  },
  schengen: {
    min: 3000, currency: 'EUR', months: 3,
    notes: `Schengen Visa (European embassies) looks for:
- Minimum €30–€50 per day of stay — typical 2-week trip needs ~€500–€700
- Minimum holding balance of €3,000 is the common benchmark across Schengen
- Regular income — payslips must match salary credits visible on statement
- No large unexplained withdrawals
- Germany, France and Netherlands consulates are particularly strict on funds parking`,
  },
  uae: {
    min: 3000, currency: 'USD', months: 3,
    notes: `UAE Tourist / Visit Visa looks for:
- Minimum balance of AED 10,000–15,000 (approx USD 2,700–4,000) over last 3 months
- Bank statements must be on official letterhead and stamped (if from Nigeria/Ghana)
- Regular credits — salary or business income
- For self-employed applicants: 6 months of statements preferred`,
  },
  usa: {
    min: 5000, currency: 'USD', months: 3,
    notes: `US B1/B2 Tourist Visa looks for:
- Strong ties to home country — financial strength supports this
- Minimum USD 5,000 is a general guideline — higher is better
- Consistent balance over 3–6 months
- Funds parking is heavily scrutinised — large deposits in the 30 days before application are a red flag
- Nigerian/Ghanaian applicants face higher scrutiny — consistency matters more than raw amount`,
  },
  australia: {
    min: 5000, currency: 'AUD', months: 3,
    notes: `Australia Tourist Visa (subclass 600) looks for:
- Minimum AUD 5,000 for a typical trip
- Consistent balance and regular income
- No unexplained large deposits
- Savings pattern preferred over a single large deposit`,
  },
  ghana: {
    min: 3000, currency: 'USD', months: 3,
    notes: `Ghanaian bank statements must be on official letterhead with bank stamp.
GHS amounts should be converted to destination currency equivalent.
Same destination thresholds apply.`,
  },
  nigeria: {
    min: 3000, currency: 'USD', months: 3,
    notes: `Nigerian bank statements should be stamped and signed by the bank.
Embassy officers know the NGN/USD exchange rate — they will convert automatically.
Naira balances of ₦2M–₦5M at current rates (~₦1,600/USD) are approximately USD 1,250–3,125 — borderline for most applications.
Same destination thresholds apply.`,
  },
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function analyzeBankStatement(
  extractedText: string,
  destination: string,
  applicantName: string,
  passportCountry = 'Nigeria',
): Promise<BankStatementAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  // Create client inside function so env var is read at call-time, not module load
  const client = new Anthropic({ apiKey })

  const key = destination.toLowerCase().replace(/\s+/g, '')
  const req = EMBASSY_REQUIREMENTS[key] ?? EMBASSY_REQUIREMENTS['uk']

  // Truncate very long statements — Claude handles ~15k chars well, beyond that = diminishing returns
  const text = extractedText.length > 15_000
    ? extractedText.slice(0, 15_000) + '\n\n[STATEMENT TRUNCATED — first 15,000 characters analysed]'
    : extractedText

  const SYSTEM_PROMPT = `You are a senior visa application specialist with 15 years of experience \
at a travel consultancy. You have processed thousands of visa applications for UK, Canada, USA, \
Schengen, and UAE embassies and you know exactly what immigration officers look for and flag.

Your job is to analyse a client's bank statement and provide:
1. A structured data assessment for the Walz Travels internal team
2. Actionable recommendations the client can act on before submission
3. An honest expert opinion — if the application looks weak, say so clearly in agentNotes

Rules:
- Be precise with numbers
- Be direct and specific in agentNotes
- Be encouraging but honest in summary (never reveal PASS/REVIEW/FLAG label to client)
- Never invent transactions — only report what is visible in the statement text`

  const USER_PROMPT = `Analyse this bank statement for a ${destination.toUpperCase()} visa application.

APPLICANT: ${applicantName}
PASSPORT COUNTRY: ${passportCountry}
VISA DESTINATION: ${destination.toUpperCase()}

EMBASSY REQUIREMENTS AND OFFICER PRIORITIES:
${req.notes}

MINIMUM BALANCE THRESHOLD: ${req.min} ${req.currency} maintained consistently over ${req.months} months.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BANK STATEMENT TEXT:
${text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analyse every transaction, every balance figure, every credit pattern, and every anomaly.

Return ONLY a raw JSON object — no markdown, no code fences, no explanation before or after. \
Just the JSON starting with { and ending with }.

Required JSON structure:
{
  "status": "PASS",
  "currency": "GBP",
  "statementPeriod": "January 2025 – March 2025",
  "monthsAnalyzed": 3,
  "averageMonthlyBalance": 4200,
  "lowestBalance": 1850,
  "highestBalance": 5100,
  "closingBalance": 4300,
  "totalCredits": 8400,
  "totalDebits": 6200,
  "incomeRegular": true,
  "estimatedMonthlyIncome": 2800,
  "salaryCreditsDetected": true,
  "salaryAmount": 2800,
  "salaryFrequency": "monthly",
  "otherIncomeSources": [],
  "suspiciousTransactions": [],
  "balanceDipsBelow": [],
  "largeUnexplainedWithdrawals": [],
  "embassyThresholdMet": true,
  "embassyMinimumRequired": ${req.min},
  "embassyCurrency": "${req.currency}",
  "overdraftsDetected": false,
  "overdraftCount": 0,
  "roundNumberDeposits": false,
  "unusualDepositPattern": false,
  "recommendations": [],
  "summary": "Client-facing plain English summary — no jargon, no PASS/REVIEW/FLAG label.",
  "agentNotes": "Internal-only. Direct, specific. Include proceed/wait recommendation.",
  "confidence": "high",
  "warnings": []
}

STATUS DECISION RULES:
- PASS → average balance clearly above ${req.min} ${req.currency}, income regular, pattern consistent, no disqualifying flags
- REVIEW → borderline balance OR minor irregularities that need explanation but are not disqualifying
- FLAG → balance below threshold, irregular/unverifiable income, funds parking evidence, overdrafts, or patterns an embassy officer would question

WHAT TO FLAG AS SUSPICIOUS:
- Large round-number cash deposits (e.g. exactly £5,000, £10,000) with no source
- Balance spikes in the final 2–4 weeks of the statement (funds parking signal)
- Vague large withdrawals (e.g. "CASH", "WITHDRAWAL") with no payee name
- Overdrafts or returned direct debits
- Transfers from unidentified sources just before statement closing date
- Stated income does not match salary credits
- Dormant account that suddenly shows activity
- Multiple credits on the same day from different sources shortly before period end

WHAT COUNTS AS A LARGE UNEXPLAINED WITHDRAWAL:
- Any single debit above 30% of the average monthly balance
- Any debit above ${Math.round(req.min * 0.5)} ${req.currency} with a vague description

Be thorough — a missed flag can cause a visa rejection. A false flag causes unnecessary anxiety.`

  console.log('[analyzeBankStatement] calling Claude API, text length:', text.length)
  let response: Awaited<ReturnType<typeof client.messages.create>>
  try {
    response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2500,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: USER_PROMPT }],
    })
  } catch (claudeErr: unknown) {
    const msg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr)
    console.error('[analyzeBankStatement] Claude API error:', msg)
    throw new Error(`Claude API error: ${msg}`)
  }
  console.log('[analyzeBankStatement] Claude API response received')

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(clean) as BankStatementAnalysis
  } catch {
    console.error('Bank statement analysis parse failed. Raw:', clean.substring(0, 300))
    return {
      status: 'REVIEW',
      currency: 'UNKNOWN',
      statementPeriod: 'Unable to parse',
      monthsAnalyzed: 0,
      averageMonthlyBalance: 0,
      lowestBalance: 0,
      highestBalance: 0,
      closingBalance: 0,
      totalCredits: 0,
      totalDebits: 0,
      incomeRegular: false,
      estimatedMonthlyIncome: 0,
      salaryCreditsDetected: false,
      salaryAmount: null,
      salaryFrequency: null,
      otherIncomeSources: [],
      suspiciousTransactions: [],
      balanceDipsBelow: [],
      largeUnexplainedWithdrawals: [],
      embassyThresholdMet: false,
      embassyMinimumRequired: req.min,
      embassyCurrency: req.currency,
      overdraftsDetected: false,
      overdraftCount: 0,
      roundNumberDeposits: false,
      unusualDepositPattern: false,
      recommendations: ['Manual review required — automatic analysis could not parse this statement.'],
      summary: 'Our team will review your bank statement and get back to you within 24 hours.',
      agentNotes: 'AUTOMATIC ANALYSIS FAILED — PDF text extraction may have produced garbled output. Open the PDF directly and review manually. Check if the statement is a scanned image rather than a text-based PDF.',
      confidence: 'low',
      warnings: ['Analysis failed — manual review required before proceeding'],
    }
  }
}
