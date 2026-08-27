// Recovery Engine — shared types (Release 3A)

export type RecoveryType =
  | 'ABANDONED_CART'
  | 'UNPAID_PROPOSAL'
  | 'FAILED_PAYMENT'
  | 'SUPPLIER_FAILURE'
  | 'INCOMPLETE_TRIP'
  | 'HOT_LEAD'

export type RecoveryStatus =
  | 'OPEN'
  | 'CONTACTED'
  | 'IN_PROGRESS'
  | 'RECOVERED'
  | 'LOST'
  | 'DISMISSED'

export type RecoveryPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface CreateOpportunityOpts {
  type:              RecoveryType
  reason:            string
  priority:          RecoveryPriority
  amount?:           number | null
  currency?:         string | null
  userId?:           string | null
  leadId?:           string | null
  tripId?:           string | null
  cartSessionId?:    string | null
  quoteId?:          string | null
  bookingId?:        string | null
  activityBookingId?: string | null
  assignedToId?:     string | null
  nextActionAt?:     Date | null
}

// Dedup key format: "TYPE:primaryEntityId"
export function makeDedupeKey(type: RecoveryType, entityId: string): string {
  return `${type}:${entityId}`
}
