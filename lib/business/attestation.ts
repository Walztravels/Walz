// lib/business/attestation.ts — Walz Business (Release 2.1): append-only
// submission attestation.
//
// Modeled directly on lib/consent/capture.ts's capture discipline: a strict
// `=== true` gate before ANY row is written, server-captured IP/UA, identity
// NEVER client-declared (membershipId always comes from the caller's own
// already-authorized, org-scoped session — never from the request body).
// Writes to TravelRequestServiceAttestation ONLY — never updates, never
// deletes. `attestationVersion` is a placeholder identifier only; no
// finalized legal wording is drafted here.

import prisma from '@/lib/db'

export const ATTESTATION_VERSION_PLACEHOLDER = 'b2b-visa-submission-v1-placeholder'

export interface RecordAttestationInput {
  travelRequestServiceId: string
  organizationId: string
  membershipId: string
  visaApplicationId?: string | null
  attested: unknown // must be strictly `true`, exactly like consent's checked gate
  ipAddress?: string | null
  userAgent?: string | null
}

export type RecordAttestationResult =
  | { recorded: true; attestationId: string }
  | { recorded: false; reason: 'not_attested' | 'write_failed' }

/**
 * Writes an attestation row IFF `attested === true` exactly (never a truthy
 * check like `!!attested` — mirrors lib/consent/capture.ts's strict
 * boolean gate on `consent`). Never throws to the caller on a DB failure —
 * callers should still decide how to handle `recorded: false`, but this
 * function itself fails soft the same way recordBusinessAudit() does.
 */
export async function recordServiceAttestation(input: RecordAttestationInput): Promise<RecordAttestationResult> {
  if (input.attested !== true) return { recorded: false, reason: 'not_attested' }

  try {
    const row = await prisma.travelRequestServiceAttestation.create({
      data: {
        travelRequestServiceId: input.travelRequestServiceId,
        organizationId: input.organizationId,
        membershipId: input.membershipId,
        visaApplicationId: input.visaApplicationId ?? null,
        attestationVersion: ATTESTATION_VERSION_PLACEHOLDER,
        attestedAt: new Date(),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      select: { id: true },
    })
    return { recorded: true, attestationId: row.id }
  } catch (err) {
    console.error('[TravelRequestServiceAttestation] write failed:', (err as Error).message)
    return { recorded: false, reason: 'write_failed' }
  }
}

/** Best-effort extraction of caller IP from standard proxy headers. */
export function extractRequestIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return headers.get('x-real-ip')
}
