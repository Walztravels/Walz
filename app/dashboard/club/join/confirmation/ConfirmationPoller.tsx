'use client'

// ConfirmationPoller.tsx — polls /api/jade-club/purchase/status (an
// ownership-scoped, IDOR-safe server read) every 2s until the purchase
// reaches a terminal activationStatus, or a reasonable timeout elapses.
// Never renders "success" from anything other than a fresh server response.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'

interface PurchaseStatus {
  purchaseId: string
  tier: string
  paymentStatus: string
  activationStatus: string
  failureReason: string | null
}

const POLL_MS = 2000
const MAX_POLLS = 60 // 2 minutes

export default function ConfirmationPoller({ purchaseId }: { purchaseId: string }) {
  const [status, setStatus] = useState<PurchaseStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollCount = useRef(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch(`/api/jade-club/purchase/status?purchaseId=${encodeURIComponent(purchaseId)}`)
        if (res.status === 404) {
          setError('We could not find this purchase.')
          return
        }
        const data = await res.json()
        if (cancelled) return
        setStatus(data.purchase)

        const terminal = data.purchase?.activationStatus === 'ACTIVATED'
          || data.purchase?.activationStatus === 'FAILED_PERMANENTLY'
          || data.purchase?.activationStatus === 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION'
        pollCount.current += 1
        if (!terminal && pollCount.current < MAX_POLLS) {
          timer = setTimeout(poll, POLL_MS)
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, POLL_MS)
      }
    }
    poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [purchaseId])

  if (error) {
    return <StatusCard icon={<XCircle className="w-8 h-8 text-red-400" />} title="Something went wrong" body={error} />
  }

  if (!status) {
    return <StatusCard icon={<Clock className="w-8 h-8 text-[#C9A84C] animate-pulse" />} title="Checking your payment…" body="This usually takes a few seconds." />
  }

  if (status.activationStatus === 'ACTIVATED') {
    return (
      <StatusCard
        icon={<CheckCircle2 className="w-8 h-8 text-green-400" />}
        title="You're in!"
        body="Your membership is now active."
        action={<Link href="/dashboard/club" className="text-[#C9A84C] font-semibold text-sm hover:underline">Go to Jade Travel Club →</Link>}
      />
    )
  }

  if (status.activationStatus === 'FAILED_PERMANENTLY') {
    return (
      <StatusCard
        icon={<XCircle className="w-8 h-8 text-red-400" />}
        title="We couldn't finish activating your membership"
        body="Your payment was received. Our team has been notified and will follow up shortly — no need to pay again."
        action={<Link href="/dashboard/club" className="text-[#C9A84C] font-semibold text-sm hover:underline">Back to Jade Travel Club →</Link>}
      />
    )
  }

  if (status.activationStatus === 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION') {
    return (
      <StatusCard
        icon={<Clock className="w-8 h-8 text-[#C9A84C]" />}
        title="We're reviewing your account"
        body="Your payment was received. Our team is reviewing your membership and will follow up shortly — no need to pay again or try again."
        action={<Link href="/dashboard/club" className="text-[#C9A84C] font-semibold text-sm hover:underline">Back to Jade Travel Club →</Link>}
      />
    )
  }

  if (status.paymentStatus === 'FAILED' || status.paymentStatus === 'CANCELLED') {
    return (
      <StatusCard
        icon={<XCircle className="w-8 h-8 text-red-400" />}
        title="Payment was not completed"
        body="You have not been charged."
        action={<Link href="/dashboard/club" className="text-[#C9A84C] font-semibold text-sm hover:underline">Back to Jade Travel Club →</Link>}
      />
    )
  }

  return (
    <StatusCard
      icon={<Clock className="w-8 h-8 text-[#C9A84C] animate-pulse" />}
      title="Confirming your payment…"
      body="We'll activate your membership as soon as your payment is confirmed. This page updates automatically."
    />
  )
}

function StatusCard({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-8 max-w-md text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <h1 className="text-white font-bold text-lg mb-2">{title}</h1>
      <p className="text-white/50 text-sm">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
