import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, MessageCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Baggage Policy',
  description: 'Walz Travels Baggage Policy — allowances, fees and tips for carry-on, checked and special items.',
}

const SECTIONS = [
  {
    title: 'Carry-on Baggage',
    icon: '🎒',
    body: `Most airlines allow one carry-on bag and one personal item (handbag, laptop bag, etc.) in the cabin. Typical carry-on dimensions are 56 × 45 × 25 cm (22 × 18 × 10 in), but this varies by airline and fare type.

Weight limits range from 7 kg to 12 kg for cabin bags depending on the carrier. Low-cost carriers may restrict carry-on to personal items only on basic fares.

Always check your airline's specific policy before travelling — your e-ticket or booking confirmation will include a link to the relevant baggage rules.`,
  },
  {
    title: 'Checked Baggage',
    icon: '🧳',
    body: `Checked baggage allowance depends on your fare class and airline. Common allowances:

• Economy (standard): 1 bag × 20–23 kg
• Economy (premium/flex): 1–2 bags × 23 kg
• Business class: 2 bags × 32 kg
• First class: 3 bags × 32 kg

Bags exceeding the weight limit (typically 23 kg for economy) will incur an excess baggage fee at check-in, which can be significant. We recommend paying for additional baggage online in advance — it is almost always cheaper.`,
  },
  {
    title: 'Excess and Oversized Baggage',
    icon: '📦',
    body: `Bags over 32 kg are classed as heavy baggage and will incur additional fees. Items over 158 cm (length + width + height) combined are classed as oversized.

Sports equipment (surfboards, bicycles, golf bags, skis) and musical instruments are usually treated as special items and require advance notification to the airline. We can arrange this for you at the time of booking.`,
  },
  {
    title: 'Liquids and Restricted Items',
    icon: '🚫',
    body: `In the cabin, liquids must be in containers of 100 ml or less, placed in a single transparent resealable bag (maximum 1 litre capacity). This rule applies at all UK and most international airports.

Items that are always prohibited in the cabin (but may be carried in hold luggage):
• Sharp objects (knives, scissors over 6 cm)
• Sporting equipment (bats, clubs, martial arts items)
• Tools over 10 cm

Dangerous goods (flammable liquids, lithium batteries over 100Wh, aerosols beyond prescribed limits) have specific rules for hold carriage. Always check with us if you are unsure.`,
  },
  {
    title: 'Baggage Loss and Damage',
    icon: '🔍',
    body: `If your baggage is lost, delayed or damaged by the airline, report it immediately at the airport to the airline's baggage desk before leaving the terminal. Obtain a Property Irregularity Report (PIR).

Under the Montreal Convention, airlines are liable for checked baggage up to approximately 1,288 Special Drawing Rights (~£1,300). Travel insurance can provide additional cover.

Contact us as soon as possible — we will liaise with the airline on your behalf.`,
  },
  {
    title: 'Walz Travels Tips',
    icon: '💡',
    body: `• Buy extra baggage allowance online when booking — it is typically 40–60% cheaper than paying at the airport.
• Weigh your bags at home before travelling.
• Keep valuables, documents and medication in your carry-on.
• Photograph your bags before checking them in as evidence if they are lost or damaged.
• For long-haul trips, consider shipping non-urgent items via courier to avoid excess fees.`,
  },
]

export default function BaggagePage() {
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
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Baggage Policy</h1>
          <p className="text-white/50 text-sm">A guide to baggage rules and allowances for your trip</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 lg:py-16">

        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-xl p-5 mb-10">
          <p className="text-[#0B1F3A] text-sm leading-relaxed">
            <strong>Note:</strong> Baggage policies vary by airline, route and fare class. Always confirm allowances on your booking confirmation or with us directly before you travel.
          </p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map(({ title, icon, body }) => (
            <div key={title} className="bg-white rounded-2xl border border-[#E2D9CC] p-7">
              <h2 className="font-display text-lg font-bold text-[#0B1F3A] mb-1 flex items-center gap-2">
                <span>{icon}</span>
                {title}
              </h2>
              <div className="text-[#0B1F3A]/65 text-sm leading-relaxed whitespace-pre-line mt-3">{body}</div>
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
              <p className="text-white font-bold">Baggage questions?</p>
              <p className="text-white/50 text-sm mt-0.5">WhatsApp us — we&apos;ll check your airline&apos;s rules instantly.</p>
            </div>
          </div>
          <a
            href="https://wa.me/12317902336"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            WhatsApp Us
          </a>
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/help" className="text-[#C9A84C] hover:underline font-medium">Help Centre</Link>
          <Link href="/help/cancellations" className="text-[#C9A84C] hover:underline font-medium">Cancellation Policy</Link>
        </div>

      </div>
    </div>
  )
}
