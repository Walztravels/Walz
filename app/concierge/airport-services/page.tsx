import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Airport Services — Walz Concierge',
  description: 'Lounge access, meet & greet, transfers, sleeping pods and baggage delivery — book instantly through Walz Concierge.',
  alternates: { canonical: 'https://www.walztravels.com/concierge/airport-services' },
  openGraph: {
    title: 'Airport Services — Walz Concierge',
    description: 'Lounge access, meet & greet, transfers, sleeping pods and baggage delivery — book instantly.',
    url: 'https://www.walztravels.com/concierge/airport-services',
    type: 'website',
    siteName: 'Walz Travels',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Airport Services — Walz Concierge',
    description: 'Lounge access, meet & greet, transfers, sleeping pods and baggage delivery.',
  },
}

const SERVICES = [
  {
    type:        'lounge',
    icon:        '🛋️',
    name:        'Airport Lounge',
    description: 'Access premium lounges with dining, showers, fast Wi-Fi and quiet seating — at airports worldwide.',
    detail:      'Instant booking',
  },
  {
    type:        'meet-greet',
    icon:        '🤝',
    name:        'Meet & Greet',
    description: 'A dedicated greeter meets you at the gate, guides you through fast-track and handles baggage.',
    detail:      'Instant booking',
  },
  {
    type:        'transfer',
    icon:        '🚗',
    name:        'Airport Transfer',
    description: 'Private car, executive SUV or minibus transfer — airport to hotel or any destination.',
    detail:      'Instant booking',
  },
  {
    type:        'sleeping-pod',
    icon:        '😴',
    name:        'Sleeping Pods',
    description: 'Private sleep cabins for long layovers. Rest in comfort, then board refreshed.',
    detail:      'Instant booking',
  },
  {
    type:        'baggage',
    icon:        '🧳',
    name:        'Baggage Delivery',
    description: 'Door-to-door baggage delivery from airport to hotel, home or next destination.',
    detail:      'Instant booking',
  },
]

export default function AirportServicesPage() {
  return (
    <main className="min-h-screen bg-[#0B1F3A]">
      {/* Back */}
      <div className="px-6 pt-8">
        <Link
          href="/concierge"
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] text-xs font-medium transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          All Concierge Services
        </Link>
      </div>

      {/* Hero */}
      <section className="relative px-6 pt-12 pb-14 text-center overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(201,168,76,0.12) 0%, transparent 70%)' }}
        />
        <span className="text-5xl mb-5 block">✈</span>
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-3">Walz Concierge</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-5">Airport Services</h1>
        <p className="text-white/60 text-base max-w-xl mx-auto leading-relaxed">
          Every detail handled before you set foot in the airport.
          Select a service, book instantly, and travel without friction.
        </p>
      </section>

      {/* Service cards */}
      <section className="px-6 pb-20 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SERVICES.map(svc => (
            <Link
              key={svc.type}
              href={`/concierge/airport-services/${svc.type}`}
              className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#C9A84C]/40
                rounded-2xl p-6 transition-all duration-300 cursor-pointer">
              <span className="text-3xl mb-4 block">{svc.icon}</span>
              <h3 className="text-white font-bold text-lg mb-2 group-hover:text-[#C9A84C] transition-colors">
                {svc.name}
              </h3>
              <p className="text-white/50 text-sm leading-relaxed mb-4">
                {svc.description}
              </p>
              <span className="inline-flex items-center gap-1.5 text-[#C9A84C]/60 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                {svc.detail}
              </span>
              <span className="absolute bottom-5 right-5 text-[#C9A84C]/40 group-hover:text-[#C9A84C] transition-colors text-lg">
                →
              </span>
            </Link>
          ))}
        </div>

        {/* Jade CTA */}
        <div className="mt-10 text-center">
          <p className="text-white/40 text-sm mb-4">
            Not sure which service you need? Jade can guide you.
          </p>
          <button
            id="airport-services-jade-cta"
            className="inline-block border border-[#C9A84C]/40 text-[#C9A84C] text-sm font-semibold px-6 py-3
              rounded-full hover:bg-[#C9A84C]/10 transition-colors cursor-pointer">
            Ask Jade →
          </button>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                document.getElementById('airport-services-jade-cta')?.addEventListener('click', function() {
                  window.dispatchEvent(new CustomEvent('jade:open', {
                    detail: { prefill: "I'd like help choosing an airport service" }
                  }));
                });
              `,
            }}
          />
        </div>
      </section>
    </main>
  )
}
