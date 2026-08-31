// lib/portal/identity-logging.ts
// Release 6.1 — Track 9: Structured observability constants for identity events.
// All identity-related events are logged through console.log with a machine-readable
// prefix so log aggregators can filter and alert on identity incidents.

export const IDENTITY_EVENT = {
  ITINERARY_USER_LINKED:    'itinerary.user_linked',
  ITINERARY_USER_UNMATCHED: 'itinerary.user_unmatched',
  ITINERARY_USER_AMBIGUOUS: 'itinerary.user_ambiguous',
  ITINERARY_USER_CONFLICT:  'itinerary.user_conflict',
  DOCUMENT_ACCESS_DENIED:   'document.access_denied',
  DOCUMENT_URL_REFRESHED:   'document.url_refreshed',
  TRIP_ID_OWNERSHIP_DENIED: 'jade.trip_id_ownership_denied',
} as const

export type IdentityEventKey = keyof typeof IDENTITY_EVENT
export type IdentityEventValue = (typeof IDENTITY_EVENT)[IdentityEventKey]

export interface IdentityLogPayload {
  itineraryId?: string
  itineraryRef?: string
  userId?:       string
  email?:        string
  actor?:        string
  reason?:       string
  tripId?:       string
  documentId?:   string
  [key: string]: unknown
}

export function logIdentityEvent(
  event:   IdentityEventValue,
  payload: IdentityLogPayload,
): void {
  console.log(`[IDENTITY] ${event}`, JSON.stringify(payload))
}
