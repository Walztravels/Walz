/**
 * Staff Updates — lib/staff-updates/priority.ts
 *
 * requiresAcknowledgement is the single source of truth for "does this
 * priority require formal staff acknowledgement" — shared by the
 * announcement detail page (UI visibility) and both ack API routes
 * (server-side enforcement). Per spec: HIGH and URGENT ("Critical") both
 * require acknowledgement; NORMAL is read-tracked only.
 */

import { requiresAcknowledgement } from '@/lib/staff-updates/priority'

describe('requiresAcknowledgement', () => {
  it('HIGH requires acknowledgement', () => {
    expect(requiresAcknowledgement('HIGH')).toBe(true)
  })

  it('URGENT ("Critical") requires acknowledgement', () => {
    expect(requiresAcknowledgement('URGENT')).toBe(true)
  })

  it('NORMAL does not require acknowledgement — read tracking only', () => {
    expect(requiresAcknowledgement('NORMAL')).toBe(false)
  })

  it('an unrecognized priority value does not require acknowledgement (fails closed, not open)', () => {
    expect(requiresAcknowledgement('SOMETHING_NEW')).toBe(false)
  })
})
