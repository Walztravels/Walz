import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Always live: the client (components/promos/FlightPromos.tsx) fetches this
// on every mount and renders nothing on an empty/failed response, so there
// is no caching benefit to static generation — and without this export,
// Next tried to statically evaluate this route at BUILD time, which (a)
// requires DATABASE_URL to exist in whichever environment runs the build
// (breaking Preview, where it deliberately doesn't) and (b) silently froze
// production responses to a single build-time snapshot, so admin edits to
// Featured Deals would not appear until the next deploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  const deals = await prisma.featuredDeal.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    take: 12,
  })
  return NextResponse.json(deals)
}
