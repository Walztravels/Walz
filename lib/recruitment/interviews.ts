/**
 * Walz Recruitment Hub — human interviews and scorecards (Release 5).
 *
 * Scorecards evaluate job-relevant criteria only. This module never scores —
 * and the schema has no fields for — appearance, emotion, accent or any
 * protected personal characteristic. Scorecards inform, and never replace,
 * the human hiring decision made in the pipeline.
 */

export const INTERVIEW_KINDS    = ['phone', 'video', 'onsite'] as const
export const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
export const RECOMMENDATIONS    = ['strong_yes', 'yes', 'neutral', 'no', 'strong_no'] as const

export const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_yes: 'Strong yes',
  yes:        'Yes',
  neutral:    'Neutral',
  no:         'No',
  strong_no:  'Strong no',
}

export interface ScorecardCriterion { key: string; label: string; weight: number }
export interface CriterionScore extends ScorecardCriterion { score: number; comment?: string }

/** Seed scorecard for the commission-based Sales & Marketing Representative role. */
export const SALES_MARKETING_SCORECARD: { id: string; name: string; criteria: ScorecardCriterion[] } = {
  id:   'sc_sales_marketing_rep',
  name: 'Sales & Marketing Representative',
  criteria: [
    { key: 'communication',            label: 'Communication skills',                weight: 20 },
    { key: 'sales_experience',         label: 'Sales experience',                    weight: 20 },
    { key: 'persuasion',               label: 'Persuasion and objection handling',   weight: 20 },
    { key: 'client_sourcing',          label: 'Client sourcing ability',             weight: 15 },
    { key: 'travel_industry',          label: 'Travel-industry knowledge',           weight: 10 },
    { key: 'follow_up',                label: 'Follow-up discipline',                weight: 10 },
    { key: 'commission_understanding', label: 'Understanding of commission model',   weight: 5 },
  ],
}

/** Criteria are valid when 1–20 entries with unique keys and weights summing to 100. */
export function validateCriteria(criteria: unknown): criteria is ScorecardCriterion[] {
  if (!Array.isArray(criteria) || criteria.length === 0 || criteria.length > 20) return false
  const keys = new Set<string>()
  let total = 0
  for (const c of criteria) {
    if (typeof c?.key !== 'string' || !c.key || typeof c?.label !== 'string' || !c.label) return false
    if (typeof c?.weight !== 'number' || !Number.isFinite(c.weight) || c.weight <= 0 || c.weight > 100) return false
    if (keys.has(c.key)) return false
    keys.add(c.key)
    total += c.weight
  }
  return total === 100
}

/**
 * Validates submitted scores against the template criteria (every criterion
 * scored exactly once, 1–5) and computes the weighted overall (0–100).
 */
export function scoreSubmission(
  criteria: ScorecardCriterion[],
  raw: unknown,
): { ok: true; scores: CriterionScore[]; overall: number } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'scores must be an array' }
  const byKey = new Map(criteria.map(c => [c.key, c]))
  const seen = new Set<string>()
  const scores: CriterionScore[] = []

  for (const entry of raw) {
    const key = typeof entry?.key === 'string' ? entry.key : ''
    const criterion = byKey.get(key)
    if (!criterion) return { ok: false, error: `Unknown criterion "${key}"` }
    if (seen.has(key)) return { ok: false, error: `Criterion "${key}" scored twice` }
    const score = Number(entry?.score)
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return { ok: false, error: `Score for "${criterion.label}" must be an integer 1–5` }
    }
    seen.add(key)
    scores.push({
      ...criterion,
      score,
      comment: typeof entry?.comment === 'string' && entry.comment.trim()
        ? entry.comment.trim().slice(0, 1000)
        : undefined,
    })
  }
  if (seen.size !== criteria.length) {
    return { ok: false, error: 'Every criterion must be scored' }
  }
  // score 1–5 maps to 0–100% of the criterion's weight: (score-1)/4 × weight
  const overall = Math.round(scores.reduce((sum, s) => sum + ((s.score - 1) / 4) * s.weight, 0))
  return { ok: true, scores, overall }
}

export function validateInterviewInput(body: Record<string, unknown>):
  | { ok: true; value: { kind: string; scheduledAt: Date | null; durationMins: number; location: string | null; meetingUrl: string | null; interviewers: string[]; scorecardTemplateId: string | null; notes: string | null } }
  | { ok: false; error: string } {
  const kind = typeof body.kind === 'string' ? body.kind : 'video'
  if (!(INTERVIEW_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `kind must be one of: ${INTERVIEW_KINDS.join(', ')}` }
  }
  let scheduledAt: Date | null = null
  if (body.scheduledAt) {
    const d = new Date(String(body.scheduledAt))
    if (isNaN(d.getTime())) return { ok: false, error: 'scheduledAt must be a valid date-time' }
    scheduledAt = d
  }
  const durationMins = body.durationMins === undefined ? 45 : Number(body.durationMins)
  if (!Number.isInteger(durationMins) || durationMins < 5 || durationMins > 480) {
    return { ok: false, error: 'durationMins must be an integer between 5 and 480' }
  }
  const interviewers = Array.isArray(body.interviewers)
    ? body.interviewers.filter((e): e is string => typeof e === 'string' && e.includes('@')).slice(0, 10)
    : []
  const strOrNull = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  return {
    ok: true,
    value: {
      kind,
      scheduledAt,
      durationMins,
      location:   strOrNull(body.location, 200),
      meetingUrl: strOrNull(body.meetingUrl, 500),
      interviewers,
      scorecardTemplateId: strOrNull(body.scorecardTemplateId, 60),
      notes: strOrNull(body.notes, 5000),
    },
  }
}
