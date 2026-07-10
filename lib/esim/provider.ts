/**
 * Normalized types that both Airalo and eSIM Access adapters produce.
 * Code outside lib/airalo.ts and lib/esimaccess.ts must only consume these shapes.
 */

export type EsimProviderName = 'airalo' | 'esimaccess'

// ── Normalized order result ────────────────────────────────────────────────────

export interface NormalizedOrderResult {
  ok:               boolean
  provider?:        EsimProviderName
  /** Provider-specific order code (Airalo: order.code; eSIM Access: orderNo) */
  providerOrderId?: string
  iccid?:           string
  qrCodeUrl?:       string
  activationCode?:  string    // matching_id (Airalo) / AC code (eSIM Access)
  smdpAddress?:     string    // SM-DP+ address
  lpaString?:       string    // full LPA:1$...$... string
  appleInstallUrl?: string    // iOS 17.4+ tap-to-install
  wholesalePaid?:   number    // what we actually paid to the provider

  // Failure details
  errorCode?:    number | string
  errorMsg?:     string
  customerMsg?:  string   // safe message to show the customer
  alertStaff?:   boolean
  alertMsg?:     string

  // Retry / fallback hints
  isFallbackEligible?: boolean  // true = caller may try eSIM Access
  needsRetry?:         boolean  // true = same provider retry might help
}

// ── Normalized install instructions ───────────────────────────────────────────

export interface NormalizedInstallStep {
  stepNumber: number
  text:       string
}

export interface NormalizedInstallSection {
  title:    string   // e.g. "Install via QR Code", "Manual Installation", "Network Setup"
  steps:    NormalizedInstallStep[]
  qrCodeUrl?:      string
  appleInstallUrl?: string
}

export interface NormalizedInstallInstructions {
  provider:  EsimProviderName
  ios:       NormalizedInstallSection[]
  android:   NormalizedInstallSection[]
}

// ── Normalized package (enriched EsimPackage with provider tag) ───────────────
// The existing EsimPackage shape (lib/esim/types.ts) is used at the UI layer.
// This is the richer shape used internally when pairing packages across providers.

export interface ProviderPackage {
  provider:      EsimProviderName
  packageCode:   string
  name:          string
  locationCode:  string  // ISO2
  locationName:  string
  durationDays:  number
  dataAmountMb:  number | null   // null = unlimited; stored in MB for matching
  dataLabel:     string
  dataUnit:      string
  wholesaleUsd:  number
  isUnlimited:   boolean
  voice:         string | null
  text:          string | null
  planType?:     string
  isFairUsagePolicy?: boolean
  fairUsagePolicy?:   string | null
  speed:         string
}
