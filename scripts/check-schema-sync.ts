/**
 * Checks that the Supabase DB matches the Prisma schema for critical tables.
 * Run before deploy: npx ts-node scripts/check-schema-sync.ts
 *
 * RULE: Never add fields to prisma/schema.prisma without running the
 *       corresponding ALTER TABLE SQL in Supabase SQL editor.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Maps Prisma camelCase field names → DB column names (snake_case)
const REQUIRED_COLUMNS: Record<string, string[]> = {
  VisaApplication: [
    // Core
    'id', 'reference_number', 'user_id', 'destination_iso2', 'visa_type',
    'status', 'is_draft', 'initiated_by',
    // Personal
    'first_name', 'middle_name', 'last_name', 'date_of_birth', 'sex',
    'place_of_birth', 'nationality', 'marital_status',
    // Passport
    'passport_number', 'passport_type', 'passport_issue_date', 'passport_expiry_date',
    'issuing_authority', 'issuing_country',
    // Contact
    'phone', 'email', 'home_address', 'home_address2', 'city',
    'state_region', 'country', 'postal_code',
    // Employment
    'employment_status', 'employer_name', 'job_title', 'employer_address', 'monthly_income',
    // Travel
    'arrival_date', 'return_date', 'purpose_of_visit',
    'accommodation_name', 'accommodation_address', 'port_of_entry',
    // Visa history & background
    'previous_refusal', 'previous_refusal_details',
    'previous_visits', 'previous_visit_details',
    'criminal_record', 'communicable_disease', 'deported_before',
    // Declaration
    'declaration_accurate', 'declaration_authorise', 'declaration_fee_policy',
    // Admin
    'assigned_to', 'assigned_officer_id', 'branch',
    'embassy_reference', 'submission_date', 'decision_date',
    // Payment
    'service_fee_paid', 'service_fee_amount', 'service_fee_currency',
    'stripe_payment_intent_id', 'govt_fee_paid', 'govt_fee_amount',
    // Timestamps
    'created_at', 'updated_at',
    // ── Columns added after initial migration (run ALTER TABLE if these fail) ──
    'client_account_id',   // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "clientAccountId" UUID REFERENCES "ClientAccount"(id) ON DELETE SET NULL
    'status_message',      // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "statusMessage" TEXT
    'timeline',            // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "timeline" JSONB DEFAULT '[]'
    'decision_notes',      // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "decisionNotes" TEXT
    'govt_fee_instructions',// ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "govtFeeInstructions" TEXT
    'pdf_url',             // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT
    'opened_at',           // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMPTZ
    'started_at',          // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ
    'view_count',          // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0
    'appointment_date',    // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "appointmentDate" TIMESTAMPTZ
    'appointment_notes',   // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "appointmentNotes" TEXT
    'appointment_location',// ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "appointmentLocation" TEXT
    'last_email_sent_at',  // ALTER TABLE "VisaApplication" ADD COLUMN IF NOT EXISTS "lastEmailSentAt" TIMESTAMPTZ
    'country_specific',    // JSONB country-specific field
  ],
}

async function getTableColumns(tableName: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
       AND table_schema = 'public'`,
    tableName,
  )
  return rows.map(r => r.column_name)
}

async function main() {
  console.log('\n🔍  Checking Prisma schema ↔ Supabase DB sync...\n')

  let anyFailed = false

  for (const [table, expected] of Object.entries(REQUIRED_COLUMNS)) {
    let actual: string[]
    try {
      actual = await getTableColumns(table)
    } catch (err) {
      console.error(`❌  Could not query table "${table}": ${err}`)
      anyFailed = true
      continue
    }

    if (actual.length === 0) {
      console.error(`❌  Table "${table}" — not found in DB or has no columns`)
      anyFailed = true
      continue
    }

    const missing = expected.filter(col => !actual.includes(col))

    if (missing.length > 0) {
      console.error(`❌  Table "${table}" — missing ${missing.length} column(s):`)
      missing.forEach(col => {
        console.error(`       - ${col}`)
      })
      anyFailed = true
    } else {
      console.log(`✅  Table "${table}" — all ${expected.length} required columns present`)
    }
  }

  console.log('')

  if (anyFailed) {
    console.error('🚨  Schema sync FAILED — run the missing ALTER TABLE statements in Supabase SQL editor')
    console.error('     See prisma/schema.prisma and scripts/check-schema-sync.ts for the SQL.\n')
    process.exit(1)
  } else {
    console.log('🎉  All tables in sync — safe to deploy.\n')
    process.exit(0)
  }
}

main()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
