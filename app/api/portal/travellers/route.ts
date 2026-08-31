// app/api/portal/travellers/route.ts — Release 6.4: Traveller profile list + create (IDOR-safe)
// userId always comes from authenticated session — never from the request body.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import prisma from '@/lib/db'
import { toTravellerDTO } from '@/lib/portal/traveller-dto'

const RELATIONSHIPS = ['Self', 'Spouse/Partner', 'Child', 'Family', 'Friend', 'Other'] as const

const createSchema = z.object({
  relationship: z.enum(RELATIONSHIPS).default('Other'),
  firstName:    z.string().min(1).max(100),
  middleName:   z.string().max(100).optional(),
  lastName:     z.string().min(1).max(100),
  dateOfBirth:  z.string().datetime().optional().nullable(),
  gender:       z.enum(['Male', 'Female', 'Non-binary', 'Prefer not to say']).optional().nullable(),
  nationality:  z.string().max(100).optional().nullable(),
  phone:        z.string().max(30).optional().nullable(),
  email:        z.string().email().max(200).optional().nullable(),
  passportMeta: z.object({
    maskedNumber:  z.string().optional().nullable(),
    expiryDate:    z.string().optional().nullable(),
    nationality:   z.string().optional().nullable(),
    passportType:  z.string().optional().nullable(),
  }).optional().nullable(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const travellers = await prisma.travellerProfile.findMany({
    where: { userId: session.user.id, isDeleted: false },
    orderBy: [{ relationship: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ travellers: travellers.map(t => toTravellerDTO(t)) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 422 })
  }

  const { passportMeta, dateOfBirth, ...rest } = parsed.data

  const traveller = await prisma.travellerProfile.create({
    data: {
      userId: session.user.id,
      ...rest,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      passportMeta: passportMeta ?? undefined,
    },
  })

  return NextResponse.json({ traveller: toTravellerDTO(traveller) }, { status: 201 })
}
