import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const emailTrimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Save to DB (upsert — idempotent on re-subscribe)
    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: { email: emailTrimmed },
      update: { active: true },
      create: { email: emailTrimmed, source: 'homepage' },
    })

    // If they were already subscribed (updatedAt == subscribedAt roughly), skip email
    const isNew = subscriber.subscribedAt >= new Date(Date.now() - 5000)

    if (isNew) {
      await resend.emails.send({
        from: 'Walz Travels <noreply@walztravels.com>',
        to: emailTrimmed,
        subject: 'Welcome to Walz Travels — Exclusive Deals Inside ✈️',
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Walz Travels</title>
</head>
<body style="margin:0;padding:0;background:#F7F4EF;font-family:'DM Sans',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(10,22,40,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0A1628;padding:32px 40px;text-align:center;">
              <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="80" style="width:80px;height:auto;display:block;margin:0 auto 16px;" />
              <h1 style="margin:0;color:#C9A84C;font-size:26px;font-weight:700;letter-spacing:-0.02em;">Welcome aboard</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:14px;">You&rsquo;re now part of our exclusive travel community</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#0A1628;font-size:16px;line-height:1.6;">
                Hi there,
              </p>
              <p style="margin:0 0 20px;color:#0A1628;font-size:16px;line-height:1.6;">
                Thank you for subscribing to <strong>Walz Travels</strong>. Every week we hand-pick the best flight deals, hotel offers and visa tips — delivered straight to your inbox.
              </p>

              <!-- What you'll get -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EF;border-radius:12px;padding:24px;margin:0 0 28px;">
                <tr>
                  <td>
                    <p style="margin:0 0 16px;font-weight:700;color:#0A1628;font-size:15px;">What to expect:</p>
                    ${['✈️ &nbsp;Exclusive flight deals — often before they go public',
                      '🏨 &nbsp;Hotel flash sales and upgrade offers',
                      '📄 &nbsp;Visa guides and country updates',
                      '🌍 &nbsp;Destination spotlights and travel inspiration',
                    ].map(item => `<p style="margin:0 0 10px;color:#0A1628;font-size:14px;line-height:1.5;">${item}</p>`).join('')}
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="https://walztravels.com" style="display:inline-block;background:linear-gradient(135deg,#C9A84C,#E8C97A);color:#0A1628;font-weight:700;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:50px;">
                      Explore Walz Travels &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#8B9BAE;font-size:13px;line-height:1.6;">
                Questions? WhatsApp us at <a href="https://wa.me/447398753797" style="color:#C9A84C;text-decoration:none;">+44 7398 753797</a> or email <a href="mailto:contact@walztravels.com" style="color:#C9A84C;text-decoration:none;">contact@walztravels.com</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F7F4EF;padding:20px 40px;text-align:center;border-top:1px solid #E2D9CC;">
              <p style="margin:0;color:#8B9BAE;font-size:12px;">
                &copy; ${new Date().getFullYear()} Walz Travels Ltd &bull; 1 Commercial Street, London, E1 6RF
              </p>
              <p style="margin:6px 0 0;color:#8B9BAE;font-size:11px;">
                You received this because you subscribed at walztravels.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      })
    }

    return NextResponse.json({ success: true, alreadySubscribed: !isNew })
  } catch (error) {
    console.error('[newsletter/subscribe]', error)
    return NextResponse.json({ error: 'Subscription failed. Please try again.' }, { status: 500 })
  }
}
