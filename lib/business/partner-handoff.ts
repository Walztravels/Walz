// lib/business/partner-handoff.ts — Walz Business (Track C: public /partners →
// Walz Business handoff)
//
// Public /partners (app/partners/page.tsx) is the acquisition front door for
// prospective Business partners: visitors pick a partnership type, then
// click through to start a Walz Business account. This module is the ONLY
// place that builds that link, and it is deliberately narrow:
//
//   - It NEVER creates an Organization, OrganizationMembership, or
//     OrganizationInvitation row. It has no `prisma`/`@/lib/db` import and
//     performs no I/O at all — it is a pure, synchronous, allowlist-only
//     string builder.
//   - Three of the four partnership types map onto a real, pre-existing
//     `OrganizationType` value (see lib/business/organization-type.ts):
//     Travel Agency -> TRAVEL_AGENCY, Corporate -> CORPORATE, Referral
//     Partner -> REFERRAL_PARTNER. The fourth, Relocation, has NO
//     OrganizationType today — Track B has not decided whether it needs a
//     dedicated one. This file does NOT add a value to
//     VALID_ORGANIZATION_TYPES to make Relocation fit; instead it tracks it
//     as a clearly-separate, UI-only marker (`RELOCATION_ACQUISITION_MARKER`)
//     that can never be confused with a real OrganizationType.
//   - Every value accepted or returned here is checked against the closed
//     allowlist below (never trusted from arbitrary input), and every
//     generated href is additionally verified with `isSafeLocalPath`
//     (lib/safe-redirect.ts) before being handed back, so this can never
//     become an open-redirect vector even if some future, less-trusted
//     caller starts threading a value through this module.
//
// IMPORTANT — current Track B dependency (read before extending this file):
// app/business/register/BusinessRegisterForm.tsx does not read the
// `partnerType` query parameter this module attaches. It only reads `email`
// and `callbackUrl` today. Attaching `partnerType` to the generated href is
// therefore currently INERT — it changes nothing about what the register
// page shows or does. It is forward-compatible plumbing only: Track B can
// later read it there (e.g. `parsePartnerAcquisitionType(searchParams.get
// ('partnerType'))`) to pre-select a radio button or show contextual copy —
// NEVER to set `Organization.organizationType` directly, since no
// Organization is created anywhere in the registration flow this hands off
// to (that route creates only a `User` row).

import { VALID_ORGANIZATION_TYPES, type OrganizationType } from './organization-type'
import { isSafeLocalPath } from '@/lib/safe-redirect'

/**
 * Relocation is a UI/use-case concept only — NOT a real `OrganizationType`.
 * Deliberately NOT added to `VALID_ORGANIZATION_TYPES`. Routed through the
 * exact same safe, allowlisted mechanism as the other three partnership
 * types below, flagged here for Track B's attention: if Relocation
 * eventually needs its own `OrganizationType` (or a different
 * representation entirely), that is Track B's decision to make, not this
 * track's to invent.
 */
export const RELOCATION_ACQUISITION_MARKER = 'RELOCATION' as const

export type PartnerAcquisitionType = OrganizationType | typeof RELOCATION_ACQUISITION_MARKER

/** The closed set of values this module will ever accept or emit. */
export const PARTNER_ACQUISITION_TYPES: readonly PartnerAcquisitionType[] = [
  ...VALID_ORGANIZATION_TYPES,
  RELOCATION_ACQUISITION_MARKER,
]

/** The literal, hardcoded Business sign-in destination. Never dynamic and
 *  never built from any parameter — every Business-intent "sign in" action
 *  on /partners must land here, never on the consumer /login page. */
export const BUSINESS_SIGN_IN_HREF = '/business/login' as const

/** The existing, unchanged Business self-serve registration start point
 *  (app/business/register/**, which this track does not modify). */
export const BUSINESS_REGISTER_PATH = '/business/register'

const QUERY_PARAM = 'partnerType'

// Generous upper bound for a valid value ('REFERRAL_PARTNER' is 16 chars);
// anything longer is rejected outright before any allowlist comparison, so
// an oversized payload can never reach the `includes()` check below.
const MAX_VALUE_LENGTH = 32

/**
 * Strict, exact-match allowlist check — true ONLY for one of the 4 known
 * values, case-sensitive, with no normalization or "fixing up" of close-but-
 * wrong input. This is intentionally stricter than
 * `organization-type.ts`'s `parseOrganizationType` (which uppercases its
 * input): this helper's output can end up in a public, client-constructed
 * URL, so there is no upside to being forgiving and every upside to being
 * exact.
 */
export function isPartnerAcquisitionType(value: unknown): value is PartnerAcquisitionType {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > MAX_VALUE_LENGTH) return false
  return (PARTNER_ACQUISITION_TYPES as readonly string[]).includes(value)
}

/**
 * Parses an arbitrary, untrusted value against the closed allowlist.
 * Returns the value itself (narrowed) on an exact match, otherwise `null`.
 * Never throws.
 */
export function parsePartnerAcquisitionType(value: unknown): PartnerAcquisitionType | null {
  return isPartnerAcquisitionType(value) ? value : null
}

/**
 * Builds the safe link from a /partners partnership-type card to the
 * existing Business registration start point, carrying only a minimal,
 * allowlisted acquisition-context marker — never any company information,
 * never a redirect target, never anything else.
 *
 * Any value outside the closed allowlist (missing, wrong type, wrong case,
 * an external URL, a scheme-relative URL, a path-traversal payload, an
 * oversized string, an HTML/script payload, etc.) degrades SAFELY to the
 * bare `/business/register` path with no query string at all — it never
 * throws, never reflects the bad input back into the href, and never
 * produces anything other than a same-origin local path.
 */
export function buildBusinessRegisterHref(acquisitionType: unknown): string {
  const parsed = parsePartnerAcquisitionType(acquisitionType)
  const href = parsed
    ? `${BUSINESS_REGISTER_PATH}?${QUERY_PARAM}=${encodeURIComponent(parsed)}`
    : BUSINESS_REGISTER_PATH

  // Belt-and-braces: even though `href` is built exclusively from a
  // hardcoded path and an allowlisted value, confirm the result still
  // resolves as a safe, same-origin local path before ever returning it.
  return isSafeLocalPath(href) ? href : BUSINESS_REGISTER_PATH
}
