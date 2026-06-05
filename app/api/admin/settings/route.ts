import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

const DEFAULT_SETTINGS: Record<string, { label: string; value: string; group: string }> = {
  // General
  business_name:   { label: 'Business Name',      value: 'Walz Travels',                        group: 'general' },
  website_url:     { label: 'Website URL',         value: 'https://walztravels.us',               group: 'general' },
  office_address:  { label: 'Office Address',      value: '1 Commercial Street, London, E1 6RF', group: 'general' },

  // Emails
  contact_email:   { label: 'Contact Email',       value: 'contact@walztravels.com',              group: 'emails' },
  support_email:   { label: 'Support Email',        value: 'contact@walztravels.com',              group: 'emails' },
  booking_email:   { label: 'Booking Email',        value: 'contact@walztravels.com',              group: 'emails' },

  // Phone & WhatsApp
  whatsapp_uk:     { label: 'WhatsApp UK',          value: '+447398753797',                        group: 'phones' },
  whatsapp_canada: { label: 'WhatsApp Canada',      value: '+15557107823',                         group: 'phones' },
  call_jade:       { label: 'Call Jade (Phone)',     value: '+19843880110',                         group: 'phones' },

  // Social Media
  instagram:       { label: 'Instagram',            value: '@walztravels',                         group: 'social' },
  facebook:        { label: 'Facebook',             value: '@walztravels',                         group: 'social' },
  snapchat:        { label: 'Snapchat',             value: '@walztravels',                         group: 'social' },
  twitter:         { label: 'Twitter / X',          value: '@walztravels',                         group: 'social' },
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await prisma.siteSetting.findMany()
  const dbMap: Record<string, string> = {}
  for (const row of rows) dbMap[row.key] = row.value

  const result: Record<string, { label: string; value: string; group: string }> = {}
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    result[key] = { label: def.label, value: dbMap[key] ?? def.value, group: def.group }
  }

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const updates = Object.entries(body as Record<string, string>).filter(
    ([key]) => key in DEFAULT_SETTINGS
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
