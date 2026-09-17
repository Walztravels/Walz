import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Client/case search for the Intelligence Hub (UX patch).
 *
 * Staff search by business identifiers — name, WALZ reference, email,
 * phone — never by database ids. Returns ONLY the minimum display +
 * resolution fields; no financial values, no document contents. The
 * userId in the payload is for internal resolution and is never shown
 * as something staff must copy.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const contains = { contains: q, mode: 'insensitive' as const }

  interface SearchResult {
    applicationId: string | null
    userId: string | null
    referenceNumber: string | null
    clientName: string
    email: string | null
    destinationIso2: string | null
    status: string | null
    visaType: string | null
    currency: string | null
  }

  const apps = await prisma.visaApplication.findMany({
    where: {
      isDraft: false,
      OR: [
        { referenceNumber: contains },
        { firstName: contains },
        { lastName: contains },
        { email: contains },
        { phone: contains },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 15,
    select: {
      id: true, referenceNumber: true, firstName: true, middleName: true, lastName: true,
      email: true, destinationIso2: true, status: true, visaType: true, userId: true,
      serviceFeeCurrency: true,
    },
  })

  // Clients who match by account name/email but whose application text
  // doesn't — resolve through their most recent application.
  const users = await prisma.user.findMany({
    where: { OR: [{ name: contains }, { email: contains }] },
    take: 5,
    select: {
      id: true, name: true, email: true,
      visaApplications: {
        where: { isDraft: false },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          id: true, referenceNumber: true, firstName: true, middleName: true, lastName: true,
          email: true, destinationIso2: true, status: true, visaType: true, userId: true,
          serviceFeeCurrency: true,
        },
      },
    },
  })

  const seen = new Set(apps.map(a => a.id))
  const results: SearchResult[] = [
    ...apps.map(a => toResult(a, a.userId)),
    ...users.flatMap((u): SearchResult[] => {
      const app = u.visaApplications[0]
      if (app && !seen.has(app.id)) { seen.add(app.id); return [toResult(app, u.id)] }
      if (!app) {
        // Registered client with no application yet — still selectable for
        // user-keyed modules (DNA/Lifecycle).
        return [{
          applicationId: null, userId: u.id,
          referenceNumber: null, clientName: u.name ?? u.email ?? 'Client',
          email: u.email, destinationIso2: null, status: null, visaType: null, currency: null,
        }]
      }
      return []
    }),
  ].slice(0, 20)

  return NextResponse.json({ results })
}

function toResult(a: {
  id: string; referenceNumber: string; firstName: string | null; middleName: string | null
  lastName: string | null; email: string | null; destinationIso2: string; status: string
  visaType: string; serviceFeeCurrency: string
}, userId: string | null) {
  return {
    applicationId: a.id,
    userId,
    referenceNumber: a.referenceNumber,
    clientName: [a.firstName, a.middleName, a.lastName].filter(Boolean).join(' ') || (a.email ?? 'Client'),
    email: a.email,
    destinationIso2: a.destinationIso2,
    status: a.status,
    visaType: a.visaType,
    currency: a.serviceFeeCurrency ?? null,
  }
}
