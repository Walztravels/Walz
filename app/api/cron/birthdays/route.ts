export const maxDuration = 60
export const dynamic    = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { sendBirthdayEmail }         from '@/lib/email'
import { getResend }                 from '@/lib/resend'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ── Today's birthdays — one email per unique email address ──────────────
  type BirthdayRow = { id: string; email: string; firstName: string | null; lastName: string | null }

  const todaysBirthdays = await prisma.$queryRaw<BirthdayRow[]>`
    SELECT DISTINCT ON (LOWER(email))
           id, email, "firstName", "lastName"
    FROM   "VisaApplication"
    WHERE  "dateOfBirth"   IS NOT NULL
      AND  email            IS NOT NULL
      AND  "marketingOptOut" = false
      AND  EXTRACT(MONTH FROM "dateOfBirth") = EXTRACT(MONTH FROM CURRENT_DATE)
      AND  EXTRACT(DAY   FROM "dateOfBirth") = EXTRACT(DAY   FROM CURRENT_DATE)
      AND  (
            "birthdayEmailSentAt" IS NULL
            OR EXTRACT(YEAR FROM "birthdayEmailSentAt") < EXTRACT(YEAR FROM CURRENT_DATE)
           )
    ORDER BY LOWER(email), "createdAt" DESC
  `

  let sent   = 0
  let failed = 0

  for (const client of todaysBirthdays) {
    try {
      await sendBirthdayEmail({
        to:                 client.email,
        firstName:          client.firstName || 'there',
        visaApplicationId:  client.id,
      })
      await prisma.visaApplication.update({
        where: { id: client.id },
        data:  { birthdayEmailSentAt: new Date() },
      })
      sent++
    } catch (err: any) {
      console.error('[birthdays] Failed for', client.email, err?.message)
      failed++
    }
  }

  // ── Upcoming 7-day birthdays — staff digest ──────────────────────────────
  type UpcomingRow = { firstName: string | null; lastName: string | null; email: string; dateOfBirth: Date }

  const upcoming = await prisma.$queryRaw<UpcomingRow[]>`
    SELECT DISTINCT ON (LOWER(email))
           "firstName", "lastName", email, "dateOfBirth"
    FROM   "VisaApplication"
    WHERE  "dateOfBirth" IS NOT NULL
      AND  email          IS NOT NULL
      AND  TO_CHAR("dateOfBirth", 'MM-DD') IN (
             TO_CHAR(CURRENT_DATE + INTERVAL '1 day',  'MM-DD'),
             TO_CHAR(CURRENT_DATE + INTERVAL '2 days', 'MM-DD'),
             TO_CHAR(CURRENT_DATE + INTERVAL '3 days', 'MM-DD'),
             TO_CHAR(CURRENT_DATE + INTERVAL '4 days', 'MM-DD'),
             TO_CHAR(CURRENT_DATE + INTERVAL '5 days', 'MM-DD'),
             TO_CHAR(CURRENT_DATE + INTERVAL '6 days', 'MM-DD'),
             TO_CHAR(CURRENT_DATE + INTERVAL '7 days', 'MM-DD')
           )
    ORDER BY LOWER(email), TO_CHAR("dateOfBirth", 'MM-DD')
  `

  if (upcoming.length > 0) {
    const rows = upcoming.map(c => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email
      const dob  = new Date(c.dateOfBirth)
      const when = dob.toLocaleDateString('en-GB', { month: 'long', day: 'numeric' })
      return `<tr><td style="padding:8px 12px">${name}</td><td style="padding:8px 12px">${c.email}</td><td style="padding:8px 12px">${when}</td></tr>`
    }).join('')

    await getResend().emails.send({
      from:    'Walz Travels System <contact@walztravels.com>',
      to:      'contact@walztravels.com',
      subject: `🎂 ${upcoming.length} client birthday${upcoming.length > 1 ? 's' : ''} in the next 7 days`,
      html: `
        <p style="font-family:sans-serif">Here are clients with birthdays in the next 7 days. A personal call or note goes a long way!</p>
        <table style="font-family:sans-serif;border-collapse:collapse;width:100%">
          <thead>
            <tr style="background:#0B1F3A;color:#fff">
              <th style="padding:8px 12px;text-align:left">Name</th>
              <th style="padding:8px 12px;text-align:left">Email</th>
              <th style="padding:8px 12px;text-align:left">Birthday</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `,
    }).catch(err => console.error('[birthdays] Staff digest failed:', err?.message))
  }

  // ── Count of clients with usable DOB + email (for reporting) ────────────
  const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT LOWER(email)) AS count
    FROM   "VisaApplication"
    WHERE  "dateOfBirth" IS NOT NULL
      AND  email IS NOT NULL
      AND  "marketingOptOut" = false
  `

  console.log(`[birthdays] sent=${sent} failed=${failed} upcoming=${upcoming.length} usable=${count}`)

  return NextResponse.json({
    success:          true,
    sentToday:        sent,
    failedToday:      failed,
    upcomingIn7Days:  upcoming.length,
    usableRecords:    Number(count),
  })
}
