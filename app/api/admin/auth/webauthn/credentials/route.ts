import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface StoredCredential {
  credentialID:        string
  credentialPublicKey: string
  counter:             number
  transports:          string[]
  deviceName:          string
  createdAt:           string
}

// GET — list credentials (strips public key — not needed client-side)
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { webAuthnCredentials: true },
  })

  const creds = ((staff?.webAuthnCredentials ?? []) as unknown as StoredCredential[]).map(c => ({
    credentialID: c.credentialID,
    deviceName:   c.deviceName,
    createdAt:    c.createdAt,
  }))

  return NextResponse.json(creds)
}

// DELETE — remove a specific credential by ID
export async function DELETE(req: Request) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { credentialID } = await req.json() as { credentialID: string }

  const staff = await prisma.staff.findUnique({
    where:  { email: session.email },
    select: { id: true, webAuthnCredentials: true },
  })
  if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const filtered = ((staff.webAuthnCredentials ?? []) as unknown as StoredCredential[])
    .filter(c => c.credentialID !== credentialID)

  await prisma.staff.update({
    where: { id: staff.id },
    data:  { webAuthnCredentials: filtered as unknown as Prisma.InputJsonValue },
  })

  return NextResponse.json({ ok: true })
}
