'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { CreditCard, CheckCircle, Clock, Loader2, MessageCircle, Download } from 'lucide-react'

interface Payment {
  id: string
  amount: number
  currency: string
  description: string
  status: string
  method: string | null
  reference: string | null
  receiptUrl: string | null
  paidAt: string | null
  createdAt: string
  application: { title: string; refNumber: string }
}

const STATUS_COLOR: Record<string, string> = {
  PAID:     'bg-green-100 text-green-700',
  PENDING:  'bg-amber-100 text-amber-700',
  REFUNDED: 'bg-blue-100 text-blue-700',
}

export default function PortalPaymentsPage() {
  const [payments, setPayments]   = useState<Payment[]>([])
  const [totalPaid, setTotalPaid] = useState(0)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch('/api/portal/payments')
      .then(r => r.json())
      .then(d => { setPayments(d.payments ?? []); setTotalPaid(d.totalPaid ?? 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const paid    = payments.filter(p => p.status === 'PAID')
  const pending = payments.filter(p => p.status === 'PENDING')

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" /></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <h1 className="text-xl font-bold text-[#0B1F3A]">Payments</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your payment history and outstanding balances</p>
      </div>

      <div className="px-6 lg:px-8 py-6 max-w-3xl space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-green-600">£{totalPaid.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">Payments Made</p>
            <p className="text-2xl font-bold text-[#0B1F3A]">{paid.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-gray-500 mb-1">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
          </div>
        </div>

        {/* Pending payments */}
        {pending.length > 0 && (
          <div>
            <h2 className="font-semibold text-[#0B1F3A] mb-3">Pending Payments</h2>
            <div className="space-y-2">
              {pending.map(p => (
                <div key={p.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-[#0B1F3A] text-sm">{p.description}</p>
                    <p className="text-xs text-gray-500">{p.application?.title} · {p.application?.refNumber}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="font-bold text-[#0B1F3A]">{p.currency} {p.amount.toLocaleString()}</p>
                    <a
                      href="https://wa.me/12317902336"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <MessageCircle className="w-3 h-3" /> Pay via WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment history */}
        <div>
          <h2 className="font-semibold text-[#0B1F3A] mb-3">Payment History</h2>
          {payments.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No payments recorded yet</p>
              <p className="text-xs text-gray-400 mt-1">Payments will appear here once processed by our team</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {payments.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-4 p-4 ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${p.status === 'PAID' ? 'bg-green-100' : 'bg-amber-100'}`}>
                    {p.status === 'PAID' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#0B1F3A] text-sm">{p.description}</p>
                    <p className="text-xs text-gray-400">
                      {p.application?.title} · {p.paidAt ? format(new Date(p.paidAt), 'd MMM yyyy') : format(new Date(p.createdAt), 'd MMM yyyy')}
                      {p.method && ` · ${p.method}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status] ?? 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                    <p className="font-bold text-[#0B1F3A] text-sm">{p.currency} {p.amount.toLocaleString()}</p>
                    {p.receiptUrl && (
                      <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#C9A84C] transition-colors">
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Make payment banner */}
        <div className="bg-[#0B1F3A] rounded-2xl p-6 text-white">
          <h3 className="font-semibold mb-1">Need to make a payment?</h3>
          <p className="text-white/60 text-sm mb-4">Contact us on WhatsApp and we&apos;ll send you a secure payment link for your application.</p>
          <a
            href="https://wa.me/12317902336"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> Chat on WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
