'use client'

/**
 * HelcimPayButton
 *
 * Mounts the Helcim Pay.js iframe and resolves with the transaction ID
 * when payment is approved, or rejects with an error message.
 *
 * Usage:
 *   <HelcimPayButton
 *     amount={299}
 *     currency="GBP"
 *     invoiceNumber="WALZ-001"
 *     onSuccess={(txId) => console.log('paid', txId)}
 *     onError={(msg) => console.error(msg)}
 *   />
 *
 * Helcim Pay.js docs:
 *   https://devdocs.helcim.com/reference/helcim-pay-overview
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Lock, Loader2, CreditCard } from 'lucide-react'

interface Props {
  amount:        number
  currency:      string
  invoiceNumber?: string
  label?:        string
  disabled?:     boolean
  onSuccess:     (transactionId: string | number) => void
  onError:       (message: string) => void
}

// Helcim postMessage event types
interface HelcimMessage {
  eventType: 'HELCIM_PAY_OK' | 'HELCIM_PAY_FAILED' | 'HELCIM_PAY_CLOSE'
  checkoutToken?: string
  transactionId?: string | number
  message?: string
}

export function HelcimPayButton({
  amount,
  currency,
  invoiceNumber,
  label,
  disabled,
  onSuccess,
  onError,
}: Props) {
  const [status, setStatus]             = useState<'idle' | 'loading' | 'ready' | 'processing'>('idle')
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null)
  const iframeRef                        = useRef<HTMLDivElement>(null)

  // ── Load HelcimPay.js script once ──────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById('helcim-pay-script')) return
    const script = document.createElement('script')
    script.id    = 'helcim-pay-script'
    script.src   = 'https://secure.helcim.app/helcim-pay/services/start.js'
    script.async = true
    document.head.appendChild(script)
  }, [])

  // ── Listen for Helcim postMessage ─────────────────────────────────────────
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== 'https://secure.helcim.app') return
      let data: HelcimMessage
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      if (data.eventType === 'HELCIM_PAY_OK') {
        setStatus('processing')
        onSuccess(data.transactionId ?? '')
      } else if (data.eventType === 'HELCIM_PAY_FAILED') {
        setStatus('idle')
        onError(data.message ?? 'Payment failed. Please try again.')
      } else if (data.eventType === 'HELCIM_PAY_CLOSE') {
        setStatus('idle')
        // User closed the iframe — no error, just reset
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onSuccess, onError])

  // ── Append iframe once we have a checkout token ───────────────────────────
  useEffect(() => {
    if (!checkoutToken || !iframeRef.current) return
    // Clear any previous iframe
    iframeRef.current.innerHTML = ''
    // appendHelcimIframe is injected by HelcimPay.js script
    const win = window as unknown as Record<string, unknown>
    if (typeof win.appendHelcimIframe === 'function') {
      ;(win.appendHelcimIframe as (token: string) => void)(checkoutToken)
      setStatus('ready')
    } else {
      // Script not yet loaded — wait 500ms and retry once
      const t = setTimeout(() => {
        if (typeof win.appendHelcimIframe === 'function') {
          ;(win.appendHelcimIframe as (token: string) => void)(checkoutToken)
          setStatus('ready')
        } else {
          setStatus('idle')
          onError('Helcim Pay failed to load. Please refresh the page.')
        }
      }, 500)
      return () => clearTimeout(t)
    }
  }, [checkoutToken, onError])

  // ── Initialise checkout session ───────────────────────────────────────────
  const handleClick = useCallback(async () => {
    if (status !== 'idle') return
    setStatus('loading')
    try {
      const res = await fetch('/api/helcim/initialize', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount, currency, invoiceNumber }),
      })
      const data = await res.json()
      if (!res.ok || !data.checkoutToken) {
        throw new Error(data.error ?? 'Failed to open payment form')
      }
      setCheckoutToken(data.checkoutToken)
    } catch (err) {
      setStatus('idle')
      onError(err instanceof Error ? err.message : 'Could not initialise Helcim checkout')
    }
  }, [status, amount, currency, invoiceNumber, onError])

  const buttonLabel = label ?? `Pay ${new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)} with Helcim`

  return (
    <div className="space-y-3">
      {/* Pay button — hidden once iframe is showing */}
      {status !== 'ready' && (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || status !== 'idle'}
          className="w-full flex items-center justify-center gap-2 bg-[#0B1F3A] hover:bg-[#1a3358] text-white font-semibold py-3.5 px-6 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === 'loading' || status === 'processing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {status === 'processing' ? 'Confirming payment…' : 'Loading secure form…'}
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              {buttonLabel}
            </>
          )}
        </button>
      )}

      {/* Lock badge */}
      {status === 'idle' && (
        <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
          <Lock className="w-3 h-3" />
          Secured by Helcim · PCI DSS Level 1
        </p>
      )}

      {/* Helcim Pay iframe mounts here */}
      <div ref={iframeRef} id="helcimPayIframe" />
    </div>
  )
}
