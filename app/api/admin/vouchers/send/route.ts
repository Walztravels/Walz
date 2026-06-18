import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getResend } from '@/lib/email-internal'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://walztravels.com'

export async function POST(req: NextRequest) {
  if (!(await getAdminSession()))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { voucherId, recipientEmail, recipientName, personalMessage } = await req.json()

  if (!voucherId || !recipientEmail)
    return NextResponse.json({ error: 'voucherId and recipientEmail required' }, { status: 400 })

  const voucher = await prisma.voucher.findUnique({ where: { id: voucherId } })
  if (!voucher)
    return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })

  await prisma.voucher.update({
    where: { id: voucherId },
    data: {
      recipientEmail: recipientEmail || voucher.recipientEmail,
      recipientName:  recipientName  || voucher.recipientName,
      personalMessage: personalMessage || voucher.personalMessage,
      status: voucher.status === 'ACTIVE' ? 'SENT' : voucher.status,
    },
  })

  const sym: Record<string, string> = {
    GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', AED: 'AED ', NGN: '₦',
  }
  const currency = sym[voucher.currency] ?? voucher.currency
  let valueDisplay = ''
  if (voucher.discountType === 'percentage') valueDisplay = `${voucher.amount}% OFF`
  else if (voucher.discountType === 'free')  valueDisplay = 'FREE SERVICE'
  else valueDisplay = `${currency}${voucher.amount.toLocaleString()}`

  const expiryDate = new Date(voucher.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const serviceLabel: Record<string, string> = {
    visa: 'Visa Services', flight: 'Flight Bookings',
    tour: 'Tour Packages', all: 'All Walz Travels Services',
  }
  const service = serviceLabel[voucher.serviceType] ?? 'Walz Travels Services'

  const name = recipientName || voucher.recipientName || 'Valued Client'
  const message = personalMessage || voucher.personalMessage

  const resend = getResend()

  await resend.emails.send({
    from:    'Walz Travels <gifts@walztravels.com>',
    to:      recipientEmail,
    subject: `Your ${voucher.voucherKind === 'gift' ? 'Gift Voucher' : 'Discount Code'} from Walz Travels 🎁`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">

        <!-- Header -->
        <div style="background:#0B1F3A;padding:32px 40px;text-align:center;">
          <img src="${BASE_URL}/walz-logo.png" alt="Walz Travels" width="160"
            style="height:auto;display:block;margin:0 auto 8px;" />
          <p style="margin:0;color:#C9A84C;font-size:11px;
            letter-spacing:2px;text-transform:uppercase;">
            ${voucher.voucherKind === 'gift' ? 'Gift Voucher' : 'Exclusive Discount'}
          </p>
        </div>

        <div style="padding:40px;">
          <p style="color:#0B1F3A;font-size:16px;margin:0 0 8px;">Hi ${name},</p>
          <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 32px;">
            ${voucher.voucherKind === 'gift'
              ? `You've received a special gift voucher from <strong>${voucher.senderName || 'Walz Travels'}</strong>. Redeem it on your next travel booking with us!`
              : `Here is your exclusive discount code for <strong>${service}</strong>.`
            }
          </p>

          ${message ? `
          <div style="background:#F5F0E8;border-left:4px solid #C9A84C;
            border-radius:8px;padding:16px 20px;margin:0 0 32px;">
            <p style="margin:0;color:#0B1F3A;font-size:14px;
              line-height:1.7;font-style:italic;">"${message}"</p>
            ${voucher.senderName ? `<p style="margin:8px 0 0;color:#C9A84C;
              font-size:12px;font-weight:600;">— ${voucher.senderName}</p>` : ''}
          </div>` : ''}

          <!-- Voucher Card -->
          <div style="background:linear-gradient(135deg,#0B1F3A 0%,#1a3a6b 100%);
            border-radius:16px;padding:32px;text-align:center;margin:0 0 32px;">
            <p style="color:#C9A84C;font-size:11px;margin:0 0 8px;
              text-transform:uppercase;letter-spacing:2px;">
              ${service}
            </p>
            <p style="color:#ffffff;font-size:48px;font-weight:800;
              margin:0 0 4px;letter-spacing:2px;">
              ${valueDisplay}
            </p>
            ${voucher.name ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 24px;">
              ${voucher.name}</p>` : '<div style="margin-bottom:24px;"></div>'}

            <!-- Voucher Code Box -->
            <div style="background:rgba(255,255,255,0.1);border:2px dashed #C9A84C;
              border-radius:12px;padding:16px 24px;display:inline-block;">
              <p style="color:#94a3b8;font-size:10px;margin:0 0 4px;
                text-transform:uppercase;letter-spacing:1px;">Your Code</p>
              <p style="color:#C9A84C;font-size:24px;font-weight:800;
                margin:0;letter-spacing:4px;font-family:monospace;">
                ${voucher.code}
              </p>
            </div>

            <p style="color:#64748b;font-size:12px;margin:16px 0 0;">
              Valid until ${expiryDate}
            </p>
          </div>

          <!-- How to redeem -->
          <div style="background:#f8fafc;border-radius:12px;
            padding:20px 24px;margin:0 0 32px;">
            <p style="color:#0B1F3A;font-weight:700;font-size:14px;
              margin:0 0 12px;">How to redeem:</p>
            <ol style="margin:0;padding-left:20px;color:#475569;
              font-size:13px;line-height:2;">
              <li>Visit <a href="${BASE_URL}" style="color:#C9A84C;">walztravels.com</a>
                or contact our team</li>
              <li>Choose your travel service</li>
              <li>Enter code <strong style="color:#0B1F3A;
                font-family:monospace;">${voucher.code}</strong> at checkout</li>
              <li>Your discount is applied instantly</li>
            </ol>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin:0 0 32px;">
            <a href="${BASE_URL}"
              style="display:inline-block;background:#C9A84C;color:#0B1F3A;
                font-weight:700;font-size:15px;padding:14px 36px;
                border-radius:12px;text-decoration:none;">
              Book Now →
            </a>
          </div>

          <p style="color:#94a3b8;font-size:12px;text-align:center;
            line-height:1.6;margin:0;">
            Need help? WhatsApp us on
            <a href="https://wa.me/447398753797" style="color:#C9A84C;">
              +44 7398 753797</a>
            or email
            <a href="mailto:contact@walztravels.com" style="color:#C9A84C;">
              contact@walztravels.com</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#f1f5f9;padding:20px 40px;
          text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;">
            © Walz Travels · walztravels.com ·
            <a href="mailto:contact@walztravels.com" style="color:#94a3b8;">
              Unsubscribe</a>
          </p>
        </div>

      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
