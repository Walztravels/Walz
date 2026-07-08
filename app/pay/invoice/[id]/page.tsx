import { notFound } from 'next/navigation'
import prisma from '@/lib/db'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
  category?: string
}

function fmt(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n)
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })

  if (!invoice) notFound()

  // Mark as viewed if currently 'sent'
  if (invoice.status === 'sent') {
    await prisma.invoice.update({ where: { id }, data: { status: 'viewed', viewedAt: new Date() } })
  }

  const items = (invoice.items as unknown as LineItem[]) || []

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#F5F0E8', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ background: 'white', maxWidth: 640, margin: '0 auto', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>

        {/* Header */}
        <div style={{ background: '#0B1F3A', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#C9A84C', fontSize: 20, fontWeight: 900, letterSpacing: 3 }}>WALZ TRAVELS</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 2, marginTop: 3 }}>FLIGHTS · VISAS · HOTELS · TOURS</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            <div>walztravels.com</div>
            <div>contact@walztravels.com</div>
          </div>
        </div>

        {/* Invoice meta */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ color: '#0B1F3A', fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>Invoice {invoice.invoiceNumber}</h1>
          <p style={{ color: '#64748B', fontSize: 13, margin: 0 }}>Dear {invoice.clientName}, please find your invoice below.</p>

          <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 16, marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Invoice No.', val: invoice.invoiceNumber },
              { label: 'Client', val: invoice.clientName },
              ...(invoice.dueDate ? [{ label: 'Due Date', val: new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) }] : []),
              ...(invoice.staffName ? [{ label: 'Issued by', val: invoice.staffName }] : []),
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: '#94A3B8', letterSpacing: 1, marginBottom: 2 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3A' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Line items */}
        <div style={{ padding: '0 32px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
            <thead>
              <tr>
                {['Description', 'Qty', 'Unit Price', 'Total'].map(h => (
                  <th key={h} style={{ background: '#0B1F3A', color: 'white', padding: '10px 12px', textAlign: 'left', fontSize: 11, letterSpacing: 1 }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.description}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.quantity}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{fmt(item.unitPrice, invoice.currency)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{fmt(item.unitPrice * item.quantity, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: 16, gap: 6 }}>
            {[
              { label: 'Subtotal', val: fmt(invoice.subtotal, invoice.currency) },
              ...(invoice.taxAmount > 0 ? [{ label: `VAT (${invoice.taxRate}%)`, val: fmt(invoice.taxAmount, invoice.currency) }] : []),
              ...(invoice.discountAmount > 0 ? [{ label: 'Discount', val: `-${fmt(invoice.discountAmount, invoice.currency)}` }] : []),
            ].map(({ label, val }) => (
              <div key={label} style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>{label}</span>
                <span style={{ color: '#0B1F3A', minWidth: 80, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#0B1F3A', color: 'white', padding: '14px 20px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {invoice.depositAmount > 0 ? 'Balance Due' : 'Total Due'}
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#C9A84C' }}>
              {fmt(invoice.balanceDue, invoice.currency)}
            </span>
          </div>

          {invoice.depositAmount > 0 && (
            <div style={{ fontSize: 12, color: '#64748B', textAlign: 'right', marginTop: 6 }}>
              Deposit paid: {fmt(invoice.depositAmount, invoice.currency)} · Original total: {fmt(invoice.totalAmount, invoice.currency)}
            </div>
          )}
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ padding: '0 32px 20px' }}>
            <div style={{ background: '#F5F0E8', borderRadius: 10, padding: 16, fontSize: 13, color: '#475569' }}>
              {invoice.notes}
            </div>
          </div>
        )}

        {/* Status */}
        {invoice.status === 'paid' ? (
          <div style={{ margin: '0 32px 24px', background: '#F0FDF4', border: '2px solid #BBF7D0', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>✅</div>
            <div style={{ fontWeight: 900, color: '#16A34A', fontSize: 16 }}>This invoice has been paid</div>
            {invoice.paidAt && (
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Paid on {new Date(invoice.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '0 32px 24px' }}>
            <div style={{ textAlign: 'center', fontSize: 13, color: '#64748B', marginBottom: 12 }}>
              To pay by bank transfer or for payment queries, please contact us:
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="https://wa.me/12317902336"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#25D366', color: 'white', padding: '12px 20px', borderRadius: 50, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
                💬 WhatsApp Us
              </a>
              <a href="mailto:contact@walztravels.com"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0B1F3A', color: 'white', padding: '12px 20px', borderRadius: 50, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
                ✉ Email Us
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ background: '#0B1F3A', padding: '16px 32px', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          © {new Date().getFullYear()} Walz Travels Ltd · walztravels.com · contact@walztravels.com · +12317902336
        </div>
      </div>
    </div>
  )
}
