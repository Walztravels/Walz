import type { Metadata } from 'next'
import { Shield, Check, MessageCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Travel Insurance',
  description: 'Travel insurance through Walz Travels — comprehensive cover for flights, hotels, medical emergencies and trip cancellation.',
}

const COVER_ITEMS = [
  'Medical expenses and emergency evacuation',
  'Trip cancellation and curtailment',
  'Lost, stolen or delayed baggage',
  'Flight delays and missed connections',
  'Personal liability cover',
  'COVID-19 related disruptions',
  'Adventure sports (optional)',
  '24/7 emergency assistance line',
]

export default function InsurancePage() {
  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Hero */}
      <div className="relative bg-[#0B1F3A] py-20 lg:py-28 px-5 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-8 right-8 w-64 h-64 rounded-full border border-white/20" />
          <div className="absolute -bottom-12 -left-12 w-80 h-80 rounded-full border border-white/20" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#C9A84C] flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-[#0B1F3A]" />
          </div>
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-4">Coming Soon</p>
          <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Travel Insurance
          </h1>
          <p className="text-white/50 text-base lg:text-lg max-w-xl mx-auto leading-relaxed">
            We&apos;re partnering with leading insurers to offer comprehensive travel cover directly through Walz Travels. In the meantime, our team can arrange a policy for you via WhatsApp.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-14 lg:py-20">

        {/* What's covered */}
        <div className="mb-12">
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-6">What Will Be Covered</h2>
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {COVER_ITEMS.map(item => (
                <div key={item} className="flex items-center gap-3 text-sm text-[#0B1F3A]/70">
                  <div className="w-5 h-5 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-[#C9A84C]" />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold">Need insurance now?</p>
              <p className="text-white/50 text-sm mt-0.5">WhatsApp us and we&apos;ll arrange a policy for your trip today.</p>
            </div>
          </div>
          <a
            href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20travel%20insurance%20for%20my%20upcoming%20trip."
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Get a Quote via WhatsApp
          </a>
        </div>

      </div>
    </div>
  )
}
