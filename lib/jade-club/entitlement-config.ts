// lib/jade-club/entitlement-config.ts — tunable defaults for the
// entitlement-slot reservation mechanism (lib/jade-club/entitlements.ts).
//
// This is an internal, configurable default — NOT a business invariant
// baked into multiple call sites. Change it here and every reservation
// path picks it up.

/** How long a RESERVED slot holds before it is reclaimable as AVAILABLE again. */
export const ENTITLEMENT_RESERVATION_TTL_MS = 15 * 60 * 1000 // 15 minutes

/** Safety bound on how many AVAILABLE candidates one reservation attempt will try before giving up. */
export const ENTITLEMENT_RESERVATION_MAX_ATTEMPTS = 25
