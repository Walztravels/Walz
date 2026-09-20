/**
 * Privacy Policy / Terms of Service SiteContent seed script
 *
 * Creates the initial SiteContent rows (group 'privacy' / 'terms') that back
 * /privacy and /terms, from the single source of truth in
 * lib/content/legal-content.ts. Idempotent — safe to re-run; existing rows
 * are left untouched (an admin may have already edited them) unless --force
 * is passed.
 *
 * Run: DATABASE_URL="..." npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-legal-content.ts
 *      (add --force to overwrite rows that already exist)
 */

import { PrismaClient } from '@prisma/client'
import { PRIVACY_SECTIONS, TERMS_SECTIONS, type LegalSection } from '../lib/content/legal-content'

const prisma = new PrismaClient()
const FORCE = process.argv.includes('--force')

function rowsFor(group: 'privacy' | 'terms', sections: LegalSection[]) {
  return sections.flatMap((s) => [
    { key: `${s.key}_title`, value: s.title, label: `${group === 'privacy' ? 'Privacy' : 'Terms'} — ${s.title} (Heading)`, group },
    { key: `${s.key}_body`,  value: s.body,  label: `${group === 'privacy' ? 'Privacy' : 'Terms'} — ${s.title} (Body)`,    group },
  ])
}

async function main() {
  console.log(`Seeding Privacy Policy + Terms of Service SiteContent rows${FORCE ? ' (--force: overwriting existing)' : ''}...`)

  const rows = [
    ...rowsFor('privacy', PRIVACY_SECTIONS),
    ...rowsFor('terms',   TERMS_SECTIONS),
  ]

  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const existing = await prisma.siteContent.findUnique({ where: { key: row.key } })
    if (existing && !FORCE) {
      skipped++
      continue
    }
    await prisma.siteContent.upsert({
      where:  { key: row.key },
      update: { value: row.value, label: row.label, group: row.group },
      create: row,
    })
    if (existing) updated++
    else created++
  }

  console.log(`Done. Created ${created}, updated ${updated}, skipped ${skipped} (already present) of ${rows.length} rows.`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('Seed failed:', err)
  await prisma.$disconnect()
  process.exit(1)
})
