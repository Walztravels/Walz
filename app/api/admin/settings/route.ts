import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

const DEFAULT_SETTINGS: Record<string, { label: string; value: string }> = {
  contact_email:    { label: 'Contact Email',        value: 'contact@walztravels.com'  },
  support_email:    { label: 'Support Email',         value: 'contact@walztravels.com'  },
  booking_email:    { label: 'Booking Email',         value: 'contact@walztravels.com'  },
  whatsapp_uk:      { label: 'WhatsApp UK',           value: '+447398753797'             },
  whatsapp_canada:  { label: 'WhatsApp Canada',       value: '+15557107823'              },
  call_jade:        { label: 'Call Jade (Phone)',      value: '+19843880110'              },
  office_address:   { label: 'Office Address',        value: '1 Commercial Street, London, E1 6RF' },
  service_fee:      { label: 'Service Fee (USD)',      value: '75'                        },
  instagram:        { label: 'Instagram Handle',      value: '@walztravels'              },
  facebook:         { label: 'Facebook Handle',       value: '@walztravels'              },
  snapchat:         { label: 'Snapchat Handle',       value: '@walztravels'              },
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await prisma.siteSetting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value

  // Merge with defaults for any missing keys
  const result: Record<string, { label: string; value: string }> = {}
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    result[key] = { label: def.label, value: map[key] ?? def.value }
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

  // Upsert each key
  const updates = Object.entries(body as Record<string, string>)
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
