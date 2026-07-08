import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { revalidateSiteSettings } from '@/lib/site-settings'

// ── Hard-coded default settings (used as fallbacks if DB has no value) ──────
const DEFAULT_SETTINGS: Record<string, { label: string; value: string; group: string }> = {
  // General — keys match SiteSettings type in lib/site-settings.ts
  business_name:    { label: 'Business Name',     value: 'Walz Travels Ltd',                     group: 'general' },
  business_address: { label: 'Business Address',  value: '1 Commercial Street, London, E1 6RF', group: 'general' },
  business_email:   { label: 'Business Email',    value: 'contact@walztravels.com',              group: 'general' },
  website_url:      { label: 'Website URL',       value: 'https://walztravels.com',              group: 'general' },
  office_address:   { label: 'Office Address (legacy)', value: '1 Commercial Street, London, E1 6RF', group: 'general' },

  // Emails
  contact_email:   { label: 'Contact Email',       value: 'contact@walztravels.com',              group: 'emails' },
  support_email:   { label: 'Support Email',        value: 'contact@walztravels.com',              group: 'emails' },
  booking_email:   { label: 'Booking Email',        value: 'contact@walztravels.com',              group: 'emails' },

  // Phone & WhatsApp — these keys are consumed by lib/site-settings.ts → components
  whatsapp_header:         { label: 'WhatsApp (Navbar – raw number)',    value: '+12317902336',  group: 'phones' },
  whatsapp_header_display: { label: 'WhatsApp (Navbar – display text)',  value: '+12317902336',group: 'phones' },
  whatsapp_cta:            { label: 'WhatsApp (Homepage CTA – raw number)',    value: '+12317902336',  group: 'phones' },
  whatsapp_cta_display:    { label: 'WhatsApp (Homepage CTA – display text)',  value: '+12317902336',  group: 'phones' },
  phone_uk:        { label: 'WhatsApp UK',      value: '+12317902336',  group: 'phones' },
  phone_canada:    { label: 'WhatsApp Canada',  value: '+13657200865',   group: 'phones' },
  phone_uae:       { label: 'WhatsApp UAE',     value: '+971000000000',  group: 'phones' },
  phone_nigeria:   { label: 'WhatsApp Nigeria', value: '+2347077691701', group: 'phones' },
  phone_ghana:     { label: 'WhatsApp Ghana',   value: '+2330000000000', group: 'phones' },
  footer_wa_1_label:  { label: 'Footer Slot 1 – Label',  value: 'WhatsApp UK',     group: 'phones' },
  footer_wa_1_number: { label: 'Footer Slot 1 – Number', value: '+12317902336',   group: 'phones' },
  footer_wa_2_label:  { label: 'Footer Slot 2 – Label',  value: 'WhatsApp Canada', group: 'phones' },
  footer_wa_2_number: { label: 'Footer Slot 2 – Number', value: '+13657200865',    group: 'phones' },
  footer_wa_3_label:  { label: 'Footer Slot 3 – Label',  value: '',                group: 'phones' },
  footer_wa_3_number: { label: 'Footer Slot 3 – Number', value: '',                group: 'phones' },
  footer_wa_4_label:  { label: 'Footer Slot 4 – Label',  value: '',                group: 'phones' },
  footer_wa_4_number: { label: 'Footer Slot 4 – Number', value: '',                group: 'phones' },
  // Legacy keys kept for backwards compat
  whatsapp_uk:     { label: 'WhatsApp UK (legacy)', value: '+12317902336',                        group: 'phones' },
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

  // Email Notifications
  admin_email:        { label: 'Admin Alert Email',   value: 'contact@walztravels.com', group: 'notifications' },
  visa_email:         { label: 'Visa Alert Email',    value: 'visa@walztravels.com',    group: 'notifications' },
  finance_email:      { label: 'Finance Alert Email', value: 'contact@walztravels.com', group: 'notifications' },

  // Payment Gateway Display
  gateway_stripe_pk:  { label: 'Stripe Public Key',      value: '', group: 'gateway' },
  gateway_flw_public: { label: 'Flutterwave Public Key', value: '', group: 'gateway' },
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

  // Bust the site-settings cache so the next request picks up new values
  await revalidateSiteSettings()

  return NextResponse.json({ success: true })
}
