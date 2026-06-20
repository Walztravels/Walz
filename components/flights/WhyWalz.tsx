'use client'

const ITEMS = [
  { icon: '🤖', title: 'AI Flight Concierge',      desc: 'Ask Jade anything. She scans 3,200 fares in seconds and recommends the best route for your budget and preferences.' },
  { icon: '💺', title: 'Business & First Class',    desc: 'Access exclusive fares on Emirates, Qatar Airways, British Airways, Turkish Airlines and 30+ premium carriers.' },
  { icon: '🌍', title: 'Africa & Caribbean Routes', desc: "Specialists in Lagos, Accra, Nairobi, Kingston routes. We negotiate group and family fares others can't access." },
  { icon: '📋', title: 'Visa + Flight Bundled',     desc: "Book your flight and we'll prepare your visa application at the same time. One team, one booking, zero stress." },
  { icon: '💳', title: 'Flexible Payment',           desc: 'Pay by card, Apple Pay, Klarna, Flutterwave or bank transfer. Split payments available for group bookings.' },
  { icon: '📞', title: '24/7 Human Support',        desc: 'Every booking has a named travel expert. WhatsApp us any time — before, during, or after your trip.' },
]

export function WhyWalz() {
  return (
    <section className="py-20 lg:py-28 px-5 sm:px-8 bg-[#0B1F3A]">
      <div className="container-walz">
        <div className="text-center mb-12">
          <p className="text-[#C9A84C] text-xs font-semibold tracking-[0.2em] uppercase mb-3">Why Walz Travels</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-white">The Walz Difference</h2>
          <p className="text-white/50 mt-3 max-w-lg mx-auto">More than a booking engine — a dedicated travel team in your corner.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {ITEMS.map(({ icon, title, desc }) => (
            <div key={title}
              className="bg-white/5 border border-white/8 rounded-2xl p-6 hover:border-[#C9A84C]/30 transition-all duration-200">
              <div className="text-3xl mb-4">{icon}</div>
              <h3 className="font-display text-base font-bold text-white mb-2">{title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
