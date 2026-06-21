'use client'

import { useState, useEffect } from 'react'

const MESSAGES = [
  { role: 'user', text: 'I need the cheapest business class from Toronto to Lagos in December.' },
  { role: 'jade', text: 'I found 12 business class options. Flying 2 days earlier (Dec 13) saves you CAD $620. Qatar Airways via Doha is the most popular choice with Walz clients on this route.' },
  { role: 'user', text: 'Show me the Qatar Airways option.' },
  { role: 'jade', text: 'Qatar Airways QR074 · 18h 20m · 1 stop Doha · Boeing 787 Dreamliner Business Class · CAD $3,840 per person. Includes lounge access at Pearson + Hamad. Fully refundable. Shall I book this for you?' },
]

const HINTS = [
  { icon: '🌍', text: '"Cheapest business class LHR → LOS in December"' },
  { icon: '📊', text: '"Should I book now or wait for prices to drop?"' },
  { icon: '📋', text: '"Do I need a visa to travel from Canada to Nigeria?"' },
  { icon: '👨‍👩‍👧', text: '"Flights for a family of 4, under £3,000 total"' },
]

export function AiAssistantTeaser() {
  const [visible, setVisible] = useState(2)

  useEffect(() => {
    if (visible < MESSAGES.length) {
      const t = setTimeout(() => setVisible(v => v + 1), 1800)
      return () => clearTimeout(t)
    }
  }, [visible])

  return (
    <section className="py-16 lg:py-24 px-5 sm:px-8 bg-[#F5F2EE]">
      <div className="container-walz max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div>
            <p className="text-[#C9A84C] text-xs font-semibold tracking-[0.2em] uppercase mb-3">Walz AI</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#0B1F3A] mb-4">
              Meet Jade, your AI flight concierge
            </h2>
            <p className="text-[#0B1F3A]/60 mb-6 leading-relaxed">
              Tell Jade what you need in plain English. She searches 900+ airlines,
              compares fares, checks visa requirements, and recommends the best options — instantly.
            </p>
            <div className="space-y-3 mb-8">
              {HINTS.map(h => (
                <div key={h.icon} className="flex items-center gap-3 text-sm text-[#0B1F3A]/60">
                  <span className="text-base">{h.icon}</span>
                  <span className="italic">{h.text}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('jade:open', { detail: { service: 'Flight', page: '/flights' } }))}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B1F3A] text-white font-semibold text-sm hover:bg-[#081629] transition-colors">
              Chat with Jade ✈️
            </button>
          </div>

          {/* Right — chat mockup */}
          <div className="bg-white rounded-2xl shadow-xl border border-black/5 overflow-hidden">
            <div className="bg-[#0B1F3A] px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center text-[#0B1F3A] font-bold text-sm">J</div>
              <div>
                <p className="text-white text-sm font-semibold">Jade · AI Flight Assistant</p>
                <p className="text-white/40 text-xs">Online now · Usually replies instantly</p>
              </div>
              <div className="ml-auto w-2 h-2 rounded-full bg-green-400" />
            </div>
            <div className="p-4 space-y-3 min-h-[300px]">
              {MESSAGES.slice(0, visible).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#0B1F3A] text-white rounded-br-sm'
                      : 'bg-[#F5F2EE] text-[#0B1F3A] rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {visible < MESSAGES.length && (
                <div className="flex justify-start">
                  <div className="bg-[#F5F2EE] rounded-2xl rounded-bl-sm px-4 py-2.5">
                    <div className="flex gap-1">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#0B1F3A]/30 animate-bounce"
                          style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
