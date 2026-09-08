/** Careers management — shared server-side validation. */

export const JOB_TYPES = ['Full-time', 'Contract', 'Part-time'] as const

export interface JobOpeningInput {
  title?:       unknown
  type?:        unknown
  location?:    unknown
  description?: unknown
  isActive?:    unknown
  sortOrder?:   unknown
}

export interface ValidatedOpening {
  title?: string; type?: string; location?: string; description?: string
  isActive?: boolean; sortOrder?: number
}

/** Server-side validation — the browser payload is never trusted. */
export function validateOpening(
  data: JobOpeningInput,
  partial = false,
): { ok: true; value: ValidatedOpening } | { ok: false; error: string } {
  const out: ValidatedOpening = {}

  if (data.title !== undefined || !partial) {
    const t = typeof data.title === 'string' ? data.title.trim() : ''
    if (!t) return { ok: false, error: 'Title is required' }
    if (t.length > 120) return { ok: false, error: 'Title must be 120 characters or fewer' }
    out.title = t
  }
  if (data.type !== undefined || !partial) {
    if (!JOB_TYPES.includes(data.type as typeof JOB_TYPES[number])) {
      return { ok: false, error: `Type must be one of: ${JOB_TYPES.join(', ')}` }
    }
    out.type = data.type as string
  }
  if (data.location !== undefined || !partial) {
    const l = typeof data.location === 'string' ? data.location.trim() : ''
    if (!l) return { ok: false, error: 'Location is required' }
    if (l.length > 120) return { ok: false, error: 'Location must be 120 characters or fewer' }
    out.location = l
  }
  if (data.description !== undefined || !partial) {
    const d = typeof data.description === 'string' ? data.description.trim() : ''
    if (!d) return { ok: false, error: 'Description is required' }
    if (d.length > 5000) return { ok: false, error: 'Description must be 5000 characters or fewer' }
    out.description = d
  }
  if (data.isActive !== undefined) {
    if (typeof data.isActive !== 'boolean') return { ok: false, error: 'isActive must be a boolean' }
    out.isActive = data.isActive
  }
  if (data.sortOrder !== undefined) {
    const n = Number(data.sortOrder)
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'sortOrder must be a non-negative integer' }
    out.sortOrder = n
  }
  return { ok: true, value: out }
}
