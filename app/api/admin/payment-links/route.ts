import { NextResponse }      from 'next/server'
import { getAdminSession }   from '@/lib/admin-auth'
import { prisma }            from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const links = await prisma.paymentLink.findMany({
      orderBy: { createdAt: 'desc' },
      take:    50,
    })
    return NextResponse.json({ links })
  } catch (err: any) {
    console.error('[payment-links GET]', err.message)
    return NextResponse.json({ error: 'Failed to load payment links' }, { status: 500 })
  }
}
