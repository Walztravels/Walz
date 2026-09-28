/**
 * Staff Performance Management — the deterministic, non-AI letter
 * template (mission brief §5). This is the DEFAULT draft content
 * generated from authoritative facts; Super Admin may then edit it
 * freely, and may optionally ask Jade to rewrite/shorten it (lib/performance/jade.ts) —
 * but the initial generation never calls an LLM, so a warning can always
 * be produced even if the AI provider is unavailable, and the factual
 * skeleton is always deterministic and reviewable.
 *
 * Deliberately avoids: unsupported accusations, claims of misconduct,
 * and the forbidden phrase "Employee must be warned" — this describes a
 * performance pattern and a management process, nothing more.
 */

export type WarningType =
  | 'COACHING_NOTE'
  | 'FIRST_WRITTEN_WARNING'
  | 'FINAL_WARNING'
  | 'PERFORMANCE_IMPROVEMENT_PLAN'

export const WARNING_TYPE_TITLE: Record<WarningType, { title: string; subtitle: string }> = {
  COACHING_NOTE: {
    title: 'COACHING NOTE',
    subtitle: 'Performance Discussion Summary',
  },
  FIRST_WRITTEN_WARNING: {
    title: 'FORMAL PERFORMANCE WARNING',
    subtitle: 'Sales Performance & Improvement Plan',
  },
  FINAL_WARNING: {
    title: 'FINAL PERFORMANCE WARNING',
    subtitle: 'Sales Performance & Improvement Plan',
  },
  PERFORMANCE_IMPROVEMENT_PLAN: {
    title: 'PERFORMANCE IMPROVEMENT PLAN',
    subtitle: 'Sales Performance',
  },
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'not on record'
  // Always formatted in UTC: these are calendar dates (review period,
  // last sale date, etc.) computed and stored in UTC elsewhere in this
  // feature (see lib/performance/sales.ts) — rendering in the server's
  // local timezone could otherwise shift the displayed date by a day.
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export interface WarningFacts {
  employeeName: string
  jobTitle: string
  department: string
  warningType: WarningType
  reviewPeriodStart: Date
  reviewPeriodEnd: Date
  salesInPeriod: number
  lastSaleDate: Date | null
  requiredImprovement: string
  pipDurationDays: number | null
  reviewDate: Date
  issuedByName: string
  warningHistorySummary: string
  additionalNotes?: string | null
}

/**
 * Builds the default editable letter body as an array of paragraphs
 * (never a single opaque blob), so the UI can render/edit them and the
 * PDF can lay them out identically. Joined with blank lines when needed.
 */
export function buildWarningParagraphs(facts: WarningFacts): string[] {
  const { title, subtitle } = WARNING_TYPE_TITLE[facts.warningType]
  const periodStr = `${fmtDate(facts.reviewPeriodStart)} to ${fmtDate(facts.reviewPeriodEnd)}`

  const paragraphs: string[] = []

  paragraphs.push(`Dear ${facts.employeeName},`)

  paragraphs.push(
    `This letter follows a review of your sales performance for the period ${periodStr}, undertaken as part of Walz Travels' ` +
      `ongoing performance management process. It sets out the factual basis for this review, the improvement expected, and ` +
      `the support available to you.`,
  )

  paragraphs.push(
    `As a ${facts.jobTitle} in the ${facts.department} team, your role includes generating confirmed, paid bookings for ` +
      `Walz Travels clients. During the period under review, our records show ${facts.salesInPeriod} completed sale(s) ` +
      `attributed to you, with your most recent completed sale on ${fmtDate(facts.lastSaleDate)}. This is a factual ` +
      `record of activity during the stated period and does not represent an allegation of misconduct.`,
  )

  if (facts.warningHistorySummary) {
    paragraphs.push(facts.warningHistorySummary)
  }

  paragraphs.push(
    `We would like to understand any circumstances that may have affected your performance during this period, and we ` +
      `invite you to raise anything you believe is inaccurate or relevant before or during your next review.`,
  )

  paragraphs.push(`Improvement required:\n${facts.requiredImprovement}`)

  if (facts.warningType === 'PERFORMANCE_IMPROVEMENT_PLAN' || facts.warningType === 'FIRST_WRITTEN_WARNING' || facts.warningType === 'FINAL_WARNING') {
    const durationLine = facts.pipDurationDays
      ? `a Performance Improvement Plan of ${facts.pipDurationDays} days`
      : 'a Performance Improvement Plan'
    paragraphs.push(
      `To support you in meeting this expectation, we are putting in place ${durationLine}, running until your next ` +
        `review on ${fmtDate(facts.reviewDate)}. Support available to you during this period includes coaching from ` +
        `your manager, access to sales training materials, and regular check-ins to discuss progress.`,
    )
  } else {
    paragraphs.push(`We will review progress together on ${fmtDate(facts.reviewDate)}.`)
  }

  if (facts.warningType === 'FIRST_WRITTEN_WARNING' || facts.warningType === 'FINAL_WARNING') {
    paragraphs.push(
      `Should performance not improve to the required standard by the review date, further management action may be ` +
        `considered, in line with Walz Travels' performance management process. No decision on further action has been ` +
        `made at this stage.`,
    )
  }

  if (facts.additionalNotes) {
    paragraphs.push(facts.additionalNotes)
  }

  paragraphs.push(
    `If you believe any information in this notice is inaccurate, or there are circumstances you would like management ` +
      `to consider, please raise this with your manager as soon as possible.`,
  )

  paragraphs.push(`Regards,\n${facts.issuedByName}\nWalz Travels Management`)

  return paragraphs
}

export function buildWarningDraft(facts: WarningFacts): string {
  return buildWarningParagraphs(facts).join('\n\n')
}

export function warningTypeHeading(warningType: WarningType): { title: string; subtitle: string } {
  return WARNING_TYPE_TITLE[warningType]
}
