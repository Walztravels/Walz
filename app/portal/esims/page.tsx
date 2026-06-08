'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Signal, Download, MessageCircle, Clock,
  Wifi, CheckCircle2, XCircle, Loader2, ArrowLeft,
} from 'lucide-react'

interface EsimOrder {
  id:             string
  orderRef:       string
  destination:    string
  destinationIso2: string
  packageName:    string
  durationDays:   number
  dataGb:         number | null
  retailPriceUsd: number
  currency:       string
  iccid:          string | null
  qrCodeUrl:      string | null
  activationCode: string | null
  smdpAddress:    string | null
  status:         string
  purchasedAt:    string
  activatedAt:    string | null
  expiresAt:      string | null
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    active:    { label: 'Active',   cls: 'bg-green-100 text-green-700 border-green-200' },
    IN_USE:    { label: 'In Use',   cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    pending:   { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    expired:   { label: 'Expired',  cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    EXPIRED:   { label: 'Expired',  cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-600 border-red-200' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  )
}

export default function PortalEsimsPage() {
  const [orders,  setOrders]  = useState<EsimOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [open,    setOpen]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/esim/orders')
      .then(r => r.json())
      .then(d => setOrders(d.orders ?? []))
      .catch(() => setError('Failed to load eSIM orders.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-[#F5F2EE] py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/portal/dashboard" className="text-[#0B1F3A]/40 hover:text-[#0B1F3A] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Signal className="w-5 h-5 text-[#C9A84C]" />
              <h1 className="font-display font-bold text-[#0B1F3A] text-2xl">My eSIMs</h1>
            </div>
            <p className="text-[#0B1F3A]/50 text-sm mt-0.5">Jade Connect — your travel data plans</p>
          </div>
          <Link
            href="/esim"
            className="ml-auto px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-full hover:bg-[#b8943d] transition-colors whitespace-nowrap"
          >
            + Buy eSIM
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin mx-auto mb-3" />
            <p className="text-[#0B1F3A]/50 text-sm">Loading your eSIMs…</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-[#E5E7EB]">
            <Signal className="w-10 h-10 text-[#0B1F3A]/20 mx-auto mb-3" />
            <p className="font-semibold text-[#0B1F3A] mb-2">No eSIMs yet</p>
            <p className="text-[#0B1F3A]/50 text-sm mb-5">
              Get connected on your next trip with Jade Connect.
            </p>
            <Link
              href="/esim"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-full hover:bg-[#b8943d] transition-colors"
            >
              Browse eSIM Plans
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                {/* Summary row */}
                <button
                  onClick={() => setOpen(open === order.id ? null : order.id)}
                  className="w-full text-left px-5 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#0B1F3A]/5 flex items-center justify-center flex-shrink-0">
                        <Signal className="w-5 h-5 text-[#C9A84C]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#0B1F3A] text-sm">{order.destination}</p>
                        <p className="text-[#0B1F3A]/50 text-xs mt-0.5">
                          {order.packageName} · {order.durationDays}d · {order.dataGb ? `${order.dataGb} GB` : 'Unlimited'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {statusBadge(order.status)}
                      <span className="text-[#0B1F3A] font-bold text-sm">${order.retailPriceUsd}</span>
                    </div>
                  </div>
                </button>

                {/* Expanded details */}
                {open === order.id && (
                  <div className="border-t border-[#E5E7EB] px-5 pb-5 pt-4">
                    {/* QR code */}
                    {order.qrCodeUrl && (
                      <div className="text-center mb-5">
                        <p className="text-xs text-[#0B1F3A]/50 mb-3 uppercase font-semibold tracking-wider">QR Code</p>
                        <div className="inline-block p-2 border border-[#E5E7EB] rounded-xl bg-white mb-3">
                          <Image
                            src={order.qrCodeUrl}
                            alt="QR Code"
                            width={150}
                            height={150}
                            className="rounded-lg"
                          />
                        </div>
                        <div>
                          <a
                            href={order.qrCodeUrl}
                            download="jade-connect-esim.png"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white font-semibold text-xs rounded-full"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Manual codes */}
                    {(order.smdpAddress || order.activationCode) && (
                      <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-xl p-4 mb-4 text-xs">
                        <p className="font-bold text-[#0369A1] mb-2">Manual Activation</p>
                        {order.smdpAddress && (
                          <div className="mb-2">
                            <p className="text-[#374151] font-medium mb-1">SM-DP+ Address</p>
                            <p className="font-mono text-[#0369A1] bg-white px-2 py-1 rounded-lg border border-[#BAE6FD] break-all">
                              {order.smdpAddress}
                            </p>
                          </div>
                        )}
                        {order.activationCode && (
                          <div>
                            <p className="text-[#374151] font-medium mb-1">Activation Code</p>
                            <p className="font-mono text-[#0369A1] bg-white px-2 py-1 rounded-lg border border-[#BAE6FD] break-all">
                              {order.activationCode}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Activation instructions */}
                    <div className="bg-[#F8F9FA] rounded-xl p-4 mb-4 text-xs">
                      <p className="font-bold text-[#0B1F3A] mb-2">📱 How to activate</p>
                      <p className="text-[#0B1F3A]/60 mb-1"><strong>iPhone:</strong> Settings → Mobile Data → Add eSIM → Use QR Code</p>
                      <p className="text-[#0B1F3A]/60"><strong>Android:</strong> Settings → Network → SIM → Add eSIM → Scan QR</p>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center justify-between text-xs text-[#0B1F3A]/40 mb-4">
                      <span>Ref: {order.orderRef}</span>
                      <span>Purchased {new Date(order.purchasedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>

                    <a
                      href={`https://wa.me/447398753797?text=Hi, I need help with my Jade Connect eSIM (${order.orderRef})`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-2.5 border border-[#E5E7EB] text-[#0B1F3A] font-semibold text-xs rounded-full hover:border-[#0B1F3A]/30 transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp Support
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
