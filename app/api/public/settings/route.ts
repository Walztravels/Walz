import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const PUBLIC_KEYS = [
  'whatsapp_uk', 'whatsapp_us', 'whatsapp_canada',
  'business_name', 'office_address', 'website_url',
  'contact_email', 'support_email',
  'instagram', 'facebook', 'twitter', 'snapchat',
  'brand_tagline', 'footer_pitch',
]

const DEFAULTS: Record<string, string> = {
  whatsapp_uk:     '+447398753797',
  whatsapp_us:     '+19843880110',
  whatsapp_canada: '+15557107823',
  business_name:   'Walz Travels',
  office_address:  '1 Commercial Street, London, E1 6RF',
  website_url:     'https://walztravels.com',
  contact_email:   'contact@walztravels.com',
  support_email:   'contact@walztravels.com',
  instagram:       '@walztravels',
  facebook:        '@walztravels',
  twitter:         '@walztravels',
  snapchat:        '@walztravels',
  brand_tagline:   'Global Travel. Expert Care.',
  footer_pitch:    'Flights. Visas. Hotels. Tours. Expertly handled for every journey.',
}

export async function GET() {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: PUBLIC_KEYS } },
    })
    const result: Record<string, string> = { ...DEFAULTS }
    for (const row of rows) result[row.key] = row.value
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    })
  } catch {
    return NextResponse.json(DEFAULTS)
  }
}
