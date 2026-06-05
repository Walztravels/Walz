'use client'

import { useState } from 'react'
import { Gift, Plane, FileText, Map, ChevronRight, ChevronLeft, Check, Loader2, Mail, MessageSquare, User, Send, Clock } from 'lucide-react'
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3'

// ── Voucher catalogue ────────────────────────────────────────────────────────

interface VoucherOption {
  id:          string
  serviceType: 'visa' | 'flight' | 'tour'
  label:       string
  subtitle:    string
  icon:        React.ReactNode
  description: string
  values:      { amount: number; currency: string; label: string; tourName?: string }[]
  color:       string
  accentColor: string
}

const VOUCHERS: VoucherOption[] = [
  {
    id:          'visa',
    serviceType: 'visa',
    label:       'Visa Application Gift',
    subtitle:    'Covers our visa service fee',
    icon:        <FileText className="w-7 h-7" />,
    description: 'Gift someone expert visa assistance. Our specialists handle everything — from document prep to embassy submission.',
    values: [
      { amount: 150, currency: 'USD', label: '$150' },
      { amount: 280, currency: 'USD', label: '$280' },
      { amount: 499, currency: 'USD', label: '$499' },
    ],
    color:       'from-blue-600 to-blue-800',
    accentColor: 'blue',
  },
  {
    id:          'flight',
    serviceType: 'flight',
    label:       'Flight Credit Gift',
    subtitle:    'Fixed value toward any flight',
    icon:        <Plane className="w-7 h-7" />,
    description: 'Give the freedom to fly anywhere. This credit can be used toward any flight booked through Walz Travels.',
    values: [
      { amount: 100, currency: 'USD', label: '$100' },
      { amount: 200, currency: 'USD', label: '$200' },
      { amount: 500, currency: 'USD', label: '$500' },
    ],
    color:       'from-[#0B1F3A] to-[#1a3a5c]',
    accentColor: 'navy',
  },
  {
    id:          'tour',
    serviceType: 'tour',
    label:       'Tour Experience Gift',
    subtitle:    'A complete private tour',
    icon:        <Map className="w-7 h-7" />,
    description: 'Gift an unforgettable private tour experience. Select from our most popular guided tours.',
    values: [
      { amount: 450, currency: 'CAD', label: 'CAD $450', tourName: 'Niagara VIP Tour' },
      { amount: 350, currency: 'GBP', label: '£350',     tourName: 'London Private Tour' },
      { amount: 295, currency: 'GBP', label: '£295',     tourName: 'Dublin Private Tour' },
    ],
    color:       'from-emerald-600 to-emerald-800',
    accentColor: 'emerald',
  },
]

// ── Types ────────────────────────────────────────────────────────────────────

interface SelectedVoucher {
  option:  VoucherOption
  value:   VoucherOption['values'][number]
}

interface BuyerDetails {
  senderName:      string
  senderEmail:     string
  recipientName:   string
  recipientEmail:  string
  personalMessage: string
  sendNow:         boolean
  scheduledDate:   string
}

const EMPTY_BUYER: BuyerDetails = {
  senderName: '', senderEmail: '', recipientName: '', recipientEmail: '',
  personalMessage: '', sendNow: true, scheduledDate: '',
}

// ── Step progress bar ────────────────────────────────────────────────────────

function Steps({ current }: { current: number }) {
  const labels = ['Choose Voucher', 'Your Details', 'Payment', 'Confirmed']
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {labels.map((label, i) => {
        const step = i + 1
        const done    = step < current
        const active  = step === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                done   ? 'bg-[#C9A84C] text-[#0B1F3A]' :
                active ? 'bg-[#0B1F3A] text-white ring-2 ring-[#C9A84C] ring-offset-2' :
                         'bg-gray-100 text-gray-400'
              }`}>
                {done ? <Check className="w-4 h-4" /> : step}
              </div>
              <span className={`text-xs mt-1.5 font-medium hidden sm:block ${active ? 'text-[#0B1F3A]' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={`w-12 sm:w-20 h-0.5 mx-1 ${done ? 'bg-[#C9A84C]' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1 ───────────────────────────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (s: SelectedVoucher) => void }) {
  const [chosen, setChosen] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#0B1F3A] mb-2">Choose a Gift Voucher</h2>
        <p className="text-gray-500 text-sm">Select the type and value that's perfect for your recipient.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {VOUCHERS.map((v) => (
          <div
            key={v.id}
            onClick={() => setChosen(v.id)}
            className={`rounded-2xl border-2 cursor-pointer transition-all overflow-hidden ${
              chosen === v.id ? 'border-[#C9A84C] shadow-lg' : 'border-gray-100 hover:border-[#C9A84C]/40 hover:shadow-md'
            }`}
          >
            {/* Card header */}
            <div className={`bg-gradient-to-br ${v.color} p-6 text-white`}>
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                {v.icon}
              </div>
              <h3 className="font-bold text-lg leading-tight">{v.label}</h3>
              <p className="text-white/70 text-sm mt-1">{v.subtitle}</p>
            </div>

            {/* Description */}
            <div className="p-5 bg-white">
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{v.description}</p>

              {/* Value selector */}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Select value</p>
              <div className="grid grid-cols-3 gap-2">
                {v.values.map((val) => (
                  <button
                    key={val.label}
                    onClick={(e) => { e.stopPropagation(); onSelect({ option: v, value: val }) }}
                    className="py-2.5 rounded-xl border-2 border-[#0B1F3A] text-[#0B1F3A] text-sm font-bold hover:bg-[#0B1F3A] hover:text-white transition-all active:scale-95"
                  >
                    {val.label}
                  </button>
                ))}
              </div>
              {v.serviceType === 'tour' && (
                <div className="mt-3 space-y-1">
                  {v.values.map((val) => (
                    <p key={val.tourName} className="text-xs text-gray-400">
                      {val.label} → {val.tourName}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400">Click any amount to proceed</p>
    </div>
  )
}

// ── Step 2 ───────────────────────────────────────────────────────────────────

function Step2({
  selected,
  buyer,
  onChange,
  onBack,
  onNext,
}: {
  selected: SelectedVoucher
  buyer: BuyerDetails
  onChange: (b: BuyerDetails) => void
  onBack: () => void
  onNext: () => void
}) {
  const set = (k: keyof BuyerDetails, v: string | boolean) => onChange({ ...buyer, [k]: v })
  const valid = buyer.senderName && buyer.senderEmail && buyer.recipientName && buyer.recipientEmail

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#0B1F3A] mb-2">Personalise Your Gift</h2>
        <p className="text-gray-500 text-sm">Tell us who the gift is from and who it's going to.</p>
      </div>

      {/* Summary pill */}
      <div className="flex items-center gap-3 bg-[#0B1F3A] rounded-xl p-4 mb-8">
        <div className="w-10 h-10 rounded-lg bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
          <Gift className="w-5 h-5 text-[#C9A84C]" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-white text-sm">{selected.option.label}</p>
          {selected.value.tourName && <p className="text-[#8B9BAE] text-xs">{selected.value.tourName}</p>}
        </div>
        <span className="text-[#C9A84C] font-bold text-lg">{selected.value.label}</span>
      </div>

      <div className="space-y-5">
        {/* Sender */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> From (Your Details)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Your name *</label>
              <input value={buyer.senderName} onChange={e => set('senderName', e.target.value)}
                placeholder="Jane Smith"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Your email *</label>
              <input type="email" value={buyer.senderEmail} onChange={e => set('senderEmail', e.target.value)}
                placeholder="jane@email.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
            </div>
          </div>
        </div>

        {/* Recipient */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> To (Recipient)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Recipient name *</label>
              <input value={buyer.recipientName} onChange={e => set('recipientName', e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Recipient email *</label>
              <input type="email" value={buyer.recipientEmail} onChange={e => set('recipientEmail', e.target.value)}
                placeholder="john@email.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
            </div>
          </div>
        </div>

        {/* Personal message */}
        <div>
          <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Personal message <span className="text-gray-300">(optional)</span>
          </label>
          <textarea value={buyer.personalMessage} onChange={e => set('personalMessage', e.target.value)}
            placeholder="Wishing you an incredible adventure! 🌍"
            rows={3}
            maxLength={500}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] resize-none" />
          <p className="text-right text-xs text-gray-400 mt-1">{buyer.personalMessage.length}/500</p>
        </div>

        {/* Delivery */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" /> Delivery
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <button
              onClick={() => set('sendNow', true)}
              className={`py-3 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                buyer.sendNow ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#0B1F3A]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Send className="w-4 h-4" /> Send immediately
            </button>
            <button
              onClick={() => set('sendNow', false)}
              className={`py-3 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                !buyer.sendNow ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#0B1F3A]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Clock className="w-4 h-4" /> Schedule delivery
            </button>
          </div>
          {!buyer.sendNow && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Delivery date</label>
              <input type="date"
                value={buyer.scheduledDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => set('scheduledDate', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!valid}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-[#1a3a5c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue to Payment <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 3 — Payment ─────────────────────────────────────────────────────────

function Step3({
  selected,
  buyer,
  onBack,
  onSuccess,
}: {
  selected: SelectedVoucher
  buyer: BuyerDetails
  onBack: () => void
  onSuccess: (code: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const config = {
    public_key:   process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? '',
    tx_ref:       `WALZ-GIFT-${Date.now()}`,
    amount:       selected.value.amount,
    currency:     selected.value.currency,
    payment_options: 'card,banktransfer,ussd',
    customer: {
      email:        buyer.senderEmail,
      name:         buyer.senderName,
      phone_number: '',
    },
    customizations: {
      title:       'Walz Travels Gift Voucher',
      description: `${selected.option.label} — ${selected.value.label}`,
      logo:        'https://walztravels.us/walz-logo.png',
    },
  }

  const handleFlutterPayment = useFlutterwave(config)

  async function pay() {
    setError(null)
    handleFlutterPayment({
      callback: async (response) => {
        closePaymentModal()
        if (response.status !== 'successful') {
          setError('Payment was not completed. Please try again.')
          return
        }
        setLoading(true)
        try {
          const res = await fetch('/api/vouchers/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serviceType:          selected.option.serviceType,
              amount:               selected.value.amount,
              currency:             selected.value.currency,
              tourName:             selected.value.tourName,
              senderName:           buyer.senderName,
              senderEmail:          buyer.senderEmail,
              recipientName:        buyer.recipientName,
              recipientEmail:       buyer.recipientEmail,
              personalMessage:      buyer.personalMessage || undefined,
              sendNow:              buyer.sendNow,
              scheduledDeliveryDate: !buyer.sendNow && buyer.scheduledDate ? buyer.scheduledDate : undefined,
              gateway:              'flutterwave',
              transactionId:        String(response.transaction_id),
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Purchase failed')
          onSuccess(data.code)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong')
        } finally {
          setLoading(false)
        }
      },
      onClose: () => {},
    })
  }

  const expiry = new Date()
  expiry.setFullYear(expiry.getFullYear() + 1)

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#0B1F3A] mb-2">Review &amp; Pay</h2>
        <p className="text-gray-500 text-sm">Double-check everything looks right before paying.</p>
      </div>

      {/* Order summary */}
      <div className="bg-[#0B1F3A] rounded-2xl p-6 mb-5">
        <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-widest mb-4">Order Summary</p>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[#8B9BAE]">Voucher type</span>
            <span className="text-white font-semibold">{selected.option.label}</span>
          </div>
          {selected.value.tourName && (
            <div className="flex justify-between">
              <span className="text-[#8B9BAE]">Tour</span>
              <span className="text-white">{selected.value.tourName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[#8B9BAE]">From</span>
            <span className="text-white">{buyer.senderName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8B9BAE]">To</span>
            <span className="text-white">{buyer.recipientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8B9BAE]">Delivery</span>
            <span className="text-white">{buyer.sendNow ? 'Immediately after payment' : buyer.scheduledDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8B9BAE]">Valid for</span>
            <span className="text-white">12 months (until {expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})</span>
          </div>
          <div className="border-t border-white/10 pt-3 flex justify-between">
            <span className="text-[#8B9BAE] font-semibold">Total</span>
            <span className="text-[#C9A84C] font-bold text-xl">{selected.value.label}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm mb-4">
          {error}
        </div>
      )}

      <button
        onClick={pay}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-4 bg-[#C9A84C] text-[#0B1F3A] font-bold text-base rounded-xl hover:bg-[#d4b45f] transition-colors disabled:opacity-60"
      >
        {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</> : <>Pay {selected.value.label} <ChevronRight className="w-5 h-5" /></>}
      </button>

      <button onClick={onBack} className="w-full mt-3 flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2">
        <ChevronLeft className="w-4 h-4" /> Back to details
      </button>

      <div className="flex items-center justify-center gap-4 mt-5 text-xs text-gray-400">
        <span className="flex items-center gap-1">🔒 Secured by Flutterwave</span>
        <span>·</span>
        <span>Card, bank transfer, USSD</span>
      </div>
    </div>
  )
}

// ── Step 4 — Confirmation ────────────────────────────────────────────────────

function Step4({ code, selected, buyer }: { code: string; selected: SelectedVoucher; buyer: BuyerDetails }) {
  return (
    <div className="max-w-md mx-auto text-center">
      {/* Checkmark */}
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <Check className="w-10 h-10 text-green-600" />
      </div>

      <h2 className="text-2xl font-bold text-[#0B1F3A] mb-2">Gift Voucher Sent! 🎉</h2>
      <p className="text-gray-500 text-sm mb-8">
        {buyer.sendNow
          ? `A beautiful voucher email has been sent to ${buyer.recipientEmail}.`
          : `Your voucher is scheduled for delivery on ${buyer.scheduledDate}.`}
      </p>

      {/* Voucher code */}
      <div className="bg-[#0B1F3A] rounded-2xl p-6 mb-6">
        <p className="text-[#8B9BAE] text-xs uppercase tracking-widest mb-2">Voucher Code</p>
        <p className="text-[#C9A84C] text-3xl font-black font-mono tracking-widest mb-2">{code}</p>
        <p className="text-[#8B9BAE] text-xs">{selected.option.label} · {selected.value.label}</p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 text-left mb-6">
        <p className="font-semibold mb-1">How to redeem</p>
        <p className="leading-relaxed text-blue-600">
          {buyer.recipientName} can redeem by contacting us on WhatsApp or email with their voucher code.
          The credit will be applied to their booking instantly.
        </p>
      </div>

      <div className="flex gap-3">
        <a
          href="https://wa.me/447398753797"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white text-sm font-bold rounded-xl hover:bg-[#20c45e] transition-colors"
        >
          💬 WhatsApp Us
        </a>
        <a
          href="/"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-[#1a3a5c] transition-colors"
        >
          ✈️ Back to Home
        </a>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function GiftPage() {
  const [step, setStep]         = useState(1)
  const [selected, setSelected] = useState<SelectedVoucher | null>(null)
  const [buyer, setBuyer]       = useState<BuyerDetails>(EMPTY_BUYER)
  const [code, setCode]         = useState('')

  function handleSelect(s: SelectedVoucher) {
    setSelected(s)
    setStep(2)
  }

  function handlePurchased(c: string) {
    setCode(c)
    setStep(4)
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0B1F3A] to-[#1a3a5c] py-14 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#C9A84C]/20 border border-[#C9A84C]/30 flex items-center justify-center mx-auto mb-5">
          <Gift className="w-8 h-8 text-[#C9A84C]" />
        </div>
        <p className="text-[#C9A84C] text-xs font-semibold tracking-widest uppercase mb-3">Walz Travels</p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4">Gift a Travel Experience</h1>
        <p className="text-[#8B9BAE] text-base max-w-xl mx-auto">
          Give the gift of travel — visa assistance, flight credit, or a private tour. A personalised voucher delivered directly to their inbox.
        </p>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-10">
        {step < 4 && <Steps current={step} />}

        {step === 1 && <Step1 onSelect={handleSelect} />}
        {step === 2 && selected && (
          <Step2
            selected={selected}
            buyer={buyer}
            onChange={setBuyer}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && selected && (
          <Step3
            selected={selected}
            buyer={buyer}
            onBack={() => setStep(2)}
            onSuccess={handlePurchased}
          />
        )}
        {step === 4 && selected && code && (
          <Step4 code={code} selected={selected} buyer={buyer} />
        )}
      </div>
    </div>
  )
}
