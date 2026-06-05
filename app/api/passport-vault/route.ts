import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const vault = await prisma.passportVault.findUnique({ where: { userId: session.user.id } })
  return NextResponse.json({ vault })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const body = await req.json()

    // Sanitise — remove undefined/null string values
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== '') data[k] = v
    }

    // Convert date strings to Date objects
    for (const field of ['dateOfBirth', 'issueDate', 'expiryDate']) {
      if (data[field] && typeof data[field] === 'string') {
        data[field] = new Date(data[field] as string)
      }
    }

    const vault = await prisma.passportVault.upsert({
      where:  { userId: session.user.id },
      update: { ...data, updatedAt: new Date() },
      create: { userId: session.user.id, ...data },
    })

    return NextResponse.json({ vault })
  } catch (err) {
    console.error('passport-vault POST error:', err)
    return NextResponse.json({ error: 'Failed to save vault' }, { status: 500 })
  }
}
