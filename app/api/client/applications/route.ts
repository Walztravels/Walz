import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { jwtVerify } from 'jose'

const JWT_SECRET  = new TextEncoder().encode(
  process.env.CLIENT_JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'walz-client-fallback-secret'
)
const COOKIE_NAME = 'walz_client_token'

async function getClientSession(req: NextRequest): Promise<{ email: string } | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return { email: payload.email as string }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const session = await getClientSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const applications = await prisma.visaApplication.findMany({
    where:   { email: session.email, isDraft: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id:              true,
      referenceNumber: true,
      destinationIso2: true,
      visaType:        true,
      status:          true,
      statusMessage:   true,
      timeline:        true,
      createdAt:       true,
      updatedAt:       true,
    },
  })

  return NextResponse.json({ applications })
}
