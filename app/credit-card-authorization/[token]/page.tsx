'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { formatCurrencyMinor } from '@/lib/currency'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface AuthData {
  id:                string
  reference:         string
  status:            string
  cardholderName:    string
  cardholderEmail:   string
  travellerName:     string
  serviceType:       string
  description:       string
  currency:          string
  maxAmountMinor:    number
  permittedCharges:  string[]
  allowMultipleCharges: boolean
  validUntil:        string
  alreadySigned?:    boolean
  cardBrand?:        string
  cardLast4?:        string
}

// ── Signature pad ──────────────────────────────────────────────────────────────

function SignaturePad({ onSign }: { onSign: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const src  = 'touches' in e ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    const pos    = getPos(e.nativeEvent, canvas)
    drawing.current = true
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    const pos    = getPos(e.nativeEvent, canvas)
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.strokeStyle = '#0A1628'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  function stopDraw() {
    if (!drawing.current) return
    drawing.current = false
    onSign(canvasRef.current?.toDataURL('image/png') ?? null)
  }

  function clearPad() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    onSign(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={130}
        className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 cursor-crosshair w-full touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <button type="button" onClick={clearPad} className="text-xs text-gray-400 hover:text-gray-700 mt-1.5 underline">
        Clear signature
      </button>
    </div>
  )
}

// ── Inner form (inside Stripe <Elements>) ──────────────────────────────────────

function AuthorizationForm({ auth, rawToken }: { auth: AuthData; rawToken: string }) {
  const stripe   = useStripe()
  const elements = useElements()

  const [signatureName,     setSignatureName]     = useState('')
  const [signatureDataUrl,  setSignatureDataUrl]  = useState<string | null>(null)
  const [useDrawn,          setUseDrawn]          = useState(false)
  const [consents,          setConsents]          = useState({
    termsAccepted:   false,
    chargesAccepted: false,
    identityCorrect: false,
    authorityConfirmed: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [done,       setDone]       = useState(false)

  const allConsented = Object.values(consents).every(Boolean)
  const signatureProvided = useDrawn ? !!signatureDataUrl : signatureName.trim().length >= 3

  const termsText = `I, ${signatureName || '[Name]'}, authorise Walz Travels to charge my card ${auth.permittedCharges.length > 0 ? `for: ${auth.permittedCharges.join(', ')}` : ''} up to a maximum of ${formatCurrencyMinor(auth.maxAmountMinor, auth.currency)} in relation to travel services for ${auth.travellerName}. This authorisation is valid until ${new Date(auth.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!allConsented) { setError('Please agree to all terms before submitting.'); return }
    if (!signatureProvided) { setError('Please provide your signature.'); return }

    setSubmitting(true)
    setError(null)

    // Step 1: Confirm SetupIntent (save card)
    const { setupIntent, error: stripeErr } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/credit-card-authorization/${rawToken}`,
      },
      redirect: 'if_required',
    })

    if (stripeErr) {
      setError(stripeErr.message ?? 'Card setup failed — please try again.')
      setSubmitting(false)
      return
    }

    if (!setupIntent || setupIntent.status !== 'succeeded') {
      setError('Card setup did not complete. Please try again.')
      setSubmitting(false)
      return
    }

    // Step 2: Complete authorization on server
    const finalSig = useDrawn ? signatureDataUrl : null

    try {
      const r = await fetch(`/api/credit-card-authorization/${rawToken}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupIntentId:     setupIntent.id,
          signatureName:     signatureName.trim() || 'Typed name not provided',
          signatureDataUrl:  finalSig,
          allConsentChecked: true,
          termsSnapshot:     termsText,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Completion failed')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete — please contact Walz Travels.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Authorisation Complete</h2>
        <p className="text-gray-600 max-w-sm mx-auto">
          Thank you. Your card is now on file and your authorisation has been signed.
          You will receive a confirmation email at <strong>{auth.cardholderEmail}</strong>.
        </p>
        <div className="mt-6 bg-gray-50 rounded-xl p-4 text-sm text-gray-500 font-mono text-center">
          Reference: {auth.reference}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* Authorization summary */}
      <div className="bg-[#0A1628]/5 rounded-2xl p-6 border border-[#0A1628]/10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><span className="text-gray-500">Reference</span><br /><span className="font-mono font-bold text-gray-900">{auth.reference}</span></div>
          <div><span className="text-gray-500">Service</span><br /><span className="font-semibold text-gray-900">{auth.serviceType}</span></div>
          <div><span className="text-gray-500">Purpose</span><br /><span className="font-semibold text-gray-900">{auth.description}</span></div>
          <div><span className="text-gray-500">Traveller</span><br /><span className="font-semibold text-gray-900">{auth.travellerName}</span></div>
          <div><span className="text-gray-500">Maximum Amount</span><br /><span className="text-xl font-bold text-[#0A1628]">{formatCurrencyMinor(auth.maxAmountMinor, auth.currency)}</span></div>
          <div><span className="text-gray-500">Valid Until</span><br /><span className="font-semibold text-gray-900">{new Date(auth.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
        </div>
        {auth.permittedCharges.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#0A1628]/10">
            <p className="text-xs text-gray-500 mb-2">Permitted charge types:</p>
            <div className="flex flex-wrap gap-2">
              {auth.permittedCharges.map(c => (
                <span key={c} className="px-2.5 py-1 bg-[#C9A84C]/15 text-[#7a5c00] text-xs font-semibold rounded-full">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Consent checkboxes */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Terms &amp; Consent</h3>
        {[
          { key: 'termsAccepted',       label: `I have read and agree to the above authorisation terms including the maximum amount of ${formatCurrencyMinor(auth.maxAmountMinor, auth.currency)}.` },
          { key: 'chargesAccepted',     label: 'I understand that Walz Travels may charge my saved card for the services described above without requiring my presence at the time of charge.' },
          { key: 'identityCorrect',     label: 'I confirm that the cardholder information is correct and I am the authorised holder of the card being registered.' },
          { key: 'authorityConfirmed',  label: 'I confirm I have the authority to authorise this card for the travel services described and that this authorisation is given freely.' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={consents[key as keyof typeof consents]}
              onChange={e => setConsents(c => ({ ...c, [key]: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-[#C9A84C] flex-shrink-0"
            />
            <span className="text-sm text-gray-700 leading-relaxed">{label}</span>
          </label>
        ))}
      </div>

      {/* Signature */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Signature</h3>
        <div className="flex gap-3 mb-4">
          <button type="button" onClick={() => setUseDrawn(false)}
            className={`text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors ${!useDrawn ? 'bg-[#0A1628] border-[#0A1628] text-white' : 'bg-white border-gray-300 text-gray-600'}`}>
            Type name
          </button>
          <button type="button" onClick={() => setUseDrawn(true)}
            className={`text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors ${useDrawn ? 'bg-[#0A1628] border-[#0A1628] text-white' : 'bg-white border-gray-300 text-gray-600'}`}>
            Draw signature
          </button>
        </div>

        {!useDrawn ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type your full legal name to sign
            </label>
            <input
              type="text"
              value={signatureName}
              onChange={e => setSignatureName(e.target.value)}
              required
              placeholder={auth.cardholderName}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-semibold italic text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] placeholder:font-normal placeholder:text-gray-300 placeholder:not-italic"
              style={{ fontFamily: 'Georgia, serif' }}
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Draw your signature below</label>
            <SignaturePad onSign={url => setSignatureDataUrl(url)} />
            {!signatureDataUrl && (
              <p className="text-xs text-gray-400 mt-1">Use your mouse or finger to draw your signature</p>
            )}
          </div>
        )}

        {!useDrawn && signatureName.trim() && (
          <p className="text-xs text-gray-400 mt-2">
            By typing your name above, you are applying your electronic signature to this authorisation.
          </p>
        )}
      </div>

      {/* Card entry */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Card Details</h3>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <PaymentElement options={{ layout: 'tabs' }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Your card details are encrypted and handled by Stripe. Walz Travels never sees or stores your full card number.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !stripe || !allConsented || !signatureProvided}
        className="w-full bg-[#C9A84C] text-[#0A1628] font-bold text-base py-4 rounded-xl hover:bg-[#b8973d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Processing…' : 'Submit Authorisation'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        By submitting, you confirm all information is accurate and you consent to the authorisation terms above.
        Your IP address and timestamp will be recorded.
      </p>
    </form>
  )
}

// ── Page shell ─────────────────────────────────────────────────────────────────

export default function CreditCardAuthorizationPage() {
  const { token } = useParams<{ token: string }>()

  const [auth,         setAuth]         = useState<AuthData | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [pageError,    setPageError]    = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/credit-card-authorization/${token}`)
        const d = await r.json()
        if (!r.ok) {
          setPageError(d.error ?? 'This link is invalid.')
          return
        }
        setAuth(d.auth)
        setClientSecret(d.clientSecret)
      } catch {
        setPageError('Could not load authorisation. Please try again or contact Walz Travels.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (pageError || !auth) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link Not Available</h2>
          <p className="text-gray-600 text-sm">{pageError}</p>
          <p className="text-gray-400 text-xs mt-4">Questions? Contact <a href="mailto:contact@walztravels.com" className="text-[#C9A84C]">contact@walztravels.com</a></p>
        </div>
      </div>
    )
  }

  if (auth.alreadySigned) {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Already Authorised</h2>
          <p className="text-gray-600 text-sm">
            This authorisation has already been signed
            {auth.cardLast4 ? ` and your ${auth.cardBrand} ···${auth.cardLast4} is on file.` : '.'}
          </p>
          <p className="text-gray-400 text-xs mt-4">Reference: <span className="font-mono">{auth.reference}</span></p>
        </div>
      </div>
    )
  }

  const stripeOptions = clientSecret ? { clientSecret } : undefined

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Header */}
      <div className="bg-[#0A1628] py-4 px-6">
        <img src="/walz-logo.png" alt="Walz Travels" className="h-8" />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Intro */}
        <div className="text-center mb-8">
          <p className="text-xs text-[#C9A84C] font-semibold uppercase tracking-widest mb-2">Credit Card Authorisation</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Authorise Your Card</h1>
          <p className="text-gray-600 text-sm leading-relaxed max-w-md mx-auto">
            Walz Travels is requesting authorisation to charge your card for travel services.
            Please review the terms below, sign, and save your card.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {clientSecret && stripeOptions ? (
            <Elements stripe={stripePromise} options={stripeOptions}>
              <AuthorizationForm auth={auth} rawToken={token} />
            </Elements>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">
              Unable to load payment form. Please refresh or contact Walz Travels.
            </div>
          )}
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-center gap-6 mt-6 text-xs text-gray-400">
          <span>🔒 256-bit SSL</span>
          <span>💳 Secured by Stripe</span>
          <span>🛡️ PCI DSS Compliant</span>
        </div>
      </div>
    </div>
  )
}
