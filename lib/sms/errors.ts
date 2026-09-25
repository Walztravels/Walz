/**
 * Twilio error code → SAFE, human-readable text for persistence/logs.
 * Raw provider response bodies are never stored (they can echo the message
 * body or recipient). Unknown codes map to a generic string.
 */
const SAFE: Record<string, string> = {
  '21211': 'Invalid recipient number',
  '21408': 'Permission to send to this region is not enabled',
  '21610': 'Recipient has opted out (STOP)',
  '21612': 'Recipient cannot be reached from this sender',
  '21614': 'Recipient is not a mobile number',
  '30001': 'Message queue overflow',
  '30002': 'Account suspended',
  '30003': 'Handset unreachable',
  '30004': 'Message blocked by recipient',
  '30005': 'Unknown destination handset',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Message filtered by carrier',
  '30008': 'Unknown delivery error',
  '30034': 'Sender is not registered for A2P messaging',
}

export function safeSmsErrorMessage(code: string | number | null | undefined): string | null {
  if (code === null || code === undefined || code === '') return null
  return SAFE[String(code)] ?? 'Delivery error'
}

/** Codes meaning the RECIPIENT has opted out at provider level. */
export function isProviderOptOutErrorCode(code: string | number | null | undefined): boolean {
  return String(code ?? '') === '21610'
}
