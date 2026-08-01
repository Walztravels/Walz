import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { duplicateVisaApplication } from '@/lib/visa-duplicate'
import { z } from 'zod'

const schema = z.object({
  destinationIso2: z.string().length(2),
  visaType:        z.string().optional(),
  consent:         z.literal(true),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'destinationIso2 required and consent must be true' }, { status: 422 })
  }

  const userId = (session.user as { id?: string }).id
  const email  = session.user.email

  // Ownership check — client must own the source application
  const source = await prisma.visaApplication.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, email: true, firstName: true, lastName: true },
  })
  if (!source) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const ownsById    = userId && source.userId === userId
  const ownsByEmail = source.email && source.email.toLowerCase() === email.toLowerCase()
  if (!ownsById && !ownsByEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await duplicateVisaApplication({
      sourceId:        params.id,
      destinationIso2: parsed.data.destinationIso2.toUpperCase(),
      visaType:        parsed.data.visaType,
      initiatedBy:     'client',
      authorName:      session.user.name ?? email,
      userId,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
