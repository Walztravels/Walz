import type { Metadata } from 'next'
import { Mail, Download, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Press & Media',
  description: 'Walz Travels press and media resources. Press kit, brand guidelines and media enquiries.',
}

const FACTS = [
  { label: 'Founded', value: '2022' },
  { label: 'Headquarters', value: 'London, UK' },
  { label: 'Markets', value: '6 countries' },
  { label: 'Approval Rate', value: '90%+ visa' },
  { label: 'Support', value: '24/7 WhatsApp' },
  { label: 'GDS', value: 'Sabre' },
]

export default function PressPage() {
  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Header */}
      <div className="bg-[#0B1F3A] py-16 lg:py-24 px-5">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-4">Press &amp; Media</p>
          <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
            Walz Travels in the Press
          </h1>
          <p className="text-white/50 text-base lg:text-lg max-w-xl leading-relaxed">
            For press enquiries, interview requests and media resources, contact our communications team.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-14 lg:py-20">

        {/* Media contact */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 mb-12">
          <h2 className="font-display text-xl font-bold text-[#0B1F3A] mb-4">Media Enquiries</h2>
          <p className="text-[#0B1F3A]/60 text-sm leading-relaxed mb-6">
            For interview requests, press releases, partnerships and media mentions, please reach out to our team directly. We aim to respond to all press enquiries within 24 hours.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="mailto:contact@walztravels.com?subject=Press%20Enquiry"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1F3A] text-white font-semibold text-sm rounded-xl hover:bg-[#0d2345] transition-colors"
            >
              <Mail className="w-4 h-4" />
              contact@walztravels.com
            </a>
            <a
              href="https://wa.me/12317902336"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border-2 border-[#C9A84C] text-[#C9A84C] font-semibold text-sm rounded-xl hover:bg-[#C9A84C] hover:text-[#0B1F3A] transition-colors"
            >
              WhatsApp +12317902336
            </a>
          </div>
        </div>

        {/* Company facts */}
        <div className="mb-12">
          <h2 className="font-display text-xl font-bold text-[#0B1F3A] mb-6">Company at a Glance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {FACTS.map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-[#E2D9CC] p-5">
                <p className="text-[#0B1F3A]/40 text-xs uppercase tracking-wider mb-1">{label}</p>
                <p className="font-display text-lg font-bold text-[#0B1F3A]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="mb-12">
          <h2 className="font-display text-xl font-bold text-[#0B1F3A] mb-4">About Walz Travels</h2>
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-[#0B1F3A]/65 text-sm leading-relaxed space-y-4">
            <p>
              Walz Travels is an IATA-certified luxury travel agency headquartered in London, UK, with operations across Nigeria, Canada, the UAE and beyond. Founded in 2022, we help clients book flights, hotels, private tours, visas and travel insurance with expert guidance and 24/7 WhatsApp support.
            </p>
            <p>
              Unlike online travel agencies, every booking is handled by a real travel expert — someone who has first-hand experience of the destinations they recommend. Our direct access to Sabre GDS gives clients real-time inventory across 400+ airlines and the lowest available fares.
            </p>
            <p>
              Our visa team achieves a 90%+ approval rate by preparing every document meticulously, coaching clients through embassy interviews and following up proactively — a track record built on thousands of successful applications.
            </p>
          </div>
        </div>

        {/* Press kit */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-white font-bold text-lg mb-1">Press Kit</p>
            <p className="text-white/50 text-sm">Brand logos, photography and fact sheet.</p>
          </div>
          <a
            href="mailto:contact@walztravels.com?subject=Press%20Kit%20Request"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors"
          >
            <Download className="w-4 h-4" />
            Request Press Kit
          </a>
        </div>

      </div>
    </div>
  )
}
