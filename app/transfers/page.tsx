import type { Metadata } from 'next'
import { Car, Check, MessageCircle, Clock, Shield, Star } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Airport Transfers',
  description: 'Private airport transfers through Walz Travels — door-to-door service, flight monitoring and meet-and-greet at 100+ airports worldwide.',
}

const TRANSFER_TYPES = [
  { title: 'Private Car', desc: 'Executive sedan or SUV for individuals and small groups. Door-to-door service with a uniformed driver.', icon: '🚘' },
  { title: 'Minibus', desc: 'Comfortable minibus for groups of 7–16 passengers with luggage space and air conditioning.', icon: '🚌' },
  { title: 'VIP Luxury', desc: 'Premium Mercedes, BMW or Range Rover for business travellers and special occasions.', icon: '✨' },
]

const FEATURES = [
  'Flight tracking — driver adjusts pickup if your flight is delayed',
  'Meet & greet at arrivals with a name board',
  'Child seats available on request',
  'Fixed prices with no hidden charges',
  '24/7 support if anything changes',
  '100+ airports and cities worldwide',
]

export default function TransfersPage() {
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
            <Car className="w-8 h-8 text-[#0B1F3A]" />
          </div>
          <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-4">Coming Soon</p>
          <h1 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Airport Transfers
          </h1>
          <p className="text-white/50 text-base lg:text-lg max-w-xl mx-auto leading-relaxed">
            Seamless door-to-door transfers in 100+ cities worldwide. Our online booking is launching soon — until then, WhatsApp us to arrange your transfer.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-14 lg:py-20">

        {/* Transfer types */}
        <div className="mb-12">
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-6">Transfer Options</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {TRANSFER_TYPES.map(({ title, desc, icon }) => (
              <div key={title} className="bg-white rounded-2xl border border-[#E2D9CC] p-6">
                <span className="text-3xl mb-4 block">{icon}</span>
                <h3 className="font-bold text-[#0B1F3A] mb-2">{title}</h3>
                <p className="text-[#0B1F3A]/55 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="mb-12">
          <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mb-6">Every Transfer Includes</h2>
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FEATURES.map(item => (
                <div key={item} className="flex items-start gap-3 text-sm text-[#0B1F3A]/70">
                  <div className="w-5 h-5 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[#C9A84C]" />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trust row */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {[
            { icon: Clock, label: '24/7', desc: 'Available' },
            { icon: Shield, label: 'Fixed', desc: 'Price' },
            { icon: Star, label: '100+', desc: 'Cities' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#E2D9CC] p-5 text-center">
              <Icon className="w-6 h-6 text-[#C9A84C] mx-auto mb-2" />
              <p className="font-display font-bold text-xl text-[#0B1F3A]">{label}</p>
              <p className="text-[#0B1F3A]/50 text-xs">{desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-[#0B1F3A] rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold">Book a transfer now</p>
              <p className="text-white/50 text-sm mt-0.5">Tell us your airport, date and number of passengers.</p>
            </div>
          </div>
          <a
            href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20an%20airport%20transfer."
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Book via WhatsApp
          </a>
        </div>

      </div>
    </div>
  )
}
