import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { duplicateVisaApplication } from '@/lib/visa-duplicate'
import { z } from 'zod'

const schema = z.object({
  destinationIso2: z.string().length(2),
  visaType:        z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'destinationIso2 required (2-letter ISO)' }, { status: 422 })

  try {
    const result = await duplicateVisaApplication({
      sourceId:        params.id,
      destinationIso2: parsed.data.destinationIso2.toUpperCase(),
      visaType:        parsed.data.visaType,
      initiatedBy:     'admin',
      authorName:      session.name ?? session.email ?? 'Admin',
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
