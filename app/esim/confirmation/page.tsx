'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Check, Download, Mail, MessageCircle, Smartphone, AlertCircle, Loader2 } from 'lucide-react'

interface OrderResult {
  success:        boolean
  orderId?:       string
  orderRef?:      string
  qrCodeUrl?:     string
  activationCode?: string
  smdpAddress?:   string
  status?:        string
  error?:         string
}

function ConfirmationContent() {
  const params    = useSearchParams()
  const router    = useRouter()
  const sessionId = params.get('session_id')

  const [order,   setOrder]   = useState<OrderResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) {
      router.replace('/esim')
      return
    }
    async function verify() {
      try {
        const res  = await fetch('/api/esim/stripe-verify', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sessionId }),
        })
        const data = await res.json()
        setOrder(data)
      } catch {
        setOrder({ success: false, error: 'Verification failed. Please contact support.' })
      } finally {
        setLoading(false)
      }
    }
    verify()
  }, [sessionId, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-5" />
          <p className="text-white font-semibold text-lg mb-1">Setting up your eSIM…</p>
          <p className="text-white/40 text-sm">This usually takes a few seconds</p>
        </div>
      </div>
    )
  }

  if (!order?.success || order.error) {
    return (
      <div className="min-h-screen bg-[#F5F2EE] flex items-center justify-center px-5">
        <div className="max-w-md text-center bg-white rounded-2xl p-8 shadow-lg border border-[#E5E7EB]">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="font-bold text-[#0B1F3A] text-xl mb-2">Something went wrong</h2>
          <p className="text-[#0B1F3A]/60 text-sm mb-6">
            {order?.error ?? 'We could not process your eSIM. Please contact support.'}
          </p>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1F3A] text-white font-semibold text-sm rounded-full"
          >
            <MessageCircle className="w-4 h-4" /> Contact Support
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F2EE] py-12 px-5 sm:px-8">
      <div className="max-w-xl mx-auto">

        {/* Success badge */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-100 border-4 border-green-400 flex items-center justify-center mx-auto mb-5">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-2">
            📶 Jade Connect
          </p>
          <h1 className="font-display text-[#0B1F3A] font-bold text-3xl mb-2">
            You&apos;re all set!
          </h1>
          <p className="text-[#0B1F3A]/50 text-sm">
            Your eSIM QR code has been sent to your email.
          </p>
        </div>

        {/* QR Code */}
        {order.qrCodeUrl && (
          <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm text-center mb-5">
            <p className="text-[#0B1F3A]/50 text-xs mb-4 font-semibold uppercase tracking-wider">
              Your eSIM QR Code
            </p>
            <div className="inline-block p-3 border border-[#E5E7EB] rounded-xl bg-white mb-4">
              <Image
                src={order.qrCodeUrl}
                alt="eSIM QR Code"
                width={200}
                height={200}
                className="rounded-lg"
              />
            </div>
            <p className="text-[#0B1F3A]/40 text-xs mb-4">Order ref: {order.orderRef}</p>
            <a
              href={order.qrCodeUrl}
              download="jade-connect-esim.png"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] text-white font-semibold text-sm rounded-full hover:bg-[#0d2345] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download QR Code
            </a>
          </div>
        )}

        {/* Manual activation code */}
        {(order.activationCode || order.smdpAddress) && (
          <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-2xl p-5 mb-5">
            <p className="text-[#0369A1] font-bold text-sm mb-3">Manual Activation Code</p>
            {order.smdpAddress && (
              <div className="mb-2">
                <p className="text-xs text-[#374151] mb-1 font-medium">SM-DP+ Address</p>
                <p className="font-mono text-xs bg-white border border-[#BAE6FD] px-3 py-2 rounded-lg text-[#0369A1] break-all">
                  {order.smdpAddress}
                </p>
              </div>
            )}
            {order.activationCode && (
              <div>
                <p className="text-xs text-[#374151] mb-1 font-medium">Activation Code</p>
                <p className="font-mono text-xs bg-white border border-[#BAE6FD] px-3 py-2 rounded-lg text-[#0369A1] break-all">
                  {order.activationCode}
                </p>
              </div>
            )}
          </div>
        )}

        {/* How to activate */}
        <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] shadow-sm mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Smartphone className="w-4 h-4 text-[#C9A84C]" />
            <p className="font-bold text-[#0B1F3A] text-sm">How to activate</p>
          </div>
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-[#0B1F3A] text-sm mb-1">📱 iPhone</p>
              <p className="text-[#0B1F3A]/55 text-xs leading-relaxed font-mono bg-[#F8F9FA] p-3 rounded-lg">
                Settings → Mobile Data → Add eSIM → Use QR Code
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#0B1F3A] text-sm mb-1">🤖 Android</p>
              <p className="text-[#0B1F3A]/55 text-xs leading-relaxed font-mono bg-[#F8F9FA] p-3 rounded-lg">
                Settings → Network → SIM → Add eSIM → Scan QR Code
              </p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl">
            <p className="text-[#92400E] text-xs font-medium">
              💡 Tip: Activate now but don&apos;t switch to the eSIM until you land. Your data countdown starts when you first use it.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <a
            href="mailto:contact@walztravels.com?subject=eSIM QR Code Resend"
            className="flex items-center justify-center gap-2 py-3 bg-white border border-[#E5E7EB] text-[#0B1F3A] font-semibold text-sm rounded-full hover:border-[#0B1F3A]/30 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Email QR again
          </a>
          <a
            href={`https://wa.me/447398753797?text=Hi, I need help with my Jade Connect eSIM (${order.orderRef})`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3 bg-white border border-[#E5E7EB] text-[#0B1F3A] font-semibold text-sm rounded-full hover:border-[#0B1F3A]/30 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp support
          </a>
        </div>

        {/* Nav links */}
        <div className="text-center space-y-2">
          <Link href="/portal/esims" className="block text-sm text-[#C9A84C] hover:underline font-medium">
            View all my eSIMs →
          </Link>
          <Link href="/esim" className="block text-sm text-[#0B1F3A]/40 hover:text-[#0B1F3A] transition-colors">
            Buy another eSIM
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function EsimConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">Loading your eSIM…</p>
        </div>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  )
}
