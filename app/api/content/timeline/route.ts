import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

const FALLBACK = [
  { id: '1', icon: 'plane',    title: 'Where It Began',     description: 'Walz Travels launched as a boutique travel consultancy in Dubai — serving the African diaspora in the UAE and building a reputation for expert visa processing and travel support.', order: 0 },
  { id: '2', icon: 'landmark', title: 'Expanding to Europe', description: 'Formally registered in the United Kingdom. Expanded visa processing and travel services for Nigerian and Ghanaian diaspora across the UK and Europe.', order: 1 },
  { id: '3', icon: 'leaf',     title: 'North America',        description: 'Opened Canadian operations in Ontario. Launched Niagara Falls private tours and Canada visa processing for diaspora clients across North America.', order: 2 },
  { id: '4', icon: 'globe',    title: 'Global Platform',     description: 'THE WALZ TRAVELS INC incorporated in Ontario, Canada. Full global travel platform launched at walztravels.us — serving clients across six markets worldwide with one unified experience.', order: 3 },
]

export async function GET() {
  try {
    const events = await prisma.timelineEvent.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(events.length ? events : FALLBACK)
  } catch {
    return NextResponse.json(FALLBACK)
  }
}
