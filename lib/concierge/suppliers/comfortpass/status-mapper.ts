// Maps ComfortPass booking status → Walz internal request status lifecycle.
// Walz status is what customers and admin see; CP status is internal.

import type { CPBookingStatus } from './types'
import type { RequestStatus }   from '../../types'

// Walz extended status for ComfortPass-specific states stored in comfortpass_bookings.submission_state
export type CPSubmissionState = 'pending' | 'submitted' | 'failed' | 'manual_review'

// Walz extended voucher status
export type CPVoucherStatus = 'pending' | 'ready'

export function cpStatusToWalzRequestStatus(cpStatus: CPBookingStatus): RequestStatus {
  switch (cpStatus) {
    case 'pending':     return 'confirmed'    // CP accepted, awaiting their confirmation
    case 'confirmed':   return 'confirmed'
    case 'in_progress': return 'in_progress'
    case 'completed':   return 'completed'
    case 'cancelled':   return 'cancelled'
    case 'failed':      return 'cancelled'
    default:            return 'confirmed'
  }
}

// Human-readable label for admin display
export function cpStatusLabel(cpStatus: CPBookingStatus): string {
  switch (cpStatus) {
    case 'pending':     return 'Pending Confirmation'
    case 'confirmed':   return 'Confirmed'
    case 'in_progress': return 'In Progress'
    case 'completed':   return 'Completed'
    case 'cancelled':   return 'Cancelled'
    case 'failed':      return 'Failed'
    default:            return cpStatus
  }
}

export function submissionStateLabel(state: CPSubmissionState): string {
  switch (state) {
    case 'pending':       return 'Submission Pending'
    case 'submitted':     return 'Submitted to ComfortPass'
    case 'failed':        return 'Submission Failed'
    case 'manual_review': return 'Requires Manual Review'
  }
}

// Whether a CP booking status means a voucher should be available
export function cpStatusHasVoucher(cpStatus: CPBookingStatus): boolean {
  return cpStatus === 'confirmed' || cpStatus === 'in_progress' || cpStatus === 'completed'
}
