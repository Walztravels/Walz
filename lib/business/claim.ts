// lib/business/claim.ts — Walz Business (Release 1): BusinessTraveller <-> User
// account linking — DATA MODEL + TOKEN GENERATION ONLY.
//
// LOCKED PRODUCT DECISION: linking a BusinessTraveller row to a registered
// User account requires EXPLICIT VERIFICATION — it is NEVER set
// automatically just because a BusinessTraveller.email matches a User.email.
// BusinessTraveller.userId stays null until a human explicitly proves
// control of the claimed inbox.
//
// SCOPE OF THIS FILE (Release 1): generate an opaque verification token and
// store it (claimVerificationToken) so a future release's claim flow has
// something to verify against. This function:
//   - does NOT send an email (no email-send integration here at all)
//   - does NOT expose any way to verify/consume the token
//   - has no customer-visible effect — nothing else in the codebase reads
//     claimVerificationToken/claimVerifiedAt yet
//
// FOLLOW-UP RELEASE (not built here): an email-send step carrying a link to
// a public verification-landing-page, which — only after the traveller
// proves control of the claimed inbox by visiting that link — calls
// something like:
//   prisma.businessTraveller.update({
//     where: { id, claimVerificationToken: token },   // token as a WHERE
//     data:  { userId, claimVerifiedAt: new Date(), claimVerificationToken: null },
//   })
// That verification-consuming code does not exist yet; do not wire it up
// speculatively from this stub.

import crypto from 'crypto'
import prisma from '@/lib/db'

export interface InitiateClaimResult {
  businessTravellerId: string
  token: string
}

export async function initiateBusinessTravellerClaim(
  businessTravellerId: string,
): Promise<InitiateClaimResult | null> {
  const token = crypto.randomBytes(32).toString('hex')

  try {
    await prisma.businessTraveller.update({
      where: { id: businessTravellerId },
      data: { claimVerificationToken: token, claimVerifiedAt: null },
    })
    return { businessTravellerId, token }
  } catch (err) {
    console.error('[BusinessTravellerClaim] Failed to store claim token:', (err as Error).message)
    return null
  }
}
