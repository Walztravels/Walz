import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, MessageCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Cancellation Policy',
  description: 'Walz Travels Cancellation Policy — refund timelines and cancellation rules for flights, hotels, tours and visa services.',
}

const POLICIES = [
  {
    service: '✈️ Flights',
    colour: 'border-blue-200 bg-blue-50',
    rules: [
      { label: 'Non-refundable fares', detail: 'Most low-cost and discounted airline fares are non-refundable once issued. The ticket value is forfeited if cancelled.' },
      { label: 'Refundable fares', detail: 'Fully refundable tickets may be cancelled up to 24 hours before departure for a full refund. A small processing fee may apply.' },
      { label: 'Date changes', detail: 'Date/route changes are subject to the airline\'s fare rules and any applicable fare difference. Walz Travels charges a £25 admin fee per change.' },
      { label: 'Airline cancellations', detail: 'If the airline cancels your flight, you are entitled to a full refund or rebooking at no charge. We will manage this process on your behalf.' },
    ],
  },
  {
    service: '🏨 Hotels',
    colour: 'border-green-200 bg-green-50',
    rules: [
      { label: 'Free cancellation', detail: 'Hotels with a free cancellation period (displayed at booking) may be cancelled without charge up to the deadline stated.' },
      { label: 'Non-refundable rates', detail: 'Non-refundable hotel rates cannot be refunded or amended. These are displayed clearly during booking.' },
      { label: 'Early departure', detail: 'Leaving a hotel before your checkout date does not entitle you to a refund for unused nights unless the hotel agrees to waive its policy.' },
    ],
  },
  {
    service: '🗺️ Private Tours',
    colour: 'border-amber-200 bg-amber-50',
    rules: [
      { label: '14+ days before start', detail: 'Full refund minus a £50 booking administration fee.' },
      { label: '7–13 days before start', detail: '50% refund of the total tour price.' },
      { label: 'Within 7 days', detail: 'Non-refundable. Rescheduling may be offered at the tour operator\'s discretion.' },
      { label: 'Walz Travels cancels', detail: 'If we cancel a tour due to circumstances within our control, you will receive a full refund within 5 business days.' },
    ],
  },
  {
    service: '📄 Visa Services',
    colour: 'border-purple-200 bg-purple-50',
    rules: [
      { label: 'Before submission', detail: 'If you cancel before we submit your application to the embassy or visa centre, a full refund of our service fee is issued (government fees may be non-refundable).' },
      { label: 'After submission', detail: 'Once an application has been submitted, our service fee is non-refundable regardless of the outcome.' },
      { label: 'Visa refusal', detail: 'We do not refund our service fee if your visa is refused, as the work has been completed. Government fees may be partially recoverable — we will advise on a case-by-case basis.' },
    ],
  },
  {
    service: '🎁 Gift Vouchers',
    colour: 'border-rose-200 bg-rose-50',
    rules: [
      { label: 'Validity', detail: 'Gift vouchers are valid for 12 months from the date of purchase.' },
      { label: 'Cancellation', detail: 'Gift vouchers are non-refundable once purchased. They may be transferred to another person by contacting us.' },
      { label: 'Expiry', detail: 'Expired vouchers cannot be extended or refunded.' },
    ],
  },
]

export default function CancellationsPage() {
  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Header */}
      <div className="bg-[#0B1F3A] py-14 lg:py-20 px-5">
        <div className="max-w-3xl mx-auto">
          <Link href="/help" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Help Centre
          </Link>
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">Help Centre</p>
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Cancellation Policy</h1>
          <p className="text-white/50 text-sm">Last updated: June 2025</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 lg:py-16">

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl p-5 mb-10">
          <p className="text-[#0B1F3A] text-sm leading-relaxed">
            <strong>Important:</strong> Cancellation terms vary by service and fare type. Always check the specific terms at the time of booking. To cancel, contact us at <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">contact@walztravels.com</a> or via WhatsApp.
          </p>
        </div>

        <div className="space-y-8">
          {POLICIES.map(({ service, colour, rules }) => (
            <div key={service} className="bg-white rounded-2xl border border-[#E2D9CC] overflow-hidden">
              <div className={`px-6 py-4 border-b ${colour}`}>
                <h2 className="font-display text-lg font-bold text-[#0B1F3A]">{service}</h2>
              </div>
              <div className="p-6 space-y-4">
                {rules.map(({ label, detail }) => (
                  <div key={label}>
                    <p className="font-semibold text-[#0B1F3A] text-sm mb-1">{label}</p>
                    <p className="text-[#0B1F3A]/60 text-sm leading-relaxed">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-12 bg-[#0B1F3A] rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold">Need to cancel a booking?</p>
              <p className="text-white/50 text-sm mt-0.5">WhatsApp us and we&apos;ll handle it immediately.</p>
            </div>
          </div>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            WhatsApp Us
          </a>
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/terms" className="text-[#C9A84C] hover:underline font-medium">Terms of Service</Link>
          <Link href="/help/baggage" className="text-[#C9A84C] hover:underline font-medium">Baggage Policy</Link>
        </div>

      </div>
    </div>
  )
}
