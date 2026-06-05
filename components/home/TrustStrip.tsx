'use client'

import { Star, Shield, Award, MessageCircle, CreditCard, Sparkles } from 'lucide-react'

const trustItems = [
  { icon: Star, value: '15,000+', label: 'Trips Booked' },
  { icon: Shield, value: '90%+', label: 'Visa Approval Rate' },
  { icon: Award, value: 'IATA', label: 'Certified Agency' },
  { icon: CreditCard, value: 'Stripe', label: 'Secured Payments' },
  { icon: MessageCircle, value: '24/7', label: 'WhatsApp Support' },
]

export function TrustStrip() {
  return (
    <section className="py-10 lg:py-12 bg-walz-deep-navy">
      <div className="container-walz">
        {/* Stats Row */}
        <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12 mb-6">
          {trustItems.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl walz-gold-gradient flex items-center justify-center shadow-gold-glow group-hover:scale-105 transition-transform">
                <Icon className="w-5 h-5 text-walz-deep-navy" />
              </div>
              <div>
                <div className="font-display text-xl font-bold text-walz-white">{value}</div>
                <div className="text-walz-muted text-xs">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Sentence */}
        <p className="text-center text-walz-muted text-sm max-w-2xl mx-auto">
          From visa applications to complex itineraries, Walz Travels combines expert support with secure booking technology.
        </p>
      </div>
    </section>
  )
}
