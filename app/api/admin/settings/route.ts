import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

// ── Hard-coded default settings (used as fallbacks if DB has no value) ──────
const DEFAULT_SETTINGS: Record<string, { label: string; value: string; group: string }> = {
  // General
  business_name:   { label: 'Business Name',      value: 'Walz Travels',                        group: 'general' },
  website_url:     { label: 'Website URL',         value: 'https://walztravels.com',               group: 'general' },
  office_address:  { label: 'Office Address',      value: '1 Commercial Street, London, E1 6RF', group: 'general' },

  // Emails
  contact_email:   { label: 'Contact Email',       value: 'contact@walztravels.com',              group: 'emails' },
  support_email:   { label: 'Support Email',        value: 'contact@walztravels.com',              group: 'emails' },
  booking_email:   { label: 'Booking Email',        value: 'contact@walztravels.com',              group: 'emails' },

  // Phone & WhatsApp
  whatsapp_uk:     { label: 'WhatsApp UK',          value: '+447398753797',                        group: 'phones' },
  whatsapp_us:     { label: 'WhatsApp US',          value: '+19843880110',                         group: 'phones' },
  whatsapp_canada: { label: 'WhatsApp Canada',      value: '+15557107823',                         group: 'phones' },
  call_jade:       { label: 'Call Jade (Phone)',     value: '+19843880110',                         group: 'phones' },

  // Visa Service Fees
  visa_fee_uk:       { label: 'UK Visa Fee',           value: '£149',                               group: 'visa_fees' },
  visa_fee_canada:   { label: 'Canada Visa Fee',       value: '£149',                               group: 'visa_fees' },
  visa_fee_uae:      { label: 'UAE Visa Fee',          value: '£99',                                group: 'visa_fees' },
  visa_fee_schengen: { label: 'Schengen Visa Fee',     value: '£149',                               group: 'visa_fees' },
  visa_fee_usa:      { label: 'USA Visa Fee',          value: '£199',                               group: 'visa_fees' },

  // Social Media
  instagram:       { label: 'Instagram',            value: '@walztravels',                         group: 'social' },
  facebook:        { label: 'Facebook',             value: '@walztravels',                         group: 'social' },
  snapchat:        { label: 'Snapchat',             value: '@walztravels',                         group: 'social' },
  twitter:         { label: 'Twitter / X',          value: '@walztravels',                         group: 'social' },
}

// Prefixes that are always accepted without being in DEFAULT_SETTINGS
const OPEN_PREFIXES = [
  'gateway_', 'fee_', 'email_tpl_', 'notif_',
  'admin_email', 'visa_email', 'finance_email', 'visa_fee_',
]

function isAllowedKey(key: string) {
  if (key in DEFAULT_SETTINGS) return true
  return OPEN_PREFIXES.some(p => key.startsWith(p))
}

// ── GET /api/admin/settings ──────────────────────────────────────────────────
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await prisma.siteSetting.findMany()
  const dbMap: Record<string, string> = {}
  for (const row of rows) dbMap[row.key] = row.value

  // Start with hard-coded defaults
  const result: Record<string, { label: string; value: string; group: string }> = {}
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    result[key] = { label: def.label, value: dbMap[key] ?? def.value, group: def.group }
  }

  // Include any other DB-stored settings not in defaults
  for (const row of rows) {
    if (!(row.key in result)) {
      result[row.key] = { label: row.label ?? row.key, value: row.value, group: 'other' }
    }
  }

  return NextResponse.json(result)
}

// ── POST /api/admin/settings ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const updates = Object.entries(body as Record<string, string>).filter(
    ([key]) => isAllowedKey(key)
  )

  await Promise.all(
    updates.map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: {
          key,
          value: String(value),
          label: DEFAULT_SETTINGS[key]?.label ?? key,
        },
      })
    )
  )

  return NextResponse.json({ success: true })
}
