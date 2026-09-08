/**
 * Walz Recruitment Hub — core constants, validation, authz, audit.
 * Server-side validation is authoritative; the browser payload is never trusted.
 */

import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'

// ── Vocabulary (strings per repo convention — no Prisma enums) ────────────────

export const JOB_STATUSES = ['draft', 'published', 'paused', 'closed', 'archived'] as const
export type JobStatus = typeof JOB_STATUSES[number]

export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Commission-based'] as const
export const WORKPLACE_TYPES  = ['remote', 'hybrid', 'onsite'] as const
export const COMPENSATION_TYPES = ['salary', 'hourly', 'commission', 'mixed'] as const

/** Legal status transitions — anything else is rejected server-side. */
export const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft:     ['published', 'archived'],
  published: ['paused', 'closed', 'archived'],
  paused:    ['published', 'closed', 'archived'],
  closed:    ['published', 'archived'],   // reopen
  archived:  ['draft'],                   // restore to draft only
}

/** Default per-job pipeline stages. `key` is stable; labels are customizable. */
export const DEFAULT_PIPELINE_STAGES = [
  { key: 'new',                  label: 'New Application' },
  { key: 'ai_review',            label: 'AI Review Completed' },
  { key: 'recruiter_review',     label: 'Recruiter Review' },
  { key: 'shortlisted',          label: 'Shortlisted' },
  { key: 'ai_interview_invited', label: 'AI Interview Invited' },
  { key: 'ai_interview_done',    label: 'AI Interview Completed' },
  { key: 'human_interview',      label: 'Human Interview' },
  { key: 'reference_check',      label: 'Reference Check' },
  { key: 'offer',                label: 'Offer' },
  { key: 'hired',                label: 'Hired' },
  { key: 'rejected',             label: 'Rejected' },
  { key: 'talent_pool',          label: 'Talent Pool' },
] as const

export const DEFAULT_AI_DISCLOSURE =
  'Walz Travels uses artificial intelligence to assist with résumé review, candidate screening and structured interviews. ' +
  'AI does not make final hiring decisions. All hiring decisions are reviewed and approved by authorized Walz Travels staff. ' +
  'Candidates may request accommodation or human assistance during the recruitment process.'

// ── Authorization ─────────────────────────────────────────────────────────────
// The API RBAC layer is session + role (granular permission strings are a
// nav-only concept in this repo), so the suggested recruitment.* permissions
// map to roles here. Management roles manage; any authenticated staff views.

const MANAGEMENT_ROLES = ['super_admin', 'operations_manager', 'general_manager', 'senior_manager']

export type RecruitmentPermission =
  | 'recruitment.view'
  | 'recruitment.jobs.manage'
  | 'recruitment.candidates.view'
  | 'recruitment.candidates.manage'
  | 'recruitment.interviews.manage'
  | 'recruitment.ai.review'
  | 'recruitment.offers.manage'
  | 'recruitment.analytics.view'
  | 'recruitment.settings.manage'

const VIEW_PERMISSIONS: RecruitmentPermission[] = [
  'recruitment.view', 'recruitment.candidates.view', 'recruitment.analytics.view',
]

export function hasRecruitmentPermission(
  session: Pick<AdminSession, 'role'> | null,
  permission: RecruitmentPermission,
): boolean {
  if (!session) return false
  if (VIEW_PERMISSIONS.includes(permission)) return true            // any authenticated staff
  return MANAGEMENT_ROLES.includes(session.role)                    // manage = management roles
}

// ── Slugs ─────────────────────────────────────────────────────────────────────

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80)
}

export async function ensureUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || 'job'
  let candidate = base
  for (let i = 0; i < 20; i++) {
    const existing = await prisma.jobOpening.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (!existing) return candidate
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }
  return `${base}-${Date.now().toString(36)}`
}

// ── Public visibility ─────────────────────────────────────────────────────────

/** Prisma where for publicly visible jobs: published AND not past deadline. */
export function publicJobWhere(now: Date = new Date()) {
  return {
    status: 'published',
    OR: [{ deadline: null }, { deadline: { gt: now } }],
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface JobInput {
  title?: unknown; department?: unknown; type?: unknown; workplaceType?: unknown
  location?: unknown; compensationType?: unknown; compensationMin?: unknown
  compensationMax?: unknown; currency?: unknown; description?: unknown
  responsibilities?: unknown; requirements?: unknown; benefits?: unknown
  applicationInstructions?: unknown; deadline?: unknown; hiringManager?: unknown
  recruiters?: unknown; positions?: unknown; screeningSettings?: unknown
  aiDisclosure?: unknown; sortOrder?: unknown
}

type Validated = Record<string, unknown>

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= max ? t : null
}

export function validateJob(data: JobInput, partial = false): { ok: true; value: Validated } | { ok: false; error: string } {
  const out: Validated = {}
  const need = (field: keyof JobInput) => data[field] !== undefined || !partial

  if (need('title')) {
    const t = str(data.title, 120)
    if (!t) return { ok: false, error: 'Title is required (max 120 chars)' }
    out.title = t
  }
  if (need('type')) {
    if (!EMPLOYMENT_TYPES.includes(data.type as typeof EMPLOYMENT_TYPES[number])) {
      return { ok: false, error: `Employment type must be one of: ${EMPLOYMENT_TYPES.join(', ')}` }
    }
    out.type = data.type
  }
  if (need('location')) {
    const l = str(data.location, 120)
    if (!l) return { ok: false, error: 'Location is required (max 120 chars)' }
    out.location = l
  }
  if (need('description')) {
    const d = str(data.description, 20000)
    if (!d) return { ok: false, error: 'Description is required' }
    out.description = d
  }
  if (data.workplaceType !== undefined) {
    if (!WORKPLACE_TYPES.includes(data.workplaceType as typeof WORKPLACE_TYPES[number])) {
      return { ok: false, error: `Workplace type must be one of: ${WORKPLACE_TYPES.join(', ')}` }
    }
    out.workplaceType = data.workplaceType
  }
  if (data.compensationType !== undefined) {
    if (!COMPENSATION_TYPES.includes(data.compensationType as typeof COMPENSATION_TYPES[number])) {
      return { ok: false, error: `Compensation type must be one of: ${COMPENSATION_TYPES.join(', ')}` }
    }
    out.compensationType = data.compensationType
  }
  for (const field of ['department', 'currency', 'hiringManager'] as const) {
    if (data[field] !== undefined) {
      const v = data[field]
      if (v === null || v === '') { out[field] = null; continue }
      const s = str(v, 120)
      if (s === null) return { ok: false, error: `${field} must be a string (max 120 chars)` }
      out[field] = s
    }
  }
  for (const field of ['responsibilities', 'requirements', 'benefits', 'applicationInstructions', 'aiDisclosure'] as const) {
    if (data[field] !== undefined) {
      const v = data[field]
      if (v === null || v === '') { out[field] = null; continue }
      const s = str(v, 20000)
      if (s === null) return { ok: false, error: `${field} is too long` }
      out[field] = s
    }
  }
  for (const field of ['compensationMin', 'compensationMax'] as const) {
    if (data[field] !== undefined) {
      if (data[field] === null || data[field] === '') { out[field] = null; continue }
      const n = Number(data[field])
      if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return { ok: false, error: `${field} must be a non-negative number` }
      out[field] = n
    }
  }
  if (data.deadline !== undefined) {
    if (data.deadline === null || data.deadline === '') { out.deadline = null }
    else {
      const d = new Date(String(data.deadline))
      if (isNaN(d.getTime())) return { ok: false, error: 'Deadline must be a valid date' }
      out.deadline = d
    }
  }
  if (data.positions !== undefined) {
    const n = Number(data.positions)
    if (!Number.isInteger(n) || n < 1 || n > 500) return { ok: false, error: 'Positions must be an integer between 1 and 500' }
    out.positions = n
  }
  if (data.sortOrder !== undefined) {
    const n = Number(data.sortOrder)
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'sortOrder must be a non-negative integer' }
    out.sortOrder = n
  }
  if (data.recruiters !== undefined) {
    if (!Array.isArray(data.recruiters) || data.recruiters.some(r => typeof r !== 'string' || r.length > 200)) {
      return { ok: false, error: 'recruiters must be an array of emails' }
    }
    out.recruiters = data.recruiters
  }
  if (data.screeningSettings !== undefined) {
    if (typeof data.screeningSettings !== 'object' || data.screeningSettings === null || Array.isArray(data.screeningSettings)) {
      return { ok: false, error: 'screeningSettings must be an object' }
    }
    out.screeningSettings = data.screeningSettings
  }
  return { ok: true, value: out }
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export async function recruitmentAudit(
  session: Pick<AdminSession, 'email' | 'id' | 'name'> | null,
  action: string,
  detail: string,
): Promise<void> {
  await prisma.activityLog.create({
    data: {
      staffId:   session?.id ?? null,
      staffName: session?.name ?? session?.email ?? 'system',
      action:    `Recruitment: ${action}`,
      detail:    detail.slice(0, 800),
    },
  }).catch((e: unknown) => console.error('[recruitment] audit failed:', e))
}
