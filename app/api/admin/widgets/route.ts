import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

const DEFAULT_WIDGETS = [
  { key: 'flight_search', label: 'Flight Search Widget', enabled: true, order: 0 },
  { key: 'hotel_search', label: 'Hotel Search Widget', enabled: true, order: 1 },
  { key: 'visa_checker', label: 'Visa Checker Widget', enabled: true, order: 2 },
  { key: 'ai_chatbot', label: 'AI Travel Assistant Chatbot', enabled: true, order: 3 },
  { key: 'whatsapp_button', label: 'WhatsApp Chat Button', enabled: true, order: 4 },
]

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configs = await prisma.widgetConfig.findMany({ orderBy: { order: 'asc' } })

  if (configs.length === 0) {
    // Seed defaults
    await prisma.widgetConfig.createMany({ data: DEFAULT_WIDGETS, skipDuplicates: true })
    return NextResponse.json(DEFAULT_WIDGETS)
  }

  // Fill any missing defaults
  const existingKeys = new Set(configs.map((c) => c.key))
  const missing = DEFAULT_WIDGETS.filter((w) => !existingKeys.has(w.key))
  if (missing.length > 0) {
    await prisma.widgetConfig.createMany({ data: missing, skipDuplicates: true })
  }

  const all = await prisma.widgetConfig.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json(all)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected array of widget configs' }, { status: 400 })
  }

  // Update each widget
  await Promise.all(
    body.map((w: { key: string; enabled: boolean; order: number }) =>
      prisma.widgetConfig.upsert({
        where: { key: w.key },
        update: { enabled: w.enabled, order: w.order },
        create: {
          key: w.key,
          label: DEFAULT_WIDGETS.find((d) => d.key === w.key)?.label ?? w.key,
          enabled: w.enabled,
          order: w.order,
        },
      })
    )
  )

  return NextResponse.json({ success: true })
}
