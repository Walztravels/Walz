export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { verifyUnsubscribeToken }    from '@/lib/email'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || ''
  const id    = verifyUnsubscribeToken(token)

  if (!id) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:80px 20px">
        <h2 style="color:#c0392b">Invalid or expired link</h2>
        <p>This unsubscribe link is not valid. Please contact <a href="mailto:contact@walztravels.com">contact@walztravels.com</a> if you need help.</p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } },
    )
  }

  try {
    await prisma.visaApplication.update({
      where: { id },
      data:  { marketingOptOut: true },
    })
  } catch {
    // Record may not exist or already opted out — either way, confirm to the user
  }

  return new NextResponse(
    `<html><body style="font-family:Georgia,serif;text-align:center;padding:80px 20px;background:#F7F4EF">
      <div style="max-width:480px;margin:0 auto;background:#fff;padding:48px 40px;border-radius:4px">
        <p style="color:#C9A84C;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 24px">Walz Travels</p>
        <h2 style="color:#0B1F3A;font-weight:400;margin:0 0 16px">You've been unsubscribed</h2>
        <p style="color:#555;line-height:1.7;margin:0">You won't receive birthday emails from us anymore. We'll still send you important updates about your visa applications and bookings.</p>
        <p style="color:#8B9BAE;font-size:12px;margin:32px 0 0">Changed your mind? Email <a href="mailto:contact@walztravels.com" style="color:#C9A84C">contact@walztravels.com</a></p>
      </div>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )
}
