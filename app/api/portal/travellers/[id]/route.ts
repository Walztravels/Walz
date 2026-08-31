// app/api/portal/travellers/[id]/route.ts — Release 6.4: Single traveller CRUD (IDOR-safe)
// Ownership enforced in WHERE clause — userId always from session.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import prisma from '@/lib/db'
import { toTravellerDTO } from '@/lib/portal/traveller-dto'

const RELATIONSHIPS = ['Self', 'Spouse/Partner', 'Child', 'Family', 'Friend', 'Other'] as const

const updateSchema = z.object({
  relationship: z.enum(RELATIONSHIPS).optional(),
  firstName:    z.string().min(1).max(100).optional(),
  middleName:   z.string().max(100).nullable().optional(),
  lastName:     z.string().min(1).max(100).optional(),
  dateOfBirth:  z.string().datetime().nullable().optional(),
  gender:       z.enum(['Male', 'Female', 'Non-binary', 'Prefer not to say']).nullable().optional(),
  nationality:  z.string().max(100).nullable().optional(),
  phone:        z.string().max(30).nullable().optional(),
  email:        z.string().email().max(200).nullable().optional(),
  passportMeta: z.object({
    maskedNumber:  z.string().nullable().optional(),
    expiryDate:    z.string().nullable().optional(),
    nationality:   z.string().nullable().optional(),
    passportType:  z.string().nullable().optional(),
  }).nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const traveller = await prisma.travellerProfile.findFirst({
    where: { id: params.id, userId: session.user.id, isDeleted: false },
  })

  if (!traveller) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ traveller: toTravellerDTO(traveller) })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Confirm ownership before update
  const existing = await prisma.travellerProfile.findFirst({
    where: { id: params.id, userId: session.user.id, isDeleted: false },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 422 })
  }

  const { dateOfBirth, passportMeta, ...rest } = parsed.data

  const updated = await prisma.travellerProfile.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
      ...(passportMeta !== undefined ? { passportMeta: passportMeta ?? undefined } : {}),
    },
  })

  return NextResponse.json({ traveller: toTravellerDTO(updated) })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Soft delete — historical booking passengers are immutable snapshots and unaffected
  const existing = await prisma.travellerProfile.findFirst({
    where: { id: params.id, userId: session.user.id, isDeleted: false },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.travellerProfile.update({
    where: { id: params.id },
    data: { isDeleted: true },
  })

  return NextResponse.json({ success: true })
}
