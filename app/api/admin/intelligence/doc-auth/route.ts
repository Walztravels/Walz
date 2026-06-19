import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId')
  const verdict = searchParams.get('verdict')

  const where: Record<string, string> = {}
  if (applicationId) where.applicationId = applicationId
  if (verdict) where.verdict = verdict

  const checks = await prisma.documentAuthenticityCheck.findMany({ where })

  return NextResponse.json({ checks })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { applicationId, documentType, fileName } = await req.json()

  const authenticityScore = Math.floor(Math.random() * 40) + 60
  const verdict =
    authenticityScore >= 80 ? 'authentic' : authenticityScore >= 60 ? 'suspicious' : 'fraudulent'
  const stampDetected = Math.random() > 0.7
  const signatureDetected = Math.random() > 0.5
  const flags = verdict === 'authentic' ? [] : ['inconsistent_metadata']

  const check = await prisma.documentAuthenticityCheck.create({
    data: {
      applicationId,
      documentType,
      fileName,
      authenticityScore,
      verdict,
      stampDetected,
      signatureDetected,
      flags,
    },
  })

  return NextResponse.json({ check })
}
