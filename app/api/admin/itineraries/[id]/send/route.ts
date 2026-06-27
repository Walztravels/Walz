import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/email-internal'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

const BASE = 'https://walztravels.com'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { id } = await params
  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let days: Array<{ day: number; title: string; description?: string; activities?: string[]; accommodation?: string; meals?: string; notes?: string }> = []
  try { days = JSON.parse(itin.days) } catch { days = [] }
  let flights: Array<{ from?: string; to?: string; airline?: string; date?: string; flightNumber?: string; class?: string; pnr?: string }> = []
  try { flights = JSON.parse(itin.flights) } catch { flights = [] }
  let hotels: Array<{ name?: string; location?: string; checkIn?: string; checkOut?: string; roomType?: string; nights?: number }> = []
  try { hotels = JSON.parse(itin.hotels) } catch { hotels = [] }
  let inclusions: string[] = []
  try { inclusions = JSON.parse(itin.inclusions) } catch { inclusions = [] }
  let exclusions: string[] = []
  try { exclusions = JSON.parse(itin.exclusions) } catch { exclusions = [] }
  let priceBreakdown: Array<{ item: string; description?: string; cost: number }> = []
  try { priceBreakdown = JSON.parse(itin.priceBreakdown) } catch { priceBreakdown = [] }

  const sym = itin.currency === 'GBP' ? '£' : itin.currency === 'USD' ? '$' : itin.currency === 'EUR' ? '€' : itin.currency === 'AED' ? 'AED ' : '₦'
  const fmtDate = (d?: string | Date | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  const daysHtml = days.length > 0 ? `
    <h2 style="color:#0B1F3A;font-size:18px;margin:32px 0 16px;">Day-by-Day Plan</h2>
    ${days.map(d => `
    <div style="border-left:3px solid #C9A84C;padding:0 0 24px 20px;margin:0 0 8px;">
      <p style="color:#C9A84C;font-size:12px;font-weight:700;text-transform:uppercase;margin:0 0 4px;">Day ${d.day}</p>
      <h3 style="color:#0B1F3A;font-size:16px;margin:0 0 8px;">${d.title || ''}</h3>
      ${d.description ? `<p style="color:#475569;font-size:13px;margin:0 0 8px;">${d.description}</p>` : ''}
      ${(d.activities || []).length > 0 ? `<ul style="margin:0 0 8px;padding-left:20px;">${(d.activities || []).map(a => `<li style="color:#475569;font-size:13px;margin-bottom:4px;">${a}</li>`).join('')}</ul>` : ''}
      ${d.accommodation ? `<p style="color:#475569;font-size:13px;margin:0 0 4px;">🏨 <strong>Stay:</strong> ${d.accommodation}</p>` : ''}
      ${d.meals ? `<p style="color:#475569;font-size:13px;margin:0;">🍽 <strong>Meals:</strong> ${d.meals}</p>` : ''}
    </div>`).join('')}` : ''

  const flightsHtml = flights.length > 0 ? `
    <h2 style="color:#0B1F3A;font-size:18px;margin:32px 0 16px;">Flights</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#f8fafc;"><th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;">Route</th><th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;">Date</th><th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;">Airline</th><th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;">Class</th></tr>
      ${flights.map(f => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 12px;color:#1e293b;">${f.from || ''} → ${f.to || ''}</td><td style="padding:10px 12px;color:#1e293b;">${f.date ? fmtDate(f.date) : ''}</td><td style="padding:10px 12px;color:#1e293b;">${f.airline || ''} ${f.flightNumber || ''}</td><td style="padding:10px 12px;color:#1e293b;">${f.class || ''}</td></tr>`).join('')}
    </table>` : ''

  const hotelsHtml = hotels.length > 0 ? `
    <h2 style="color:#0B1F3A;font-size:18px;margin:32px 0 16px;">Accommodation</h2>
    ${hotels.map(h => `<div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:12px;"><p style="font-weight:700;color:#0B1F3A;margin:0 0 4px;">${h.name || ''}</p><p style="color:#475569;font-size:13px;margin:0 0 4px;">📍 ${h.location || ''}</p>${h.checkIn ? `<p style="color:#475569;font-size:13px;margin:0;">📅 ${fmtDate(h.checkIn)} — ${fmtDate(h.checkOut)} · ${h.nights || ''} nights · ${h.roomType || ''}</p>` : ''}</div>`).join('')}` : ''

  const inclHtml = inclusions.length > 0 ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px;">
      <div><h3 style="color:#16a34a;font-size:15px;margin:0 0 12px;">✅ Included</h3>${inclusions.map(i => `<p style="font-size:13px;color:#475569;margin:0 0 6px;">✓ ${i}</p>`).join('')}</div>
      ${exclusions.length > 0 ? `<div><h3 style="color:#dc2626;font-size:15px;margin:0 0 12px;">❌ Not Included</h3>${exclusions.map(e => `<p style="font-size:13px;color:#475569;margin:0 0 6px;">✗ ${e}</p>`).join('')}</div>` : ''}
    </div>` : ''

  const pricingHtml = priceBreakdown.length > 0 ? `
    <h2 style="color:#0B1F3A;font-size:18px;margin:32px 0 16px;">Pricing</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${priceBreakdown.map((r, i) => `<tr style="border-bottom:1px solid #f1f5f9;${i === 0 ? 'background:#f8fafc;' : ''}"><td style="padding:10px 12px;color:#0B1F3A;font-weight:600;">${r.item}</td><td style="padding:10px 12px;color:#64748b;">${r.description || ''}</td><td style="padding:10px 12px;text-align:right;font-weight:700;color:#0B1F3A;">${sym}${Number(r.cost).toLocaleString()}</td></tr>`).join('')}
      ${itin.totalPrice ? `<tr style="background:#0B1F3A;"><td colspan="2" style="padding:12px;color:#fff;font-weight:700;">Total</td><td style="padding:12px;text-align:right;color:#C9A84C;font-size:16px;font-weight:700;">${sym}${Number(itin.totalPrice).toLocaleString()}</td></tr>` : ''}
    </table>
    ${itin.deposit ? `<div style="background:#fef9f0;border:1px solid #C9A84C;border-radius:8px;padding:16px;margin-top:16px;"><p style="color:#92400e;font-weight:700;margin:0 0 4px;">💰 Deposit Required: ${sym}${Number(itin.deposit).toLocaleString()}</p>${itin.depositDue ? `<p style="color:#92400e;font-size:13px;margin:0;">Due by ${fmtDate(itin.depositDue)}</p>` : ''}</div>` : ''}` : ''

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;background:#ffffff;">
    <div style="background:#0B1F3A;padding:32px 40px;text-align:center;">
      <img src="${BASE}/walz-logo.png" alt="Walz Travels" width="160" style="height:auto;display:block;margin:0 auto 12px;"/>
      <p style="color:#C9A84C;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0;">Your Travel Itinerary</p>
    </div>
    ${itin.coverImage ? `<img src="${itin.coverImage}" alt="${itin.title}" style="width:100%;height:240px;object-fit:cover;display:block;"/>` : ''}
    <div style="padding:40px;">
      <h1 style="color:#0B1F3A;font-size:26px;margin:0 0 8px;">${itin.title}</h1>
      <p style="color:#C9A84C;font-size:14px;font-weight:600;margin:0 0 6px;">Dear ${itin.clientName},</p>
      <p style="color:#475569;font-size:13px;margin:0 0 6px;">📍 ${itin.destination} · ${itin.numberOfTravellers} traveller${itin.numberOfTravellers > 1 ? 's' : ''} · ${itin.duration ? `${itin.duration} days` : ''}</p>
      ${itin.startDate ? `<p style="color:#475569;font-size:13px;margin:0 0 24px;">📅 ${fmtDate(itin.startDate)}${itin.endDate ? ` — ${fmtDate(itin.endDate)}` : ''}</p>` : '<div style="margin-bottom:24px;"></div>'}
      ${itin.overview ? `<div style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;"><p style="color:#475569;font-size:14px;line-height:1.7;margin:0;">${itin.overview}</p></div>` : ''}
      ${daysHtml}${flightsHtml}${hotelsHtml}${inclHtml}${pricingHtml}
      <div style="background:#0B1F3A;border-radius:12px;padding:24px;text-align:center;margin-top:40px;">
        <p style="color:#fff;font-size:14px;margin:0 0 16px;">View your full itinerary online</p>
        <a href="${BASE}/itinerary/${itin.referenceNumber}" style="display:inline-block;background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;">View Itinerary →</a>
      </div>
      ${itin.terms ? `<p style="color:#94a3b8;font-size:12px;line-height:1.6;margin-top:32px;border-top:1px solid #f1f5f9;padding-top:16px;">${itin.terms}</p>` : ''}
    </div>
    <div style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#0B1F3A;font-weight:600;font-size:13px;margin:0 0 6px;">Questions? We're here.</p>
      <p style="color:#64748b;font-size:13px;margin:0;">💬 <a href="https://wa.me/447398753797" style="color:#C9A84C;">WhatsApp</a> | ✉️ <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">contact@walztravels.com</a></p>
      <p style="color:#94a3b8;font-size:11px;margin:12px 0 0;">Ref: ${itin.referenceNumber} · Walz Travels</p>
    </div>
  </div>`

  const resend = getResend()
  let emailSent = false
  try {
    const { error } = await resend.emails.send({
      from: 'Walz Travels <contact@walztravels.com>',
      to: itin.clientEmail,
      subject: `Your ${itin.destination} Itinerary — ${itin.referenceNumber}`,
      html,
    })
    if (!error) emailSent = true
  } catch { /* non-fatal */ }

  await prisma.itinerary.update({
    where: { id },
    data: { status: 'proposal', sentAt: new Date(), updatedAt: new Date() },
  })

  return NextResponse.json({ ok: true, emailSent, to: itin.clientEmail })
}
