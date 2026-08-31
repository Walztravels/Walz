// lib/portal/status-normalizers.ts
// Release 6.2: Customer-facing labels and badge classes for internal status codes.
// Never expose raw internal values (ENQUIRY, DOCUMENTS_PENDING, etc.) directly in the UI.

// ── Itinerary proposals ───────────────────────────────────────────────────────

export function proposalStatusLabel(status: string): string {
  const map: Record<string, string> = {
    sent:      'Awaiting your approval',
    viewed:    'Awaiting your approval',
    approved:  'Approved',
    rejected:  'Declined',
    expired:   'Expired',
    cancelled: 'Cancelled',
  }
  return map[status] ?? status
}

export function proposalStatusColor(status: string): string {
  const map: Record<string, string> = {
    sent:      'bg-amber-500/15 text-amber-400',
    viewed:    'bg-amber-500/15 text-amber-400',
    approved:  'bg-green-500/15 text-green-400',
    rejected:  'bg-red-500/15 text-red-400',
    expired:   'bg-white/8 text-white/30',
    cancelled: 'bg-white/8 text-white/30',
  }
  return map[status] ?? 'bg-white/8 text-white/40'
}

export function proposalNeedsAction(status: string): boolean {
  return status === 'sent' || status === 'viewed'
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export function bookingStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING:   'Processing',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    FAILED:    'Failed',
  }
  return map[status] ?? status
}

export function bookingStatusColor(status: string): string {
  const map: Record<string, string> = {
    CONFIRMED: 'bg-green-500/15 text-green-400',
    COMPLETED: 'bg-white/10 text-white/50',
    CANCELLED: 'bg-red-500/15 text-red-400',
    FAILED:    'bg-red-500/15 text-red-400',
    PENDING:   'bg-amber-500/15 text-amber-400',
  }
  return map[status] ?? 'bg-white/8 text-white/40'
}

// ── Applications ──────────────────────────────────────────────────────────────

export function applicationStageLabel(stage: string): string {
  const map: Record<string, string> = {
    ENQUIRY:            'Enquiry received',
    DOCUMENTS_PENDING:  'Documents needed',
    DOCUMENTS_RECEIVED: 'Documents received',
    PROCESSING:         'Processing',
    SUBMITTED:          'Submitted',
    AWAITING_DECISION:  'Decision pending',
    APPROVED:           'Approved',
    REJECTED:           'Refused',
    COMPLETED:          'Completed',
  }
  return map[stage] ?? stage.replace(/_/g, ' ')
}

export function applicationStageColor(stage: string): string {
  const map: Record<string, string> = {
    ENQUIRY:            'bg-blue-500/15 text-blue-400',
    DOCUMENTS_PENDING:  'bg-amber-500/15 text-amber-400',
    DOCUMENTS_RECEIVED: 'bg-yellow-500/15 text-yellow-400',
    PROCESSING:         'bg-purple-500/15 text-purple-400',
    SUBMITTED:          'bg-indigo-500/15 text-indigo-400',
    AWAITING_DECISION:  'bg-orange-500/15 text-orange-400',
    APPROVED:           'bg-green-500/15 text-green-400',
    REJECTED:           'bg-red-500/15 text-red-400',
    COMPLETED:          'bg-white/10 text-white/50',
  }
  return map[stage] ?? 'bg-white/8 text-white/40'
}

export function applicationStageProgress(stage: string): number {
  if (stage === 'REJECTED') return 100
  const ORDER = ['ENQUIRY', 'DOCUMENTS_PENDING', 'DOCUMENTS_RECEIVED', 'PROCESSING', 'SUBMITTED', 'AWAITING_DECISION', 'APPROVED', 'COMPLETED']
  const i = ORDER.indexOf(stage)
  return i === -1 ? 0 : Math.round(((i + 1) / ORDER.length) * 100)
}
