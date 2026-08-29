import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { patchOptions } from '@/lib/itinerary-options'
import crypto from 'crypto'

// POST — generate (or regenerate) a one-time approval token for an itinerary.
// Token is stored in the Itinerary.options JSON field, merged safely with any
// existing keys (packageOptions, paymentSchedule, future optionGroups, etc.).

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { expiresInDays?: number }
  const expiresInDays = typeof body.expiresInDays === 'number' && body.expiresInDays > 0
    ? body.expiresInDays
    : 30

  const now   = new Date()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(now.getTime() + expiresInDays * 86_400_000).toISOString()

  await prisma.itinerary.update({
    where: { id },
    data: {
      options: patchOptions(itin.options, {
        approvalToken:          token,
        approvalTokenIssuedAt:  now.toISOString(),
        approvalTokenExpiresAt: expiresAt,
        approvalTokenUsed:      false,
      }),
      updatedAt: now,
    },
  })

  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
  // GA5+: the token is embedded server-side in the proposal DTO.
  // Clients visit the main proposal page — no token in the URL needed.
  return NextResponse.json({
    token,
    expiresAt,
    url: `${BASE}/itinerary/${itin.referenceNumber}`,
  })
}
