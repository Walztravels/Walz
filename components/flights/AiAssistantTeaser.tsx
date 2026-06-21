'use client'

import { useState, useEffect } from 'react'
import { openJadeChat } from '@/lib/useJadeChat'

const CONVERSATION = [
  { role: 'jade', text: 'Good morning! I\'m Jade, your flight concierge. Where would you like to fly today?' },
  { role: 'user', text: 'I need business class from London to Lagos in December for 2 adults.' },
  { role: 'jade', text: 'Perfect. I\'m scanning 14 airlines now... I found 9 business class options. Flying 3 days earlier (Dec 10) saves you £840 per person. Would you like me to compare them?' },
  { role: 'user', text: 'Yes — which is the best value?' },
  { role: 'jade', text: 'Qatar Airways via Doha is your best value: £2,190pp, Qsuite, lounge at Heathrow + Doha, fully refundable. Emirates is £2,480pp but faster. Shall I hold seats on Qatar while you decide?' },
]

const CAPABILITIES = [
  { text: '"Find business class LHR→LOS under £2,500"' },
  { text: '"Should I book now or wait for December fares to drop?"' },
  { text: '"Book a family of 4 to Accra, cheapest with checked bags"' },
  { text: '"Do I need a visa from Canada to Nigeria?"' },
]

function JadeAvatar() {
  return (
    <div className="relative flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/jade-avatar.jpg" alt="Jade" className="w-9 h-9 rounded-full object-cover shadow-lg shadow-[#C9A84C]/30" />
      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
    </div>
  )
}

export function AiAssistantTeaser() {
  const [visible, setVisible] = useState(1)

  useEffect(() => {
    if (visible < CONVERSATION.length) {
      const delay = CONVERSATION[visible]?.role === 'jade' ? 1400 : 900
      const t = setTimeout(() => setVisible(v => v + 1), delay)
      return () => clearTimeout(t)
    }
  }, [visible])

  function handleOpenJade() {
    openJadeChat({
      service: 'Flight',
      detail: 'Flight search assistant',
      page: '/flights',
      message: 'Hi Jade, I\'d like help finding a flight.',
    })
  }

  return (
    <section className="py-20 lg:py-28 px-5 sm:px-8 bg-[#FAF7F2] relative overflow-hidden">
      {/* Soft glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #C9A84C22 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />

      <div className="container-walz max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left — copy */}
          <div>
            {/* Label */}
            <div className="inline-flex items-center gap-2.5 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jade-avatar.jpg" alt="Jade" className="w-8 h-8 rounded-xl object-cover shadow-md shadow-[#C9A84C]/30" />
              <div>
                <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase leading-none">Jade</p>
                <p className="text-[#0B1F3A]/40 text-[10px] leading-none mt-0.5">AI Flight Concierge</p>
              </div>
            </div>

            <h2 className="font-display text-4xl lg:text-5xl font-bold text-[#0B1F3A] leading-tight mb-5">
              Your personal<br />
              <span style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #8B6914 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                flight expert
              </span>
              <br />is always on.
            </h2>

            <p className="text-[#0B1F3A]/55 text-base leading-relaxed mb-8 max-w-md">
              Jade searches 900+ airlines, compares fares in real time, checks visa requirements,
              and recommends the best route for your budget — all in a single conversation.
            </p>

            {/* Capability hints */}
            <div className="space-y-2.5 mb-10">
              {CAPABILITIES.map((c, i) => (
                <button key={i} onClick={handleOpenJade}
                  className="group flex items-center gap-3 text-sm text-[#0B1F3A]/50 hover:text-[#0B1F3A] transition-colors text-left w-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/40 group-hover:bg-[#C9A84C] transition-colors flex-shrink-0" />
                  <span className="italic group-hover:not-italic transition-all">{c.text}</span>
                </button>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={handleOpenJade}
              className="inline-flex items-center gap-3 px-7 py-4 rounded-xl bg-[#0B1F3A] text-white font-bold text-sm hover:bg-[#152D52] active:scale-[0.97] transition-all shadow-xl shadow-[#0B1F3A]/20 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jade-avatar.jpg" alt="Jade" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
              Chat with Jade
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>

            <p className="text-[#0B1F3A]/30 text-xs mt-4">Free to use · No account required · Replies instantly</p>
          </div>

          {/* Right — live chat mockup */}
          <div className="relative">
            {/* Glow */}
            <div className="absolute -inset-4 rounded-3xl opacity-20 blur-xl bg-gradient-to-br from-[#C9A84C] to-[#0B1F3A]" />

            <div className="relative bg-white rounded-2xl shadow-2xl shadow-[#0B1F3A]/12 border border-black/5 overflow-hidden">
              {/* Chat header */}
              <div className="bg-[#0B1F3A] px-5 py-4 flex items-center gap-3">
                <JadeAvatar />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold leading-none">Jade</p>
                  <p className="text-white/40 text-[11px] mt-0.5">AI Flight Concierge · Walz Travels</p>
                </div>
                {/* Window controls */}
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                </div>
              </div>

              {/* Messages */}
              <div className="p-5 space-y-4 min-h-[320px] max-h-[400px] overflow-hidden">
                {CONVERSATION.slice(0, visible).map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    style={{ animation: 'fadeSlideUp 0.3s ease forwards' }}>
                    {msg.role === 'jade' && <JadeAvatar />}
                    <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#0B1F3A] text-white rounded-br-sm'
                        : 'bg-[#F5F2EE] text-[#0B1F3A] rounded-bl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {visible < CONVERSATION.length && CONVERSATION[visible]?.role === 'jade' && (
                  <div className="flex gap-3 justify-start">
                    <JadeAvatar />
                    <div className="bg-[#F5F2EE] rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[0, 120, 240].map(d => (
                          <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#0B1F3A]/25 animate-bounce"
                            style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="px-5 pb-5">
                <button onClick={handleOpenJade}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#0B1F3A]/10 bg-[#FAF7F2] hover:border-[#C9A84C]/40 transition-colors text-left group">
                  <span className="flex-1 text-sm text-[#0B1F3A]/30 group-hover:text-[#0B1F3A]/50 transition-colors">
                    Ask Jade about flights…
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  )
}
