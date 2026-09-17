'use client'

/**
 * Cross-page Active Case store for the Intelligence Hub (client-only).
 *
 * Lets a case selected in Document Intelligence follow staff into
 * Financial DNA (and, as they adopt the shared selector, the other hub
 * modules) so nobody selects the same client twice. sessionStorage:
 * per-tab, cleared on browser close, guarded for private-mode throws.
 */

export interface ActiveCaseRef {
  applicationId: string | null
  userId: string | null
  referenceNumber: string | null
  clientName: string
  email: string | null
  destinationIso2: string | null
  status: string | null
}

const KEY = 'walz-intelligence-active-case'

export function getActiveCase(): ActiveCaseRef | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveCaseRef
    return parsed && typeof parsed.clientName === 'string' ? parsed : null
  } catch { return null }
}

export function setActiveCase(ref: ActiveCaseRef | null): void {
  try {
    if (ref) sessionStorage.setItem(KEY, JSON.stringify(ref))
    else sessionStorage.removeItem(KEY)
  } catch { /* storage unavailable — selection stays page-local */ }
}
