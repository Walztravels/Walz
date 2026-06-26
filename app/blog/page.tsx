import type { Metadata } from 'next'
import { SoroEmbed } from './SoroEmbed'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Travel Blog | Visa Guides & Tips | Walz Travels',
  description: 'Expert visa guides, flight tips, destination inspiration and travel advice from Walz Travels — updated daily.',
  openGraph: {
    type: 'website',
    url: 'https://www.walztravels.com/blog',
    title: 'Travel Blog | Walz Travels',
    description: 'Visa guides, flight tips and destination inspiration from Walz Travels.',
    images: [{ url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1200&q=80', width: 1200, height: 630 }],
  },
  alternates: { canonical: 'https://www.walztravels.com/blog' },
}

const TOPICS = [
  '🛂 Visa Guides',
  '✈️ Flights',
  '🇬🇧 UK Visa',
  '🇨🇦 Canada',
  '🇦🇪 Dubai',
  '🌍 Schengen',
  '💡 Travel Tips',
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative bg-[#060f1e] overflow-hidden">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: [
              'radial-gradient(circle at 20% 50%, #F59E0B 0%, transparent 50%)',
              'radial-gradient(circle at 80% 20%, #F59E0B 0%, transparent 40%)',
            ].join(', '),
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <span className="inline-block bg-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6">
            Walz Travels Blog
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Travel Guides &{' '}
            <span className="text-amber-400">Visa Tips</span>
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Expert advice on visas, flights and destinations — updated daily by the Walz Travels team.
          </p>

          {/* Topic pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {TOPICS.map(topic => (
              <span
                key={topic}
                className="bg-white/10 border border-white/10 text-white/70 text-xs font-medium px-4 py-2 rounded-full"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Articles ─────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-1">Daily Updates</p>
            <h2 className="text-2xl font-bold text-gray-900">Latest Travel Guides</h2>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Updated daily
          </div>
        </div>

        <SoroEmbed />
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-amber-500 to-amber-600 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Start Your Journey?</h2>
          <p className="text-amber-100 text-lg mb-8 max-w-xl mx-auto">
            Our visa experts handle everything from start to finish — approvals, not guesswork.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/visa"
              className="bg-white text-amber-600 font-bold px-8 py-4 rounded-2xl hover:bg-amber-50 transition text-base shadow-lg"
            >
              Apply for a Visa
            </a>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/20 border-2 border-white/40 text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/30 transition text-base"
            >
              💬 WhatsApp Us
            </a>
          </div>
        </div>
      </section>

    </div>
  )
}
