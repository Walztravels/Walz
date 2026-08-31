// scripts/backfill-itinerary-users.ts
// Release 6.1 — Track 4: Idempotent backfill of itinerary.userId from clientEmail.
//
// Usage:
//   npx tsx scripts/backfill-itinerary-users.ts            # dry-run (prints what would change)
//   npx tsx scripts/backfill-itinerary-users.ts --apply    # apply changes
//
// Safety:
//   - Only writes when user_id IS NULL (never overwrites an existing link)
//   - Skips ambiguous matches (multiple users with same email)
//   - Skips conflict cases (userId already set to a different user)
//   - Reports counts: eligible, matched, ambiguous, skipped, updated

import prisma from '../lib/db'
import { tryLinkItineraryByEmail } from '../lib/portal/customer-identity'

const DRY_RUN = !process.argv.includes('--apply')

async function main() {
  console.log(`\n=== Itinerary Identity Backfill (${DRY_RUN ? 'DRY-RUN' : 'APPLY'}) ===\n`)

  // Fetch all itineraries without a userId — sorted by creation so oldest are linked first
  const eligible = await prisma.itinerary.findMany({
    where:   { userId: null },
    select:  { id: true, referenceNumber: true, clientEmail: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Eligible itineraries (userId IS NULL): ${eligible.length}`)

  if (eligible.length === 0) {
    console.log('Nothing to backfill.')
    await prisma.$disconnect()
    return
  }

  const counts = { matched: 0, ambiguous: 0, noMatch: 0, conflict: 0, error: 0, applied: 0 }

  for (const itin of eligible) {
    // Find matching users for this email (pre-check for reporting)
    const matches = await prisma.user.findMany({
      where:  { email: { equals: itin.clientEmail.trim().toLowerCase(), mode: 'insensitive' } },
      select: { id: true, email: true },
    })

    if (matches.length === 0) {
      counts.noMatch++
      continue
    }

    if (matches.length > 1) {
      console.warn(`  AMBIGUOUS  ${itin.referenceNumber} <${itin.clientEmail}> → ${matches.length} users`)
      counts.ambiguous++
      continue
    }

    counts.matched++
    const user = matches[0]

    if (DRY_RUN) {
      console.log(`  DRY-RUN    ${itin.referenceNumber} <${itin.clientEmail}> → User ${user.id} (${user.email})`)
      continue
    }

    const result = await tryLinkItineraryByEmail(itin.id, itin.clientEmail, 'backfill')

    if (result.linked) {
      console.log(`  LINKED     ${itin.referenceNumber} → User ${user.id}`)
      counts.applied++
    } else if (result.reason === 'conflict') {
      console.warn(`  CONFLICT   ${itin.referenceNumber} — already linked to a different user`)
      counts.conflict++
    } else if (result.reason === 'error') {
      console.error(`  ERROR      ${itin.referenceNumber}`)
      counts.error++
    } else {
      // already_linked or ambiguous (re-checked inside tryLink)
      console.log(`  SKIP       ${itin.referenceNumber} — ${result.reason}`)
    }
  }

  console.log('\n=== Summary ===')
  console.log(`  Eligible:  ${eligible.length}`)
  console.log(`  Matched:   ${counts.matched}`)
  console.log(`  Ambiguous: ${counts.ambiguous}`)
  console.log(`  No match:  ${counts.noMatch}`)
  if (!DRY_RUN) {
    console.log(`  Applied:   ${counts.applied}`)
    console.log(`  Conflict:  ${counts.conflict}`)
    console.log(`  Errors:    ${counts.error}`)
  }
  if (DRY_RUN) {
    console.log('\n  (dry-run — pass --apply to write changes)')
  }
  console.log()

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
