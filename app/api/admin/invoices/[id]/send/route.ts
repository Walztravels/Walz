import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getResend } from '@/lib/email-internal'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://walztravels.com'
  const paymentLink = `${appUrl}/pay/invoice/${invoice.id}`
  const currency = invoice.currency
  const fmt = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n)
  const items = (invoice.items as unknown as LineItem[]) || []

  const resend = getResend()
  await resend.emails.send({
    from: 'Walz Travels <invoices@walztravels.com>',
    to: invoice.clientEmail,
    subject: `Invoice ${invoice.invoiceNumber} from Walz Travels — ${fmt(invoice.totalAmount)}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;background:#F5F0E8;margin:0;padding:20px}
.container{background:white;max-width:600px;margin:0 auto;border-radius:12px;overflow:hidden}
.header{background:#0B1F3A;padding:32px;text-align:center}
.logo{color:#C9A84C;font-size:22px;font-weight:900;letter-spacing:3px}
.body{padding:32px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#0B1F3A;color:white;padding:10px 12px;text-align:left;font-size:12px}
td{padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px}
.pay-btn{display:block;background:#C9A84C;color:#0B1F3A;text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px;margin:24px 0}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <img src="https://walztravels.com/walz-logo.png" alt="Walz Travels" width="130" style="display:block;max-width:100%;height:auto;" />
    <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-top:4px;letter-spacing:2px">FLIGHTS · VISAS · HOTELS · TOURS</div>
  </div>
  <div class="body">
    <h2 style="color:#0B1F3A;margin:0 0 8px">Invoice ${invoice.invoiceNumber}</h2>
    <p style="color:#666;margin:0 0 24px">Dear ${invoice.clientName}, please find your invoice below.</p>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:#666">Invoice No.</span>
        <strong style="color:#0B1F3A">${invoice.invoiceNumber}</strong>
      </div>
      ${invoice.dueDate ? `<div style="display:flex;justify-content:space-between">
        <span style="color:#666">Due Date</span>
        <strong style="color:#0B1F3A">${new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
      </div>` : ''}
    </div>
    <table>
      <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>
        ${items.map(i => `<tr>
          <td>${i.description}</td>
          <td>${i.quantity}</td>
          <td>${fmt(i.unitPrice)}</td>
          <td>${fmt(i.unitPrice * i.quantity)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="text-align:right;font-size:13px;margin-bottom:16px">
      ${invoice.depositAmount > 0 ? `<div style="margin-bottom:4px"><span style="color:#666;margin-right:20px">Deposit Paid</span><strong>-${fmt(invoice.depositAmount)}</strong></div>` : ''}
    </div>
    <div style="background:#0B1F3A;color:white;padding:12px 16px;border-radius:8px;display:flex;justify-content:space-between;margin:16px 0;align-items:center">
      <span style="font-weight:bold">Balance Due</span>
      <span style="font-size:20px;font-weight:bold;color:#C9A84C">${fmt(invoice.balanceDue)}</span>
    </div>
    ${invoice.notes ? `<p style="color:#666;font-size:13px">${invoice.notes}</p>` : ''}
    <a href="${paymentLink}" class="pay-btn">Pay Now — ${fmt(invoice.balanceDue)}</a>
    <p style="color:#999;font-size:12px;text-align:center">Payment link: <a href="${paymentLink}" style="color:#C9A84C">${paymentLink}</a></p>
  </div>
  <div style="background:#f8f9fa;padding:20px 32px;text-align:center;font-size:11px;color:#999">
    © ${new Date().getFullYear()} Walz Travels Ltd · walztravels.com<br>
    contact@walztravels.com · +12317902336
  </div>
</div>
</body>
</html>`,
  })

  await prisma.invoice.update({
    where: { id },
    data: { status: 'sent', sentAt: new Date(), paymentLink },
  })

  return NextResponse.json({ ok: true, paymentLink })
}
