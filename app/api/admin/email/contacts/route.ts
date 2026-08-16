import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// ── GET /api/admin/email/contacts?q=&type= ───────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q    = searchParams.get('q')    ?? ''
  const type = searchParams.get('type') ?? 'all'

  if (!q) return NextResponse.json({ contacts: [] })

  const contacts: Array<{ id: string; name: string; email: string; type: string }> = []

  try {
    if (type === 'all' || type === 'client') {
      const clients = await prisma.user.findMany({
        where: {
          OR: [
            { name:  { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
          email: { not: null },
        },
        select: { id: true, name: true, email: true },
        take: 10,
      })
      clients.forEach(c => {
        if (c.email) {
          contacts.push({ id: c.id, name: c.name ?? c.email, email: c.email, type: 'client' })
        }
      })
    }

    if (type === 'all' || type === 'supplier') {
      const suppliers = await prisma.supplier.findMany({
        where: {
          OR: [
            { name:    { contains: q, mode: 'insensitive' } },
            { email:   { contains: q, mode: 'insensitive' } },
            { contact: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true, contact: true },
        take: 10,
      })
      suppliers.forEach(s => {
        const email = s.email ?? s.contact ?? null
        if (email) {
          contacts.push({ id: s.id, name: s.name, email, type: 'supplier' })
        }
      })
    }

    return NextResponse.json({ contacts })
  } catch (err) {
    console.error('[email/contacts GET]', err)
    return NextResponse.json({ error: 'Failed to search contacts' }, { status: 500 })
  }
}
