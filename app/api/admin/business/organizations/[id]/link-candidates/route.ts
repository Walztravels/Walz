// app/api/admin/business/organizations/[id]/link-candidates/route.ts
// Walz Business (Release 2)
// GET ?kind=QUOTE|VISA_APPLICATION|ITINERARY|TRIP&q=… — search/select source
// for the service-linking picker, so staff never paste a raw record id.
// Requires 'b2b.manage' (the only use is feeding a link action).
//
// Records already linked to ANOTHER organization's services are excluded
// from the results entirely (they can never be linked here — the link route
// re-checks this server-side inside a serializable transaction anyway).
// Visa candidates expose only reference / applicant name / destination /
// status — never passport or other personal fields.

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireB2bStaff, organizationExists, NOT_FOUND } from '@/lib/business/admin-guard'
import { LINK_COLUMN, isLinkKind, type LinkKind } from '@/lib/business/services'

export const dynamic = 'force-dynamic'

interface Candidate { id: string; label: string; sublabel: string | null; status: string | null }

async function search(kind: LinkKind, q: string): Promise<Candidate[]> {
  const ci = { contains: q, mode: 'insensitive' as const }
  switch (kind) {
    case 'QUOTE': {
      const rows = await prisma.quote.findMany({
        where: { OR: [{ reference: ci }, { title: ci }, { clientName: ci }, { clientEmail: ci }] },
        select: { id: true, reference: true, title: true, clientName: true, status: true, currency: true },
        orderBy: { createdAt: 'desc' }, take: 20,
      })
      return rows.map(r => ({ id: r.id, label: `${r.reference} — ${r.title}`, sublabel: `${r.clientName} · ${r.currency}`, status: r.status }))
    }
    case 'VISA_APPLICATION': {
      const rows = await prisma.visaApplication.findMany({
        where: { OR: [{ referenceNumber: ci }, { firstName: ci }, { lastName: ci }, { email: ci }] },
        select: { id: true, referenceNumber: true, firstName: true, lastName: true, destinationIso2: true, visaType: true, status: true },
        orderBy: { createdAt: 'desc' }, take: 20,
      })
      return rows.map(r => ({
        id: r.id,
        label: `${r.referenceNumber} — ${[r.firstName, r.lastName].filter(Boolean).join(' ') || 'Applicant'}`,
        sublabel: `${r.visaType} · ${r.destinationIso2}`,
        status: r.status,
      }))
    }
    case 'ITINERARY': {
      const rows = await prisma.itinerary.findMany({
        where: { OR: [{ referenceNumber: ci }, { title: ci }, { clientName: ci }, { clientEmail: ci }] },
        select: { id: true, referenceNumber: true, title: true, clientName: true, destination: true, status: true },
        orderBy: { createdAt: 'desc' }, take: 20,
      })
      return rows.map(r => ({ id: r.id, label: `${r.referenceNumber} — ${r.title}`, sublabel: `${r.clientName} · ${r.destination}`, status: r.status }))
    }
    case 'TRIP': {
      const rows = await prisma.trip.findMany({
        where: { OR: [{ title: ci }, { destination: ci }] },
        select: { id: true, title: true, destination: true, status: true, startDate: true },
        orderBy: { createdAt: 'desc' }, take: 20,
      })
      return rows.map(r => ({
        id: r.id, label: r.title, sublabel: [r.destination, r.startDate?.toISOString().slice(0, 10)].filter(Boolean).join(' · ') || null,
        status: String(r.status),
      }))
    }
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireB2bStaff('b2b.manage')
  if (!guard.ok) return guard.response
  if (!(await organizationExists(params.id))) return NOT_FOUND()

  const kind = req.nextUrl.searchParams.get('kind')
  if (!isLinkKind(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100)
  if (q.length < 2) return NextResponse.json({ candidates: [] })

  const found = await search(kind, q)
  if (found.length === 0) return NextResponse.json({ candidates: [] })

  const column = LINK_COLUMN[kind]
  const links = await prisma.travelRequestService.findMany({
    where: { [column]: { in: found.map(c => c.id) } },
    select: { [column]: true, travelRequest: { select: { organizationId: true } } },
  }) as unknown as Array<Record<string, string | null> & { travelRequest: { organizationId: string } }>

  const foreign = new Set<string>()
  const here = new Set<string>()
  for (const l of links) {
    const id = l[column]
    if (!id) continue
    if (l.travelRequest.organizationId === params.id) here.add(id)
    else foreign.add(id)
  }

  return NextResponse.json({
    candidates: found
      .filter(c => !foreign.has(c.id))
      .map(c => ({ ...c, alreadyLinkedInThisOrganization: here.has(c.id) })),
  })
}
