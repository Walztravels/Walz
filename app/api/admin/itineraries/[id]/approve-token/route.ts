import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import crypto from 'crypto'

// POST — generate (or regenerate) a one-time approval token for an itinerary
// The token is stored in Itinerary.approvedBy (temp) until we have a dedicated column.
// We store it as a JSON string: {"token": "...", "issuedAt": "...", "used": false}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const token = crypto.randomBytes(32).toString('hex')

  // Store token in Itinerary.options field as a structured JSON alongside any existing options
  let options: Record<string, unknown> = {}
  try { options = JSON.parse(itin.options) } catch { options = {} }
  options.approvalToken = token
  options.approvalTokenIssuedAt = new Date().toISOString()
  options.approvalTokenUsed = false

  await prisma.itinerary.update({ where: { id }, data: { options: JSON.stringify(options), updatedAt: new Date() } })

  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
  return NextResponse.json({ token, url: `${BASE}/itinerary/${itin.referenceNumber}/approve?token=${token}` })
}
