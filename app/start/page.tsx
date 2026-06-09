import type { Metadata } from 'next'
import Link from 'next/link'
import { Plane, Hotel, Map, FileText, Gift, ArrowRight, MessageCircle, Shield } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Get Started',
  description: 'Tell us what you need and our expert team will guide you every step of the way — flights, hotels, tours, visa and more.',
  openGraph: {
    type: 'website',
    url: 'https://walztravels.com/start',
    title: 'Get Started | Walz Travels',
    description: 'Tell us what you need and our expert team will guide you every step of the way.',
    images: [{ url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80', width: 1200, height: 630 }],
  },
}

const SERVICES = [
  {
    icon: Plane,
    title: 'Book a Flight',
    description: 'Search 400+ airlines via Sabre GDS for the best available fares. Economy, business and first class.',
    href: '/flights',
    cta: 'Search Flights',
    colour: 'from-[#0B3D7A] to-[#0B1F3A]',
    tag: 'Sabre GDS',
  },
  {
    icon: Hotel,
    title: 'Book a Hotel',
    description: 'Luxury hotels, boutique stays and serviced apartments worldwide — hand-picked by our team.',
    href: '/hotels',
    cta: 'Find Hotels',
    colour: 'from-[#1a3a5c] to-[#0B1F3A]',
    tag: 'Worldwide',
  },
  {
    icon: Map,
    title: 'Private Tour',
    description: 'Bespoke tours designed around you. City breaks, safaris, island hopping and group itineraries.',
    href: '/tours',
    cta: 'Explore Tours',
    colour: 'from-[#1C3557] to-[#0B1F3A]',
    tag: 'Bespoke',
  },
  {
    icon: FileText,
    title: 'Visa Assistance',
    description: 'Our specialists prepare every document and follow up with embassies. 90%+ approval rate.',
    href: '/visa',
    cta: 'Check Visa',
    colour: 'from-[#7A4A0B] to-[#3A2200]',
    tag: '90%+ approval',
  },
  {
    icon: Gift,
    title: 'Gift Voucher',
    description: 'Give the gift of travel. Redeemable for flights, hotels, tours or visa services.',
    href: '/gift',
    cta: 'Get a Voucher',
    colour: 'from-[#5a3800] to-[#2e1c00]',
    tag: 'Perfect gift',
  },
]

export default function StartPage() {
  return (
    <div className="min-h-screen bg-[#F5F2EE]">

      {/* Hero */}
      <div className="bg-[#0B1F3A] py-16 lg:py-24 px-5 text-center">
        <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-4">
          Walz Travels
        </p>
        <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          How Can We Help You?
        </h1>
        <p className="text-white/50 text-base lg:text-lg max-w-xl mx-auto leading-relaxed">
          Pick a service below. Our expert team handles everything from search to booking — 24/7.
        </p>
      </div>

      {/* Service Cards */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SERVICES.map(({ icon: Icon, title, description, href, cta, colour, tag }) => (
            <Link
              key={href}
              href={href}
              className="group relative rounded-2xl overflow-hidden bg-white border border-[#E2D9CC] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              {/* Coloured stripe */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${colour}`} />

              <div className="p-6 flex flex-col flex-1">
                {/* Icon + tag */}
                <div className="flex items-start justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[#C9A84C]" />
                  </div>
                  <span className="text-[10px] font-semibold text-[#C9A84C] bg-[#C9A84C]/10 px-2.5 py-1 rounded-full">
                    {tag}
                  </span>
                </div>

                <h2 className="font-display text-lg font-bold text-[#0B1F3A] mb-2">{title}</h2>
                <p className="text-[#0B1F3A]/55 text-sm leading-relaxed flex-1">{description}</p>

                <div className="mt-5 flex items-center gap-1.5 text-[#C9A84C] font-semibold text-sm group-hover:gap-3 transition-all duration-200">
                  {cta}
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* WhatsApp CTA */}
        <div className="mt-12 rounded-2xl bg-[#0B1F3A] px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold">Not sure where to start?</p>
              <p className="text-white/50 text-sm mt-0.5">WhatsApp our team — we&apos;ll plan it for you.</p>
            </div>
          </div>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Chat on WhatsApp
          </a>
        </div>

        {/* Trust badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-[#0B1F3A]/40 text-xs">
          {[
            { icon: Shield, text: 'IATA Certified Agency' },
            { icon: Shield, text: 'Stripe Secured Payments' },
            { icon: Shield, text: '24/7 WhatsApp Support' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-[#C9A84C]" />
              {text}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
