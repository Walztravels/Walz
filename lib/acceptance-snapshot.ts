// Shared acceptance snapshot parser.
// Used by the PDF route, admin panel, and any server-side helper that
// needs to read the immutable acceptance record stored in itin.selectedOption.

export type AcceptanceSnapshot = {
  version:           1
  acceptedAt:        string
  acceptedBy:        string
  proposalHash:      string | null
  legacyNoHash:      boolean
  currency:          string
  acceptedTotal:     number | null
  deposit:           number | null
  selectedOptionIds: string[]
  options:           { id: string; label: string; price: number | null; currency: string }[]
  termsAccepted:     boolean
}

export function parseAcceptanceSnapshot(raw: string | null | undefined): AcceptanceSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    if ((parsed as { version?: unknown }).version !== 1) return null
    return parsed as AcceptanceSnapshot
  } catch {
    return null
  }
}

// Returns the authoritative total for client billing:
// - approved + valid snapshot with acceptedTotal → acceptedTotal (immutable)
// - otherwise → totalPrice (current figure on the record)
export function getAuthoritativeClientTotal(
  status: string,
  selectedOptionJson: string | null | undefined,
  totalPrice: number | null | undefined
): number | null {
  if (status === 'approved') {
    const snap = parseAcceptanceSnapshot(selectedOptionJson)
    if (snap && snap.acceptedTotal != null) return snap.acceptedTotal
  }
  return totalPrice ?? null
}
