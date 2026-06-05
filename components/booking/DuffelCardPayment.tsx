'use client'

import { useRef, useState } from 'react'
import { DuffelCardForm, useDuffelCardFormActions, createThreeDSecureSession } from '@duffel/components'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DuffelCardPaymentProps {
  /** Duffel offer ID (off_...) */
  offerId: string
  /** client_key JWT from GET /api/flights/offers/{id} or GET /api/flights/offer-requests/{id} */
  clientKey: string
  /** Total charge amount as string e.g. "267.18" */
  amount: string
  currency: string
  /** Optional ancillary services to include in the 3DS session */
  services?: { id: string; quantity: number }[]
  /** Called with the 3DS session ID when auth succeeds — use to call POST /api/flights/book */
  onSuccess: (threeDSecureSessionId: string) => Promise<void>
  onError?: (error: Error) => void
}

function CardFormInner({
  offerId,
  clientKey,
  amount,
  currency,
  services = [],
  onSuccess,
  onError,
}: DuffelCardPaymentProps) {
  const { ref, createCardForTemporaryUse } = useDuffelCardFormActions()
  const [status, setStatus] = useState<'idle' | 'tokenising' | '3ds' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Bridges the event-based onCreateCardForTemporaryUse callback into the async handlePay flow
  const cardIdResolverRef = useRef<((id: string) => void) | null>(null)

  const handleCreateCardForTemporaryUse = (card: { id: string }) => {
    cardIdResolverRef.current?.(card.id)
    cardIdResolverRef.current = null
  }

  const handlePay = async () => {
    setStatus('tokenising')
    setErrorMsg(null)

    try {
      // Step 1: tokenise the card → tcd_...
      // createCardForTemporaryUse() is void; card data arrives via onCreateCardForTemporaryUse callback
      const cardId = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Card tokenisation timed out')),
          30_000
        )
        cardIdResolverRef.current = (id) => {
          clearTimeout(timeout)
          resolve(id)
        }
        createCardForTemporaryUse()
      })

      // Step 2: run 3DS authentication
      setStatus('3ds')
      const session = await createThreeDSecureSession(
        clientKey,
        cardId,
        offerId,
        services,
        true // live_mode flag — set false in test/sandbox
      )

      if (session.status !== 'ready_for_payment') {
        throw new Error(`3DS authentication failed (status: ${session.status})`)
      }

      // Step 3: hand off session ID to parent to create the order
      setStatus('submitting')
      await onSuccess(session.id)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Payment failed')
      setStatus('error')
      setErrorMsg(error.message)
      onError?.(error)
    }
  }

  const isLoading = status !== 'idle' && status !== 'error'

  const statusLabel: Record<typeof status, string> = {
    idle: `Pay ${currency} ${amount}`,
    tokenising: 'Securing card…',
    '3ds': 'Authenticating…',
    submitting: 'Confirming booking…',
    error: `Pay ${currency} ${amount}`,
  }

  return (
    <div className="space-y-4">
      <DuffelCardForm
        ref={ref}
        clientKey={clientKey}
        intent="to-create-card-for-temporary-use"
        onCreateCardForTemporaryUseSuccess={handleCreateCardForTemporaryUse}
      />

      {errorMsg && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}

      <Button
        type="button"
        variant="gold"
        size="lg"
        className="w-full"
        disabled={isLoading}
        onClick={handlePay}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {statusLabel[status]}
          </>
        ) : (
          statusLabel[status]
        )}
      </Button>
    </div>
  )
}

export function DuffelCardPayment(props: DuffelCardPaymentProps) {
  return <CardFormInner {...props} />
}
