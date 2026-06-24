'use client'

import { Globe, Zap, ShieldCheck } from 'lucide-react'

const CARDS = [
  {
    Icon: Globe,
    title: 'Real Travel Expertise',
    desc: 'Our team has first-hand experience of the destinations we sell. Every recommendation comes from genuine knowledge — not just a catalogue.',
  },
  {
    Icon: Zap,
    title: 'Instant AI Support',
    desc: 'Jade, our AI travel assistant, is available 24/7. Backed by real experts who know your booking inside out.',
  },
  {
    Icon: ShieldCheck,
    title: 'No Hidden Fees',
    desc: 'The price you see is the price you pay. Transparent, honest pricing with no surprise charges at checkout.',
  },
]

export function WhyWalzSection() {
  return (
    <section className="bg-[#060f1e] py-14 lg:py-16 px-5 sm:px-8 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <p className="text-amber-400 text-[11px] font-medium tracking-[0.22em] uppercase mb-3">
            Why Choose Us
          </p>
          <h2 className="font-display text-white font-bold text-2xl md:text-3xl leading-tight">
            The Walz Travels Difference
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CARDS.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="bg-[#0d1e35] rounded-2xl p-7 border border-white/8 hover:border-amber-500/30 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center mb-5">
                <Icon className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
