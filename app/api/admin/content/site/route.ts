import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '@/lib/content/legal-content'

// Groups that carry legally-significant, compliance-filed language (incl. an
// active Twilio A2P 10DLC SMS filing). Editing these must be restricted to
// super_admin only — see GET/POST below.
const SUPER_ADMIN_ONLY_GROUPS = new Set(['privacy', 'terms'])

const DEFAULTS: Record<string, { label: string; value: string; group: string }> = {
  // About page
  about_company_story: { label: 'Company Story', group: 'about', value: 'Walz Travels is a global travel and visa consultancy built for the modern international traveller. What began as a boutique consultancy in Dubai has grown into a full service travel platform serving clients across five markets — Canada, United Kingdom, UAE, Nigeria, Ghana and beyond.\n\nFormally registered in London, United Kingdom — Walz Travels expanded its reach across the African diaspora community in the UK, Europe and West Africa.\n\nThe Walz Travels Inc. was incorporated in Ontario, Canada, marking a new chapter as a truly global travel platform with operations across three continents.\n\nToday Walz Travels handles everything from visa applications and flight bookings to private tours, hotel reservations and corporate travel management — all under one trusted global brand.' },
  about_diaspora_story: { label: 'Built for the Diaspora', group: 'about', value: 'We understand the unique challenges international travellers face — from complex visa applications to finding trusted flight prices and planning journeys across multiple countries.\n\nOur team combines deep knowledge of African diaspora travel needs with global expertise across every major destination. Whether you are travelling from Lagos to London, Accra to Toronto or Dubai to anywhere — Walz Travels handles every detail.' },
  about_promise:        { label: 'Client Promise',  group: 'about', value: 'Every application prepared to the highest standard. Every booking confirmed before we consider the job done. Every client supported from first enquiry to safe return.\n\nWe do not consider our work complete until you are travelling with confidence.' },
  // Homepage
  home_hero_eyebrow:   { label: 'Hero Eyebrow',   group: 'homepage', value: 'Your Global Travel Partner' },
  home_hero_line1:     { label: 'Hero Line 1',     group: 'homepage', value: 'Fly.'     },
  home_hero_line2:     { label: 'Hero Line 2',     group: 'homepage', value: 'Explore.' },
  home_hero_line3:     { label: 'Hero Line 3',     group: 'homepage', value: 'Arrive.'  },
  home_hero_sub:       { label: 'Hero Subheadline', group: 'homepage', value: 'Flights, visas, hotels and tours — handled by experts. Available 24/7.' },
  home_cta_primary:    { label: 'Primary CTA',    group: 'homepage', value: 'Book a Flight' },
  home_cta_secondary:  { label: 'Secondary CTA',  group: 'homepage', value: 'Check Visa Requirements' },
  // General
  brand_tagline:       { label: 'Brand Tagline',    group: 'general', value: 'Global Travel. Expert Care.' },
  footer_pitch:        { label: 'Footer Pitch',     group: 'general', value: 'Flights. Visas. Hotels. Tours. Expertly handled for every journey.' },
  meta_description:    { label: 'Meta Description', group: 'general', value: 'Walz Travels — expert flight bookings, visa processing, private tours and hotel reservations for the global African diaspora.' },
  // Privacy Policy (/privacy) — one row per section title/body, matching the
  // granularity of the About tab above. Verbatim source: lib/content/legal-content.ts
  ...Object.fromEntries(
    PRIVACY_SECTIONS.flatMap((s) => [
      [`${s.key}_title`, { label: `Privacy — ${s.title} (Heading)`, group: 'privacy', value: s.title }],
      [`${s.key}_body`,  { label: `Privacy — ${s.title} (Body)`,    group: 'privacy', value: s.body }],
    ])
  ),
  // Terms of Service (/terms) — same pattern as Privacy above.
  ...Object.fromEntries(
    TERMS_SECTIONS.flatMap((s) => [
      [`${s.key}_title`, { label: `Terms — ${s.title} (Heading)`, group: 'terms', value: s.title }],
      [`${s.key}_body`,  { label: `Terms — ${s.title} (Body)`,    group: 'terms', value: s.body }],
    ])
  ),
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await prisma.siteContent.findMany()
  const dbMap: Record<string, string> = {}
  for (const r of rows) dbMap[r.key] = r.value
  const result: Record<string, { label: string; value: string; group: string }> = {}
  for (const [key, def] of Object.entries(DEFAULTS)) {
    // Privacy/Terms carry compliance-filed legal language (incl. an active
    // Twilio A2P 10DLC SMS filing) — never expose them to non-super_admin
    // staff, even read-only, so the admin editor never shows an edit surface
    // a general staff member can't actually save to.
    if (SUPER_ADMIN_ONLY_GROUPS.has(def.group) && session.role !== 'super_admin') continue
    result[key] = { label: def.label, value: dbMap[key] ?? def.value, group: def.group }
  }
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json() as Record<string, string>

  // Fail closed: reject the whole request if it touches a super_admin-only
  // group (privacy/terms) and the caller isn't super_admin. Other groups
  // (about/homepage/general) keep their existing, unchanged behavior.
  for (const key of Object.keys(body)) {
    const group = DEFAULTS[key]?.group
    if (group && SUPER_ADMIN_ONLY_GROUPS.has(group) && session.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden — Privacy Policy and Terms of Service content can only be edited by a super admin.' },
        { status: 403 },
      )
    }
  }

  await Promise.all(
    Object.entries(body).map(([key, value]) =>
      prisma.siteContent.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value), label: DEFAULTS[key]?.label ?? key, group: DEFAULTS[key]?.group ?? 'general' },
      })
    )
  )
  return NextResponse.json({ success: true })
}
