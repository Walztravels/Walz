import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { Resend }                    from 'resend'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Virtual account / bank transfer payment handler ───────────────────────────
async function handleVirtualAccountPayment(payload: Record<string, unknown>) {
  try {
    const data: Record<string, unknown>      = (payload.data as Record<string, unknown>) ?? {}
    const meta: Record<string, unknown>      = (payload.meta_data as Record<string, unknown>) ?? {}

    const tx_ref          = data.tx_ref      as string | undefined
    const amount          = data.amount      as number | undefined
    const status          = data.status      as string | undefined
    const flw_ref         = data.flw_ref     as string | undefined
    const originatorname  = meta.originatorname  as string | undefined
    const bankname        = meta.bankname        as string | undefined

    console.log('[flw-webhook] VA payment:', { tx_ref, amount, status, payer: originatorname, payerBank: bankname })

    if (status !== 'successful' || !tx_ref) return

    // Find & update PaymentLink record (table may not exist yet — catch gracefully)
    let clientEmail: string | null = null
    let clientName:  string | null = null
    let description: string | null = null
    let currency:    string        = 'NGN'

    try {
      const record = await prisma.paymentLink.findUnique({ where: { txRef: tx_ref } })
      if (record) {
        clientEmail = record.clientEmail
        clientName  = record.clientName
        description = record.description
        currency    = record.currency ?? 'NGN'

        await prisma.paymentLink.update({
          where: { txRef: tx_ref },
          data: {
            status:    'paid',
            paidAt:    new Date(),
            payerName: originatorname ?? null,
            payerBank: bankname       ?? null,
          },
        })
        console.log('[flw-webhook] VA PaymentLink updated:', tx_ref)
      } else {
        console.warn('[flw-webhook] No PaymentLink for tx_ref:', tx_ref)
      }
    } catch (dbErr: any) {
      console.warn('[flw-webhook] VA DB lookup failed (table may not exist):', dbErr.message)
    }

    // Send confirmation email to client
    if (clientEmail) {
      try {
        const resend  = new Resend(process.env.RESEND_API_KEY)
        const nameStr = originatorname || clientName || 'Client'
        const amtFmt  = new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount ?? 0)

        await resend.emails.send({
          from:    'Walz Travels <payments@walztravels.com>',
          to:      clientEmail,
          subject: `Payment confirmed — ${amtFmt} received`,
          html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <tr><td style="background:#0B1F3A;padding:32px;text-align:center;">
    <img src="https://www.walztravels.com/walz-logo.png" width="120" alt="Walz Travels" />
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <div style="background:#D1FAE5;border:1px solid #6EE7B7;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px;">
      <p style="color:#065F46;font-weight:700;margin:0;font-size:16px;">✓ Payment Received</p>
    </div>
    <p style="color:#0B1F3A;font-size:15px;">Dear ${nameStr},</p>
    <p style="color:#4a5568;font-size:14px;line-height:1.8;">
      We have received your payment of <strong style="color:#0B1F3A;">${amtFmt}</strong>${description ? ` for <em>${description}</em>` : ''}.
      Our team will process your request and be in touch shortly.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tr><td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;color:#6b7280;font-size:14px;">Reference</td>
          <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;font-size:14px;font-weight:600;color:#0B1F3A;text-align:right;font-family:monospace;">${tx_ref}</td></tr>
      <tr><td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;color:#6b7280;font-size:14px;">Amount</td>
          <td style="padding:10px 14px;border-bottom:1px solid #F3F4F6;font-size:14px;font-weight:700;color:#059669;text-align:right;">${amtFmt}</td></tr>
      ${flw_ref ? `<tr><td style="padding:10px 14px;color:#6b7280;font-size:14px;">FLW Ref</td>
          <td style="padding:10px 14px;font-size:13px;color:#9ca3af;text-align:right;font-family:monospace;">${flw_ref}</td></tr>` : ''}
    </table>
    <p style="color:#9ca3af;font-size:13px;margin-top:24px;">
      Questions? WhatsApp us at <a href="https://wa.me/447398753797" style="color:#C9A84C;">+44 7398 753797</a>
      or email <a href="mailto:payments@walztravels.com" style="color:#C9A84C;">payments@walztravels.com</a>
    </p>
  </td></tr>
  <tr><td style="background:#0B1F3A;padding:16px;text-align:center;">
    <p style="color:rgba(255,255,255,.3);font-size:12px;margin:0;">© Walz Travels · walztravels.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`,
        })
        console.log('[flw-webhook] VA confirmation email sent to:', clientEmail)
      } catch (emailErr: any) {
        console.error('[flw-webhook] VA email error:', emailErr.message)
      }
    }
  } catch (err: any) {
    console.error('[flw-webhook] handleVirtualAccountPayment error:', err.message)
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify Flutterwave webhook signature
    const secretHash = process.env.FLW_WEBHOOK_SECRET
    const signature  = req.headers.get('verif-hash')
    if (secretHash && signature !== secretHash) {
      console.error('[flw-webhook] Bad signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload  = await req.json()
    const { event, data: transfer } = payload

    console.log('[flw-webhook]', event, payload['event.type'], transfer?.tx_ref || transfer?.reference, transfer?.status)

    // ── Virtual account payment (bank transfer) ────────────────────────────────
    if (
      event === 'charge.completed' &&
      payload['event.type'] === 'BANK_TRANSFER_TRANSACTION'
    ) {
      await handleVirtualAccountPayment(payload)
      return NextResponse.json({ received: true })
    }

    if (event !== 'transfer.completed') return NextResponse.json({ received: true })

    const reference = transfer?.reference
    if (!reference?.startsWith('WALZ-')) return NextResponse.json({ received: true })

    const payslip = await prisma.payslip.findFirst({
      where: { transferReference: reference },
    })
    if (!payslip) {
      console.warn('[flw-webhook] No payslip for:', reference)
      return NextResponse.json({ received: true })
    }

    const isSuccess = transfer.status === 'SUCCESSFUL'
    const isFailed  = transfer.status === 'FAILED'

    await prisma.payslip.update({
      where: { id: payslip.id },
      data: {
        transferStatus:     transfer.status,
        status:             isSuccess ? 'PAID' : isFailed ? 'FAILED' : payslip.status,
        transferCompletedAt: (isSuccess || isFailed) ? new Date() : undefined,
        transferError:      isFailed ? (transfer.complete_message || 'Transfer failed') : null,
      },
    })

    // Send payslip email on success
    if (isSuccess && !payslip.emailSentAt) {
      const staff = await prisma.staffMember.findUnique({ where: { id: payslip.staffMemberId } })
      if (staff?.email) {
        try {
          const resend      = new Resend(process.env.RESEND_API_KEY)
          const currency    = payslip.currency || staff.currency || 'NGN'
          const monthLabel  = MONTHS[payslip.month - 1] + ' ' + payslip.year
          const gross       = payslip.grossPay || 0
          const net         = payslip.netPay   || 0
          const deductions  = gross - net
          const allowance   = payslip.allowance || 0
          const f           = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)

          await resend.emails.send({
            from:    'Walz Travels HR <hr@walztravels.com>',
            to:      staff.email,
            subject: `Payslip — ${monthLabel} | Walz Travels`,
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.w{max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.h{background:#060f1e;padding:30px;text-align:center}
.h h1{color:#F59E0B;margin:0;font-size:22px}
.h p{color:rgba(255,255,255,.5);margin:6px 0 0;font-size:13px}
.b{padding:28px 30px}
.badge{background:#D1FAE5;border:1px solid #6EE7B7;border-radius:8px;padding:10px 16px;text-align:center;margin-bottom:16px}
.badge p{color:#065F46;font-weight:700;margin:0;font-size:14px}
.ref{color:#9CA3AF;font-size:12px;text-align:center;margin-bottom:22px}
table{width:100%;border-collapse:collapse}
td{padding:11px 14px;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151}
td:last-child{text-align:right;font-weight:600}
.net td{background:#FFFBEB;border-top:2px solid #F59E0B;border-bottom:none;color:#92400E;font-size:17px;font-weight:700}
.bank{background:#F9FAFB;border-radius:8px;padding:14px 16px;margin:18px 0;font-size:13px;color:#4B5563}
.f{background:#060f1e;padding:18px;text-align:center}
.f p{color:rgba(255,255,255,.3);font-size:11px;margin:0}
</style></head>
<body>
<div class="w">
  <div class="h"><h1>Walz Travels</h1><p>PAYSLIP — ${monthLabel}</p></div>
  <div class="b">
    <p style="font-size:15px;color:#111">Dear <strong>${staff.name}</strong>,</p>
    <p style="font-size:14px;color:#6B7280;margin-bottom:18px">Your salary for ${monthLabel} has been transferred successfully.</p>
    <div class="badge"><p>✓ SALARY PAID</p></div>
    <p class="ref">Ref: ${reference} &nbsp;·&nbsp; Paid: ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p>
    <table>
      <tr><td>Basic Salary</td><td>${f(staff.baseSalary)}</td></tr>
      ${allowance > 0 ? `<tr><td>Allowances</td><td style="color:#059669">+ ${f(allowance)}</td></tr>` : ''}
      ${deductions > 0 ? `<tr><td>Deductions</td><td style="color:#DC2626">− ${f(deductions)}</td></tr>` : ''}
      <tr class="net"><td>NET PAY</td><td>${f(net)}</td></tr>
    </table>
    <div class="bank">
      <strong>Paid to:</strong><br>
      ${staff.bankName || 'Bank'} · Account ****${(staff.accountNumber || '').slice(-4)}
    </div>
    <p style="font-size:13px;color:#9CA3AF">Questions? Email <a href="mailto:hr@walztravels.com" style="color:#F59E0B">hr@walztravels.com</a></p>
  </div>
  <div class="f"><p>Walz Travels HR · Keep this payslip for your records.</p></div>
</div>
</body></html>`,
          })

          await prisma.payslip.update({
            where: { id: payslip.id },
            data:  { emailSentAt: new Date() },
          })
        } catch (emailErr: any) {
          console.error('[flw-webhook] Email error:', emailErr.message)
        }
      }
    }

    // Alert admin on failure
    if (isFailed) {
      try {
        const staff  = await prisma.staffMember.findUnique({ where: { id: payslip.staffMemberId } })
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from:    'Walz Travels Alerts <alerts@walztravels.com>',
          to:      'contact@walztravels.com',
          subject: `⚠️ Salary Transfer Failed — ${staff?.name}`,
          html: `<h2>Transfer Failed</h2>
<p>Staff: ${staff?.name}</p>
<p>Amount: ${payslip.currency} ${payslip.netPay?.toLocaleString()}</p>
<p>Bank: ${staff?.bankName} · ${staff?.accountNumber}</p>
<p>Error: ${transfer.complete_message || 'Unknown'}</p>
<p>Ref: ${reference}</p>
<p>Please retry manually in the Flutterwave dashboard.</p>`,
        })
      } catch {}
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[flw-webhook] ERROR:', err.message)
    // Always 200 so Flutterwave doesn't retry
    return NextResponse.json({ received: true })
  }
}
