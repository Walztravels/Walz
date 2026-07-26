import type { Metadata } from 'next'
import Link from 'next/link'
import { getActiveCategories } from '@/lib/concierge/catalogue'

export const metadata: Metadata = {
  title: 'Walz Concierge — White-Glove Travel Services',
  description: 'Bespoke travel services handled by personal specialists. Private aviation, yacht charters, airport VIP, and more — all arranged by Jade.',
}

// Fallback icon map for when the DB is unavailable
const CATEGORY_ICONS: Record<string, string> = {
  'airport-services':     '✈',
  'executive-transport':  '🚗',
  'private-aviation':     '🛩',
  'yacht-marine':         '⛵',
  'lifestyle-concierge':  '✨',
  'tickets-entertainment': '🎭',
  'vip-experiences':      '👑',
}

export default async function ConciergePage() {
  const categories = await getActiveCategories().catch(() => [])

  return (
    <main className="min-h-screen bg-[#0B1F3A]">
      {/* Hero */}
      <section className="relative px-6 pt-24 pb-20 text-center overflow-hidden">
        {/* Subtle radial glow */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,168,76,0.15) 0%, transparent 70%)',
          }}
        />
        <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-5">
          Walz Concierge
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight max-w-3xl mx-auto mb-6">
          Travel the way it
          <br />
          <span className="text-[#C9A84C]">was meant to be.</span>
        </h1>
        <p className="text-white/60 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Every Walz Concierge request receives personal attention.
          Tell Jade what you need, and our concierge specialists will handle the details from start to finish.
        </p>
        <button
          onClick={undefined}
          data-jade-open="true"
          className="inline-block bg-[#C9A84C] text-[#0B1F3A] font-bold px-8 py-3.5 rounded-full
            hover:bg-[#d4b86e] transition-colors text-sm tracking-wide cursor-pointer"
          id="concierge-hero-cta"
        >
          Talk to Jade →
        </button>

        {/* Client script to open Jade */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.getElementById('concierge-hero-cta')?.addEventListener('click', function() {
                window.dispatchEvent(new CustomEvent('jade:open', { detail: { prefill: 'I am interested in Walz Concierge services' } }));
              });
            `,
          }}
        />
      </section>

      {/* Services grid */}
      <section className="px-6 pb-16 max-w-6xl mx-auto">
        <p className="text-white/50 text-xs uppercase tracking-[0.2em] font-semibold text-center mb-10">
          Our Services
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.length > 0
            ? categories.map(cat => (
                <Link
                  key={cat.slug}
                  href={`/concierge/${cat.slug}`}
                  className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#C9A84C]/40
                    rounded-2xl p-6 transition-all duration-300 cursor-pointer">
                  <span className="text-3xl mb-4 block">
                    {CATEGORY_ICONS[cat.slug] ?? '✦'}
                  </span>
                  <h3 className="text-white font-bold text-lg mb-2 group-hover:text-[#C9A84C] transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-white/50 text-sm leading-relaxed line-clamp-2">
                    {cat.description ?? 'Bespoke service, arranged by your personal concierge specialist.'}
                  </p>
                  <span className="absolute bottom-5 right-5 text-[#C9A84C]/40 group-hover:text-[#C9A84C] transition-colors text-lg">
                    →
                  </span>
                </Link>
              ))
            : FALLBACK_SERVICES.map(svc => (
                <div
                  key={svc.slug}
                  className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <span className="text-3xl mb-4 block">{svc.icon}</span>
                  <h3 className="text-white font-bold text-lg mb-2">{svc.name}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{svc.description}</p>
                </div>
              ))
          }
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white/3 border-t border-white/5 px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-8">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Tell Jade', body: 'Chat with Jade — our AI travel specialist. Describe what you need in plain language.' },
              { step: '02', title: 'We arrange it', body: 'Your personal concierge specialist takes over. You get a tailored proposal within hours.' },
              { step: '03', title: 'Enjoy', body: 'Everything is handled — from confirmation to on-the-day support. You just show up.' },
            ].map(item => (
              <div key={item.step} className="text-center">
                <p className="text-[#C9A84C]/40 text-5xl font-bold mb-3">{item.step}</p>
                <h4 className="text-white font-bold text-base mb-2">{item.title}</h4>
                <p className="text-white/50 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-16 text-center">
        <p className="text-white/60 text-sm mb-6 max-w-sm mx-auto">
          Have something in mind that&apos;s not listed? We handle anything. Just ask.
        </p>
        <a
          href="https://wa.me/12317902336?text=Hi%2C%20I%27m%20interested%20in%20Walz%20Concierge"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block border border-[#C9A84C]/50 text-[#C9A84C] font-semibold px-6 py-3
            rounded-full hover:bg-[#C9A84C]/10 transition-colors text-sm">
          WhatsApp our concierge team
        </a>
      </section>
    </main>
  )
}

const FALLBACK_SERVICES = [
  { slug: 'airport-services',     icon: '✈', name: 'Airport Services',       description: 'Fast-track, meet & greet, lounge access, porter and VIP arrivals.' },
  { slug: 'executive-transport',  icon: '🚗', name: 'Executive Transport',    description: 'Chauffeur-driven cars, limousines and VIP fleet for any occasion.' },
  { slug: 'private-aviation',     icon: '🛩', name: 'Private Aviation',       description: 'Charter jets, turboprops and helicopter transfers worldwide.' },
  { slug: 'yacht-marine',         icon: '⛵', name: 'Yacht & Marine',         description: 'Superyacht, gulet and speedboat charters in any ocean.' },
  { slug: 'lifestyle-concierge',  icon: '✨', name: 'Lifestyle Concierge',    description: 'Restaurant reservations, personal shopping, wellness retreats.' },
  { slug: 'tickets-entertainment', icon: '🎭', name: 'Tickets & Entertainment', description: 'VIP events, sports, concerts, F1 paddock and beyond.' },
  { slug: 'vip-experiences',      icon: '👑', name: 'VIP Experiences',        description: 'Bespoke white-glove packages crafted around you.' },
]
