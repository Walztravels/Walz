import prisma from '@/lib/db'
import { getAnthropic } from '@/lib/anthropic'
import {
  normalizeByType, getCaseEvidence, type EvidenceDataType,
} from '@/lib/intelligence/evidence'
import { modelFor } from '@/lib/intelligence/models'

/**
 * Embassy Form Cross-Check engine (DI-3).
 *
 * Deterministic first: dates, amounts, names and identifiers are compared
 * in code — the model NEVER decides whether 850000 == 850000 or whether
 * 2026-10-10 == 2026-10-11. One optional LLM call at the end explains the
 * ALREADY-COMPUTED findings for staff (findings only, no raw documents —
 * payload minimization). Nothing here estimates approval probability.
 */

export type FindingStatus = 'MATCH' | 'PARTIAL_MATCH' | 'CONFLICT' | 'MISSING' | 'UNVERIFIED'

export interface Finding {
  category: string
  field: string
  applicationValue: string | null
  evidenceValue: string | null
  evidenceSourceType: string | null
  evidenceSourceId: string | null
  status: FindingStatus
  confidence: number
  explanation: string
  recommendedAction: string | null
}

/** Application-side value extractor — always read live, never duplicated. */
type AppRecord = {
  firstName: string | null; middleName: string | null; lastName: string | null
  dateOfBirth: Date | null; nationality: string | null
  passportNumber: string | null; passportExpiryDate: Date | null
  email: string | null; phone: string | null
  homeAddress: string | null; city: string | null; country: string | null
  employerName: string | null; jobTitle: string | null; monthlyIncome: string | null
  arrivalDate: Date | null; returnDate: Date | null
  accommodationName: string | null
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

interface EqualityRule {
  kind: 'equality'
  field: string                 // finding field name, e.g. identity.fullName
  category: string
  dataType: EvidenceDataType
  appValue: (a: AppRecord) => string | null
  evidenceFields: string[]      // canonical evidence fields that attest this
  action: string                // recommended staff action on conflict
}
interface WindowRule {
  kind: 'window'
  field: string
  category: string
  // evidence date must fall inside [start, end] (inclusive)
  evidenceField: string
  start: (a: AppRecord) => string | null
  end:   (a: AppRecord) => string | null
  action: string
}
export type ComparisonRule = EqualityRule | WindowRule

const fullName = (a: AppRecord) => [a.firstName, a.middleName, a.lastName].filter(Boolean).join(' ') || null

export const COMPARISON_RULES: ComparisonRule[] = [
  { kind: 'equality', field: 'identity.fullName', category: 'identity', dataType: 'string',
    appValue: fullName,
    evidenceFields: ['passport.fullName', 'form.fullName', 'employment.fullName', 'payslip.fullName', 'bank.accountName', 'flight.passengerName', 'hotel.guestName', 'insurance.insuredName', 'tax.fullName'],
    action: 'Confirm the applicant name is spelled identically on every document.' },
  { kind: 'equality', field: 'identity.dateOfBirth', category: 'identity', dataType: 'date',
    appValue: a => iso(a.dateOfBirth),
    evidenceFields: ['passport.dateOfBirth', 'form.dateOfBirth'],
    action: 'Verify the date of birth against the passport bio page.' },
  { kind: 'equality', field: 'passport.number', category: 'passport', dataType: 'identifier',
    appValue: a => a.passportNumber,
    evidenceFields: ['passport.number', 'form.passportNumber'],
    action: 'Check the passport number character by character.' },
  { kind: 'equality', field: 'passport.expiryDate', category: 'passport', dataType: 'date',
    appValue: a => iso(a.passportExpiryDate),
    evidenceFields: ['passport.expiryDate'],
    action: 'Confirm passport validity for the intended travel dates.' },
  { kind: 'equality', field: 'employment.employer', category: 'employment', dataType: 'string',
    appValue: a => a.employerName,
    evidenceFields: ['employment.employer', 'payslip.employer', 'form.employer'],
    action: 'Reconcile the employer name across the application and employment evidence.' },
  { kind: 'equality', field: 'employment.jobTitle', category: 'employment', dataType: 'string',
    appValue: a => a.jobTitle,
    evidenceFields: ['employment.jobTitle', 'form.jobTitle'],
    action: 'Confirm the job title with the employment letter.' },
  { kind: 'equality', field: 'financial.monthlyIncome', category: 'financial', dataType: 'amount',
    appValue: a => a.monthlyIncome,
    evidenceFields: ['employment.monthlyIncome', 'form.monthlyIncome', 'payslip.netPay'],
    action: 'Review the income declared against employment and payslip evidence.' },
  { kind: 'equality', field: 'travel.startDate', category: 'travel', dataType: 'date',
    appValue: a => iso(a.arrivalDate),
    evidenceFields: ['flight.departureDate', 'form.travelDate'],
    action: 'Review travel dates — the application and flight must agree.' },
  { kind: 'equality', field: 'travel.returnDate', category: 'travel', dataType: 'date',
    appValue: a => iso(a.returnDate),
    evidenceFields: ['flight.returnDate', 'form.returnDate'],
    action: 'Review return dates across the application and flight.' },
  { kind: 'window', field: 'accommodation.checkIn', category: 'accommodation',
    evidenceField: 'hotel.checkIn',
    start: a => iso(a.arrivalDate), end: a => iso(a.returnDate),
    action: 'Review accommodation dates — check-in falls outside the declared trip.' },
  { kind: 'window', field: 'accommodation.checkOut', category: 'accommodation',
    evidenceField: 'hotel.checkOut',
    start: a => iso(a.arrivalDate), end: a => iso(a.returnDate),
    action: 'Review accommodation dates — check-out falls outside the declared trip.' },
  { kind: 'window', field: 'travel.insuranceCoversStart', category: 'travel',
    evidenceField: 'insurance.startDate',
    start: a => null, end: a => iso(a.arrivalDate),
    action: 'Insurance must start on or before the departure date.' },
]

/** Percentage tolerance under which two amounts count as a partial match
 *  (e.g. net pay vs gross declared income). Exact equality is a MATCH. */
export const AMOUNT_PARTIAL_TOLERANCE = 0.05

/** Deterministic comparison of two NORMALIZED values. */
export function compareNormalized(
  dataType: EvidenceDataType,
  appNorm: string,
  evNorm: string,
  currencies?: { app: string | null; ev: string | null },
): { status: FindingStatus; explanation: string } {
  switch (dataType) {
    case 'date': {
      if (appNorm === evNorm) return { status: 'MATCH', explanation: 'Dates are identical.' }
      const days = Math.round(Math.abs(Date.parse(appNorm) - Date.parse(evNorm)) / 86_400_000)
      return { status: 'CONFLICT', explanation: `Dates differ by ${days} day${days === 1 ? '' : 's'} (${appNorm} vs ${evNorm}).` }
    }
    case 'amount': {
      if (currencies?.app && currencies?.ev && currencies.app !== currencies.ev) {
        return { status: 'UNVERIFIED', explanation: `Amounts are in different currencies (${currencies.app} vs ${currencies.ev}) and cannot be compared directly.` }
      }
      const a = Number(appNorm), e = Number(evNorm)
      if (!Number.isFinite(a) || !Number.isFinite(e)) return { status: 'UNVERIFIED', explanation: 'One of the amounts could not be read as a number.' }
      if (a === e) return { status: 'MATCH', explanation: 'Amounts are identical.' }
      const diff = Math.abs(a - e) / Math.max(a, e)
      if (diff <= AMOUNT_PARTIAL_TOLERANCE) {
        return { status: 'PARTIAL_MATCH', explanation: `Amounts are within ${(diff * 100).toFixed(1)}% of each other (${appNorm} vs ${evNorm}).` }
      }
      return { status: 'CONFLICT', explanation: `Amounts differ by ${(diff * 100).toFixed(0)}% (${appNorm} vs ${evNorm}).` }
    }
    case 'identifier':
      return appNorm === evNorm
        ? { status: 'MATCH', explanation: 'Identifiers are identical.' }
        : { status: 'CONFLICT', explanation: `Identifiers differ (${appNorm} vs ${evNorm}).` }
    default: {
      if (appNorm === evNorm) return { status: 'MATCH', explanation: 'Values are identical.' }
      const aTokens = new Set(appNorm.split(' ')), eTokens = new Set(evNorm.split(' '))
      const subset = (x: Set<string>, y: Set<string>) => [...x].every(t => y.has(t))
      if (subset(aTokens, eTokens) || subset(eTokens, aTokens)) {
        return { status: 'PARTIAL_MATCH', explanation: `Values agree but one includes extra parts ("${appNorm}" vs "${evNorm}") — often a missing middle name.` }
      }
      return { status: 'CONFLICT', explanation: `Values do not match ("${appNorm}" vs "${evNorm}").` }
    }
  }
}

type EvidenceRow = {
  id: string; field: string; sourceType: string; sourceId: string | null
  rawValue: string | null; normalizedValue: string | null
  currency: string | null; confidence: number
}

/** Pick the best attestation per evidence field: highest confidence, then newest (rows arrive newest-first). */
export function bestEvidenceByField(rows: EvidenceRow[]): Map<string, EvidenceRow> {
  const best = new Map<string, EvidenceRow>()
  for (const row of rows) {
    const cur = best.get(row.field)
    if (!cur || row.confidence > cur.confidence) best.set(row.field, row)
  }
  return best
}

export function runComparisons(app: AppRecord, evidenceRows: EvidenceRow[]): Finding[] {
  const best = bestEvidenceByField(evidenceRows)
  const findings: Finding[] = []

  for (const rule of COMPARISON_RULES) {
    if (rule.kind === 'equality') {
      const appRaw = rule.appValue(app)
      const appNorm = appRaw ? normalizeByType(appRaw, rule.dataType) : { normalized: null, currency: null }
      const attestations = rule.evidenceFields.map(f => best.get(f)).filter((r): r is EvidenceRow => Boolean(r))

      if (!appRaw && attestations.length === 0) continue   // nothing on either side — not a checkable field
      if (attestations.length === 0) {
        findings.push({
          category: rule.category, field: rule.field,
          applicationValue: appRaw, evidenceValue: null,
          evidenceSourceType: null, evidenceSourceId: null,
          status: 'MISSING', confidence: 1,
          explanation: 'No supporting evidence has been extracted for this field yet.',
          recommendedAction: 'Upload the supporting document that evidences this field.',
        })
        continue
      }
      for (const ev of attestations) {
        if (!appNorm.normalized || !ev.normalizedValue) {
          findings.push({
            category: rule.category, field: rule.field,
            applicationValue: appRaw, evidenceValue: ev.rawValue,
            evidenceSourceType: ev.sourceType, evidenceSourceId: ev.sourceId,
            status: 'UNVERIFIED', confidence: ev.confidence,
            explanation: !appRaw
              ? 'The application does not state this value; evidence exists but has nothing to be checked against.'
              : 'The value could not be normalized for a deterministic comparison.',
            recommendedAction: 'Review both values manually.',
          })
          continue
        }
        const cmp = compareNormalized(rule.dataType, appNorm.normalized, ev.normalizedValue,
          { app: appNorm.currency, ev: ev.currency })
        findings.push({
          category: rule.category, field: rule.field,
          applicationValue: appRaw, evidenceValue: ev.rawValue,
          evidenceSourceType: ev.sourceType, evidenceSourceId: ev.sourceId,
          status: cmp.status, confidence: ev.confidence,
          explanation: cmp.explanation,
          recommendedAction: cmp.status === 'MATCH' ? null : rule.action,
        })
      }
    } else {
      const ev = best.get(rule.evidenceField)
      if (!ev) continue                                   // window rules only fire when evidence exists
      const start = rule.start(app), end = rule.end(app)
      if (!ev.normalizedValue || (!start && !end)) continue
      const v = ev.normalizedValue
      const inside = (!start || v >= start) && (!end || v <= end)
      findings.push({
        category: rule.category, field: rule.field,
        applicationValue: [start, end].filter(Boolean).join(' – ') || null,
        evidenceValue: ev.rawValue,
        evidenceSourceType: ev.sourceType, evidenceSourceId: ev.sourceId,
        status: inside ? 'MATCH' : 'CONFLICT', confidence: ev.confidence,
        explanation: inside
          ? `${v} falls inside the declared window.`
          : `${v} falls outside the declared window (${start ?? '…'} – ${end ?? '…'}).`,
        recommendedAction: inside ? null : rule.action,
      })
    }
  }
  return findings
}

export function countFindings(findings: Finding[]) {
  const by = (s: FindingStatus) => findings.filter(f => f.status === s).length
  return {
    fieldsChecked:  findings.length,
    matches:        by('MATCH'),
    partialMatches: by('PARTIAL_MATCH'),
    conflicts:      by('CONFLICT'),
    missing:        by('MISSING'),
    unverified:     by('UNVERIFIED'),
  }
}

const SUMMARY_MODEL = modelFor('findingsSummary')

/** Explain the ALREADY-COMPUTED findings for staff. Findings only — no
 *  documents, no case history. A failure yields null, never invented text. */
async function summarizeFindings(findings: Finding[], formType: string): Promise<string | null> {
  const notable = findings.filter(f => f.status !== 'MATCH').slice(0, 25)
  if (notable.length === 0) return 'All checked fields agree with the available evidence. No review items were detected by the deterministic comparison.'
  try {
    const res = await getAnthropic().messages.create({
      model: SUMMARY_MODEL, max_tokens: 700,
      messages: [{
        role: 'user',
        content: [
          `You are helping visa staff review a ${formType} application cross-check.`,
          'The following field comparisons were computed DETERMINISTICALLY by code — do not re-judge them, do not change any status, and never estimate approval chances.',
          'Write a concise staff-facing review summary (max 180 words): group the issues, state what each conflict means practically, and list the concrete next actions.',
          '',
          JSON.stringify(notable.map(f => ({
            field: f.field, status: f.status,
            application: f.applicationValue, evidence: f.evidenceValue,
            source: f.evidenceSourceType, note: f.explanation,
          }))),
        ].join('\n'),
      }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
    return text || null
  } catch {
    return null
  }
}

async function tryDb<T>(op: () => Promise<T>): Promise<T | null> {
  try { return await op() } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/does not exist|relation|column/i.test(msg)) return null
    throw e
  }
}

export interface CrossCheckResult {
  crossCheckId: string | null
  counts: ReturnType<typeof countFindings>
  findings: Finding[]
  summary: string | null
  persisted: boolean
}

/** Run and persist one cross-check for a case. Reruns append new runs. */
export async function runCrossCheck(opts: {
  applicationId: string
  formType: string
  runBy: string
}): Promise<CrossCheckResult | { error: 'APPLICATION_NOT_FOUND' }> {
  const app = await prisma.visaApplication.findUnique({
    where: { id: opts.applicationId },
    select: {
      firstName: true, middleName: true, lastName: true, dateOfBirth: true,
      nationality: true, passportNumber: true, passportExpiryDate: true,
      email: true, phone: true, homeAddress: true, city: true, country: true,
      employerName: true, jobTitle: true, monthlyIncome: true,
      arrivalDate: true, returnDate: true, accommodationName: true,
    },
  })
  if (!app) return { error: 'APPLICATION_NOT_FOUND' }

  const evidence = await getCaseEvidence(opts.applicationId)
  const findings = runComparisons(app, evidence as EvidenceRow[])
  const counts = countFindings(findings)
  const summary = await summarizeFindings(findings, opts.formType)

  const saved = await tryDb(() => prisma.formCrossCheck.create({
    data: {
      applicationId: opts.applicationId,
      formType: opts.formType,
      ...counts,
      summary,
      runBy: opts.runBy,
      findings: { create: findings.map(f => ({ ...f })) },
    },
    select: { id: true },
  }))

  return { crossCheckId: saved?.id ?? null, counts, findings, summary, persisted: Boolean(saved) }
}
