import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/email-internal'
import { ensurePortalAccount } from '@/lib/portal-account'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const request = await prisma.tripRequest.findUnique({ where: { token } })
  if (!request) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  if (request.status === 'submitted' || request.status === 'viewed' || request.status === 'converted') {
    return NextResponse.json({ request, alreadySubmitted: true })
  }
  if (!request.formOpenedAt) {
    await prisma.tripRequest.update({ where: { id: request.id }, data: { formOpenedAt: new Date() } })
  }
  return NextResponse.json({ request })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const request = await prisma.tripRequest.findUnique({ where: { token } })
  if (!request) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })

  const body = await req.json()
  const ua = req.headers.get('user-agent') || ''
  const deviceType = ua.includes('Mobile') ? 'mobile' : ua.includes('Tablet') ? 'tablet' : 'desktop'
  const ip = req.headers.get('x-forwarded-for') || 'unknown'

  const updated = await prisma.tripRequest.update({
    where: { id: request.id },
    data: {
      status: 'submitted', submittedAt: new Date(), ipAddress: ip, deviceType,
      firstName: body.firstName || request.firstName,
      lastName: body.lastName || request.lastName,
      email: body.email || request.email,
      phone: body.phone || request.phone,
      whatsapp: body.whatsapp || null,
      destination: body.destination || null,
      departureCity: body.departureCity || null,
      departureDate: body.departureDate || null,
      returnDate: body.returnDate || null,
      datesFlexible: body.datesFlexible ?? false,
      numberOfTravellers: body.numberOfTravellers ? Number(body.numberOfTravellers) : 1,
      tripType: body.tripType || null,
      budgetRange: body.budgetRange || null,
      budgetCurrency: body.budgetCurrency || 'GBP',
      budgetAmount: body.budgetAmount ? Number(body.budgetAmount) : null,
      hotelPreference: body.hotelPreference || null,
      vibes: JSON.stringify(body.vibes || []),
      activities: JSON.stringify(body.activities || []),
      mustDos: body.mustDos || null,
      dietaryNeeds: body.dietaryNeeds || null,
      mobilityNeeds: body.mobilityNeeds || null,
      travellingWithChildren: body.travellingWithChildren ?? false,
      childrenAges: JSON.stringify(body.childrenAges || []),
      seatPreference: body.seatPreference || null,
      cabinClass: body.cabinClass || 'economy',
      bedPreference: body.bedPreference || null,
      mealPreference: body.mealPreference || null,
      directFlightsOnly: body.directFlightsOnly ?? false,
      passportName: body.passportName || null,
      passportNumber: body.passportNumber || null,
      passportCountry: body.passportCountry || null,
      passportIssueDate: body.passportIssueDate || null,
      passportExpiry: body.passportExpiry || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender || null,
      placeOfBirth: body.placeOfBirth || null,
      nationality: body.nationality || null,
      citizenship: body.citizenship || null,
      loyaltyPrograms: JSON.stringify(body.loyaltyPrograms || []),
      hasValidVisa: body.hasValidVisa ?? null,
      visaCountry: body.visaCountry || null,
      needsVisaHelp: body.needsVisaHelp ?? false,
      needsTravelInsurance: body.needsTravelInsurance ?? false,
      notes: body.notes || null,
      signature: body.signature || null,
      signedAt: body.signature ? new Date() : null,
      agreedToTerms: body.agreedToTerms ?? false,
      updatedAt: new Date(),
    },
  })

  // Auto-create portal account for the client
  const clientEmail = body.email || request.email
  if (clientEmail) {
    const fullName = [body.firstName || request.firstName, body.lastName || request.lastName].filter(Boolean).join(' ') || 'Client'
    const { userId } = await ensurePortalAccount(
      clientEmail,
      fullName,
      updated.referenceNumber,
      'Trip Request',
    ).catch(() => ({ userId: null as string | null }))

    if (userId) {
      await prisma.tripRequest.update({
        where: { id: updated.id },
        data: { userId },
      }).catch(() => {})
    }
  }

  // Notify staff
  if (request.sentBy) {
    try {
      const resend = getResend()
      await resend.emails.send({
        from: 'Walz Travels <contact@walztravels.com>',
        to: request.sentBy,
        subject: `🔔 New Trip Request from ${body.firstName || ''} ${body.lastName || ''} — ${body.destination || 'Unknown'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
<div style="background:#060f1e;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px">
<p style="color:#F59E0B;font-weight:900;font-size:18px;margin:0">✈️ New Trip Request</p>
<p style="color:rgba(255,255,255,.4);font-size:12px;margin:4px 0 0">${updated.referenceNumber}</p>
</div>
<div style="background:#F9FAFB;border-radius:12px;padding:16px;margin-bottom:16px">
<p style="font-weight:700;color:#111;margin:0 0 12px">${body.firstName || ''} ${body.lastName || ''}</p>
<table style="width:100%;font-size:13px;border-collapse:collapse">
<tr><td style="color:#9CA3AF;padding:4px 0;width:40%">Destination</td><td style="color:#111;font-weight:600">${body.destination || '—'}</td></tr>
<tr><td style="color:#9CA3AF;padding:4px 0">Dates</td><td style="color:#111;font-weight:600">${body.departureDate || '—'} → ${body.returnDate || '—'}</td></tr>
<tr><td style="color:#9CA3AF;padding:4px 0">Travellers</td><td style="color:#111;font-weight:600">${body.numberOfTravellers || 1}</td></tr>
<tr><td style="color:#9CA3AF;padding:4px 0">Budget</td><td style="color:#111;font-weight:600">${body.budgetRange || '—'}</td></tr>
<tr><td style="color:#9CA3AF;padding:4px 0">Hotel</td><td style="color:#111;font-weight:600">${body.hotelPreference || '—'}</td></tr>
<tr><td style="color:#9CA3AF;padding:4px 0">Cabin Class</td><td style="color:#111;font-weight:600">${body.cabinClass || 'Economy'}</td></tr>
</table>
</div>
<a href="https://walztravels.com/admin/trip-requests/${updated.id}" style="display:block;background:#F59E0B;color:#000;font-weight:900;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-size:14px">View Full Request & Build Itinerary →</a>
</div>`,
      })
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ success: true, referenceNumber: updated.referenceNumber })
}
