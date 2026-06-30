import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'
import { ensurePortalAccount } from '@/lib/portal-account'

export const dynamic = 'force-dynamic'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

type Applicant = {
  relationship: string
  firstName: string
  lastName: string
  dateOfBirth: string
  nationality: string
  passportNumber?: string
  passportExpiry?: string
  isMinor: boolean
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      visaType: string
      destinationIso2: string
      contactEmail: string
      contactPhone?: string
      applicants: Applicant[]
    }

    const { visaType, destinationIso2, contactEmail, contactPhone, applicants } = body

    if (!applicants?.length || !contactEmail) {
      return NextResponse.json({ error: 'applicants and contactEmail are required' }, { status: 400 })
    }

    // Generate unique family reference number like FAM-A1B2C3D4
    let refNumber = ''
    for (let i = 0; i < 8; i++) {
      refNumber = 'FAM-' + Math.random().toString(36).substring(2, 10).toUpperCase()
      const existing = await prisma.familyGroup.findUnique({ where: { referenceNumber: refNumber } })
      if (!existing) break
    }

    // Create one VisaApplication per member
    const created: { id: string; referenceNumber: string }[] = []
    for (let i = 0; i < applicants.length; i++) {
      const a = applicants[i]
      const memberRef = `${refNumber}-${i + 1}`
      const app = await prisma.visaApplication.create({
        data: {
          referenceNumber:  memberRef,
          destinationIso2:  destinationIso2 || '',
          visaType:         visaType || 'tourist',
          email:            contactEmail,
          phone:            contactPhone ?? '',
          firstName:        a.firstName,
          lastName:         a.lastName,
          nationality:      a.nationality,
          passportNumber:   a.passportNumber ?? null,
          passportExpiryDate: a.passportExpiry ? new Date(a.passportExpiry) : null,
          dateOfBirth:      a.dateOfBirth ? new Date(a.dateOfBirth) : null,
          relationship:     a.relationship || (i === 0 ? 'lead' : 'other'),
          isMinor:          a.isMinor ?? false,
          guardianId:       i > 0 ? (created[0]?.id ?? null) : null,
          familyGroupId:    refNumber,
          isDraft:          false,
          status:           'received',
          initiatedBy:      'client',
        },
      })
      created.push({ id: app.id, referenceNumber: app.referenceNumber })
    }

    // Create FamilyGroup record
    await prisma.familyGroup.create({
      data: {
        referenceNumber:  refNumber,
        leadApplicantId:  created[0]?.id ?? null,
        visaType:         visaType || '',
        destination:      destinationIso2 || '',
        totalApplicants:  applicants.length,
        status:           'pending',
      },
    })

    // Auto-create portal account for lead applicant
    const lead = applicants[0]
    const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(' ')
    const { userId } = await ensurePortalAccount(
      contactEmail,
      leadName,
      refNumber,
      `Family Visa Application (${applicants.length} people)`,
    ).catch(() => ({ userId: null as string | null }))

    if (userId) {
      await prisma.visaApplication.updateMany({
        where: { familyGroupId: refNumber },
        data: { userId },
      }).catch(() => {})
    }

    // Send confirmation email to lead applicant
    const resend = getResend()
    if (resend) {
      resend.emails.send({
        from:    'Walz Travels <contact@walztravels.com>',
        to:      contactEmail,
        subject: `Family Visa Application Received — ${refNumber}`,
        html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#0B1F3A;padding:24px 28px;border-radius:12px 12px 0 0;">
    <img src="https://walztravels.com/walz-logo.png" width="120" style="height:auto;" alt="Walz Travels" />
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <h2 style="color:#0B1F3A;margin:0 0 8px;">Family Visa Application Received ✅</h2>
    <p style="color:#444;line-height:1.6;">Hi ${lead.firstName},</p>
    <p style="color:#444;line-height:1.6;">
      We've received your family visa application for <strong>${applicants.length} applicant(s)</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="color:#888;padding:6px 0;width:160px;">Family Reference</td><td style="color:#0B1F3A;font-weight:700;">${refNumber}</td></tr>
      <tr><td style="color:#888;padding:6px 0;">Visa Type</td><td style="color:#0B1F3A;">${visaType}</td></tr>
      <tr><td style="color:#888;padding:6px 0;">Total Applicants</td><td style="color:#0B1F3A;">${applicants.length}</td></tr>
    </table>
    <p style="color:#444;font-weight:600;margin:16px 0 8px;">Applicants:</p>
    <ul style="margin:0;padding:0 0 0 20px;color:#555;line-height:1.8;">
      ${applicants.map((a, i) => `<li>${a.firstName} ${a.lastName} — ${i === 0 ? 'Lead applicant' : a.relationship}${a.isMinor ? ' (minor)' : ''}</li>`).join('')}
    </ul>
    <p style="color:#444;line-height:1.6;margin-top:16px;">
      Our team will review your application and contact you within 24 hours with next steps for document submission.
    </p>
    <a href="https://www.walztravels.com/dashboard"
       style="display:inline-block;margin:20px 0 0;padding:12px 28px;background:#C9A84C;color:#0B1F3A;text-decoration:none;border-radius:8px;font-weight:700;">
      View My Dashboard →
    </a>
    <p style="color:#888;font-size:12px;margin-top:24px;">
      WhatsApp: <a href="https://wa.me/447398753797" style="color:#C9A84C;">+44 7398 753797</a> · contact@walztravels.com
    </p>
  </div>
</div>`,
      }).catch(() => {})

      // Admin notification
      resend.emails.send({
        from:    'Walz Travels System <noreply@walztravels.com>',
        to:      'contact@walztravels.com',
        subject: `👨‍👩‍👧‍👦 New Family Visa Application — ${refNumber} (${applicants.length} applicants)`,
        html: `
<p><strong>New family visa application received.</strong></p>
<p>Ref: ${refNumber}</p>
<p>Visa: ${visaType} | Destination: ${destinationIso2}</p>
<p>Lead: ${lead.firstName} ${lead.lastName} (${contactEmail})</p>
<p>Total applicants: ${applicants.length}</p>
<ul>${applicants.map((a, i) => `<li>${a.firstName} ${a.lastName} — ${i === 0 ? 'lead' : a.relationship}${a.isMinor ? ' (minor)' : ''}</li>`).join('')}</ul>
<p><a href="https://www.walztravels.com/admin/visa-applications">View in Admin →</a></p>`,
      }).catch(() => {})
    }

    return NextResponse.json({
      success:        true,
      referenceNumber: refNumber,
      totalApplicants: applicants.length,
      applicationIds:  created.map(a => a.id),
    }, { status: 201 })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[family visa POST]', msg)
    return NextResponse.json({ error: 'Failed to submit family application', details: msg.slice(0, 200) }, { status: 500 })
  }
}
