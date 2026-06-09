import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

const DEFAULT_TIMELINE = [
  { icon: 'plane',    title: 'Where It Began',      order: 0, active: true, description: 'Walz Travels launched as a boutique travel consultancy in Dubai — serving the African diaspora in the UAE and building a reputation for expert visa processing and travel support.' },
  { icon: 'landmark', title: 'Expanding to Europe',  order: 1, active: true, description: 'Formally registered in the United Kingdom. Expanded visa processing and travel services for Nigerian and Ghanaian diaspora across the UK and Europe.' },
  { icon: 'leaf',     title: 'North America',         order: 2, active: true, description: 'Opened Canadian operations in Ontario. Launched Niagara Falls private tours and Canada visa processing for diaspora clients across North America.' },
  { icon: 'globe',    title: 'Global Platform',      order: 3, active: true, description: 'THE WALZ TRAVELS INC incorporated in Ontario, Canada. Full global travel platform launched at walztravels.com — serving clients across six markets worldwide with one unified experience.' },
]

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let events = await prisma.timelineEvent.findMany({ orderBy: { order: 'asc' } })
  if (events.length === 0) {
    await prisma.timelineEvent.createMany({ data: DEFAULT_TIMELINE })
    events = await prisma.timelineEvent.findMany({ orderBy: { order: 'asc' } })
  }
  return NextResponse.json(events)
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const event = await prisma.timelineEvent.create({ data: { icon: body.icon ?? 'plane', title: body.title, description: body.description, order: body.order ?? 0, active: body.active ?? true } })
  return NextResponse.json(event, { status: 201 })
}

export async function PUT(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, ...rest } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const event = await prisma.timelineEvent.update({ where: { id }, data: rest })
  return NextResponse.json(event)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.timelineEvent.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
