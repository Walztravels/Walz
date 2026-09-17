/** Structured conversation event types (INT-6) — only these may be
 *  extracted, and only when explicitly stated in the transcript. */
export const CONVERSATION_EVENT_TYPES = [
  'requested_service', 'destination_interest', 'budget', 'travel_date',
  'promised_document', 'follow_up_date', 'price_objection',
  'awaiting_decision', 'hotel_interest', 'flight_interest', 'visa_status_question',
] as const

export type ConversationEventType = (typeof CONVERSATION_EVENT_TYPES)[number]
