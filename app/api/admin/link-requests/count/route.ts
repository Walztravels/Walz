import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ count: 0 })

  const count = await prisma.applicationLinkRequest.count({ where: { status: 'pending' } })
  return NextResponse.json({ count })
}
