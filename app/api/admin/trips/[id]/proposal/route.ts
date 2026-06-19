import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tripId } = await params
  const { title, message } = await req.json()

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: { include: { items: { orderBy: { order: 'asc' } } }, orderBy: { dayNumber: 'asc' } },
    },
  })
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const totalCost = trip.days.reduce((sum, day) =>
    sum + day.items.reduce((s, item) => s + (item.cost ?? 0), 0), 0)

  const content = buildProposalHtml(trip, message)

  const proposal = await prisma.tripProposal.create({
    data: {
      tripId,
      staffId: session.id,
      staffName: session.name,
      title: title || `${trip.title} — Itinerary Proposal`,
      content,
      itinerary: trip.days as unknown as Parameters<typeof prisma.tripProposal.create>[0]['data']['itinerary'],
      totalCost,
      currency: trip.currency,
      status: 'draft',
    },
  })

  return NextResponse.json({ proposal, content })
}

function buildProposalHtml(
  trip: { title: string; destination: string; startDate: Date | null; endDate: Date | null; currency: string; days: Array<{ dayNumber: number; date: Date | null; title: string | null; items: Array<{ type: string; title: string; description: string | null; location: string | null; startTime: string | null; endTime: string | null; cost: number | null; confirmed: boolean }> }> },
  message?: string,
): string {
  const fmt = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: trip.currency }).format(n)
  const dateStr = trip.startDate
    ? `${new Date(trip.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}${trip.endDate ? ` — ${new Date(trip.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}`
    : ''

  const TYPE_ICONS: Record<string, string> = {
    FLIGHT: '✈', HOTEL: '🏨', ACTIVITY: '🎯', RESTAURANT: '🍽',
    TRANSPORT: '🚗', TOUR: '🌴', CUSTOM: '📝', NOTE: '📌',
    VISA: '📋', ESIM: '📱',
  }

  const daysHtml = trip.days.map(day => {
    const dayDate = day.date ? new Date(day.date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }) : ''
    const itemsHtml = day.items.map(item => `
      <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #f0f0f0">
        <div style="font-size:20px;flex-shrink:0">${TYPE_ICONS[item.type] || '📝'}</div>
        <div style="flex:1">
          <div style="font-weight:700;color:#0B1F3A;font-size:14px">${item.title}${item.confirmed ? ' <span style="color:#16A34A;font-size:11px">✓ Confirmed</span>' : ''}</div>
          ${item.location ? `<div style="color:#64748B;font-size:12px">📍 ${item.location}</div>` : ''}
          ${item.description ? `<div style="color:#64748B;font-size:12px;margin-top:4px">${item.description}</div>` : ''}
          <div style="display:flex;gap:12px;margin-top:4px">
            ${item.startTime ? `<span style="font-size:11px;color:#94A3B8">⏰ ${item.startTime}${item.endTime ? `–${item.endTime}` : ''}</span>` : ''}
            ${item.cost ? `<span style="font-size:11px;color:#C9A84C;font-weight:600">${fmt(item.cost)}</span>` : ''}
          </div>
        </div>
      </div>`).join('')

    return `
    <div style="margin-bottom:24px;background:white;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#0B1F3A;padding:12px 20px;display:flex;align-items:center;gap:12px">
        <div style="background:#C9A84C;color:#0B1F3A;font-weight:900;font-size:13px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center">${day.dayNumber}</div>
        <div>
          <div style="color:white;font-weight:700;font-size:14px">${day.title || `Day ${day.dayNumber}`}</div>
          ${dayDate ? `<div style="color:rgba(255,255,255,0.5);font-size:11px">${dayDate}</div>` : ''}
        </div>
      </div>
      <div style="padding:4px 20px">${itemsHtml || '<p style="color:#94A3B8;font-size:13px;padding:12px 0">No items planned yet</p>'}</div>
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;background:#F5F0E8;margin:0;padding:20px;}</style></head>
<body>
<div style="max-width:700px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:#0B1F3A;padding:32px;text-align:center">
    <div style="color:#C9A84C;font-size:24px;font-weight:900;letter-spacing:3px">WALZ TRAVELS</div>
    <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:4px;letter-spacing:2px">FLIGHTS · HOTELS · TOURS · VISAS</div>
  </div>
  <div style="padding:32px">
    <h1 style="color:#0B1F3A;font-size:26px;font-weight:900;margin:0 0 4px">${trip.title}</h1>
    <div style="color:#C9A84C;font-size:14px;margin-bottom:4px">📍 ${trip.destination}</div>
    ${dateStr ? `<div style="color:#64748B;font-size:13px;margin-bottom:20px">📅 ${dateStr}</div>` : ''}
    ${message ? `<div style="background:#F5F0E8;border-radius:10px;padding:16px;margin-bottom:24px;font-size:14px;color:#475569;font-style:italic">${message}</div>` : ''}
    <h2 style="color:#0B1F3A;font-size:16px;font-weight:700;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #C9A84C">Your Itinerary</h2>
    ${daysHtml}
  </div>
  <div style="background:#0B1F3A;padding:20px 32px;text-align:center">
    <div style="color:rgba(255,255,255,0.5);font-size:11px">Walz Travels · walztravels.com · contact@walztravels.com · +44 7398 753797</div>
  </div>
</div>
</body>
</html>`
}
