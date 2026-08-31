// lib/portal/booking-states.ts — Release 6.3: Centralized customer booking state model
// Hard rule: paymentStatus=SUCCEEDED + status=PENDING ≠ CONFIRMED (PAYMENT_RECEIVED only)

export type CustomerBookingState =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_RECEIVED'
  | 'CONFIRMED'
  | 'ACTION_REQUIRED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUND_PROCESSING'
  | 'REFUNDED'
  | 'FAILED'

export type CustomerActivityState =
  | 'ENQUIRY'
  | 'PAYMENT_RECEIVED'
  | 'CONFIRMED'
  | 'ACTION_REQUIRED'
  | 'CANCELLED'
  | 'FAILED'

export function getCustomerBookingState(opts: {
  status: string
  paymentStatus: string
}): CustomerBookingState {
  const { status, paymentStatus } = opts

  if (status === 'COMPLETED') return 'COMPLETED'

  if (status === 'CANCELLED') {
    if (paymentStatus === 'REFUNDED') return 'REFUNDED'
    if (paymentStatus === 'SUCCEEDED') return 'REFUND_PROCESSING'
    return 'CANCELLED'
  }

  if (status === 'FAILED') {
    // Payment was taken but booking failed — urgent
    if (paymentStatus === 'SUCCEEDED') return 'ACTION_REQUIRED'
    return 'FAILED'
  }

  if (status === 'CONFIRMED') return 'CONFIRMED'

  // status === 'PENDING'
  if (paymentStatus === 'SUCCEEDED') return 'PAYMENT_RECEIVED'
  if (paymentStatus === 'REFUNDED') return 'REFUNDED'
  if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') return 'FAILED'

  // PENDING or PROCESSING payment, PENDING status
  return 'PENDING_PAYMENT'
}

export function getCustomerBookingStateLabel(state: CustomerBookingState): string {
  switch (state) {
    case 'PENDING_PAYMENT':   return 'Awaiting Payment'
    case 'PAYMENT_RECEIVED':  return 'Payment Received'
    case 'CONFIRMED':         return 'Confirmed'
    case 'ACTION_REQUIRED':   return 'Action Required'
    case 'COMPLETED':         return 'Completed'
    case 'CANCELLED':         return 'Cancelled'
    case 'REFUND_PROCESSING': return 'Refund Processing'
    case 'REFUNDED':          return 'Refunded'
    case 'FAILED':            return 'Failed'
  }
}

export function getCustomerBookingStateDescription(state: CustomerBookingState): string {
  switch (state) {
    case 'PENDING_PAYMENT':
      return 'Waiting for your payment to be processed.'
    case 'PAYMENT_RECEIVED':
      return 'Your payment has been received. We are confirming your booking with the supplier.'
    case 'CONFIRMED':
      return 'Your booking is confirmed.'
    case 'ACTION_REQUIRED':
      return 'Your payment was received but there was an issue with your booking. Please contact us immediately.'
    case 'COMPLETED':
      return 'Your trip has been completed. We hope you had a wonderful experience.'
    case 'CANCELLED':
      return 'This booking has been cancelled.'
    case 'REFUND_PROCESSING':
      return 'Your cancellation has been received. Your refund is being processed.'
    case 'REFUNDED':
      return 'Your refund has been issued.'
    case 'FAILED':
      return 'This booking could not be completed. Please contact us for assistance.'
  }
}

export function getCustomerBookingStateColor(state: CustomerBookingState): string {
  switch (state) {
    case 'PENDING_PAYMENT':   return 'bg-yellow-500/15 text-yellow-300'
    case 'PAYMENT_RECEIVED':  return 'bg-blue-500/15 text-blue-300'
    case 'CONFIRMED':         return 'bg-green-500/15 text-green-300'
    case 'ACTION_REQUIRED':   return 'bg-red-500/15 text-red-300'
    case 'COMPLETED':         return 'bg-[#C9A84C]/15 text-[#C9A84C]'
    case 'CANCELLED':         return 'bg-white/8 text-white/40'
    case 'REFUND_PROCESSING': return 'bg-orange-500/15 text-orange-300'
    case 'REFUNDED':          return 'bg-green-500/15 text-green-300'
    case 'FAILED':            return 'bg-red-500/15 text-red-300'
  }
}

export function bookingStateNeedsAction(state: CustomerBookingState): boolean {
  return state === 'ACTION_REQUIRED'
}

// ActivityBooking state — derived from status (string) + paymentStatus (string)
// ActivityBooking has no userId; ownership via tripItemId → TripItem → Trip.userId
export function getCustomerActivityState(opts: {
  status: string
  paymentStatus: string
}): CustomerActivityState {
  const { status, paymentStatus } = opts

  if (status === 'CONFIRMED') return 'CONFIRMED'
  if (status === 'CANCELLED') return 'CANCELLED'

  if (status === 'MANUAL_REQUIRED' || status === 'FAILED') {
    return paymentStatus === 'PAID' ? 'ACTION_REQUIRED' : 'FAILED'
  }

  // ENQUIRY, SUPPLIER_CONFIRMING, RECONCILIATION_REQUIRED, STILL_UNKNOWN
  if (paymentStatus === 'PAID') return 'PAYMENT_RECEIVED'
  return 'ENQUIRY'
}

export function getCustomerActivityStateLabel(state: CustomerActivityState): string {
  switch (state) {
    case 'ENQUIRY':          return 'Enquiry'
    case 'PAYMENT_RECEIVED': return 'Payment Received'
    case 'CONFIRMED':        return 'Confirmed'
    case 'ACTION_REQUIRED':  return 'Action Required'
    case 'CANCELLED':        return 'Cancelled'
    case 'FAILED':           return 'Failed'
  }
}

export function getCustomerActivityStateColor(state: CustomerActivityState): string {
  switch (state) {
    case 'ENQUIRY':          return 'bg-yellow-500/15 text-yellow-300'
    case 'PAYMENT_RECEIVED': return 'bg-blue-500/15 text-blue-300'
    case 'CONFIRMED':        return 'bg-green-500/15 text-green-300'
    case 'ACTION_REQUIRED':  return 'bg-red-500/15 text-red-300'
    case 'CANCELLED':        return 'bg-white/8 text-white/40'
    case 'FAILED':           return 'bg-red-500/15 text-red-300'
  }
}
